// ===== reviews.js =====
const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Validation schema for review creation and update
const reviewSchema = Joi.object({
  property_id: Joi.number().integer().required(),
  rating: Joi.number().min(1).max(5).required(),
  comment: Joi.string().max(1000).required()
});

// =====================================================
// POST A REVIEW
// =====================================================
router.post('/', authenticateToken, authorizeRoles('tenant'), async (req, res) => {
  try {
    const { error, value } = reviewSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { property_id, rating, comment } = value;

    // Check if user already reviewed this property
    const [existing] = await db.execute(`
      SELECT * FROM reviews 
      WHERE tenant_id = ? AND property_id = ?
    `, [req.user.user_id, property_id]);

    if (existing.length > 0) {
      return res.status(400).json({ message: 'You have already reviewed this property' });
    }

    // Insert new review
    const [result] = await db.execute(`
      INSERT INTO reviews (
        tenant_id, property_id, rating, comment, review_date
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [req.user.user_id, property_id, rating, comment]);

    res.status(201).json({
      message: 'Review submitted successfully',
      review_id: result.insertId
    });

  } catch (err) {
    console.error('Submit review error:', err);
    res.status(500).json({ message: 'Failed to submit review' });
  }
});

// =====================================================
// GET REVIEWS FOR A PROPERTY - FIXED: Changed :property_id to :propertyId
// =====================================================
router.get('/property/:propertyId', async (req, res) => {
  try {
    const propertyId = req.params.propertyId;

    const [reviews] = await db.execute(`
      SELECT r.*, u.first_name, u.last_name
      FROM reviews r
      JOIN users u ON r.tenant_id = u.user_id
      WHERE r.property_id = ?
      ORDER BY r.review_date DESC
    `, [propertyId]);

    res.json({ reviews });

  } catch (err) {
    console.error('Fetch reviews error:', err);
    res.status(500).json({ message: 'Failed to fetch reviews' });
  }
});

// =====================================================
// UPDATE A REVIEW - FIXED: Changed :id to :reviewId
// =====================================================
router.put('/:reviewId', authenticateToken, authorizeRoles('tenant'), async (req, res) => {
  try {
    const { error, value } = reviewSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { property_id, rating, comment } = value;
    const reviewId = req.params.reviewId;

    const [existing] = await db.execute(`
      SELECT * FROM reviews WHERE review_id = ? AND tenant_id = ?
    `, [reviewId, req.user.user_id]);

    if (existing.length === 0) {
      return res.status(404).json({ message: 'Review not found or not yours' });
    }

    await db.execute(`
      UPDATE reviews 
      SET property_id = ?, rating = ?, comment = ?, updated_at = CURRENT_TIMESTAMP
      WHERE review_id = ?
    `, [property_id, rating, comment, reviewId]);

    res.json({ message: 'Review updated successfully' });

  } catch (err) {
    console.error('Update review error:', err);
    res.status(500).json({ message: 'Failed to update review' });
  }
});

// =====================================================
// DELETE A REVIEW - FIXED: Changed :id to :reviewId
// =====================================================
router.delete('/:reviewId', authenticateToken, async (req, res) => {
  try {
    const reviewId = req.params.reviewId;

    const [existing] = await db.execute(`
      SELECT * FROM reviews WHERE review_id = ?
    `, [reviewId]);

    if (existing.length === 0) {
      return res.status(404).json({ message: 'Review not found' });
    }

    const review = existing[0];
    const isOwner = review.tenant_id === req.user.user_id;
    const isAdmin = req.user.user_role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to delete this review' });
    }

    await db.execute('DELETE FROM reviews WHERE review_id = ?', [reviewId]);

    res.json({ message: 'Review deleted successfully' });

  } catch (err) {
    console.error('Delete review error:', err);
    res.status(500).json({ message: 'Failed to delete review' });
  }
});

module.exports = router;
