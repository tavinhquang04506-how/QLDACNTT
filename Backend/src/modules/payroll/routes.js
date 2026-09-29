const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../policies');
const controller = require('./controller');
const { calculateBody, idParam, lockBody, payslipsQuery, updatePayslipBody } = require('./schema');

const router = express.Router();
router.use(authenticate);

router.get('/periods', requirePermission('payroll.periods.read'), controller.listPeriods);
router.get('/periods/:id', requirePermission('payroll.periods.read'), validate({ params: idParam }), controller.getPeriod);
router.post('/periods/:id/lock', requirePermission('payroll.lock'), validate({ params: idParam, body: lockBody }), controller.lock);
router.post('/periods/:id/transfer', requirePermission('payroll.transfer'), validate({ params: idParam }), controller.transfer);
router.get('/periods/:id/anomalies', requirePermission('payroll.periods.read'), validate({ params: idParam }), controller.anomalies);
router.get('/periods/:id/bank-transfer', requirePermission('payroll.transfer'), validate({ params: idParam }), controller.bankTransfer);
router.get('/payslips', requirePermission('payroll.payslips.read'), validate({ query: payslipsQuery }), controller.listPayslips);
router.get('/payslips/:id', requirePermission('payroll.payslips.read'), validate({ params: idParam }), controller.getPayslip);
router.put('/payslips/:id', requirePermission('payroll.update'), validate({ params: idParam, body: updatePayslipBody }), controller.updatePayslip);
router.get('/me', requirePermission('payroll.payslips.read'), controller.myPayslips);
router.post('/calculate', requirePermission('payroll.calculate'), validate({ body: calculateBody }), controller.calculate);

module.exports = router;
