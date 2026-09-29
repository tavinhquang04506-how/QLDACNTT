// ============================================
// routes/projects.js — Projects (+ legacy task/squad paths)
// ============================================
const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../policies');
const controller = require('./controller');
const tasks = require('../tasks/controller');
const squads = require('../squads/controller');
const { createBody, updateBody, idParam } = require('./schema');
const { createBody: taskCreateBody, stageBody } = require('../tasks/schema');

const router = express.Router();

router.get('/squads', authenticate, requirePermission('squad.read'), squads.list); // legacy path of GET /api/squads

router.get('/', authenticate, requirePermission('project.read'), controller.list);
router.post('/', authenticate, requirePermission('project.create'), validate({ body: createBody }), controller.create);

// Legacy paths kept for the current frontend.
router.patch('/tasks/:id/stage', authenticate, requirePermission('project.read'), validate({ body: stageBody }), tasks.stage);

router.get('/:id', authenticate, requirePermission('project.read'), validate({ params: idParam }), controller.get);
router.put('/:id', authenticate, requirePermission('project.read'), validate({ params: idParam, body: updateBody }), controller.update);
router.delete('/:id', authenticate, requirePermission('project.read'), validate({ params: idParam }), controller.remove);
router.get('/:id/tasks', authenticate, requirePermission('project.read'), validate({ params: idParam }), tasks.listForProject);
router.post('/:id/tasks', authenticate, requirePermission('project.read'), validate({ params: idParam, body: taskCreateBody }), tasks.create);

module.exports = router;
