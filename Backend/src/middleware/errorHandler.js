const { ZodError } = require('zod');
const { AppError } = require('../utils/AppError');

const notFoundHandler = (req, res) =>
  res.status(404).json({
    success: false,
    code: 'ROUTE_NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} không tồn tại`,
  });

const fail = (status, code, message, extra = {}) => ({
  status,
  body: { success: false, code, message, ...extra },
});

function toResponse(err) {
  if (err instanceof AppError) {
    return fail(err.status, err.code, err.message, err.details !== undefined ? { details: err.details } : {});
  }
  if (err instanceof ZodError) {
    return fail(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', {
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err && err.type === 'entity.parse.failed') return fail(400, 'INVALID_JSON', 'Body JSON không hợp lệ');
  if (err && err.type === 'entity.too.large') return fail(413, 'PAYLOAD_TOO_LARGE', 'Dữ liệu gửi lên quá lớn');
  if (err && (err.code === '40P01' || err.code === '40001')) {
    return fail(409, 'RETRY', 'Hệ thống đang bận, vui lòng thử lại');
  }
  if (err && err.code === '23505') return fail(409, 'CONFLICT', 'Dữ liệu đã tồn tại');
  if (err && err.code === '23503') return fail(409, 'REFERENCE_ERROR', 'Dữ liệu tham chiếu không hợp lệ');
  if (err && (err.code === '23514' || err.code === '22P02')) {
    return fail(400, 'VALIDATION_ERROR', 'Dữ liệu vi phạm ràng buộc');
  }
  return fail(500, 'INTERNAL_ERROR', 'Internal Server Error');
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const { status, body } = toResponse(err);
  if (status === 500) console.error('❌ Unhandled error:', err);
  res.status(status).json(body);
}

module.exports = { notFoundHandler, errorHandler };
