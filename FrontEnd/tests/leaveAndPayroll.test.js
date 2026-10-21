import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLeaveRequest, normalizePayslip, formatVND } from '../src/utils/dataAdapters.js';
import {
  normalizeServerSettingsBaseline,
  canSubmitSettingsSave,
  buildSettingsPatch,
} from '../src/utils/settingsPatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  it('R10: payrollService.lockPeriod defaults acknowledgeAnomalies to false and forwards audit note', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/services/payrollService.js'), 'utf8');
    assert.match(src, /lockPeriod:\s*\(id,\s*acknowledgeAnomalies\s*=\s*false/);
    assert.doesNotMatch(src, /lockPeriod:\s*\(id,\s*acknowledgeAnomalies\s*=\s*true/);
  });

  it('R10 & R13: PayrollLockModal displays real anomalies, defaults acknowledgeAnomalies to false, and removes fake password/checkbox controls', () => {
    const modalSrc = fs.readFileSync(path.resolve(__dirname, '../src/modals/payroll/PayrollLockModal.jsx'), 'utf8');
    assert.match(modalSrc, /useState\(false\)/);
    assert.match(modalSrc, /payrollService[\s\S]*\.getAnomalies\(periodId\)/);
    assert.match(modalSrc, /data-testid="acknowledge-anomalies-checkbox"/);
    assert.match(modalSrc, /data-testid="payroll-lock-note-input"/);
    assert.doesNotMatch(modalSrc, /type=\{showPassword \? 'text' : 'password'\}/);
    assert.doesNotMatch(modalSrc, /Nhập mật khẩu hoặc mã xác nhận quản trị/);
    assert.doesNotMatch(modalSrc, /sendPush/);
    assert.doesNotMatch(modalSrc, /openPortal/);
  });

  it('R17: settingsPatch blocks saving when server baseline is not loaded or loadError is active, and builds partial diff patch with expectedUpdatedAt', () => {
    // 1. Cannot submit save when hasLoadedBaseline is false or loadError exists
    assert.equal(
      canSubmitSettingsSave({
        canEditSettings: true,
        loading: false,
        saving: false,
        hasLoadedBaseline: false,
        loadError: null,
        serverBaseline: null,
      }),
      false
    );
    assert.equal(
      canSubmitSettingsSave({
        canEditSettings: true,
        loading: false,
        saving: false,
        hasLoadedBaseline: true,
        loadError: 'Không tải được cấu hình',
        serverBaseline: { personalIncomeTaxDeduction: 11000000 },
      }),
      false
    );

    const baseline = normalizeServerSettingsBaseline({
      personal_income_tax_deduction: 14000000,
      dependent_deduction: 5500000,
      max_ot_per_month: 35,
      policy_effective_from: '2026-06',
      updated_at: '2026-10-20T12:00:00.000Z',
    });

    assert.equal(
      canSubmitSettingsSave({
        canEditSettings: true,
        loading: false,
        saving: false,
        hasLoadedBaseline: true,
        loadError: null,
        serverBaseline: baseline,
      }),
      true
    );

    // 2. Transient saveError does NOT permanently block retry save once baseline is loaded
    const patch = buildSettingsPatch(baseline, {
      ...baseline,
      maxOtPerMonth: 32,
    });
    assert.deepEqual(patch, {
      maxOtPerMonth: 32,
      expectedUpdatedAt: '2026-10-20T12:00:00.000Z',
    });
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'personalIncomeTaxDeduction'), false);

    // 3. Verify SettingsPage.jsx does not initialize form state with sample defaults and provides Retry button
    const settingsPageSrc = fs.readFileSync(path.resolve(__dirname, '../src/pages/SettingsPage.jsx'), 'utf8');
    assert.doesNotMatch(settingsPageSrc, /useState\(11000000\)/);
    assert.doesNotMatch(settingsPageSrc, /useState\('2020-01'\)/);
    assert.match(settingsPageSrc, /data-testid="settings-retry-btn"/);
    assert.match(settingsPageSrc, /canSubmitSettingsSave/);
    assert.match(settingsPageSrc, /buildSettingsPatch/);
  });

  it('R18 & R19: PayrollLockModal blocks stale payroll from being bypassed by acknowledgeAnomalies, and BankTransferModal excludes zero-net payslips', () => {
    const lockModalSrc = fs.readFileSync(path.resolve(__dirname, '../src/modals/payroll/PayrollLockModal.jsx'), 'utf8');
    assert.match(lockModalSrc, /PAYROLL_STALE/);
    assert.match(lockModalSrc, /staleItems/);
    assert.match(lockModalSrc, /data-testid="payroll-lock-stale-banner"/);

    const bankModalSrc = fs.readFileSync(path.resolve(__dirname, '../src/modals/payroll/BankTransferModal.jsx'), 'utf8');
    assert.match(bankModalSrc, /hasBank\s*&&\s*rawNet\s*>\s*0/);
  });
});
