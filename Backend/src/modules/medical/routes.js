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
  approved: 'Đã phê chuẩn chi trả bồi thường y tế',
  step1: 'Đã duyệt cấp 1 — chờ HR phê chuẩn',
  rejected: 'Đã từ chối đơn bồi thường y tế',
  cancelled: 'Đã hủy đơn bồi thường y tế',
});

const create = asyncHandler(async (req, res) => {
  const { row, autoApproved } = await service.create(req.user, req.body, req);
  res.status(201).json({
    success: true,
    message: autoApproved ? 'Đơn bồi thường y tế đã được phê duyệt' : 'Đã nộp đơn bồi thường y tế — chờ duyệt',
    data: row,
  });
});

const router = express.Router();
router.use(authenticate);

router.post('/', requirePermission('claim.create'), validate({ body: createBody }), create);
router.get('/', requirePermission('claim.read'), validate({ query: listQuery }), controller.list);
router.get('/:id', requirePermission('claim.read'), validate({ params: idParam }), controller.get);
router.patch('/:id/approve', requirePermission('claim.approve'), validate({ params: idParam, body: approveBody }), controller.approve);
router.patch('/:id/reject', requirePermission('claim.reject'), validate({ params: idParam, body: rejectBody }), controller.reject);
router.patch('/:id/cancel', requirePermission('claim.create'), validate({ params: idParam }), controller.cancel);

module.exports = router;
