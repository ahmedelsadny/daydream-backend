// Main configuration file that exports all configurations
require('dotenv').config();
const database = require('./database');

// JWT Configuration
const jwt = {
  secret: process.env.JWT_SECRET || 'your-secret-key',
  expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  algorithm: 'HS256'
};

// Server Configuration
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const server = {
  port: process.env.PORT || 4000,
  host: process.env.HOST || '0.0.0.0',
  cors: {
    origin: function (origin, callback) {
      // Allow all if env is empty or set to '*'
      if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) return callback(null, true);
      if (!origin) return callback(null, true); // same-origin or curl
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Fallback: reflect origin to avoid 500 and let browser enforce
      return callback(null, origin);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204
  }
};

// Environment Configuration
const environment = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isStaging: process.env.NODE_ENV === 'staging',
  isProduction: process.env.NODE_ENV === 'production'
};

// Logging Configuration
const logging = {
  level: process.env.LOG_LEVEL || (environment.isProduction ? 'error' : 'debug'),
  format: process.env.LOG_FORMAT || 'combined'
};

// Export all configurations
module.exports = {
  database,
  jwt,
  server,
  environment,
  logging
};