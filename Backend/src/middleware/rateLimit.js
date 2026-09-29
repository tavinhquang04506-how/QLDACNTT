const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const createAuthLimiter = ({ limit = parseInt(process.env.AUTH_RATE_LIMIT || '500', 10), windowMs = 15 * 60 * 1000 } = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message: 'Quá nhiều yêu cầu, vui lòng thử lại sau',
      }),
  });

const passthrough = (req, res, next) => next();

// Tests log in many times; the account lockout already protects against brute force there.
const authLimiter = config.isTest ? passthrough : createAuthLimiter();

module.exports = { createAuthLimiter, authLimiter };
