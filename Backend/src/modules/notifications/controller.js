const asyncHandler = require('../../utils/asyncHandler');
const service = require('./service');

const list = asyncHandler(async (req, res) => {
  const { data, pagination, unreadCount } = await service.list(req.user, req.query);
  res.json({ success: true, data, pagination, unreadCount });
});
const unreadCount = asyncHandler(async (req, res) => {
  res.json({ success: true, count: await service.unreadCount(req.user) });
});
const markRead = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.markRead(req.user, req.params.id) });
});
const markAllRead = asyncHandler(async (req, res) => {
  res.json({ success: true, updated: await service.markAllRead(req.user) });
});
const remove = asyncHandler(async (req, res) => {
  await service.remove(req.user, req.params.id);
  res.json({ success: true, message: 'Đã xóa thông báo' });
});
const clearRead = asyncHandler(async (req, res) => {
  const result = await service.clearRead(req.user);
  res.json({ success: true, message: 'Đã dọn dẹp các thông báo đã đọc', ...result });
});
const create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, message: 'Đã gửi thông báo', data: await service.create(req.user, req.body, req) });
});

module.exports = { list, unreadCount, markRead, markAllRead, remove, clearRead, create };
