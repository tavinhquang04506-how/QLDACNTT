const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const { AppError } = require('../../utils/AppError');

const QR_TTL_SECONDS = 60;
const TYPE = 'attendance-qr';

// A key derived from the JWT secret, so a QR token can never be mistaken for an access token (and vice versa).
const qrKey = () => crypto.createHmac('sha256', config.jwt.secret).update('attendance-qr-v1').digest();

const invalid = () => new AppError(401, 'INVALID_QR_TOKEN', 'Mã QR không hợp lệ hoặc đã hết hạn');

function signQrToken(employeeId, { expiresIn = QR_TTL_SECONDS } = {}) {
  return jwt.sign({ typ: TYPE, sub: employeeId }, qrKey(), { expiresIn, jwtid: crypto.randomUUID() });
}

/** Verify signature, expiry and kind. Returns { employeeId, jti, exp } or throws 401 INVALID_QR_TOKEN. */
function verifyQrToken(token) {
  if (typeof token !== 'string' || token === '') throw invalid();
  try {
    const claims = jwt.verify(token, qrKey(), { algorithms: ['HS256'] });
    if (claims.typ !== TYPE || !claims.sub || !claims.jti) throw invalid();
    return { employeeId: claims.sub, jti: claims.jti, exp: claims.exp };
  } catch (err) {
    throw err instanceof AppError ? err : invalid();
  }
}

// Token ids already used, kept until they would have expired anyway (single process; a restart resets it,
// which is safe because tokens live only 60 seconds).
const used = new Map();

function consumeQrToken({ jti, exp }) {
  const now = Math.floor(Date.now() / 1000);
  for (const [id, expiry] of used) if (expiry <= now) used.delete(id);
  if (used.has(jti)) throw new AppError(401, 'QR_TOKEN_USED', 'Mã QR này đã được sử dụng');
  used.set(jti, exp);
}

module.exports = { signQrToken, verifyQrToken, consumeQrToken, QR_TTL_SECONDS };
