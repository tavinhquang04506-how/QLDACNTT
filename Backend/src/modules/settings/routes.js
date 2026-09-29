const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../policies');
const { forbidden } = require('../../utils/AppError');
const service = require('./service');

const router = express.Router();
router.use(authenticate);

function requireCeoOrAdmin(req, _res, next) {
  const roleCode = req.user?.roleCode || req.user?.role;
  if (roleCode === 'CEO' || roleCode === 'ADMIN') {
    return next();
  }
  return next(forbidden('Chỉ Tổng Giám Đốc (CEO) và Quản Trị Hệ Thống (ADMIN) mới có quyền truy cập phân quyền'));
}

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
  requireCeoOrAdmin,
  asyncHandler(async (_req, res) => {
    const data = await service.getRbacRoleMatrix();
    res.json({ success: true, data });
  })
);

router.post(
  '/rbac-roles',
  requireCeoOrAdmin,
  asyncHandler(async (req, res) => {
    const data = await service.createRbacRole(req.user, req.body, req);
    res.status(201).json({
      success: true,
      message: 'Đã tạo vai trò mới thành công',
      data,
    });
  })
);

router.put(
  '/rbac-roles',
  requireCeoOrAdmin,
  asyncHandler(async (req, res) => {
    const data = await service.updateRbacRoleMatrix(req.user, req.body, req);
    res.json({
      success: true,
      message: 'Đã lưu cấu hình phân quyền theo vai trò thành công',
      data,
    });
  })
);

router.patch(
  '/rbac-roles/:roleCode',
  requireCeoOrAdmin,
  asyncHandler(async (req, res) => {
    const data = await service.updateRbacRoleInfo(req.user, req.params.roleCode, req.body, req);
    res.json({
      success: true,
      message: 'Đã cập nhật thông tin vai trò thành công',
      data,
    });
  })
);

router.delete(
  '/rbac-roles/:roleCode',
  requireCeoOrAdmin,
  asyncHandler(async (req, res) => {
    const data = await service.deleteRbacRole(req.user, req.params.roleCode, req);
    res.json({
      success: true,
      message: 'Đã xóa vai trò thành công',
      data,
    });
  })
);

router.post(
  '/rbac-roles/reset',
  requireCeoOrAdmin,
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
