const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../policies');
const asyncHandler = require('../../utils/asyncHandler');
const { createApprovalController } = require('../approvals/controller');
const { idParam, listQuery, approveBody, rejectBody } = require('../leaves/schema');
const service = require('./service');
const { createBody } = require('./schema');

const controller = createApprovalController(service, {
  approved: 'Đã phê chuẩn đăng ký làm thêm giờ',
  step1: 'Đã duyệt cấp 1 — chờ HR phê chuẩn',
  rejected: 'Đã từ chối đăng ký làm thêm giờ',
  cancelled: 'Đã hủy đăng ký làm thêm giờ',
});

const create = asyncHandler(async (req, res) => {
  const { row, autoApproved } = await service.create(req.user, req.body, req);
  res.status(201).json({
    success: true,
    message: autoApproved ? 'Đăng ký làm thêm giờ đã được phê duyệt' : 'Đã đăng ký làm thêm giờ — chờ duyệt',
    data: row,
  });
});

const router = express.Router();
router.use(authenticate);

router.post('/', requirePermission('ot.create'), validate({ body: createBody }), create);
router.get('/', requirePermission('ot.read'), validate({ query: listQuery }), controller.list);
router.get('/:id', requirePermission('ot.read'), validate({ params: idParam }), controller.get);
router.patch('/:id/approve', requirePermission('ot.approve'), validate({ params: idParam, body: approveBody }), controller.approve);
router.patch('/:id/reject', requirePermission('ot.reject'), validate({ params: idParam, body: rejectBody }), controller.reject);
router.patch('/:id/cancel', requirePermission('ot.create'), validate({ params: idParam }), controller.cancel);

module.exports = router;
