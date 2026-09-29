const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../policies');
const controller = require('./controller');
const { employeeParam, contractParam, createBody, updateBody, terminateBody } = require('./schema');

// Mounted at /api because the routes span /employees/:id/contracts and /contracts/:id.
const router = express.Router();

router.get('/employees/:id/contracts', authenticate, requirePermission('contract.read'), validate({ params: employeeParam }), controller.listForEmployee);
router.post('/employees/:id/contracts', authenticate, requirePermission('contract.manage'), validate({ params: employeeParam, body: createBody }), controller.create);
router.get('/contracts/:id', authenticate, requirePermission('contract.read'), validate({ params: contractParam }), controller.get);
router.put('/contracts/:id', authenticate, requirePermission('contract.manage'), validate({ params: contractParam, body: updateBody }), controller.update);
router.post('/contracts/:id/activate', authenticate, requirePermission('contract.manage'), validate({ params: contractParam }), controller.activate);
router.post('/contracts/:id/terminate', authenticate, requirePermission('contract.manage'), validate({ params: contractParam, body: terminateBody }), controller.terminate);

module.exports = router;
