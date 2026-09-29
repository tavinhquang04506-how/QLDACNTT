// ============================================
// middleware/auth.js — JWT authentication
// ============================================
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// A KIOSK device account may only scan QR codes and manage its own login.
const KIOSK_ALLOWED = [
  ['POST', '/api/attendance/kiosk/punch'],
  ['GET', '/api/auth/me'],
  ['POST', '/api/auth/change-password'],
];

const reject = (res, status, message, code) => res.status(status).json({ success: false, ...(code && { code }), message });

/**
 * Verify the Bearer token, then load the account so that deactivation, offboarding and role
 * changes take effect immediately instead of when the token expires.
 * Sets req.user = { userId, employeeId, roleCode, email } from the database.
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reject(res, 401, 'Không tìm thấy token xác thực');
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
  } catch (error) {
    return error.name === 'TokenExpiredError'
      ? reject(res, 401, 'Token đã hết hạn, vui lòng đăng nhập lại')
      : reject(res, 401, 'Token không hợp lệ');
  }
  if (!decoded.userId) return reject(res, 401, 'Token không hợp lệ');

  try {
    const { rows } = await db.query(
      'SELECT id, employee_id, role_code, email, is_active FROM users WHERE id = $1', [decoded.userId]);
    const user = rows[0];
    if (!user || !user.is_active) return reject(res, 401, 'Tài khoản đã bị vô hiệu hóa', 'ACCOUNT_DISABLED');

    req.user = { userId: user.id, employeeId: user.employee_id, roleCode: user.role_code, email: user.email };

    if (user.role_code === 'KIOSK') {
      const path = req.originalUrl.split('?')[0].replace(/\/+$/, '');
      if (!KIOSK_ALLOWED.some(([method, allowed]) => method === req.method && allowed === path)) {
        return reject(res, 403, 'Tài khoản kiosk chỉ được dùng để chấm công', 'FORBIDDEN');
      }
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { authenticate };
