const express = require('express');
const Joi = require('joi');
const multer = require('multer');
const path = require('path');
const db = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/properties/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'property-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Validation schemas
const propertySchema = Joi.object({
  title: Joi.string().min(5).max(200).required(),
  description: Joi.string().max(2000).optional(),
  address: Joi.string().min(10).max(500).required(),
  city: Joi.string().min(2).max(100).required(),
  country: Joi.string().min(2).max(100).default('Turkey'),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  maxGuests: Joi.number().integer().min(1).max(20).required(),
  bedrooms: Joi.number().integer().min(1).max(10).required(),
  bathrooms: Joi.number().integer().min(1).max(10).required(),
  pricePerNight: Joi.number().positive().required(),
  cleaningFee: Joi.number().min(0).default(0),
  amenities: Joi.array().items(Joi.number().integer()).optional()
});

// Get all properties with filters
router.get('/', async (req, res) => {
  try {
    const {
      city,
      minPrice,
      maxPrice,
      maxGuests,
      checkIn,
      checkOut,
      page = 1,
      limit = 10
    } = req.query;

    let query = `
      SELECT p.*, u.first_name as owner_first_name, u.last_name as owner_last_name,
             COALESCE(AVG(r.rating), 0) as average_rating,
             COUNT(r.review_id) as review_count
      FROM properties p
      LEFT JOIN users u ON p.owner_id = u.user_id
      LEFT JOIN reviews r ON p.property_id = r.property_id
      WHERE p.is_active = 1
    `;

    const queryParams = [];

    // Apply filters
    if (city) {
      query += ' AND p.city LIKE ?';
      queryParams.push(`%${city}%`);
    }

    if (minPrice) {
      query += ' AND p.price_per_night >= ?';
      queryParams.push(parseFloat(minPrice));
    }

    if (maxPrice) {
      query += ' AND p.price_per_night <= ?';
      queryParams.push(parseFloat(maxPrice));
    }

    if (maxGuests) {
      query += ' AND p.max_guests >= ?';
      queryParams.push(parseInt(maxGuests));
    }

    // Check availability if dates provided
    if (checkIn && checkOut) {
      query += `
        AND p.property_id NOT IN (
          SELECT DISTINCT property_id FROM reservations 
          WHERE reservation_status IN ('confirmed', 'pending')
          AND (
            (check_in_date <= ? AND check_out_date > ?) OR
            (check_in_date < ? AND check_out_date >= ?) OR
            (check_in_date >= ? AND check_out_date <= ?)
          )
        )
      `;
      queryParams.push(checkIn, checkIn, checkOut, checkOut, checkIn, checkOut);
    }

    query += ' GROUP BY p.property_id';

    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ' LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), offset);

    const [properties] = await db.execute(query, queryParams);

    // Get images for each property
    for (let property of properties) {
      const [images] = await db.execute(
        'SELECT image_url, is_primary FROM property_images WHERE property_id = ? ORDER BY image_order',
        [property.property_id]
      );
      property.images = images;
    }

    res.json({
      properties,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: properties.length === parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Properties fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch properties' });
  }
});

// Get single property by ID
router.get('/:id', async (req, res) => {
  try {
    const propertyId = req.params.id;

    const [properties] = await db.execute(`
      SELECT p.*, u.first_name as owner_first_name, u.last_name as owner_last_name,
             u.email as owner_email, u.phone as owner_phone,
             COALESCE(AVG(r.rating), 0) as average_rating,
             COUNT(r.review_id) as review_count
      FROM properties p
      LEFT JOIN users u ON p.owner_id = u.user_id
      LEFT JOIN reviews r ON p.property_id = r.property_id
      WHERE p.property_id = ? AND p.is_active = 1
      GROUP BY p.property_id
    `, [propertyId]);

    if (properties.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const property = properties[0];

    // Get images
    const [images] = await db.execute(
      'SELECT image_url, is_primary FROM property_images WHERE property_id = ? ORDER BY image_order',
      [propertyId]
    );
    property.images = images;

    // Get amenities
    const [amenities] = await db.execute(`
      SELECT a.amenity_id, a.amenity_name, a.amenity_icon
      FROM amenities a
      JOIN property_amenities pa ON a.amenity_id = pa.amenity_id
      WHERE pa.property_id = ?
    `, [propertyId]);
    property.amenities = amenities;

    // Get recent reviews
    const [reviews] = await db.execute(`
      SELECT r.*, u.first_name, u.last_name
      FROM reviews r
      JOIN users u ON r.tenant_id = u.user_id
      WHERE r.property_id = ?
      ORDER BY r.review_date DESC
      LIMIT 10
    `, [propertyId]);
    property.reviews = reviews;

    res.json({ property });
  } catch (error) {
    console.error('Property fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch property' });
  }
});

// Create new property (Owner only)
router.post('/', authenticateToken, authorizeRoles('owner'), async (req, res) => {
  try {
    const { error, value } = propertySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const {
      title, description, address, city, country, latitude, longitude,
      maxGuests, bedrooms, bathrooms, pricePerNight, cleaningFee, amenities
    } = value;

    // Insert property
    const [result] = await db.execute(`
      INSERT INTO properties (
        owner_id, title, description, address, city, country, latitude, longitude,
        max_guests, bedrooms, bathrooms, price_per_night, cleaning_fee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.user_id, title, description, address, city, country,
      latitude, longitude, maxGuests, bedrooms, bathrooms, pricePerNight, cleaningFee
    ]);

    const propertyId = result.insertId;

    // Add amenities if provided
    if (amenities && amenities.length > 0) {
      const amenityValues = amenities.map(amenityId => [propertyId, amenityId]);
      await db.execute(
        'INSERT INTO property_amenities (property_id, amenity_id) VALUES ?',
        [amenityValues]
      );
    }

    res.status(201).json({
      message: 'Property created successfully',
      propertyId
    });
  } catch (error) {
    console.error('Property creation error:', error);
    res.status(500).json({ message: 'Failed to create property' });
  }
});

// Upload property images
router.post('/:id/images', authenticateToken, authorizeRoles('owner'), upload.array('images', 10), async (req, res) => {
  try {
    const propertyId = req.params.id;

    // Verify property ownership
    const [properties] = await db.execute(
      'SELECT owner_id FROM properties WHERE property_id = ?',
      [propertyId]
    );

    if (properties.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    if (properties[0].owner_id !== req.user.user_id) {
      return res.status(403).json({ message: 'Not authorized to upload images for this property' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No images uploaded' });
    }

    // Insert image records
    const imageValues = req.files.map((file, index) => [
      propertyId,
      `/uploads/properties/${file.filename}`,
      index + 1,
      index === 0 // First image is primary
    ]);

    await db.execute(
      'INSERT INTO property_images (property_id, image_url, image_order, is_primary) VALUES ?',
      [imageValues]
    );

    res.json({
      message: 'Images uploaded successfully',
      uploadedFiles: req.files.length
    });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ message: 'Failed to upload images' });
  }
});

// Get owner's properties
router.get('/owner/my-properties', authenticateToken, authorizeRoles('owner'), async (req, res) => {
  try {
    const [properties] = await db.execute(`
      SELECT p.*, 
             COALESCE(AVG(r.rating), 0) as average_rating,
             COUNT(DISTINCT r.review_id) as review_count,
             COUNT(DISTINCT res.reservation_id) as total_bookings,
             COALESCE(SUM(CASE WHEN res.reservation_status = 'completed' THEN res.total_amount ELSE 0 END), 0) as total_revenue
      FROM properties p
      LEFT JOIN reviews r ON p.property_id = r.property_id
      LEFT JOIN reservations res ON p.property_id = res.property_id
      WHERE p.owner_id = ?
      GROUP BY p.property_id
      ORDER BY p.created_at DESC
    `, [req.user.user_id]);

    // Get images for each property
    for (let property of properties) {
      const [images] = await db.execute(
        'SELECT image_url, is_primary FROM property_images WHERE property_id = ? ORDER BY image_order LIMIT 1',
        [property.property_id]
      );
      property.primaryImage = images[0]?.image_url || null;
    }

    res.json({ properties });
  } catch (error) {
    console.error('Owner properties fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch properties' });
  }
});

module.exports = router;