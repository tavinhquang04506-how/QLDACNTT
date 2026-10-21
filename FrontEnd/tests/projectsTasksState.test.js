import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mapServerTask,
  mapServerTaskList,
  computeProjectsTasksMetrics,
  buildCreateProjectPayload,
} from '../src/utils/projectsTasksState.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('R28 & R30 — ProjectsTasksPage & PayrollPage / Sidebar verification', () => {
  it('R28: rejects tasks missing a valid server id instead of fabricating random TSK-* IDs', () => {
    assert.equal(mapServerTask(null, 'Dự án A'), null);
    assert.equal(mapServerTask({}, 'Dự án A'), null);
    assert.equal(mapServerTask({ id: '   ', title: 'Task lỗi' }, 'Dự án A'), null);

    const valid = mapServerTask(
      {
        id: 'TSK-101',
        project_id: 'PRJ-01',
        title: 'Thiết kế API',
        stage: 'in_progress',
        progress: 60,
      },
      'Dự án A',
      'Trần Quản Lý'
    );
    assert.ok(valid);
    assert.equal(valid.id, 'TSK-101');
    assert.equal(valid.projectName, 'Dự án A');

    const list = mapServerTaskList(
      [
        { id: 'TSK-101', title: 'Hợp lệ' },
        { title: 'Thiếu ID' },
        { id: '', title: 'ID rỗng' },
      ],
      'Dự án A'
    );
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'TSK-101');
  });

  it('R28: returns 0 budgetHours, 0 totalTeamCount, and 0.0% allocationRate when projects/members are empty', () => {
    const emptyMetrics = computeProjectsTasksMetrics({
      projects: [],
      tasks: [],
      members: [],
    });

    assert.equal(emptyMetrics.totalBudgetHours, 0);
    assert.equal(emptyMetrics.totalUsedHours, 0);
    assert.equal(emptyMetrics.budgetPercentage, '0.0');
    assert.equal(emptyMetrics.totalTeamCount, 0);
    assert.equal(emptyMetrics.allocationRate, '0.0');
    assert.equal(emptyMetrics.avgPlanProgress, '0.0');
  });

  it('R28: returns 0 budgetHours when projects exist with 0 budgetHours (never falls back to 1200)', () => {
    const zeroBudgetMetrics = computeProjectsTasksMetrics({
      projects: [
        { id: 'PRJ-1', status: 'in_progress', budgetHours: 0, usedHours: 0, progress: 50 },
      ],
      tasks: [{ id: 'TSK-1', assigneeId: '', stage: 'todo' }],
      members: [{ id: 'NV-001', name: 'Nguyễn Văn A' }],
    });

    assert.equal(zeroBudgetMetrics.totalBudgetHours, 0);
    assert.equal(zeroBudgetMetrics.budgetPercentage, '0.0');
    assert.equal(zeroBudgetMetrics.totalTeamCount, 1);
    assert.equal(zeroBudgetMetrics.assignedEmpIds.size, 0);
    assert.equal(zeroBudgetMetrics.allocationRate, '0.0');
  });

  it('R28: requires explicit departmentId for global roles without user.departmentId instead of defaulting to DEPT-IT', () => {
    const missingDept = buildCreateProjectPayload({
      newProject: { name: 'Dự án Chiến lược Sales', departmentId: '' },
      user: { id: 'USR-CEO', role: 'CEO', departmentId: null },
      isLineManager: false,
    });
    assert.equal(missingDept.ok, false);
    assert.match(missingDept.error, /phòng ban/i);

    const withSelectedDept = buildCreateProjectPayload({
      newProject: { name: 'Dự án Chiến lược Sales', departmentId: 'DEPT-SALES', budgetHours: 300 },
      user: { id: 'USR-CEO', role: 'CEO', departmentId: null },
      isLineManager: false,
    });
    assert.equal(withSelectedDept.ok, true);
    assert.equal(withSelectedDept.payload.department_id, 'DEPT-SALES');
    assert.equal(withSelectedDept.payload.budget_hours, 300);
  });

  it('R30: PayrollPage and Sidebar remove DEPT-IT assumptions, 20M/95 fallbacks, non-HR/CEO period fetches, and fake approve labels', () => {
    const payrollPageSrc = fs.readFileSync(path.join(__dirname, '../src/pages/PayrollPage.jsx'), 'utf8');
    const sidebarSrc = fs.readFileSync(path.join(__dirname, '../src/components/layout/Sidebar.jsx'), 'utf8');

    assert.equal(payrollPageSrc.includes("if (roleKey !== 'EMPLOYEE')"), false);
    assert.equal(payrollPageSrc.includes("e.department_id === 'DEPT-IT'"), false);
    assert.equal(payrollPageSrc.includes('e.base_salary || 20000000'), false);
    assert.equal(payrollPageSrc.includes('e.kpi_score ?? 95'), false);
    assert.equal(payrollPageSrc.includes('canManageCompanyPayroll'), true);
    assert.equal(payrollPageSrc.includes('payroll-role-restricted'), true);
    assert.equal(sidebarSrc.includes('Phê duyệt quỹ lương'), false);
    assert.equal(sidebarSrc.includes('Quản trị bảng lương & quyết toán'), true);
  });
});
