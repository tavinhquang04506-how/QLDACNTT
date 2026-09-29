const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../policies');
const controller = require('./controller');
const { punchBody, kioskBody, listQuery, adjustBody, timesheetQuery, exceptionsQuery } = require('./schema');

const router = express.Router();

// Route lấy mã Dynamic Code cho màn hình Kiosk (không yêu cầu đăng nhập cá nhân)
router.get('/kiosk-code', controller.getKioskCode);

router.use(authenticate);

router.post('/check-in', requirePermission('attendance.punch'), validate({ body: punchBody }), controller.checkIn);
router.post('/check-out', requirePermission('attendance.punch'), validate({ body: punchBody }), controller.checkOut);
router.get('/me/today', requirePermission('attendance.punch'), controller.today);
router.get('/qr', requirePermission('attendance.punch'), controller.myQr);
router.post('/kiosk/punch', requirePermission('attendance.kiosk'), validate({ body: kioskBody }), controller.kioskPunch);
router.post('/adjust', requirePermission('attendance.adjust'), validate({ body: adjustBody }), controller.adjust);
router.get('/timesheet', requirePermission('attendance.read'), validate({ query: timesheetQuery }), controller.timesheet);
router.get('/exceptions', requirePermission('attendance.report'), validate({ query: exceptionsQuery }), controller.exceptions);
router.get('/live', requirePermission('attendance.report'), controller.live);
router.post('/appeals', controller.createAppeal);
router.get('/appeals', controller.getAppeals);
router.put('/appeals/:id/review', requirePermission('attendance.appeals.review'), controller.reviewAppeal);

router.get('/', requirePermission('attendance.read'), validate({ query: listQuery }), controller.list);

module.exports = router;
