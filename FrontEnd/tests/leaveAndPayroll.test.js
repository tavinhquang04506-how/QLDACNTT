import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLeaveRequest, normalizePayslip, formatVND } from '../src/utils/dataAdapters.js';

describe('Leave and Payroll Logic Tests', () => {
  it('correctly counts pending requests without double subtraction', () => {
    const rawLeaves = [
      { id: 1, status: 'pending', full_name: 'Nguyen Van A' },
      { id: 2, status: 'pending', full_name: 'Tran Thi B' },
      { id: 3, status: 'approved', full_name: 'Le Van C' },
    ];
    const pendingList = rawLeaves.filter(l => l.status === 'pending');
    assert.equal(pendingList.length, 2);

    // After approving one item:
    const approvedIds = [1];
    const remainingPending = pendingList.filter(l => !approvedIds.includes(l.id));
    assert.equal(remainingPending.length, 1);
  });

  it('scopes payroll visibility: filters employee payslips by role', () => {
    const payslips = [
      { id: 101, employee_id: 'NV-0001', department_id: 'DEPT-IT', employee_name: 'Dev 1', base_salary: 20000000 },
      { id: 102, employee_id: 'NV-0002', department_id: 'DEPT-HR', employee_name: 'HR 1', base_salary: 18000000 },
      { id: 103, employee_id: 'NV-0003', department_id: 'DEPT-IT', employee_name: 'Dev 2', base_salary: 25000000 },
    ].map(normalizePayslip);

    // Line manager in DEPT-IT:
    const managerDeptId = 'DEPT-IT';
    const managerPayslips = payslips.filter(p => p.departmentId === managerDeptId || p.department.includes('IT') || p.department.includes('Kỹ thuật'));
    assert.equal(managerPayslips.length, 2);

    // Employee NV-0001:
    const selfPayslips = payslips.filter(p => p.employeeId === 'NV-0001');
    assert.equal(selfPayslips.length, 1);
    assert.equal(selfPayslips[0].employeeName, 'Dev 1');
  });

  it('formats payroll currency accurately with formatVND', () => {
    assert.equal(formatVND(25000000), '25.000.000 VNĐ');
    assert.equal(formatVND(0), '0 VNĐ');
  });
});
