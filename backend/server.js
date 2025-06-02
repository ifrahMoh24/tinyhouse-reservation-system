const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:5501'], 
    credentials: true
  }));
  
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (for uploaded property images)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'Tiny House Backend Server is running!'
  });
});

// DB test route (optional)
const db = require('./config/database');
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 + 1 AS result');
    res.json({ message: 'Database connected ✅', result: rows[0].result });
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed ❌', details: err.message });
  }
});

// Import and register routes
app.use('/auth', require('./routes/auth'));
app.use('/users', require('./routes/users'));
app.use('/properties', require('./routes/properties'));
app.use('/payments', require('./routes/payments'));
app.use('/reservations', require('./routes/reservations'));
app.use('/reviews', require('./routes/reviews'));
app.use('/admin', require('./routes/admin'));

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🧪 DB test:      http://localhost:${PORT}/test-db`);
});
