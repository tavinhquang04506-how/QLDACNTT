const asyncHandler = require('../../utils/asyncHandler');
const service = require('./service');

const list = asyncHandler(async (req, res) => {
  const { data, pagination } = await service.list(req.user, req.query);
  res.json({ success: true, data, pagination });
});
const get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.user, req.params.id) });
});
const create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, message: 'Đã đăng thông báo', data: await service.create(req.user, req.body, req) });
});
const update = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Đã cập nhật thông báo', data: await service.update(req.user, req.params.id, req.body, req) });
});
const remove = asyncHandler(async (req, res) => {
  await service.remove(req.user, req.params.id, req);
  res.json({ success: true, message: 'Đã xóa thông báo' });
});
const getReaders = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getReaders(req.user, req.params.id) });
});
const remindUnread = asyncHandler(async (req, res) => {
  const result = await service.remindUnread(req.user, req.params.id, req);
  res.json({ success: true, ...result });
});

module.exports = { list, get, create, update, remove, getReaders, remindUnread };
