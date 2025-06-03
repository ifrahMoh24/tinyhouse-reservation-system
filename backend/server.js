const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:5501',
  'http://localhost:5501',
  'null' // for file:// protocol (local HTML files)
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// DB test route
app.get('/test-db', async (req, res) => {
  try {
    const db = require('./config/database');
    const [rows] = await db.query('SELECT 1 + 1 AS result');
    res.json({ message: 'Database connected ✅', result: rows[0].result });
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed ❌', details: err.message });
  }
});

// Import and register routes
try {
  console.log('Loading routes...');

  app.use('/auth', require('./routes/auth'));
  console.log('✅ Auth routes loaded');

  app.use('/users', require('./routes/users'));
  console.log('✅ User routes loaded');

  app.use('/properties', require('./routes/properties'));
  console.log('✅ Property routes loaded');

  app.use('/payments', require('./routes/payments'));
  console.log('✅ Payment routes loaded');

  app.use('/reservations', require('./routes/reservations'));
  console.log('✅ Reservation routes loaded');

  app.use('/reviews', require('./routes/reviews'));
  console.log('✅ Review routes loaded');

  app.use('/admin', require('./routes/admin'));
  console.log('✅ Admin routes loaded');

  console.log('✅ All routes loaded successfully');
} catch (error) {
  console.error('❌ Error loading routes:', error);
  process.exit(1);
}

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🧪 DB test:      http://localhost:${PORT}/test-db`);
  console.log(`📁 Uploads:      http://localhost:${PORT}/uploads/`);
});

module.exports = app;
