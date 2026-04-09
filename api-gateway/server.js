const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const axios = require('axios');
const jwt = require('jsonwebtoken');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Service URLs
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:5001';
const RESTAURANT_SERVICE_URL = process.env.RESTAURANT_SERVICE_URL || 'http://localhost:5002';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:5003';

// Auth middleware for protected routes
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};

// Helper: forward request to a service
const forwardRequest = async (req, res, serviceUrl) => {
  try {
    const url = `${serviceUrl}${req.originalUrl}`;
    const config = {
      method: req.method,
      url,
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.authorization && { Authorization: req.headers.authorization }),
      },
      data: req.body,
      timeout: 10000,
    };

    const response = await axios(config);
    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      console.error(`Proxy error to ${serviceUrl}:`, error.message);
      res.status(502).json({
        success: false,
        message: 'Service unavailable',
      });
    }
  }
};

// Gateway health check
app.get('/health', (req, res) => {
  res.status(200).json({
    service: 'api-gateway',
    status: 'running',
    timestamp: new Date(),
    services: {
      user: USER_SERVICE_URL,
      restaurant: RESTAURANT_SERVICE_URL,
      order: ORDER_SERVICE_URL,
    },
  });
});

// ========== USER SERVICE ==========
app.all('/api/users/*', (req, res) => forwardRequest(req, res, USER_SERVICE_URL));
app.all('/api/users', (req, res) => forwardRequest(req, res, USER_SERVICE_URL));

// ========== RESTAURANT SERVICE ==========
app.all('/api/restaurants/*', (req, res) => forwardRequest(req, res, RESTAURANT_SERVICE_URL));
app.all('/api/restaurants', (req, res) => forwardRequest(req, res, RESTAURANT_SERVICE_URL));

// ========== SEED ROUTE ==========
app.all('/api/seed', (req, res) => forwardRequest(req, res, RESTAURANT_SERVICE_URL));

// ========== ORDER SERVICE (protected) ==========
app.all('/api/orders/*', authMiddleware, (req, res) => forwardRequest(req, res, ORDER_SERVICE_URL));
app.all('/api/orders', authMiddleware, (req, res) => forwardRequest(req, res, ORDER_SERVICE_URL));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'API Gateway error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`   → User Service:       ${USER_SERVICE_URL}`);
  console.log(`   → Restaurant Service:  ${RESTAURANT_SERVICE_URL}`);
  console.log(`   → Order Service:       ${ORDER_SERVICE_URL}`);
});
