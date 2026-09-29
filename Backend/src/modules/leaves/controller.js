const asyncHandler = require('../../utils/asyncHandler');
const service = require('./service');

const create = asyncHandler(async (req, res) => {
  const { row, autoApproved } = await service.create(req.user, req.body, req);
  res.status(201).json({
    success: true,
    message: autoApproved ? 'Đơn nghỉ phép đã được phê duyệt' : 'Đã nộp đơn nghỉ phép — chờ duyệt',
    data: row,
  });
});

const list = asyncHandler(async (req, res) => {
  const { data, pagination } = await service.list(req.user, req.query, req.scope);
  res.json({ success: true, data, pagination });
});

const get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.user, req.params.id, req.scope) });
});

const calendar = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.calendar(req.user, req.query, req.scope) });
});

const balances = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.balances(req.user, req.params.employeeId, req.scope) });
});

const types = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.types() });
});

const approve = asyncHandler(async (req, res) => {
  const row = await service.decideOn(req.user, req.params.id, 'approve', req.body.note, req);
  res.json({
    success: true,
    message: row.stage === 'DA_PHE_DUYET' ? 'Đã phê chuẩn — nghỉ phép được duyệt' : 'Đã duyệt cấp 1 — chờ HR phê chuẩn',
    data: row,
  });
});

const reject = asyncHandler(async (req, res) => {
  const row = await service.decideOn(req.user, req.params.id, 'reject', req.body.note, req);
  res.json({ success: true, message: 'Đã từ chối đơn nghỉ phép', data: row });
});

const cancel = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Đã hủy đơn nghỉ phép', data: await service.cancel(req.user, req.params.id, req) });
});

module.exports = { create, list, get, calendar, balances, types, approve, reject, cancel };
