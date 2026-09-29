class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message, details);
const unauthorized = (message = 'Chưa xác thực') => new AppError(401, 'UNAUTHORIZED', message);
const forbidden = (message = 'Không có quyền truy cập', details) => new AppError(403, 'FORBIDDEN', message, details);
const notFound = (message = 'Không tìm thấy dữ liệu') => new AppError(404, 'NOT_FOUND', message);
const conflict = (message, details) => new AppError(409, 'CONFLICT', message, details);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };
