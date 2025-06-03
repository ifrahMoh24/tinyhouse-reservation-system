const express = require('express');
const db = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Get dashboard statistics
router.get('/dashboard-stats', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    // Get total users
    const [userCount] = await db.execute('SELECT COUNT(*) as total FROM users WHERE user_role != "admin"');
    
    // Get total properties
    const [propertyCount] = await db.execute('SELECT COUNT(*) as total FROM properties WHERE is_active = 1');
    
    // Get total reservations
    const [reservationCount] = await db.execute('SELECT COUNT(*) as total FROM reservations');
    
    // Get total revenue
    const [revenue] = await db.execute(`
      SELECT COALESCE(SUM(total_amount), 0) as total 
      FROM reservations 
      WHERE reservation_status = 'completed'
    `);

    // Get active users (logged in last 30 days)
    const [activeUsers] = await db.execute(`
      SELECT COUNT(*) as total 
      FROM users 
      WHERE last_login >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND user_role != 'admin'
    `);

    // Get pending reservations
    const [pendingReservations] = await db.execute(`
      SELECT COUNT(*) as total 
      FROM reservations 
      WHERE reservation_status = 'pending'
    `);

    res.json({
      totalUsers: userCount[0].total,
      totalProperties: propertyCount[0].total,
      totalReservations: reservationCount[0].total,
      totalRevenue: revenue[0].total,
      activeUsers: activeUsers[0].total,
      pendingReservations: pendingReservations[0].total
    });
  } catch (error) {
    console.error('Failed to fetch admin stats:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard statistics' });
  }
});

// Alternative stats endpoint 
router.get('/stats', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    // Get basic counts
    const [userCount] = await db.execute('SELECT COUNT(*) as count FROM users WHERE user_role != "admin"');
    const [reservationCount] = await db.execute('SELECT COUNT(*) as count FROM reservations');
    const [revenue] = await db.execute(`
      SELECT COALESCE(SUM(total_amount), 0) as total 
      FROM reservations 
      WHERE reservation_status = 'completed'
    `);

    res.json({
      user_count: userCount[0].count,
      reservation_count: reservationCount[0].count,
      total_revenue: revenue[0].total
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    res.status(500).json({ message: 'Failed to fetch statistics' });
  }
});

// Get all users
router.get('/users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const [users] = await db.execute(`
      SELECT user_id, first_name, last_name, email, user_role, is_active, 
             registration_date, last_login
      FROM users
      ORDER BY registration_date DESC
    `);

    res.json({ users });
  } catch (error) {
    console.error('Failed to fetch users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// Toggle user status
router.put('/users/:id/toggle-status', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const userId = req.params.id;

    // Validate userId is a number
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    await db.execute(
      'UPDATE users SET is_active = NOT is_active WHERE user_id = ?',
      [userId]
    );

    res.json({ message: 'User status updated successfully' });
  } catch (error) {
    console.error('Failed to toggle user status:', error);
    res.status(500).json({ message: 'Failed to update user status' });
  }
});

// Get all properties for admin
router.get('/properties', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const [properties] = await db.execute(`
      SELECT p.*, u.first_name as owner_first_name, u.last_name as owner_last_name,
             COUNT(r.reservation_id) as total_bookings,
             COALESCE(AVG(rev.rating), 0) as average_rating
      FROM properties p
      LEFT JOIN users u ON p.owner_id = u.user_id
      LEFT JOIN reservations r ON p.property_id = r.property_id
      LEFT JOIN reviews rev ON p.property_id = rev.property_id
      GROUP BY p.property_id
      ORDER BY p.created_at DESC
    `);

    res.json({ properties });
  } catch (error) {
    console.error('Failed to fetch properties:', error);
    res.status(500).json({ message: 'Failed to fetch properties' });
  }
});

// Get top-rated properties
router.get('/top-properties', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const [topProperties] = await db.execute(`
      SELECT 
        p.property_id,
        p.title as name,
        p.city as location,
        ROUND(AVG(r.rating), 1) AS avg_rating,
        COUNT(r.review_id) AS review_count
      FROM properties p
      JOIN reviews r ON p.property_id = r.property_id
      GROUP BY p.property_id
      HAVING review_count >= 1
      ORDER BY avg_rating DESC, review_count DESC
      LIMIT 5
    `);

    res.json(topProperties);
  } catch (error) {
    console.error('Failed to fetch top-rated properties:', error);
    res.status(500).json({ message: 'Failed to fetch top-rated properties' });
  }
});
  
module.exports = router;