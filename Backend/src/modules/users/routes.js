const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../policies');
const controller = require('./controller');
const { idParam, listQuery, createBody, updateBody } = require('./schema');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('user.read'), validate({ query: listQuery }), controller.list);
router.get('/:id', requirePermission('user.read'), validate({ params: idParam }), controller.get);
router.post('/', requirePermission('user.create'), validate({ body: createBody }), controller.create);
router.patch('/:id', requirePermission('user.update'), validate({ params: idParam, body: updateBody }), controller.update);
router.post('/:id/reset-password', requirePermission('user.resetPassword'), validate({ params: idParam }), controller.resetPassword);
router.post('/:id/unlock', requirePermission('user.update'), validate({ params: idParam }), controller.unlock);

module.exports = router;
