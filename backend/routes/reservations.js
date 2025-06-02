const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const createReservationSchema = Joi.object({
  propertyId: Joi.number().integer().required(),
  checkIn: Joi.date().required(),
  checkOut: Joi.date().greater(Joi.ref('checkIn')).required(),
  guests: Joi.number().integer().min(1).required()
});

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('confirmed', 'cancelled', 'completed').required(),
  reason: Joi.string().max(500).optional()
});

// =====================================================
// CREATE RESERVATION
// =====================================================
router.post('/', authenticateToken, authorizeRoles('tenant'), async (req, res) => {
  try {
    const { error, value } = createReservationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { propertyId, checkIn, checkOut, guests } = value;

    // First check if property exists and is active
    const [properties] = await db.execute(
      'SELECT property_id, max_guests, price_per_night, cleaning_fee, is_active FROM properties WHERE property_id = ?',
      [propertyId]
    );

    if (properties.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const property = properties[0];

    if (!property.is_active) {
      return res.status(400).json({ message: 'Property is not available for booking' });
    }

    if (guests > property.max_guests) {
      return res.status(400).json({ message: `Maximum ${property.max_guests} guests allowed` });
    }

    // Check availability
    const [availabilityCheck] = await db.execute(
      'SELECT fn_check_availability(?, ?, ?) as is_available',
      [propertyId, checkIn, checkOut]
    );

    if (!availabilityCheck[0].is_available) {
      return res.status(400).json({ message: 'Selected dates are not available' });
    }

    // Calculate pricing
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const totalNights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    const subtotal = totalNights * property.price_per_night;
    const cleaningFee = property.cleaning_fee || 0;
    const totalAmount = subtotal + cleaningFee;

    // Create reservation
    const [result] = await db.execute(`
      INSERT INTO reservations (
        property_id, tenant_id, check_in_date, check_out_date, 
        guest_count, total_nights, price_per_night, cleaning_fee, total_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [propertyId, req.user.user_id, checkIn, checkOut, guests, totalNights, property.price_per_night, cleaningFee, totalAmount]);

    res.status(201).json({
      message: 'Reservation created successfully',
      reservationId: result.insertId,
      totalAmount: totalAmount,
      totalNights: totalNights
    });

  } catch (error) {
    console.error('Reservation creation error:', error);
    res.status(500).json({ message: 'Failed to create reservation' });
  }
});

// =====================================================
// GET USER'S RESERVATIONS
// =====================================================
router.get('/my-reservations', authenticateToken, async (req, res) => {
  try {
    const { status, limit = 10, offset = 0 } = req.query;

    let query = `
      SELECT r.*, 
             p.title as property_title, p.address, p.city,
             p.price_per_night, p.cleaning_fee,
             u.first_name as owner_first_name, u.last_name as owner_last_name,
             u.email as owner_email, u.phone as owner_phone,
             pay.payment_status, pay.payment_date,
             pi.image_url as property_image
      FROM reservations r
      JOIN properties p ON r.property_id = p.property_id
      JOIN users u ON p.owner_id = u.user_id
      LEFT JOIN payments pay ON r.reservation_id = pay.reservation_id
      LEFT JOIN property_images pi ON p.property_id = pi.property_id AND pi.is_primary = 1
      WHERE r.tenant_id = ?
    `;

    const queryParams = [req.user.user_id];

    if (status) {
      query += ' AND r.reservation_status = ?';
      queryParams.push(status);
    }

    query += ' ORDER BY r.booking_date DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), parseInt(offset));

    const [reservations] = await db.execute(query, queryParams);

    res.json({ 
      reservations,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: reservations.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Failed to fetch user reservations:', error);
    res.status(500).json({ message: 'Failed to fetch reservations' });
  }
});

// =====================================================
// GET PROPERTY OWNER'S RESERVATIONS
// =====================================================
router.get('/property-reservations', authenticateToken, authorizeRoles('owner'), async (req, res) => {
  try {
    const { propertyId, status } = req.query;

    let query = `
      SELECT r.*, 
             p.title as property_title, p.address,
             tenant.first_name as tenant_first_name, tenant.last_name as tenant_last_name,
             tenant.email as tenant_email, tenant.phone as tenant_phone,
             pay.payment_status, pay.payment_date
      FROM reservations r
      JOIN properties p ON r.property_id = p.property_id
      JOIN users tenant ON r.tenant_id = tenant.user_id
      LEFT JOIN payments pay ON r.reservation_id = pay.reservation_id
      WHERE p.owner_id = ?
    `;

    const queryParams = [req.user.user_id];

    if (propertyId) {
      query += ' AND p.property_id = ?';
      queryParams.push(propertyId);
    }

    if (status) {
      query += ' AND r.reservation_status = ?';
      queryParams.push(status);
    }

    query += ' ORDER BY r.booking_date DESC';

    const [reservations] = await db.execute(query, queryParams);

    res.json({ reservations });

  } catch (error) {
    console.error('Failed to fetch property reservations:', error);
    res.status(500).json({ message: 'Failed to fetch property reservations' });
  }
});

// =====================================================
// GET SINGLE RESERVATION DETAILS
// =====================================================
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const reservationId = req.params.id;

    const [reservations] = await db.execute(`
      SELECT r.*, 
             p.title as property_title, p.address, p.city, p.description,
             p.price_per_night, p.cleaning_fee, p.max_guests,
             owner.first_name as owner_first_name, owner.last_name as owner_last_name,
             owner.email as owner_email, owner.phone as owner_phone,
             tenant.first_name as tenant_first_name, tenant.last_name as tenant_last_name,
             tenant.email as tenant_email, tenant.phone as tenant_phone,
             pay.payment_status, pay.payment_date, pay.transaction_id
      FROM reservations r
      JOIN properties p ON r.property_id = p.property_id
      JOIN users owner ON p.owner_id = owner.user_id
      JOIN users tenant ON r.tenant_id = tenant.user_id
      LEFT JOIN payments pay ON r.reservation_id = pay.reservation_id
      WHERE r.reservation_id = ?
    `, [reservationId]);

    if (reservations.length === 0) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    const reservation = reservations[0];

    // Check authorization
    const isOwner = reservation.owner_id === req.user.user_id;
    const isTenant = reservation.tenant_id === req.user.user_id;
    const isAdmin = req.user.user_role === 'admin';

    if (!isOwner && !isTenant && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to view this reservation' });
    }

    // Get property images
    const [images] = await db.execute(
      'SELECT image_url, is_primary FROM property_images WHERE property_id = ? ORDER BY image_order',
      [reservation.property_id]
    );

    reservation.property_images = images;

    res.json({ reservation });

  } catch (error) {
    console.error('Failed to fetch reservation details:', error);
    res.status(500).json({ message: 'Failed to fetch reservation details' });
  }
});

// =====================================================
// UPDATE RESERVATION STATUS
// =====================================================
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { error, value } = updateStatusSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { status, reason } = value;
    const reservationId = req.params.id;

    // Get reservation details
    const [reservations] = await db.execute(`
      SELECT r.*, p.owner_id, p.title as property_title
      FROM reservations r
      JOIN properties p ON r.property_id = p.property_id
      WHERE r.reservation_id = ?
    `, [reservationId]);

    if (reservations.length === 0) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    const reservation = reservations[0];

    // Authorization checks
    const isOwner = reservation.owner_id === req.user.user_id;
    const isTenant = reservation.tenant_id === req.user.user_id;
    const isAdmin = req.user.user_role === 'admin';

    // Business logic for status changes
    if (status === 'confirmed') {
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ message: 'Only property owner can confirm reservations' });
      }
      if (reservation.reservation_status !== 'pending') {
        return res.status(400).json({ message: 'Only pending reservations can be confirmed' });
      }
    }

    if (status === 'cancelled') {
      if (!isTenant && !isOwner && !isAdmin) {
        return res.status(403).json({ message: 'Not authorized to cancel this reservation' });
      }
      if (reservation.reservation_status === 'completed') {
        return res.status(400).json({ message: 'Cannot cancel completed reservation' });
      }
    }

    if (status === 'completed') {
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ message: 'Only property owner can mark reservation as completed' });
      }
      if (reservation.reservation_status !== 'confirmed') {
        return res.status(400).json({ message: 'Only confirmed reservations can be completed' });
      }
    }

    // Update reservation
    let updateQuery = 'UPDATE reservations SET reservation_status = ?, updated_at = CURRENT_TIMESTAMP';
    let updateParams = [status];

    if (status === 'cancelled' && reason) {
      updateQuery += ', cancellation_reason = ?, cancellation_date = CURRENT_TIMESTAMP';
      updateParams.push(reason);
    }

    updateQuery += ' WHERE reservation_id = ?';
    updateParams.push(reservationId);

    await db.execute(updateQuery, updateParams);

    res.json({ 
      message: `Reservation ${status} successfully`,
      reservationId: reservationId,
      newStatus: status
    });

  } catch (error) {
    console.error('Failed to update reservation status:', error);
    res.status(500).json({ message: 'Failed to update reservation status' });
  }
});

// =====================================================
// CHECK AVAILABILITY
// =====================================================
router.post('/check-availability', async (req, res) => {
  try {
    const { propertyId, checkIn, checkOut } = req.body;

    if (!propertyId || !checkIn || !checkOut) {
      return res.status(400).json({ 
        message: 'Property ID, check-in and check-out dates are required' 
      });
    }

    // Validate dates
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (checkInDate < today) {
      return res.status(400).json({ message: 'Check-in date cannot be in the past' });
    }

    if (checkOutDate <= checkInDate) {
      return res.status(400).json({ message: 'Check-out date must be after check-in date' });
    }

    // Check for conflicting reservations
    const [conflicts] = await db.execute(`
      SELECT COUNT(*) as conflict_count
      FROM reservations
      WHERE property_id = ?
      AND reservation_status IN ('confirmed', 'pending')
      AND (
        (check_in_date <= ? AND check_out_date > ?) OR
        (check_in_date < ? AND check_out_date >= ?) OR
        (check_in_date >= ? AND check_out_date <= ?)
      )
    `, [propertyId, checkIn, checkIn, checkOut, checkOut, checkIn, checkOut]);

    const isAvailable = conflicts[0].conflict_count === 0;

    if (isAvailable) {
      // Get property details for pricing
      const [properties] = await db.execute(
        'SELECT price_per_night, cleaning_fee FROM properties WHERE property_id = ? AND is_active = 1',
        [propertyId]
      );

      if (properties.length === 0) {
        return res.status(404).json({ message: 'Property not found or inactive' });
      }

      const property = properties[0];
      const totalNights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
      const subtotal = totalNights * property.price_per_night;
      const cleaningFee = property.cleaning_fee || 0;
      const totalAmount = subtotal + cleaningFee;

      res.json({
        available: true,
        pricing: {
          pricePerNight: property.price_per_night,
          totalNights: totalNights,
          subtotal: subtotal,
          cleaningFee: cleaningFee,
          totalAmount: totalAmount
        }
      });
    } else {
      res.json({
        available: false,
        message: 'Selected dates are not available'
      });
    }

  } catch (error) {
    console.error('Availability check error:', error);
    res.status(500).json({ message: 'Failed to check availability' });
  }
});

// =====================================================
// CANCEL RESERVATION
// =====================================================
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const reservationId = req.params.id;
    const { reason } = req.body;

    // Get reservation details
    const [reservations] = await db.execute(`
      SELECT r.*, p.owner_id, p.title as property_title
      FROM reservations r
      JOIN properties p ON r.property_id = p.property_id
      WHERE r.reservation_id = ?
    `, [reservationId]);

    if (reservations.length === 0) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    const reservation = reservations[0];

    // Authorization check
    const isTenant = reservation.tenant_id === req.user.user_id;
    const isOwner = reservation.owner_id === req.user.user_id;
    const isAdmin = req.user.user_role === 'admin';

    if (!isTenant && !isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to cancel this reservation' });
    }

    // Business logic checks
    if (reservation.reservation_status === 'completed') {
      return res.status(400).json({ message: 'Cannot cancel completed reservation' });
    }

    if (reservation.reservation_status === 'cancelled') {
      return res.status(400).json({ message: 'Reservation is already cancelled' });
    }

    // Update reservation to cancelled
    await db.execute(`
      UPDATE reservations 
      SET reservation_status = 'cancelled',
          cancellation_date = CURRENT_TIMESTAMP,
          cancellation_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE reservation_id = ?
    `, [reason || 'Cancelled by user', reservationId]);

    res.json({ 
      message: 'Reservation cancelled successfully',
      reservationId: reservationId
    });

  } catch (error) {
    console.error('Failed to cancel reservation:', error);
    res.status(500).json({ message: 'Failed to cancel reservation' });
  }
});

// =====================================================
// GET ALL RESERVATIONS (ADMIN ONLY)
// =====================================================
router.get('/admin/all', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT r.*, 
             p.title as property_title, p.city,
             owner.first_name as owner_first_name, owner.last_name as owner_last_name,
             tenant.first_name as tenant_first_name, tenant.last_name as tenant_last_name,
             tenant.email as tenant_email,
             pay.payment_status
      FROM reservations r
      JOIN properties p ON r.property_id = p.property_id
      JOIN users owner ON p.owner_id = owner.user_id
      JOIN users tenant ON r.tenant_id = tenant.user_id
      LEFT JOIN payments pay ON r.reservation_id = pay.reservation_id
    `;

    const queryParams = [];

    if (status) {
      query += ' WHERE r.reservation_status = ?';
      queryParams.push(status);
    }

    query += ' ORDER BY r.booking_date DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), parseInt(offset));

    const [reservations] = await db.execute(query, queryParams);

    // Get summary statistics
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_reservations,
        SUM(CASE WHEN reservation_status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN reservation_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count,
        SUM(CASE WHEN reservation_status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN reservation_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
        SUM(CASE WHEN reservation_status = 'completed' THEN total_amount ELSE 0 END) as total_revenue
      FROM reservations
    `);

    res.json({ 
      reservations,
      statistics: stats[0],
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: reservations.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Failed to fetch all reservations:', error);
    res.status(500).json({ message: 'Failed to fetch reservations' });
  }
});

// =====================================================
// GET RESERVATION STATISTICS
// =====================================================
router.get('/stats/dashboard', authenticateToken, async (req, res) => {
  try {
    let statsQuery = '';
    let queryParams = [];

    if (req.user.user_role === 'admin') {
      // Admin sees all statistics
      statsQuery = `
        SELECT 
          COUNT(*) as total_reservations,
          SUM(CASE WHEN reservation_status = 'pending' THEN 1 ELSE 0 END) as pending_reservations,
          SUM(CASE WHEN reservation_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_reservations,
          SUM(CASE WHEN reservation_status = 'completed' THEN 1 ELSE 0 END) as completed_reservations,
          SUM(CASE WHEN reservation_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_reservations,
          SUM(CASE WHEN reservation_status = 'completed' THEN total_amount ELSE 0 END) as total_revenue,
          AVG(CASE WHEN reservation_status = 'completed' THEN total_amount ELSE NULL END) as average_booking_value
        FROM reservations
      `;
    } else if (req.user.user_role === 'owner') {
      // Owner sees their property statistics
      statsQuery = `
        SELECT 
          COUNT(*) as total_reservations,
          SUM(CASE WHEN r.reservation_status = 'pending' THEN 1 ELSE 0 END) as pending_reservations,
          SUM(CASE WHEN r.reservation_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_reservations,
          SUM(CASE WHEN r.reservation_status = 'completed' THEN 1 ELSE 0 END) as completed_reservations,
          SUM(CASE WHEN r.reservation_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_reservations,
          SUM(CASE WHEN r.reservation_status = 'completed' THEN r.total_amount ELSE 0 END) as total_revenue,
          AVG(CASE WHEN r.reservation_status = 'completed' THEN r.total_amount ELSE NULL END) as average_booking_value
        FROM reservations r
        JOIN properties p ON r.property_id = p.property_id
        WHERE p.owner_id = ?
      `;
      queryParams.push(req.user.user_id);
    } else {
      // Tenant sees their booking statistics
      statsQuery = `
        SELECT 
          COUNT(*) as total_reservations,
          SUM(CASE WHEN reservation_status = 'pending' THEN 1 ELSE 0 END) as pending_reservations,
          SUM(CASE WHEN reservation_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_reservations,
          SUM(CASE WHEN reservation_status = 'completed' THEN 1 ELSE 0 END) as completed_reservations,
          SUM(CASE WHEN reservation_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_reservations,
          SUM(total_amount) as total_spent
        FROM reservations
        WHERE tenant_id = ?
      `;
      queryParams.push(req.user.user_id);
    }

    const [stats] = await db.execute(statsQuery, queryParams);

    res.json({ statistics: stats[0] });

  } catch (error) {
    console.error('Failed to fetch reservation statistics:', error);
    res.status(500).json({ message: 'Failed to fetch statistics' });
  }
});

module.exports = router;