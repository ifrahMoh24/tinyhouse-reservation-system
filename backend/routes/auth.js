const express = require('express');
const Joi = require('joi');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const router = express.Router();
router.get('/test', (req, res) => {
  res.json({ message: 'Auth route is active' });
});
// ============================
// Register Validation Schema
// ============================
const registerSchema = Joi.object({
  first_name: Joi.string().max(50).required(),
  last_name: Joi.string().max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().optional().allow(null, ''),
  user_role: Joi.string().valid('admin', 'owner', 'tenant').default('tenant')
});

// ============================
// Register Endpoint (Fixed)
// ============================
router.post('/register', async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });

  const { first_name, last_name, email, password, phone, user_role } = value;

  try {
    const hashed = await bcrypt.hash(password, 10);
    const [existingUser] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(409).json({ success: false, message: 'Email is already registered' });
    }

    const [result] = await db.execute(
      `INSERT INTO users 
        (first_name, last_name, email, password_hash, phone, user_role, is_active) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [first_name, last_name, email, hashed, phone || null, user_role, true]
    );

    const newUser = {
      user_id: result.insertId,
      first_name,
      last_name,
      email,
      role: user_role
    };

    const token = jwt.sign(
      {
        user_id: newUser.user_id,
        name: `${first_name} ${last_name}`,
        user_role
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: newUser
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// ============================
// Login Validation Schema
// ============================
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// ============================
// Login Endpoint (Fixed)
// ============================
router.post('/login', async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });

  const { email, password } = value;

  try {
    const [users] = await db.execute(
      'SELECT user_id, first_name, last_name, email, password_hash, user_role, is_active FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account is inactive' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        name: `${user.first_name} ${user.last_name}`,
        user_role: user.user_role
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // ✅ Send success and user info
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        user_id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.user_role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

  module.exports = router;
  