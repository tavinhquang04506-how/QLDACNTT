import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTask } from '../src/utils/dataAdapters.js';

// Helpers matching the business rules
export const levelOf = (score) => (score >= 80 ? 3 : score >= 60 ? 2 : 1);
export const cellOf = (perf, pot) => (levelOf(pot) - 1) * 3 + levelOf(perf);

export const buildReviewPayload = (decisionOrBool, note = '') => {
  const decision = typeof decisionOrBool === 'string'
    ? decisionOrBool
    : decisionOrBool ? 'accept' : 'reject';
  return { decision, note };
};

describe('Project Tasks and AI Analytics Logic Tests', () => {
  it('correctly formats task review payload conforming to backend schema', () => {
    const accepted = buildReviewPayload(true, 'Good job');
    assert.deepEqual(accepted, { decision: 'accept', note: 'Good job' });

    const rejected = buildReviewPayload('reject', 'Missing tests');
    assert.deepEqual(rejected, { decision: 'reject', note: 'Missing tests' });

    const acceptedString = buildReviewPayload('accept');
    assert.deepEqual(acceptedString, { decision: 'accept', note: '' });
  });

  it('correctly maps 9-box matrix coordinates based on performance and potential', () => {
    // High / High -> Cell 9
    assert.equal(cellOf(95, 88), 9);
    // Low / Low -> Cell 1
    assert.equal(cellOf(40, 55), 1);
    // High Perf (3), Low Pot (1) -> Cell 3
    assert.equal(cellOf(85, 45), 3);
    // Low Perf (1), High Pot (3) -> Cell 7
    assert.equal(cellOf(50, 90), 7);
    // Medium Perf (2), Medium Pot (2) -> Cell 5
    assert.equal(cellOf(70, 75), 5);
  });

  it('normalizes task safely even with missing optional attributes', () => {
    const raw = {
      id: 'TASK-001',
      title: 'Fix auth session bug',
      // no due_date, no priority, no assignee
    };
    const task = normalizeTask(raw);
    assert.equal(task.id, 'TASK-001');
    assert.equal(task.title, 'Fix auth session bug');
    assert.equal(task.status, 'todo');
    assert.equal(task.progress, 0);

    // Ensure safe string operations don't throw
    const safeDate = (task.dueDate || '').split('T')[0];
    assert.equal(safeDate, '');
  });
});
