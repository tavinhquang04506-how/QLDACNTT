const asyncHandler = require('../../utils/asyncHandler');
const service = require('./service');

const listForProject = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listForProject(req.user, req.params.id) });
});

const get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.user, req.params.id) });
});

const create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, message: 'Tạo nhiệm vụ thành công', data: await service.create(req.user, req.params.id, req.body, req) });
});

const update = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Cập nhật nhiệm vụ thành công', data: await service.update(req.user, req.params.id, req.body, req) });
});

const stage = asyncHandler(async (req, res) => {
  const data = await service.moveTask(req.user, req.params.id, req.body.stage, req.body.note, req);
  res.json({ success: true, message: `Task ${req.params.id} → ${data.stage}`, data });
});

const review = asyncHandler(async (req, res) => {
  const data = await service.review(req.user, req.params.id, req.body, req);
  res.json({ success: true, message: data.stage === 'done' ? 'Đã nghiệm thu nhiệm vụ' : 'Đã trả lại nhiệm vụ', data });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.user, req.params.id, req);
  res.json({ success: true, message: 'Đã xóa nhiệm vụ' });
});

const logs = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.logs(req.user, req.params.id) });
});

module.exports = { listForProject, get, create, update, stage, review, remove, logs };
