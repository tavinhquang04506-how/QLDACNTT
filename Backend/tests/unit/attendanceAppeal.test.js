const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const {
  createAppeal,
  getAppeals,
  reviewAppeal,
} = require('../../src/modules/attendance/appealService');

test('Attendance Appeal Service Unit Test Suite', async (t) => {
  const origQuery = db.query;
  const origWithTransaction = db.withTransaction;
  const rowsStore = [];
  let seq = 100;

  t.before(() => {
    const mockExecutor = {
      query: async (sql, params = []) => {
        const q = String(sql);
        if (q.includes('FROM employees e') && q.includes('WHERE e.id = $1')) {
          if (params[0] === 'NV-0842') {
            return {
              rows: [
                {
                  id: 'NV-0842',
                  full_name: 'Phạm Minh Quân',
                  department_id: 'DEPT-IT',
                  department_name: 'Phòng CNTT',
                },
              ],
            };
          }
          if (params[0] === 'NV-1000') {
            return {
              rows: [
                {
                  id: 'NV-1000',
                  full_name: 'Vũ Đình Khang (Trưởng phòng)',
                  department_id: 'DEPT-IT',
                  department_name: 'Phòng CNTT',
                },
              ],
            };
          }
          return { rows: [] };
        }
        if (q.includes("nextval('seq_appeal_id')")) {
          seq += 1;
          return { rows: [{ id: `APL-${seq}` }] };
        }
        if (q.includes('INSERT INTO attendance_appeals')) {
          const item = {
            id: params[0],
            employee_id: params[1],
            employee_name: params[2],
            department_name: params[3],
            date: params[4],
            appeal_type: params[5],
            reason: params[6],
            proof_url: params[7],
            status: 'CHO_DUYET',
            department_id: 'DEPT-IT',
            created_at: new Date().toISOString(),
          };
          rowsStore.push(item);
          return { rows: [item] };
        }
        if (q.includes('FROM attendance_appeals a') && q.includes('FOR UPDATE OF a')) {
          const found = rowsStore.find((r) => r.id === params[0]);
          return { rows: found ? [{ ...found, employee_department_id: found.department_id }] : [] };
        }
        if (q.includes('SELECT department_id FROM employees WHERE id = $1')) {
          if (params[0] === 'NV-1000') {
            return { rows: [{ department_id: 'DEPT-IT' }] };
          }
          return { rows: [{ department_id: 'DEPT-SALES' }] };
        }
        if (q.includes('SELECT full_name FROM employees WHERE id = $1')) {
          if (params[0] === 'NV-1000') {
            return { rows: [{ full_name: 'Vũ Đình Khang (Trưởng phòng)' }] };
          }
          return { rows: [{ full_name: 'Trưởng phòng Sales' }] };
        }
        if (q.includes('UPDATE attendance_appeals')) {
          const found = rowsStore.find((r) => r.id === params[4]);
          if (found) {
            found.status = params[0];
            found.review_note = params[1];
            found.reviewer_id = params[2];
            found.reviewer_name = params[3];
            found.reviewed_at = new Date().toISOString();
          }
          return { rows: found ? [found] : [] };
        }
        if (q.includes('FROM attendance_appeals a')) {
          return { rows: [...rowsStore] };
        }
        return { rows: [] };
      },
    };
    db.query = mockExecutor.query;
    db.withTransaction = async (fn) => fn(mockExecutor);
  });

  t.after(() => {
    db.query = origQuery;
    db.withTransaction = origWithTransaction;
  });

  let createdAppealId;
  const employeeActor = { userId: 'U-EMP', employeeId: 'NV-0842', roleCode: 'EMPLOYEE' };
  const managerActor = { userId: 'U-MGR', employeeId: 'NV-1000', roleCode: 'LINE_MANAGER' };
  const otherManagerActor = { userId: 'U-MGR-2', employeeId: 'NV-2000', roleCode: 'LINE_MANAGER' };

  await t.test('createAppeal should register a new attendance explanation using actor employeeId', async () => {
    const appeal = await createAppeal(
      {
        date: '2026-09-25',
        appeal_type: 'DI_MUON',
        reason: 'Sự cố kẹt xe trên tuyến Xa Lộ Hà Nội do ngập nước',
      },
      employeeActor,
      'self'
    );

    assert.ok(appeal);
    assert.ok(appeal.id);
    assert.equal(appeal.employee_id, 'NV-0842');
    assert.equal(appeal.status, 'CHO_DUYET');
    assert.equal(appeal.appeal_type, 'DI_MUON');
    createdAppealId = appeal.id;
  });

  await t.test('createAppeal should reject spoofed employee_id in payload', async () => {
    await assert.rejects(
      () =>
        createAppeal(
          {
            employee_id: 'NV-0001',
            date: '2026-09-26',
            appeal_type: 'DI_MUON',
            reason: 'Thử mạo danh employee_id khác',
          },
          employeeActor,
          'self'
        ),
      (err) => err.status === 403 && err.code === 'FORBIDDEN'
    );
  });

  await t.test('getAppeals should return list of appeals within scope', async () => {
    const list = await getAppeals({}, employeeActor, 'self');
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 1);
  });

  await t.test('reviewAppeal should reject self-approval and cross-department approval', async () => {
    await assert.rejects(
      () => reviewAppeal(createdAppealId, { status: 'DA_DUYET' }, employeeActor, 'department'),
      (err) => err.status === 403
    );
    await assert.rejects(
      () => reviewAppeal(createdAppealId, { status: 'DA_DUYET' }, otherManagerActor, 'department'),
      (err) => err.status === 403
    );
  });

  await t.test('reviewAppeal should return 404 for unknown appeal id', async () => {
    await assert.rejects(
      () => reviewAppeal('APL-NOT-FOUND', { status: 'DA_DUYET' }, managerActor, 'department'),
      (err) => err.status === 404
    );
  });

  await t.test('reviewAppeal should approve explanation and prevent re-review (409)', async () => {
    const reviewed = await reviewAppeal(
      createdAppealId,
      {
        status: 'DA_DUYET',
        review_note: 'Đã xác thực sự cố giao thông, chấp thuận chuẩn hóa công',
      },
      managerActor,
      'department'
    );

    assert.ok(reviewed);
    assert.equal(reviewed.status, 'DA_DUYET');
    assert.equal(reviewed.reviewer_id, 'NV-1000');
    assert.ok(reviewed.reviewed_at);

    await assert.rejects(
      () => reviewAppeal(createdAppealId, { status: 'TU_CHOI', review_note: 'Đổi ý' }, managerActor, 'department'),
      (err) => err.status === 409
    );
  });
});
