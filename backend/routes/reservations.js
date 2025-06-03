// ===== reservations.js =====
const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Validation Schemas
const createReservationSchema = Joi.object({
  property_id: Joi.number().integer().required(),
  check_in_date: Joi.date().required(),
  check_out_date: Joi.date().greater(Joi.ref('check_in_date')).required(),
  number_of_guests: Joi.number().integer().min(1).required()
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
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { property_id, check_in_date, check_out_date, number_of_guests } = value;

    const [properties] = await db.execute(
      'SELECT property_id, max_guests, price_per_night, cleaning_fee, is_active FROM properties WHERE property_id = ?',
      [property_id]
    );

    if (properties.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const property = properties[0];
    if (!property.is_active) {
      return res.status(400).json({ message: 'Property is not active' });
    }

    if (number_of_guests > property.max_guests) {
      return res.status(400).json({ message: `Maximum ${property.max_guests} guests allowed` });
    }

    const [availabilityCheck] = await db.execute(
      'SELECT fn_check_availability(?, ?, ?) AS is_available',
      [property_id, check_in_date, check_out_date]
    );

    if (!availabilityCheck[0].is_available) {
      return res.status(400).json({ message: 'Selected dates are not available' });
    }

    const inDate = new Date(check_in_date);
    const outDate = new Date(check_out_date);
    const totalNights = Math.ceil((outDate - inDate) / (1000 * 60 * 60 * 24));
    const subtotal = totalNights * property.price_per_night;
    const cleaningFee = property.cleaning_fee || 0;
    const totalAmount = subtotal + cleaningFee;

    const [result] = await db.execute(`
      INSERT INTO reservations (
        property_id, tenant_id, check_in_date, check_out_date,
        guest_count, total_nights, price_per_night, cleaning_fee, total_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [property_id, req.user.user_id, check_in_date, check_out_date, number_of_guests, totalNights, property.price_per_night, cleaningFee, totalAmount]
    );

    res.status(201).json({
      message: 'Reservation created successfully',
      reservation_id: result.insertId,
      total_nights: totalNights,
      total_amount: totalAmount
    });

  } catch (error) {
    console.error('Reservation creation error:', error);
    res.status(500).json({ message: 'Failed to create reservation' });
  }
});

// =====================================================
// GET MY RESERVATIONS (alias for compatibility)
// =====================================================
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const { status, limit = 10, offset = 0 } = req.query;

    let query = `
      SELECT r.*, 
             p.title AS property_title, p.address, p.city,
             p.price_per_night, p.cleaning_fee,
             u.first_name AS owner_first_name, u.last_name AS owner_last_name,
             u.email AS owner_email, u.phone AS owner_phone,
             pay.payment_status, pay.payment_date,
             pi.image_url AS property_image
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
    console.error('Fetch my reservations error:', error);
    res.status(500).json({ message: 'Failed to fetch reservations' });
  }
});

// =====================================================
// UPDATE RESERVATION STATUS
// =====================================================
router.put('/:reservationId/status', authenticateToken, async (req, res) => {
  try {
    const { error, value } = updateStatusSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { status, reason } = value;
    const reservationId = req.params.reservationId;

    const [reservations] = await db.execute(`
      SELECT r.*, p.owner_id 
      FROM reservations r
      JOIN properties p ON r.property_id = p.property_id
      WHERE r.reservation_id = ?`,
      [reservationId]
    );

    if (reservations.length === 0) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    const reservation = reservations[0];
    const isOwner = reservation.owner_id === req.user.user_id;
    const isTenant = reservation.tenant_id === req.user.user_id;
    const isAdmin = req.user.user_role === 'admin';

    if (status === 'confirmed' && !isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Only the owner can confirm' });
    }
    if (status === 'cancelled' && !isOwner && !isTenant && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to cancel' });
    }
    if (status === 'completed' && !isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Only the owner can complete' });
    }

    let updateQuery = 'UPDATE reservations SET reservation_status = ?, updated_at = CURRENT_TIMESTAMP';
    const updateParams = [status];

    if (status === 'cancelled' && reason) {
      updateQuery += ', cancellation_reason = ?, cancellation_date = CURRENT_TIMESTAMP';
      updateParams.push(reason);
    }

    updateQuery += ' WHERE reservation_id = ?';
    updateParams.push(reservationId);

    await db.execute(updateQuery, updateParams);

    res.json({ message: `Reservation ${status}`, reservation_id: reservationId });

  } catch (error) {
    console.error('Update reservation status error:', error);
    res.status(500).json({ message: 'Status update failed' });
  }
});

module.exports = router;
