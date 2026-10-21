import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmployee,
  normalizeLeaveBalance,
  buildPortalSalaryView,
  formatPortalWorkHours,
  normalizeLeaveRequest,
  normalizePayslip,
  normalizeTask,
  normalizeDepartment,
  formatVND,
  formatDateVN
} from '../src/utils/dataAdapters.js';

describe('Data Adapters Unit Tests', () => {
  it('normalizeEmployee should return safe defaults for null or empty input without fabricating salary', () => {
    const res = normalizeEmployee(null);
    assert.equal(res.id, '');
    assert.equal(res.name, 'Chưa rõ');
    assert.equal(res.email, '');
    assert.equal(res.department, 'Chưa phân bổ');
    assert.equal(res.role, 'Nhân viên');
    assert.equal(res.status, 'DANG_LAM_VIEC');
    assert.equal(res.avatar, '');
    assert.equal(res.baseSalary, null);
  });

  it('normalizeEmployee should correctly map PostgreSQL snake_case fields and preserve 0 vs null', () => {
    const raw = {
      id: 10,
      full_name: 'Nguyen Van A',
      work_email: 'a@nexus.com',
      department_name: 'Ky Thuat',
      job_title: 'Developer',
      status: 'DANG_LAM_VIEC',
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

    const redacted = normalizeEmployee({ id: 11, full_name: 'Redacted User' });
    assert.equal(redacted.baseSalary, null);

    const zeroSal = normalizeEmployee({ id: 12, full_name: 'Zero User', base_salary: 0 });
    assert.equal(zeroSal.baseSalary, 0);
  });

  it('R07: normalizeLeaveBalance never fabricates 12 days on empty/error state and preserves 0 remaining days', () => {
    const emptyRes = normalizeLeaveBalance([], { hasError: false });
    assert.equal(emptyRes.hasData, false);
    assert.equal(emptyRes.totalLeaveDays, null);
    assert.equal(emptyRes.remainingLeaveDays, null);
    assert.equal(emptyRes.statusText, 'Chưa có dữ liệu');

    const errorRes = normalizeLeaveBalance([{ entitled_days: 12, remaining_days: 10 }], { hasError: true });
    assert.equal(errorRes.hasData, false);
    assert.equal(errorRes.remainingLeaveDays, null);
    assert.equal(errorRes.statusText, 'Không tải được dữ liệu');

    const zeroRemaining = normalizeLeaveBalance([
      { leave_type_code: 'PHEP_NAM', entitled_days: '12.0', used_days: '12.0', remaining_days: '0.0' }
    ]);
    assert.equal(zeroRemaining.hasData, true);
    assert.equal(zeroRemaining.totalLeaveDays, 12);
    assert.equal(zeroRemaining.usedLeaveDays, 12);
    assert.equal(zeroRemaining.remainingLeaveDays, 0);
    assert.equal(zeroRemaining.usedPercent, '100.0');
    assert.equal(zeroRemaining.remainingPercent, '0.0');
  });

  it('R07: buildPortalSalaryView converts numeric strings before adding allowances+ot_pay and sums 10.5% insurance (BHXH+BHYT+BHTN)', () => {
    const view = buildPortalSalaryView([
      {
        base_salary: '20000000.00',
        allowances: '1500000.00',
        ot_pay: '500000.00',
        bonus: '0.00',
        bhxh_amount: '1600000.00',
        bhyt_amount: '300000.00',
        bhtn_amount: '200000.00',
        pit_amount: '445000.00',
        net_salary: '19455000.00',
        bank_name: 'Vietcombank',
        period: '2026-09'
      }
    ]);
    assert.equal(view.hasPayslip, true);
    assert.equal(view.allowanceAndOtAmount, 2000000);
    assert.equal(view.insuranceAmount, 2100000);
    assert.equal(view.netAmount, 19455000);
    assert.match(view.allowance, /2[.,]000[.,]000/);
    assert.match(view.insurance, /2[.,]100[.,]000/);

    const zeroSlip = buildPortalSalaryView([
      {
        base_salary: '20000000.00',
        allowances: '0.00',
        ot_pay: '0.00',
        bonus: '0.00',
        bhxh_amount: '0.00',
        bhyt_amount: '0.00',
        bhtn_amount: '0.00',
        pit_amount: '0.00',
        net_salary: '0.00'
      }
    ]);
    assert.equal(zeroSlip.hasPayslip, true);
    assert.equal(zeroSlip.allowanceAndOtAmount, 0);
    assert.equal(zeroSlip.insuranceAmount, 0);
    assert.equal(zeroSlip.netAmount, 0);

    const noSlip = buildPortalSalaryView([], {});
    assert.equal(noSlip.hasPayslip, false);
    assert.equal(noSlip.net, 'Chờ quyết toán');
    assert.equal(noSlip.insurance, 'Chưa có dữ liệu');
  });

  it('R07: formatPortalWorkHours never fabricates 8.0 giờ when employee is only checked in', () => {
    assert.equal(formatPortalWorkHours({ check_in_time: '2026-10-20T08:00:00Z', work_hours: 0 }, true), 'Đang trong ca');
    assert.equal(formatPortalWorkHours({ check_in_time: '2026-10-20T08:00:00Z', check_out_time: '2026-10-20T17:30:00Z', work_hours: 8.5 }, true), '8.5 giờ');
    assert.equal(formatPortalWorkHours(null, false), 'Chưa ghi nhận');
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

  it('formatVND formats currency correctly and distinguishes 0 from null/redacted', () => {
    assert.equal(formatVND(15000000), '15.000.000 VNĐ');
    assert.equal(formatVND(0), '0 VNĐ');
    assert.equal(formatVND(null), 'Chưa có dữ liệu');
    assert.equal(formatVND(undefined), 'Chưa có dữ liệu');
  });

  it('formatDateVN formats YYYY-MM-DD correctly', () => {
    assert.equal(formatDateVN('2026-09-27'), '27/09/2026');
    assert.equal(formatDateVN(null), '--/--/----');
  });
});
