const asyncHandler = require('../../utils/asyncHandler');
const service = require('./service');

const list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.list(req.user) });
});
const get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.user, req.params.id) });
});
const create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, message: 'Tạo nhóm thành công', data: await service.create(req.user, req.body, req) });
});
const update = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Cập nhật nhóm thành công', data: await service.update(req.user, req.params.id, req.body, req) });
});
const remove = asyncHandler(async (req, res) => {
  await service.remove(req.user, req.params.id, req);
  res.json({ success: true, message: 'Đã xóa nhóm' });
});
const addMember = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, message: 'Đã thêm thành viên', data: await service.addMember(req.user, req.params.id, req.body, req) });
});
const removeMember = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Đã xóa thành viên', data: await service.removeMember(req.user, req.params.id, req.params.employeeId, req) });
});
const listMessages = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listMessages(req.user, req.params.id, req.query) });
});
const postMessage = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.postMessage(req.user, req.params.id, req.body) });
});
const clearMessages = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Đã xóa toàn bộ lịch sử tin nhắn', data: await service.clearMessages(req.user, req.params.id) });
});
const leaveSquad = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Đã rời nhóm trò chuyện', data: await service.leaveSquad(req.user, req.params.id) });
});
const rejoinSquad = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Đã tham gia lại nhóm trò chuyện', data: await service.rejoinSquad(req.user, req.params.id) });
});

module.exports = { list, get, create, update, remove, addMember, removeMember, listMessages, postMessage, clearMessages, leaveSquad, rejoinSquad };

