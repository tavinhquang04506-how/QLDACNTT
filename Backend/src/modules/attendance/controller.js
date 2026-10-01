const asyncHandler = require('../../utils/asyncHandler');
const service = require('./service');

const checkIn = asyncHandler(async (req, res) => {
  const { row, message } = await service.checkIn(req.user, req.body);
  res.status(201).json({ success: true, message, data: row });
});

const checkOut = asyncHandler(async (req, res) => {
  const { row, message } = await service.checkOut(req.user, req.body);
  res.json({ success: true, message, data: row });
});

const today = asyncHandler(async (req, res) => {
  const { row, checkedIn, checkedOut } = await service.today(req.user);
  res.json({ success: true, data: row, checkedIn, checkedOut });
});

const myQr = asyncHandler(async (req, res) => {
  res.json({ success: true, ...service.myQr(req.user) });
});

const kioskPunch = asyncHandler(async (req, res) => {
  const { action, created, row, message } = await service.kioskPunch(req.body);
  res.status(created ? 201 : 200).json({ success: true, action, message, data: row });
});

const list = asyncHandler(async (req, res) => {
  const { data, pagination } = await service.list(req.user, req.query, req.scope);
  res.json({ success: true, data, pagination });
});

const adjust = asyncHandler(async (req, res) => {
  const { row, created } = await service.adjust(req.user, req.body, req);
  res.status(created ? 201 : 200).json({ success: true, message: 'Đã cập nhật chấm công', data: row });
});

const timesheet = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.timesheet(req.user, req.query, req.scope) });
});

const exceptions = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await service.exceptions(req.user, req.query, req.scope)) });
});

const live = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.live(req.user, req.scope) });
});

const getKioskCode = asyncHandler(async (req, res) => {
  res.json({ success: true, data: service.getKioskCode() });
});

const appealService = require('./appealService');

const createAppeal = asyncHandler(async (req, res) => {
  const data = {
    ...req.body,
    employee_id: req.user?.id || req.user?.employee_id || req.body.employee_id,
    employee_name: req.user?.full_name || req.user?.name || req.body.employee_name,
    department_name: req.user?.department || req.body.department_name,
  };
  const result = await appealService.createAppeal(data);
  res.status(201).json({ success: true, message: 'Đã gửi đơn giải trình chấm công', data: result });
});

const getAppeals = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'HR_MANAGER') {
    filter.employee_id = req.user?.id || req.user?.employee_id;
  }
  const data = await appealService.getAppeals(filter);
  res.json({ success: true, data });
});

const reviewAppeal = asyncHandler(async (req, res) => {
  const result = await appealService.reviewAppeal(req.params.id, {
    status: req.body.status,
    review_note: req.body.review_note,
    reviewer_id: req.user?.id || req.user?.employee_id,
    reviewer_name: req.user?.full_name || req.user?.name,
  });
  res.json({ success: true, message: 'Đã cập nhật trạng thái đơn giải trình', data: result });
});

module.exports = {
  checkIn,
  checkOut,
  today,
  myQr,
  kioskPunch,
  list,
  adjust,
  timesheet,
  exceptions,
  live,
  getKioskCode,
  createAppeal,
  getAppeals,
  reviewAppeal,
};
