const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Validation schema for creating a payment
const paymentSchema = Joi.object({
  reservationId: Joi.number().integer().required(),
  paymentMethod: Joi.string().valid('credit_card', 'bank_transfer', 'paypal', 'cash').required()
});

// Create a payment
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { error, value } = paymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { reservationId, paymentMethod } = value;

    // Check if reservation exists and belongs to the logged-in user
    const [reservations] = await db.execute(
      'SELECT * FROM reservations WHERE reservation_id = ? AND tenant_id = ?',
      [reservationId, req.user.user_id]
    );

    if (reservations.length === 0) {
      return res.status(404).json({ message: 'Reservation not found or not authorized' });
    }

    const reservation = reservations[0];

    // Generate unique transaction ID
    const transactionId = `TXN_${Date.now()}_${reservationId}`;

    // Insert payment record
    await db.execute(
      `INSERT INTO payments (reservation_id, payment_amount, payment_method, payment_status, transaction_id) 
       VALUES (?, ?, ?, 'completed', ?)`,
      [reservationId, reservation.total_amount, paymentMethod, transactionId]
    );

    // Update reservation status to 'confirmed'
    await db.execute(
      'UPDATE reservations SET reservation_status = "confirmed" WHERE reservation_id = ?',
      [reservationId]
    );

    res.status(201).json({
      message: 'Payment successful',
      transactionId
    });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ message: 'Payment processing failed' });
  }
});

// Get payment history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const [payments] = await db.execute(`
      SELECT p.*, r.check_in_date, r.check_out_date, 
             pr.name AS property_name
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.reservation_id
      JOIN properties pr ON r.property_id = pr.property_id
      WHERE r.tenant_id = ?
      ORDER BY p.payment_date DESC
    `, [req.user.user_id]);

    res.json({ payments });
  } catch (error) {
    console.error('Fetch payment history error:', error);
    res.status(500).json({ message: 'Failed to retrieve payment history' });
  }
});

module.exports = router;
