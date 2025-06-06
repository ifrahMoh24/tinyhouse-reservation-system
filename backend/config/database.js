const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tiny_house_system',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
  // Removed deprecated options: acquireTimeout, timeout, reconnect, handleDisconnects
};

const pool = mysql.createPool(dbConfig);

// Optional: test the DB connection on startup
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
};

testConnection();

module.exports = pool;