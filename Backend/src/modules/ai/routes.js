// ============================================
// routes.js — AI Module Router
// ============================================
const express = require('express');
const { generateAiResponse, getHrKnowledgeBase } = require('./service');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

// POST /api/ai/copilot
router.post('/copilot', async (req, res) => {
  try {
    const { message, context } = req.body;
    const user = req.user || {};
    const mergedContext = {
      name: user.name || user.full_name || context?.name,
      id: user.id || user.employee_id || context?.id,
      department: user.department_name || context?.department,
      leaveBalance: context?.leaveBalance,
      role: user.job_title || context?.role,
    };

    const result = await generateAiResponse(message, mergedContext);
    res.json(result);
  } catch (err) {
    console.error('AI copilot error:', err);
    res.status(500).json({ success: false, message: 'Lỗi xử lý AI Copilot' });
  }
});

// GET /api/ai/knowledge
router.get('/knowledge', (req, res) => {
  res.json({ success: true, data: getHrKnowledgeBase() });
});

module.exports = router;
