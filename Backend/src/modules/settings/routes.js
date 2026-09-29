const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../policies');
const service = require('./service');

const router = express.Router();
router.use(authenticate);

router.get(
  '/',
  requirePermission('settings.read'),
  asyncHandler(async (req, res) => {
    const period = req.query?.period ? String(req.query.period).trim() : null;
    const data = period
      ? await service.getSettingsForPeriod(undefined, period)
      : await service.getSettings();
    res.json({ success: true, data });
  })
);

router.get(
  '/versions',
  requirePermission('settings.read'),
  asyncHandler(async (_req, res) => {
    const data = await service.listPolicyVersions();
    res.json({ success: true, data });
  })
);

router.get(
  '/rbac-roles',
  requirePermission('settings.read'),
  asyncHandler(async (_req, res) => {
    const data = await service.getRbacRoleMatrix();
    res.json({ success: true, data });
  })
);

router.put(
  '/rbac-roles',
  requirePermission('settings.manage'),
  asyncHandler(async (req, res) => {
    const data = await service.updateRbacRoleMatrix(req.user, req.body, req);
    res.json({
      success: true,
      message: 'Đã lưu cấu hình phân quyền theo vai trò thành công',
      data,
    });
  })
);

router.post(
  '/rbac-roles/reset',
  requirePermission('settings.manage'),
  asyncHandler(async (req, res) => {
    const data = await service.resetRbacRoleMatrix(req.user, req.body, req);
    res.json({
      success: true,
      message: 'Đã khôi phục cấu hình phân quyền vai trò về mặc định chuẩn',
      data,
    });
  })
);

const saveHandler = asyncHandler(async (req, res) => {
  const data = await service.updateSettings(req.user, req.body, req);
  res.json({
    success: true,
    message: 'Lưu cấu hình hệ thống thành công',
    data,
  });
});

router.put('/', requirePermission('settings.manage'), saveHandler);
router.patch('/', requirePermission('settings.manage'), saveHandler);

module.exports = router;
