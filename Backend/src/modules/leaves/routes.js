const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../policies');
const controller = require('./controller');
const { createBody, idParam, employeeParam, listQuery, calendarQuery, approveBody, rejectBody } = require('./schema');

const router = express.Router();
router.use(authenticate);

router.post('/', requirePermission('leave.create'), validate({ body: createBody }), controller.create);
router.get('/', requirePermission('leave.read'), validate({ query: listQuery }), controller.list);
router.get('/calendar', requirePermission('leave.read'), validate({ query: calendarQuery }), controller.calendar);
router.get('/types', controller.types);
router.get('/balances/:employeeId', requirePermission('leave.read'), validate({ params: employeeParam }), controller.balances);
router.get('/:id', requirePermission('leave.read'), validate({ params: idParam }), controller.get);
router.patch('/:id/approve', requirePermission('leave.approve'), validate({ params: idParam, body: approveBody }), controller.approve);
router.patch('/:id/reject', requirePermission('leave.reject'), validate({ params: idParam, body: rejectBody }), controller.reject);
router.patch('/:id/cancel', requirePermission('leave.create'), validate({ params: idParam }), controller.cancel);

module.exports = router;
