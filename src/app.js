const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// --------------- Global Middleware ---------------

// Security headers (allow inline scripts for the dashboard)
app.use(helmet({ contentSecurityPolicy: false }));

// Enable CORS
app.use(cors());

// Request logging (dev mode)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static frontend (testing dashboard)
app.use(express.static(path.join(__dirname, '..', 'public')));

// --------------- Routes ---------------

// Health check
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: '🍔 Last Byte API is running',
    version: '1.0.0',
  });
});

// Auth routes
app.use('/api/auth', require('./routes/authRoutes'));

// Admin routes
app.use('/api/admin', require('./routes/adminRoutes'));

// Shop owner routes
app.use('/api/shop', require('./routes/shopRoutes'));

// Order routes
app.use('/api/orders', require('./routes/orderRoutes'));

// Public listing routes
app.use('/api/listings', require('./routes/listingRoutes'));

// --------------- Error Handler ---------------
app.use(errorHandler);

module.exports = app;
