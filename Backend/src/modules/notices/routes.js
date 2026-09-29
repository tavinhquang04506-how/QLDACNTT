const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../policies');
const controller = require('./controller');
const { idParam, listQuery, createBody, updateBody } = require('./schema');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('notice.read'), validate({ query: listQuery }), controller.list);
router.post('/', requirePermission('notice.manage'), validate({ body: createBody }), controller.create);
router.get('/:id', requirePermission('notice.read'), validate({ params: idParam }), controller.get);
router.get('/:id/readers', requirePermission('notice.manage'), validate({ params: idParam }), controller.getReaders);
router.post('/:id/remind', requirePermission('notice.manage'), validate({ params: idParam }), controller.remindUnread);
router.put('/:id', requirePermission('notice.manage'), validate({ params: idParam, body: updateBody }), controller.update);
router.delete('/:id', requirePermission('notice.manage'), validate({ params: idParam }), controller.remove);

module.exports = router;
