const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../policies');
const controller = require('./controller');
const { idParam, listQuery, createBody, updateBody } = require('./schema');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('handbook.read'), validate({ query: listQuery }), controller.list);
router.get('/categories', requirePermission('handbook.read'), controller.categories);
router.post('/', requirePermission('handbook.manage'), validate({ body: createBody }), controller.create);
router.get('/:id', requirePermission('handbook.read'), validate({ params: idParam }), controller.get);
router.put('/:id', requirePermission('handbook.manage'), validate({ params: idParam, body: updateBody }), controller.update);
router.delete('/:id', requirePermission('handbook.manage'), validate({ params: idParam }), controller.remove);

module.exports = router;
