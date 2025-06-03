// ===== payments.js =====
const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const router = express.Router();

// =============================
// Validation schema
// =============================
const paymentSchema = Joi.object({
  reservation_id: Joi.number().integer().required(),
  amount: Joi.number().positive().required(),
  transaction_id: Joi.string().required(),
  payment_status: Joi.string().valid('pending', 'paid', 'failed').required()
});

// =====================================================
// CREATE PAYMENT
// =====================================================
router.post('/', authenticateToken, authorizeRoles('tenant'), async (req, res) => {
  try {
    const { error, value } = paymentSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { reservation_id, amount, transaction_id, payment_status } = value;

    const [reservations] = await db.execute(
      'SELECT * FROM reservations WHERE reservation_id = ? AND tenant_id = ?',
      [reservation_id, req.user.user_id]
    );

    if (reservations.length === 0) {
      return res.status(404).json({ message: 'Reservation not found or not yours' });
    }

    const [existing] = await db.execute(
      'SELECT * FROM payments WHERE reservation_id = ?',
      [reservation_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'Payment already exists for this reservation' });
    }

    const [result] = await db.execute(
      `INSERT INTO payments (reservation_id, amount, transaction_id, payment_status, payment_date)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [reservation_id, amount, transaction_id, payment_status]
    );

    res.status(201).json({
      message: 'Payment recorded successfully',
      payment_id: result.insertId
    });

  } catch (err) {
    console.error('Payment creation error:', err);
    res.status(500).json({ message: 'Failed to create payment' });
  }
});

// =====================================================
// GET PAYMENT STATUS BY RESERVATION ID - FIXED: Changed :reservation_id to :reservationId
// =====================================================
router.get('/details/:reservationId', authenticateToken, async (req, res) => {
  try {
    const reservationId = req.params.reservationId;

    const [payments] = await db.execute(
      'SELECT * FROM payments WHERE reservation_id = ?',
      [reservationId]
    );

    if (payments.length === 0) {
      return res.status(404).json({ message: 'No payment found for this reservation' });
    }

    res.json({ payment: payments[0] });

  } catch (err) {
    console.error('Get payment error:', err);
    res.status(500).json({ message: 'Failed to fetch payment' });
  }
});

// =====================================================
// ADMIN: VIEW ALL PAYMENTS
// =====================================================
router.get('/admin/all', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const [payments] = await db.execute(`
      SELECT p.*, r.tenant_id, u.first_name, u.last_name, r.total_amount
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.reservation_id
      JOIN users u ON r.tenant_id = u.user_id
      ORDER BY p.payment_date DESC
    `);

    res.json({ payments });

  } catch (err) {
    console.error('Admin get all payments error:', err);
    res.status(500).json({ message: 'Failed to fetch payments' });
  }
});

module.exports = router;