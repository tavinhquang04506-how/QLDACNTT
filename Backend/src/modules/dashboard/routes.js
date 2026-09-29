// ============================================
// routes/dashboard.js — Dashboard statistics and legacy notifications alias
// ============================================
const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../policies');
const asyncHandler = require('../../utils/asyncHandler');
const stats = require('./service');
const notifications = require('../notifications/service');
const { dashboardCacheMiddleware } = require('../../middleware/dashboardCache');

const router = express.Router();

/** GET /api/dashboard/stats — live KPIs, scoped: company (CEO/HR), department (manager), self (employee). */
router.get('/stats', authenticate, requirePermission('dashboard.read'), dashboardCacheMiddleware, asyncHandler(async (req, res) => {
  res.json({ success: true, data: await stats.get(req.user, req.scope) });
}));

/** GET /api/dashboard/notifications — legacy alias of GET /api/notifications (latest 30, with unreadCount). */
router.get('/notifications', authenticate, requirePermission('notification.read'), asyncHandler(async (req, res) => {
  const { data, unreadCount } = await notifications.list(req.user, { limit: '30' });
  res.json({ success: true, data, unreadCount });
}));

module.exports = router;
