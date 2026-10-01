const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../policies');
const controller = require('./controller');
const { idParam, listQuery, createBody } = require('./schema');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('notification.read'), validate({ query: listQuery }), controller.list);
router.get('/unread-count', requirePermission('notification.read'), controller.unreadCount);
router.post('/read-all', requirePermission('notification.read'), controller.markAllRead);
router.post('/clear-read', requirePermission('notification.read'), controller.clearRead);
router.post('/', requirePermission('notification.create'), validate({ body: createBody }), controller.create);
router.patch('/:id/read', requirePermission('notification.read'), validate({ params: idParam }), controller.markRead);
router.delete('/:id', requirePermission('notification.read'), validate({ params: idParam }), controller.remove);

module.exports = router;
