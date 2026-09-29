const asyncHandler = require('../../utils/asyncHandler');
const service = require('./service');

const list = asyncHandler(async (req, res) => {
  const { data, pagination } = await service.list(req.user, req.query);
  res.json({ success: true, data, pagination });
});
const categories = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.categories() });
});
const get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.user, req.params.id) });
});
const create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, message: 'Đã tạo tài liệu', data: await service.create(req.user, req.body, req) });
});
const update = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Đã cập nhật tài liệu', data: await service.update(req.user, req.params.id, req.body, req) });
});
const remove = asyncHandler(async (req, res) => {
  await service.deactivate(req.user, req.params.id, req);
  res.json({ success: true, message: 'Đã ngừng sử dụng tài liệu' });
});

module.exports = { list, categories, get, create, update, remove };
