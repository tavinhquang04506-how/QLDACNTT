const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initialStage, decide, workingDays } = require('../../src/modules/approvals/chain');

const base = { requesterRole: 'EMPLOYEE', requesterId: 'NV-1', requesterDepartmentId: 'DEPT-IT', actorRole: 'LINE_MANAGER', actorId: 'NV-9', actorDepartmentId: 'DEPT-IT' };

test('initialStage: employees start at the manager, managers/HRD skip to the last step, the CEO is auto-approved', () => {
  assert.deepEqual(initialStage('EMPLOYEE'), { stage: 'CHO_TRUONG_PHONG_DUYET', autoApprove: false });
  assert.deepEqual(initialStage('LINE_MANAGER'), { stage: 'CHO_HR_PHE_CHUAN', autoApprove: false });
  assert.deepEqual(initialStage('HR_DIRECTOR'), { stage: 'CHO_HR_PHE_CHUAN', autoApprove: false });
  assert.deepEqual(initialStage('CEO'), { stage: 'CHO_HR_PHE_CHUAN', autoApprove: true });
});

test('a manager of the same department approves step one and passes it to HR', () => {
  assert.deepEqual(decide({ ...base, stage: 'CHO_TRUONG_PHONG_DUYET' }), { ok: true, next: 'CHO_HR_PHE_CHUAN' });
});

test('a manager of another department (or without one) may not act', () => {
  assert.deepEqual(decide({ ...base, stage: 'CHO_TRUONG_PHONG_DUYET', actorDepartmentId: 'DEPT-HR' }), { ok: false, reason: 'OUT_OF_SCOPE' });
  assert.deepEqual(decide({ ...base, stage: 'CHO_TRUONG_PHONG_DUYET', actorDepartmentId: null }), { ok: false, reason: 'OUT_OF_SCOPE' });
});

test('nobody acts on their own request, not even the CEO', () => {
  assert.deepEqual(decide({ ...base, stage: 'CHO_TRUONG_PHONG_DUYET', actorId: 'NV-1' }), { ok: false, reason: 'SELF_APPROVAL' });
  assert.deepEqual(decide({ ...base, stage: 'CHO_HR_PHE_CHUAN', actorRole: 'CEO', actorId: 'NV-1' }), { ok: false, reason: 'SELF_APPROVAL' });
});

test('HR_DIRECTOR approves the last step of an employee request, but not step one', () => {
  assert.deepEqual(decide({ ...base, stage: 'CHO_HR_PHE_CHUAN', actorRole: 'HR_DIRECTOR' }), { ok: true, next: 'DA_PHE_DUYET' });
  assert.deepEqual(decide({ ...base, stage: 'CHO_TRUONG_PHONG_DUYET', actorRole: 'HR_DIRECTOR' }), { ok: false, reason: 'WRONG_ROLE' });
});

test('requests of a manager or HR_DIRECTOR are approved only by the CEO', () => {
  for (const requesterRole of ['LINE_MANAGER', 'HR_DIRECTOR']) {
    const args = { ...base, requesterRole, stage: 'CHO_HR_PHE_CHUAN' };
    assert.deepEqual(decide({ ...args, actorRole: 'HR_DIRECTOR' }), { ok: false, reason: 'CEO_ONLY' });
    assert.deepEqual(decide({ ...args, actorRole: 'LINE_MANAGER' }), { ok: false, reason: 'CEO_ONLY' });
    assert.deepEqual(decide({ ...args, actorRole: 'CEO', actorId: 'NV-0001' }), { ok: true, next: 'DA_PHE_DUYET' });
  }
});

test('the CEO can approve any pending step directly', () => {
  assert.deepEqual(decide({ ...base, stage: 'CHO_TRUONG_PHONG_DUYET', actorRole: 'CEO', actorId: 'NV-0001', actorDepartmentId: null }), { ok: true, next: 'DA_PHE_DUYET' });
  assert.deepEqual(decide({ ...base, stage: 'CHO_HR_PHE_CHUAN', actorRole: 'CEO', actorId: 'NV-0001' }), { ok: true, next: 'DA_PHE_DUYET' });
});

test('finished stages cannot be acted on, and plain employees never can', () => {
  for (const stage of ['DA_PHE_DUYET', 'TU_CHOI', 'DA_HUY']) {
    assert.deepEqual(decide({ ...base, stage, actorRole: 'CEO', actorId: 'NV-0001' }), { ok: false, reason: 'NOT_PENDING' });
  }
  assert.deepEqual(decide({ ...base, stage: 'CHO_TRUONG_PHONG_DUYET', actorRole: 'EMPLOYEE' }), { ok: false, reason: 'WRONG_ROLE' });
});

test('an actor without an employee record can never approve', () => {
  for (const actorRole of ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER']) {
    assert.equal(decide({ ...base, stage: 'CHO_HR_PHE_CHUAN', actorRole, actorId: null }).ok, false, actorRole);
    assert.equal(decide({ ...base, stage: 'CHO_HR_PHE_CHUAN', actorRole, actorId: undefined }).ok, false, actorRole);
  }
});

test('workingDays counts Monday to Friday inclusive', () => {
  assert.equal(workingDays('2027-03-01', '2027-03-05'), 5);
  assert.equal(workingDays('2027-03-01', '2027-03-08'), 6);
  assert.equal(workingDays('2027-03-06', '2027-03-07'), 0);
  assert.equal(workingDays('2027-03-03', '2027-03-03'), 1);
  assert.equal(workingDays('2027-12-30', '2028-01-04'), 4);
});
