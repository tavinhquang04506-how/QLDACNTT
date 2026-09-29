const test = require('node:test');
const assert = require('node:assert/strict');
const { generateAiResponse, getHrKnowledgeBase } = require('../../src/modules/ai/service');

test('AI Copilot & HR Knowledge Base Unit Test Suite', async (t) => {
  await t.test('getHrKnowledgeBase returns structured domain policies', () => {
    const kb = getHrKnowledgeBase();
    assert.ok(kb);
    assert.ok(kb.workingHours);
    assert.ok(kb.leavePolicy);
    assert.ok(kb.insurancePolicy);
    assert.ok(kb.taxPolicy);
  });

  await t.test('generateAiResponse responds to leave query with user context', async () => {
    const res = await generateAiResponse('Tôi còn bao nhiêu ngày phép năm 2026?', {
      name: 'Lê Vũ Ngọc Duy',
      leaveBalance: 14,
      department: 'Ban Điều Hành'
    });

    assert.ok(res.success);
    assert.ok(res.answer);
    assert.match(res.answer, /14|ngày phép/);
  });

  await t.test('generateAiResponse responds to insurance Vinmec query', async () => {
    const res = await generateAiResponse('Chính sách bảo hiểm sức khỏe Vinmec chi trả thế nào?', {
      name: 'Trần Mai Hương'
    });

    assert.ok(res.success);
    assert.match(res.answer, /Vinmec|120/i);
  });

  await t.test('generateAiResponse responds to tax query', async () => {
    const res = await generateAiResponse('Cách tính thuế TNCN và giảm trừ gia cảnh?', {
      name: 'Phạm Minh Quân'
    });

    assert.ok(res.success);
    assert.match(res.answer, /11\.000\.000|lũy tiến/i);
  });
});
