const asyncHandler = require('../../utils/asyncHandler');
const service = require('./service');

const list = asyncHandler(async (req, res) => {
  const { data, pagination } = await service.list(req.query);
  res.json({ success: true, data, pagination });
});

const get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.params.id) });
});

const create = asyncHandler(async (req, res) => {
  const { user, temporaryPassword } = await service.create(req.user, req.body, req);
  res.status(201).json({
    success: true,
    message: 'Tạo tài khoản thành công',
    data: user,
    ...(temporaryPassword && { temporaryPassword }),
  });
});

const update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.update(req.user, req.params.id, req.body, req) });
});

const resetPassword = asyncHandler(async (req, res) => {
  const temporaryPassword = await service.resetPassword(req.user, req.params.id, req);
  res.json({
    success: true,
    message: 'Đã đặt lại mật khẩu, người dùng phải đổi mật khẩu ở lần đăng nhập kế tiếp',
    temporaryPassword,
  });
});

const unlock = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.unlock(req.user, req.params.id, req) });
});

module.exports = { list, get, create, update, resetPassword, unlock };
