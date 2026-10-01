const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../policies');
const controller = require('./controller');
const { idParam, memberParam, createBody, updateBody, memberBody, messageBody, messagesQuery } = require('./schema');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('squad.read'), controller.list);
router.post('/', requirePermission('squad.create'), validate({ body: createBody }), controller.create);
router.get('/:id', requirePermission('squad.read'), validate({ params: idParam }), controller.get);
router.put('/:id', requirePermission('squad.read'), validate({ params: idParam, body: updateBody }), controller.update);
router.delete('/:id', requirePermission('squad.read'), validate({ params: idParam }), controller.remove);
router.post('/:id/members', requirePermission('squad.read'), validate({ params: idParam, body: memberBody }), controller.addMember);
router.delete('/:id/members/:employeeId', requirePermission('squad.read'), validate({ params: memberParam }), controller.removeMember);
router.get('/:id/messages', requirePermission('squad.read'), validate({ params: idParam, query: messagesQuery }), controller.listMessages);
router.post('/:id/messages', requirePermission('squad.read'), validate({ params: idParam, body: messageBody }), controller.postMessage);
router.delete('/:id/messages', requirePermission('squad.read'), validate({ params: idParam }), controller.clearMessages);
router.post('/:id/leave', requirePermission('squad.read'), validate({ params: idParam }), controller.leaveSquad);
router.post('/:id/rejoin', requirePermission('squad.read'), validate({ params: idParam }), controller.rejoinSquad);

module.exports = router;
