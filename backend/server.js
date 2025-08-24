const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');
const vitalsRoutes = require('./routes/vitals');
const alertsRoutes = require('./routes/alerts');
const locationRoutes = require('./routes/location');
const attendanceRoutes = require('./routes/attendance');
const complianceRoutes = require('./routes/compliance');

const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const { initializeSocket } = require('./socket');

const app = express();

// Trust proxy for production deployment (Render.com, Heroku, etc.)
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = initializeSocket(server);

const PORT = process.env.PORT || 5000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined'));
app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Database test endpoint
const { testConnection, query } = require('./config/db');
app.get('/api/debug/db-test', async (req, res) => {
  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      return res.status(500).json({ 
        error: 'Database connection failed',
        env: {
          NODE_ENV: process.env.NODE_ENV,
          DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT SET',
          FRONTEND_URL: process.env.FRONTEND_URL || 'NOT SET'
        }
      });
    }
    
    // Test if users table exists and has data
    const userCount = await query('SELECT COUNT(*) FROM users');
    
    res.json({
      status: 'Database connected',
      userCount: userCount.rows[0].count,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT SET', 
        FRONTEND_URL: process.env.FRONTEND_URL || 'NOT SET'
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Database test failed',
      message: error.message,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT SET',
        FRONTEND_URL: process.env.FRONTEND_URL || 'NOT SET'
      }
    });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes); // Public for IoT devices
app.use('/api/vitals', authMiddleware, vitalsRoutes);
app.use('/api/alerts', authMiddleware, alertsRoutes);
app.use('/api/location', authMiddleware, locationRoutes);
app.use('/api/attendance', authMiddleware, attendanceRoutes);
app.use('/api/compliance', authMiddleware, complianceRoutes);

// Socket.io is now initialized and configured in socket.js

// Make io available to routes
app.set('io', io);

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, server, io };