const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createAppeal,
  getAppeals,
  reviewAppeal,
} = require('../../src/modules/attendance/appealService');

test('Attendance Appeal Service Unit Test Suite', async (t) => {
  let createdAppealId;

  await t.test('createAppeal should register a new attendance explanation', async () => {
    const appeal = await createAppeal({
      employee_id: 'NV-0842',
      employee_name: 'Phạm Minh Quân',
      date: '2026-09-25',
      appeal_type: 'DI_MUON',
      reason: 'Sự cố kẹt xe trên tuyến Xa Lộ Hà Nội do ngập nước',
    });

    assert.ok(appeal);
    assert.ok(appeal.id);
    assert.equal(appeal.status, 'CHO_DUYET');
    assert.equal(appeal.appeal_type, 'DI_MUON');
    createdAppealId = appeal.id;
  });

  await t.test('getAppeals should return list of appeals', async () => {
    const list = await getAppeals();
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 1);
  });

  await t.test('reviewAppeal should approve explanation and update status', async () => {
    const reviewed = await reviewAppeal(createdAppealId, {
      status: 'DA_DUYET',
      review_note: 'Đã xác thực sự cố giao thông, chấp thuận chuẩn hóa công',
      reviewer_id: 'NV-1000',
      reviewer_name: 'Vũ Đình Khang (Trưởng phòng)',
    });

    assert.ok(reviewed);
    assert.equal(reviewed.status, 'DA_DUYET');
    assert.ok(reviewed.reviewed_at);
  });
});
