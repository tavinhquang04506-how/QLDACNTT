const asyncHandler = require('../../utils/asyncHandler');
const service = require('./service');

const listForEmployee = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listForEmployee(req.user, req.params.id, req.scope) });
});

const get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.user, req.params.id, req.scope) });
});

const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.user, req.params.id, req.body, req);
  res.status(201).json({ success: true, message: 'Tạo hợp đồng thành công', data });
});

const update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.update(req.user, req.params.id, req.body, req) });
});

const activate = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Đã kích hoạt hợp đồng', data: await service.activate(req.user, req.params.id, req) });
});

const terminate = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Đã chấm dứt hợp đồng', data: await service.terminate(req.user, req.params.id, req.body, req) });
});

module.exports = { listForEmployee, get, create, update, activate, terminate };
