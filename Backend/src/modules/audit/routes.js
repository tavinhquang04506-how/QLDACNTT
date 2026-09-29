const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../policies');
const controller = require('./controller');
const { listQuery } = require('./schema');

const router = express.Router();

router.get('/', authenticate, requirePermission('audit.read'), validate({ query: listQuery }), controller.list);

module.exports = router;
