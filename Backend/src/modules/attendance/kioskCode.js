const crypto = require('crypto');
const config = require('../../config/env');

const STEP_SECONDS = 20; // Chu kỳ đổi mã 20 giây
const SECRET_SALT = 'kiosk-rolling-secret-2026';

function getHmacSecret() {
  return crypto.createHmac('sha256', config.jwt.secret || 'default-secret')
    .update(SECRET_SALT)
    .digest();
}

/**
 * Generate 6-digit numeric code for a specific time step
 */
function getCodeForStep(step) {
  const hmac = crypto.createHmac('sha256', getHmacSecret());
  hmac.update(step.toString());
  const hash = hmac.digest('hex');
  // Lấy 8 ký tự hex đầu tiên chuyển thành số nguyên và lấy 6 chữ số
  const num = parseInt(hash.substring(0, 8), 16);
  const code = (num % 900000 + 100000).toString(); // Đảm bảo luôn đủ 6 chữ số (100000 - 999999)
  return code;
}

/**
 * Get current rolling code and remaining seconds in current 20s window
 */
function getCurrentKioskCode() {
  const nowMs = Date.now();
  const currentStep = Math.floor(nowMs / (STEP_SECONDS * 1000));
  const currentSecond = Math.floor(nowMs / 1000);
  const remainingSeconds = STEP_SECONDS - (currentSecond % STEP_SECONDS);

  return {
    code: getCodeForStep(currentStep),
    expiresIn: remainingSeconds === 0 ? STEP_SECONDS : remainingSeconds,
    stepDuration: STEP_SECONDS,
    timestamp: nowMs
  };
}

/**
 * Validate submitted code: accepts current step, previous step (grace period 10-20s), or next step
 */
function validateKioskCode(inputCode) {
  if (!inputCode) return false;
  const sanitized = String(inputCode).trim();
  if (sanitized.length !== 6) return false;

  const nowMs = Date.now();
  const currentStep = Math.floor(nowMs / (STEP_SECONDS * 1000));

  // Chấp nhận mã hiện tại, mã bước trước (grace window) và mã bước kế tiếp (clock skew)
  const validCodes = [
    getCodeForStep(currentStep),
    getCodeForStep(currentStep - 1),
    getCodeForStep(currentStep + 1)
  ];

  return validCodes.includes(sanitized);
}

module.exports = {
  STEP_SECONDS,
  getCurrentKioskCode,
  validateKioskCode
};
