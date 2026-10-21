// ============================================
// routes.js — AI Module Router (Grounded Gemini + Scoped Read-Only Tools)
// ============================================
const express = require('express');
const { runCopilot, getHrKnowledgeBase, getPublishedKnowledgeSnapshot } = require('./service');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../policies');

const router = express.Router();

router.use(authenticate);

// POST /api/ai/copilot
router.post('/copilot', requirePermission('ai.copilot'), async (req, res, next) => {
  try {
    const { message, conversationId, context } = req.body || {};
    const actor = {
      userId: req.user.userId,
      employeeId: req.user.employeeId || null,
      roleCode: req.user.roleCode,
    };

    const testOptions =
      process.env.NODE_ENV === 'test' && req.app?.locals?.aiTestOptions
        ? req.app.locals.aiTestOptions
        : {};

    const result = await runCopilot({
      actor,
      message,
      conversationId,
      clientContextProvided: Boolean(context && typeof context === 'object'),
      options: testOptions,
    });

    res.json(result);
  } catch (err) {
    if (err && err.status) {
      return res.status(err.status).json({
        success: false,
        code: err.code || 'AI_ERROR',
        message: err.message,
      });
    }
    return next(err);
  }
});

// GET /api/ai/knowledge
router.get('/knowledge', requirePermission('ai.knowledge'), async (_req, res, next) => {
  try {
    const snapshot = await getPublishedKnowledgeSnapshot();
    res.json({
      success: true,
      data: {
        ...getHrKnowledgeBase(),
        ...snapshot,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
