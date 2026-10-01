const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../policies');
const controller = require('./controller');
const { idParam, createBody, updateBody, listQuery, offboardBody, importBody } = require('./schema');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('employee.list'), validate({ query: listQuery }), controller.list);
router.get('/:id', requirePermission('employee.read'), validate({ params: idParam }), controller.get);
router.post('/', requirePermission('employee.create'), validate({ body: createBody }), controller.create);
router.put('/:id', requirePermission('employee.update'), validate({ params: idParam, body: updateBody }), controller.update);

router.post('/import', requirePermission('employee.import'), validate({ body: importBody }), controller.importRows);
router.post('/:id/offboard', requirePermission('employee.offboard'), validate({ params: idParam, body: offboardBody }), controller.offboard);

module.exports = router;
