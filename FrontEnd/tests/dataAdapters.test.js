import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmployee,
  normalizeLeaveRequest,
  normalizePayslip,
  normalizeTask,
  normalizeDepartment,
  formatVND,
  formatDateVN
} from '../src/utils/dataAdapters.js';

describe('Data Adapters Unit Tests', () => {
  it('normalizeEmployee should return safe defaults for null or empty input', () => {
    const res = normalizeEmployee(null);
    assert.equal(res.id, '');
    assert.equal(res.name, 'Chưa rõ');
    assert.equal(res.email, '');
    assert.equal(res.department, 'Chưa phân bổ');
    assert.equal(res.role, 'Nhân viên');
    assert.equal(res.status, 'active');
    assert.equal(res.avatar, '');
  });

  it('normalizeEmployee should correctly map PostgreSQL snake_case fields', () => {
    const raw = {
      id: 10,
      full_name: 'Nguyen Van A',
      work_email: 'a@nexus.com',
      department_name: 'Ky Thuat',
      job_title: 'Developer',
      status: 'active',
      phone_number: '0901234567',
      base_salary: 20000000
    };
    const res = normalizeEmployee(raw);
    assert.equal(res.id, 10);
    assert.equal(res.name, 'Nguyen Van A');
    assert.equal(res.email, 'a@nexus.com');
    assert.equal(res.department, 'Ky Thuat');
    assert.equal(res.role, 'Developer');
    assert.equal(res.phone, '0901234567');
    assert.equal(res.baseSalary, 20000000);
  });

  it('normalizeLeaveRequest should handle missing fields safely', () => {
    const res = normalizeLeaveRequest(null);
    assert.equal(res.id, '');
    assert.equal(res.employeeName, 'Nhân viên');
    assert.equal(res.daysCount, 0);
    assert.equal(res.status, 'pending');
  });

  it('normalizePayslip should handle missing fields safely and compute netSalary', () => {
    const res = normalizePayslip(null);
    assert.equal(res.id, '');
    assert.equal(res.employeeName, 'Nhân viên');
    assert.equal(res.netSalary, 0);
  });

  it('normalizeTask should handle missing fields safely', () => {
    const res = normalizeTask(null);
    assert.equal(res.id, '');
    assert.equal(res.title, 'Công việc chưa đặt tên');
    assert.equal(res.status, 'todo');
  });

  it('normalizeDepartment should handle missing fields safely', () => {
    const res = normalizeDepartment(null);
    assert.equal(res.id, '');
    assert.equal(res.name, 'Phòng ban');
    assert.equal(res.employeeCount, 0);
  });

  it('formatVND formats currency correctly', () => {
    assert.equal(formatVND(15000000), '15.000.000 VNĐ');
    assert.equal(formatVND(0), '0 VNĐ');
    assert.equal(formatVND(null), '0 VNĐ');
  });

  it('formatDateVN formats YYYY-MM-DD correctly', () => {
    assert.equal(formatDateVN('2026-09-27'), '27/09/2026');
    assert.equal(formatDateVN(null), '--/--/----');
  });
});
