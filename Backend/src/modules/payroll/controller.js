const asyncHandler = require('../../utils/asyncHandler');
const service = require('./service');

const listPeriods = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listPeriods() });
});

const getPeriod = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getPeriod(req.params.id) });
});

const calculate = asyncHandler(async (req, res) => {
  const data = await service.calculate(req.user, req.body.period, req);
  res.json({ success: true, message: `Đã tính lương tháng ${data.period} cho ${data.headcount} nhân viên`, data });
});

const anomalies = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.anomalies(req.params.id) });
});

const lock = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Đã chốt bảng lương', data: await service.lock(req.user, req.params.id, req.body, req) });
});

const transfer = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Đã đánh dấu chuyển khoản lương', data: await service.transfer(req.user, req.params.id, req) });
});

const bankTransfer = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.bankTransfer(req.params.id) });
});

const listPayslips = asyncHandler(async (req, res) => {
  const { data, pagination } = await service.listPayslips(req.user, req.query, req.scope);
  res.json({ success: true, data, pagination });
});

const myPayslips = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.myPayslips(req.user) });
});

const getPayslip = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getPayslip(req.user, req.params.id, req.scope) });
});

const updatePayslip = asyncHandler(async (req, res) => {
  const updated = await service.updatePayslip(req.user, req.params.id, req.body, req);
  res.json({ success: true, message: 'Đã cập nhật thông tin phiếu lương thành công', data: updated });
});

module.exports = { listPeriods, getPeriod, calculate, anomalies, lock, transfer, bankTransfer, listPayslips, myPayslips, getPayslip, updatePayslip };
