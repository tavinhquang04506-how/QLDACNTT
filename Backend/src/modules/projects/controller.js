const asyncHandler = require('../../utils/asyncHandler');
const service = require('./service');

const list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.user) });
});

const get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.user, req.params.id) });
});

const create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, message: 'Tạo dự án thành công', data: await service.create(req.user, req.body, req) });
});

const update = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Cập nhật dự án thành công', data: await service.update(req.user, req.params.id, req.body, req) });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.user, req.params.id, req);
  res.json({ success: true, message: 'Đã xóa dự án' });
});

module.exports = { list, get, create, update, remove };
