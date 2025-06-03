// ===== properties.js =====
const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const router = express.Router();

// Validation schema
const propertySchema = Joi.object({
  title: Joi.string().required(),
  address: Joi.string().required(),
  city: Joi.string().required(),
  price_per_night: Joi.number().required(),
  cleaning_fee: Joi.number().optional(),
  max_guests: Joi.number().required(),
  description: Joi.string().required(),
  is_active: Joi.boolean().default(true)
});

// ==============================
// GET ALL PROPERTIES
// ==============================
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM properties');
    res.json(rows);
  } catch (err) {
    console.error('Get all properties error:', err);
    res.status(500).json({ message: 'Failed to fetch properties' });
  }
});

// ==============================
// SEARCH PROPERTIES
// ==============================
router.get('/search', async (req, res) => {
  const { city, checkIn, checkOut, guests } = req.query;

  if (!city || !checkIn || !checkOut || !guests) {
    return res.status(400).json({ message: 'Missing search parameters' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT * FROM properties 
       WHERE LOWER(city) = LOWER(?) 
         AND max_guests >= ? 
         AND is_active = 1
         AND fn_check_availability(property_id, ?, ?) = 1`,
      [city, guests, checkIn, checkOut]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    res.json(rows);
  } catch (err) {
    console.error('Property search error:', err);
    res.status(500).json({ message: 'Failed to search properties' });
  }
});

// ==============================
// GET PROPERTY BY ID
// ==============================
router.get('/:propertyId', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM properties WHERE property_id = ?', [req.params.propertyId]);

    if (rows.length === 0) return res.status(404).json({ message: 'Property not found' });

    res.json(rows[0]);
  } catch (err) {
    console.error('Get property by ID error:', err);
    res.status(500).json({ message: 'Failed to fetch property' });
  }
});

// ==============================
// CREATE PROPERTY
// ==============================
router.post('/', authenticateToken, authorizeRoles('owner', 'admin'), async (req, res) => {
  const { error, value } = propertySchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const { title, address, city, price_per_night, cleaning_fee, max_guests, description, is_active } = value;

    const [result] = await db.execute(
      `INSERT INTO properties 
        (owner_id, title, address, city, price_per_night, cleaning_fee, max_guests, description, is_active) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.user_id, title, address, city, price_per_night, cleaning_fee || 0, max_guests, description, is_active]
    );

    res.status(201).json({ message: 'Property created successfully', propertyId: result.insertId });
  } catch (err) {
    console.error('Create property error:', err);
    res.status(500).json({ message: 'Failed to create property' });
  }
});

// ==============================
// UPDATE PROPERTY
// ==============================
router.put('/:propertyId', authenticateToken, authorizeRoles('owner', 'admin'), async (req, res) => {
  const { error, value } = propertySchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const [existing] = await db.execute('SELECT owner_id FROM properties WHERE property_id = ?', [req.params.propertyId]);
    if (existing.length === 0) return res.status(404).json({ message: 'Property not found' });

    const isOwner = existing[0].owner_id === req.user.user_id;
    const isAdmin = req.user.user_role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized to update this property' });

    const { title, address, city, price_per_night, cleaning_fee, max_guests, description, is_active } = value;

    await db.execute(
      `UPDATE properties SET title = ?, address = ?, city = ?, price_per_night = ?, 
        cleaning_fee = ?, max_guests = ?, description = ?, is_active = ? 
       WHERE property_id = ?`,
      [title, address, city, price_per_night, cleaning_fee || 0, max_guests, description, is_active, req.params.propertyId]
    );

    res.json({ message: 'Property updated successfully' });
  } catch (err) {
    console.error('Update property error:', err);
    res.status(500).json({ message: 'Failed to update property' });
  }
});

// ==============================
// DELETE PROPERTY
// ==============================
router.delete('/:propertyId', authenticateToken, authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const [existing] = await db.execute('SELECT owner_id FROM properties WHERE property_id = ?', [req.params.propertyId]);
    if (existing.length === 0) return res.status(404).json({ message: 'Property not found' });

    const isOwner = existing[0].owner_id === req.user.user_id;
    const isAdmin = req.user.user_role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized to delete this property' });

    await db.execute('DELETE FROM properties WHERE property_id = ?', [req.params.propertyId]);

    res.json({ message: 'Property deleted successfully' });
  } catch (err) {
    console.error('Delete property error:', err);
    res.status(500).json({ message: 'Failed to delete property' });
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

    res.json({ properties });
  } catch (error) {
    console.error('Owner properties fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch properties' });
  }
});

module.exports = router;
