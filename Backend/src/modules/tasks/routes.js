const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../policies');
const controller = require('./controller');
const { updateBody, stageBody, reviewBody, idParam } = require('./schema');

const router = express.Router();
router.use(authenticate);

router.get('/:id', requirePermission('project.read'), validate({ params: idParam }), controller.get);
router.put('/:id', requirePermission('project.read'), validate({ params: idParam, body: updateBody }), controller.update);
router.delete('/:id', requirePermission('project.read'), validate({ params: idParam }), controller.remove);
router.patch('/:id/stage', requirePermission('project.read'), validate({ params: idParam, body: stageBody }), controller.stage);
router.post('/:id/review', requirePermission('project.read'), validate({ params: idParam, body: reviewBody }), controller.review);
router.get('/:id/logs', requirePermission('project.read'), validate({ params: idParam }), controller.logs);

module.exports = router;
