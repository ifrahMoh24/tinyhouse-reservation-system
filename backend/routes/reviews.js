const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Validation schema
const createReviewSchema = Joi.object({
  reservationId: Joi.number().integer().required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  title: Joi.string().max(200).optional().allow(''),
  comment: Joi.string().max(1000).optional().allow('')
});

// Create review (tenant only)
router.post('/', authenticateToken, authorizeRoles('tenant'), async (req, res) => {
  try {
    const { error, value } = createReviewSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { reservationId, rating, title, comment } = value;

    // Ensure completed reservation belongs to this tenant
    const [reservations] = await db.execute(
      `SELECT r.*, p.property_id 
       FROM reservations r 
       JOIN properties p ON r.property_id = p.property_id
       WHERE r.reservation_id = ? AND r.tenant_id = ? AND r.reservation_status = 'completed'`,
      [reservationId, req.user.user_id]
    );

    if (reservations.length === 0) {
      return res.status(404).json({ message: 'Completed reservation not found' });
    }

    const reservation = reservations[0];

    // Check for duplicate review
    const [existing] = await db.execute(
      'SELECT review_id FROM reviews WHERE reservation_id = ?',
      [reservationId]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: 'Review already submitted for this reservation' });
    }

    // Insert review
    const [result] = await db.execute(
      `INSERT INTO reviews (reservation_id, property_id, tenant_id, rating, title, comment) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        reservationId,
        reservation.property_id,
        req.user.user_id,
        rating,
        title || null,
        comment || null
      ]
    );

    res.status(201).json({
      message: 'Review created successfully',
      reviewId: result.insertId
    });
  } catch (error) {
    console.error('Review creation error:', error);
    res.status(500).json({ message: 'Failed to create review' });
  }
});

// Get reviews for a property
router.get('/property/:propertyId', async (req, res) => {
  try {
    const [reviews] = await db.execute(`
      SELECT r.review_id, r.rating, r.title, r.comment, r.review_date,
             u.first_name, u.last_name
      FROM reviews r
      JOIN users u ON r.tenant_id = u.user_id
      WHERE r.property_id = ? AND r.is_approved = 1
      ORDER BY r.review_date DESC
    `, [req.params.propertyId]);

    res.json({
      reviews: reviews.map(r => ({
        reviewId: r.review_id,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        reviewDate: r.review_date,
        firstName: r.first_name,
        lastName: r.last_name
      }))
    });
  } catch (error) {
    console.error('Failed to fetch reviews:', error);
    res.status(500).json({ message: 'Failed to fetch reviews' });
  }
});

module.exports = router;
