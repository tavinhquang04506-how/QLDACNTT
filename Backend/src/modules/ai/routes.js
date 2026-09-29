// ============================================
// routes.js — AI Module Router (Grounded Gemini + Scoped Read-Only Tools)
// ============================================
const express = require('express');
const db = require('../../config/db');
const {
  runCopilot,
  resetConversation,
  resolveActorScopeFromDb,
  getHrKnowledgeBase,
  getPublishedKnowledgeSnapshot,
} = require('./service');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../policies');

const router = express.Router();

router.use(authenticate);

// POST /api/ai/copilot
router.post('/copilot', requirePermission('ai.copilot'), async (req, res, next) => {
  try {
    const { message, conversationId, context, clientGenerationId, resetConversation: resetConv } =
      req.body || {};

    // R31 & R36: Always resolve authoritative actor scope (userId, employeeId, roleCode, departmentId)
    // directly from PostgreSQL on every request, ignoring any client body/context fields,
    // and mark __requireDbUser=true so pre-release re-verification fails closed if user is locked/deleted.
    const actor = await resolveActorScopeFromDb(
      {
        userId: req.user.userId,
        employeeId: req.user.employeeId || null,
        roleCode: req.user.roleCode,
        departmentId: req.user.departmentId || null,
        __requireDbUser: true,
      },
      db,
      { forceRefresh: true, requireDbUser: true }
    );

    const testOptions =
      process.env.NODE_ENV === 'test' && req.app?.locals?.aiTestOptions
        ? req.app.locals.aiTestOptions
        : {};

    const result = await runCopilot({
      actor,
      message,
      conversationId,
      clientContextProvided: Boolean(context && typeof context === 'object'),
      options: {
        ...testOptions,
        requireDbUser: true,
        clientGenerationId: clientGenerationId ? String(clientGenerationId).trim() : null,
        resetConversation: Boolean(resetConv),
      },
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

// POST /api/ai/copilot/reset
router.post('/copilot/reset', requirePermission('ai.copilot'), async (req, res, next) => {
  try {
    const { conversationId } = req.body || {};
    const actor = await resolveActorScopeFromDb(
      {
        userId: req.user.userId,
        employeeId: req.user.employeeId || null,
        roleCode: req.user.roleCode,
        departmentId: req.user.departmentId || null,
        __requireDbUser: true,
      },
      db,
      { forceRefresh: true, requireDbUser: true }
    );
    const convId = conversationId
      ? String(conversationId).trim()
      : `conv-${actor.userId}-default`;
    resetConversation(convId, actor);
    res.json({
      success: true,
      conversationId: convId,
      reset: true,
    });
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
