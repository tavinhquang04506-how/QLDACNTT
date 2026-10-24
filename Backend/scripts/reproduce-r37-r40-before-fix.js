/**
 * Reproduction script for R37, R38, R39, R40 BEFORE fixing (commit f8de997).
 * Uses mock executor and mock fetch transport — zero database connection required.
 */
const fs = require('fs');
const path = require('path');
const { runCopilot, clearAiRuntimeState } = require('../src/modules/ai/service');
const noticeSchema = require('../src/modules/notices/schema');

function createMockExecutor(leaveBalanceRows = []) {
  return {
    async query(sql) {
      const norm = String(sql).replace(/\s+/g, ' ').trim();
      if (/FROM leave_balances lb/i.test(norm)) {
        return { rows: leaveBalanceRows };
      }
      if (/FROM leave_requests/i.test(norm)) {
        return { rows: [{ pending_days: 0 }] };
      }
      return { rows: [] };
    },
  };
}

async function main() {
  console.log('=== REPRODUCTION BEFORE FIX (R37, R38, R39, R40) ===');

  // 1. R37 Case 1: User asks "Is my leave request rejected?" -> Model replies "Your request was rejected. Would you like help?" without calling any tool
  clearAiRuntimeState();
  const r37Case1 = await runCopilot({
    actor: { userId: 'u-r37-1', employeeId: 'NV-TEST', roleCode: 'EMPLOYEE' },
    message: 'Is my leave request rejected?',
    executor: createMockExecutor(),
    options: {
      apiKey: 'mock-key',
      model: 'gemini-2.5-flash',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            candidates: [
              {
                content: {
                  parts: [{ text: 'Your request was rejected. Would you like help?' }],
                },
              },
            ],
          };
        },
      }),
    },
  });
  console.log('[R37-CASE-1] Question + ungrounded assertion without tool:', JSON.stringify({
    answer: r37Case1.answer,
    verified: r37Case1.verified,
    refused: r37Case1.refused,
    refusalCodes: r37Case1.refusalCodes,
    toolsUsed: r37Case1.toolsUsed,
  }));

  // 2. R37 Case 2: User says "Hello" -> Model replies "Your employment contract is terminated." without calling any tool
  clearAiRuntimeState();
  const r37Case2 = await runCopilot({
    actor: { userId: 'u-r37-2', employeeId: 'NV-TEST', roleCode: 'EMPLOYEE' },
    message: 'Hello',
    executor: createMockExecutor(),
    options: {
      apiKey: 'mock-key',
      model: 'gemini-2.5-flash',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            candidates: [
              {
                content: {
                  parts: [{ text: 'Your employment contract is terminated.' }],
                },
              },
            ],
          };
        },
      }),
    },
  });
  console.log('[R37-CASE-2] Greeting + ungrounded termination claim without tool:', JSON.stringify({
    answer: r37Case2.answer,
    verified: r37Case2.verified,
    refused: r37Case2.refused,
    refusalCodes: r37Case2.refusalCodes,
    toolsUsed: r37Case2.toolsUsed,
  }));

  // 3. R38: Model calls get_my_leave_balance({ year: 2026 }) -> total_days=12, used_days=7, remaining_days=5, available=5
  // Then replies "You can take 12 days off; 5 is your balance." -> wrongly labeled VERIFIED
  clearAiRuntimeState();
  let round = 0;
  const r38Result = await runCopilot({
    actor: { userId: 'u-r38-1', employeeId: 'NV-TEST', roleCode: 'EMPLOYEE' },
    message: 'How many vacation days do I have?',
    executor: createMockExecutor([
      {
        year: 2026,
        total_days: 12,
        used_days: 7,
        remaining_days: 5,
        leave_type_id: 'LT-AL',
        leave_type_code: 'ANNUAL',
        leave_type_name: 'Nghỉ phép năm',
        paid: true,
      },
    ]),
    options: {
      apiKey: 'mock-key',
      model: 'gemini-2.5-flash',
      now: '2026-10-24T08:00:00+07:00',
      fetchImpl: async () => {
        round += 1;
        if (round === 1) {
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                candidates: [
                  {
                    content: {
                      parts: [
                        {
                          functionCall: {
                            name: 'get_my_leave_balance',
                            args: { year: 2026 },
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            },
          };
        }
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              candidates: [
                {
                  content: {
                    parts: [{ text: 'You can take 12 days off; 5 is your balance.' }],
                  },
                },
              ],
            };
          },
        };
      },
    },
  });
  console.log('[R38-CASE-1] Misattributed total_days=12 as available days off:', JSON.stringify({
    answer: r38Result.answer,
    verified: r38Result.verified,
    refused: r38Result.refused,
    refusalCodes: r38Result.refusalCodes,
    toolsUsed: r38Result.toolsUsed,
  }));

  // 4. R39: Notice modal + schema inspection before fix
  const modalPath = path.join(__dirname, '../../FrontEnd/src/modals/portal/CreateCompanyNoticeModal.jsx');
  const modalCode = fs.readFileSync(modalPath, 'utf8');
  const hasBlobObjectUrl = modalCode.includes('URL.createObjectURL(file)');
  const hasPresetDoc = modalCode.includes('handleAddPresetDoc');
  const schemaAcceptsBlob = noticeSchema.createBody.safeParse({
    title: 'Test notice',
    content: 'Test content',
    attachments: [{ id: 'att-1', name: 'fake.pdf', url: 'blob:http://localhost:5173/1234', content: 'fake' }],
  }).success;
  console.log('[R39-INSPECT] Before fix state:', JSON.stringify({
    hasBlobObjectUrl,
    hasPresetDoc,
    schemaAcceptsBlob,
  }));
}

main().catch((err) => {
  console.error('Reproduction error:', err);
  process.exit(1);
});
