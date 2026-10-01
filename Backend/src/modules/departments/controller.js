const asyncHandler = require('../../utils/asyncHandler');
const service = require('./service');
const { shapeDepartment } = require('./access');

const get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: shapeDepartment(await service.get(req.params.id), req.user) });
});

const create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, message: 'Tạo phòng ban thành công', data: await service.create(req.user, req.body, req) });
});

const update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.update(req.user, req.params.id, req.body, req) });
});

const remove = asyncHandler(async (req, res) => {
  await service.deactivate(req.user, req.params.id, req);
  res.json({ success: true, message: 'Đã ngừng hoạt động phòng ban' });
});

module.exports = { get, create, update, remove };
