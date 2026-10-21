// ============================================
// utils/dataAdapters.js — Centralized Data Adapters & Normalizers
// Converts raw backend snake_case to safe camelCase UI shapes
// ============================================

/**
 * Normalizes an employee record to safe UI format without fabricating business numbers
 */
export function normalizeEmployee(emp) {
  if (!emp || typeof emp !== 'object') {
    return {
      id: '',
      name: 'Chưa rõ',
      email: '',
      department: 'Chưa phân bổ',
      departmentId: null,
      role: 'Nhân viên',
      roleCode: 'EMPLOYEE',
      status: 'DANG_LAM_VIEC',
      avatar: '',
      phone: '',
      baseSalary: null,
      base_salary: null,
      joinedDate: '',
      kpiScore: null,
      attendanceRate: null,
      leaveBalance: null,
      leave_balance: null,
      contractType: null,
      contractNo: null,
      contractSalary: null,
      citizenId: '',
      dob: '',
      gender: '',
      address: '',
      bankAccount: '',
      bankName: '',
      managerId: null,
      managerName: '',
    };
  }

  const rawSalary = emp.base_salary ?? emp.baseSalary ?? null;
  const baseSalary = rawSalary !== null && rawSalary !== undefined && rawSalary !== '' ? Number(rawSalary) : null;

  const rawKpi = emp.kpi_score ?? emp.kpiScore ?? null;
  const kpiScore = rawKpi !== null && rawKpi !== undefined && rawKpi !== '' ? Number(rawKpi) : null;

  const rawAtt = emp.attendance_rate ?? emp.attendanceRate ?? null;
  const attendanceRate = rawAtt !== null && rawAtt !== undefined && rawAtt !== '' ? Number(rawAtt) : null;

  const rawLeave = emp.leave_balance ?? emp.leaveBalance ?? null;
  const leaveBalance = rawLeave !== null && rawLeave !== undefined && rawLeave !== '' ? Number(rawLeave) : null;

  const rawContractSalary = emp.contract_salary ?? emp.contractSalary ?? rawSalary;
  const contractSalary =
    rawContractSalary !== null && rawContractSalary !== undefined && rawContractSalary !== ''
      ? Number(rawContractSalary)
      : baseSalary;

  return {
    id: emp.id ?? emp.employee_id ?? emp.employeeId ?? '',
    name: emp.full_name ?? emp.fullName ?? emp.name ?? 'Chưa rõ',
    full_name: emp.full_name ?? emp.fullName ?? emp.name ?? 'Chưa rõ',
    email: emp.work_email ?? emp.email ?? '',
    work_email: emp.work_email ?? emp.email ?? '',
    department: emp.department_name ?? emp.departmentName ?? emp.department ?? 'Chưa phân bổ',
    department_name: emp.department_name ?? emp.departmentName ?? emp.department ?? 'Chưa phân bổ',
    departmentId: emp.department_id ?? emp.departmentId ?? null,
    department_id: emp.department_id ?? emp.departmentId ?? null,
    role: emp.job_title ?? emp.jobTitle ?? emp.position_name ?? emp.role ?? 'Nhân viên',
    job_title: emp.job_title ?? emp.jobTitle ?? emp.position_name ?? emp.role ?? 'Nhân viên',
    roleCode: emp.role_code ?? emp.roleCode ?? 'EMPLOYEE',
    status: emp.employee_status ?? emp.status ?? 'DANG_LAM_VIEC',
    avatar: emp.avatar_url ?? emp.avatarUrl ?? emp.avatar ?? '',
    phone: emp.phone_number ?? emp.phoneNumber ?? emp.phone ?? '',
    phone_number: emp.phone_number ?? emp.phoneNumber ?? emp.phone ?? '',
    baseSalary,
    base_salary: baseSalary,
    joinedDate: emp.joined_date ?? emp.joinedDate ?? emp.hire_date ?? emp.hireDate ?? '',
    joined_date: emp.joined_date ?? emp.joinedDate ?? emp.hire_date ?? emp.hireDate ?? '',
    kpiScore,
    kpi_score: kpiScore,
    attendanceRate,
    attendance_rate: attendanceRate,
    leaveBalance,
    leave_balance: leaveBalance,
    contractType: emp.active_contract_type ?? emp.contract_type ?? emp.contractType ?? null,
    contractNo: emp.contract_no ?? emp.contractNo ?? null,
    contractStartDate: emp.contract_start_date ?? emp.contractStartDate ?? emp.joined_date ?? emp.joinedDate ?? '',
    contractEndDate: emp.contract_end_date ?? emp.contractEndDate ?? null,
    contractSalary,
    citizenId: emp.citizen_id ?? emp.citizenId ?? emp.cccd ?? '',
    citizen_id: emp.citizen_id ?? emp.citizenId ?? emp.cccd ?? '',
    dob: emp.date_of_birth ?? emp.dateOfBirth ?? emp.dob ?? '',
    gender: emp.gender ?? '',
    address: emp.address ?? '',
    bankAccount: emp.bank_account ?? emp.bankAccount ?? '',
    bank_account: emp.bank_account ?? emp.bankAccount ?? '',
    bankName: emp.bank_name ?? emp.bankName ?? '',
    bank_name: emp.bank_name ?? emp.bankName ?? '',
    managerId: emp.manager_id ?? emp.managerId ?? null,
    managerName: emp.manager_name ?? emp.managerName ?? '',
    manager_name: emp.manager_name ?? emp.managerName ?? '',
  };
}

/**
 * Normalizes leave balance records for Employee Portal without fabricating 12 days when data is missing or failed.
 * Preserves 0 when the employee legitimately has 0 entitled/remaining days.
 */
export function normalizeLeaveBalance(leaveBalances, { hasError = false } = {}) {
  const annualLeave = Array.isArray(leaveBalances)
    ? (leaveBalances.find((b) => b && (b.leave_type_code === 'PHEP_NAM' || b.leave_type_code === 'AL')) || leaveBalances[0] || null)
    : null;

  const hasValidRow = Boolean(
    !hasError &&
      annualLeave &&
      typeof annualLeave === 'object' &&
      (annualLeave.entitled_days !== undefined && annualLeave.entitled_days !== null
        || annualLeave.total_days !== undefined && annualLeave.total_days !== null
        || annualLeave.remaining_days !== undefined && annualLeave.remaining_days !== null)
  );

  if (!hasValidRow) {
    return {
      hasData: false,
      totalLeaveDays: null,
      usedLeaveDays: null,
      remainingLeaveDays: null,
      usedPercent: '0.0',
      remainingPercent: '0.0',
      donutDash: '0, 100',
      statusText: hasError ? 'Không tải được dữ liệu' : 'Chưa có dữ liệu',
    };
  }

  const totalLeaveDays = Number(annualLeave.entitled_days ?? annualLeave.total_days ?? 0);
  const usedLeaveDays = Number(annualLeave.used_days ?? 0);
  const remainingLeaveDays = annualLeave.remaining_days !== undefined && annualLeave.remaining_days !== null
    ? Number(annualLeave.remaining_days)
    : Math.max(0, totalLeaveDays - usedLeaveDays);
  const usedPercent = totalLeaveDays > 0 ? ((usedLeaveDays / totalLeaveDays) * 100).toFixed(1) : '0.0';
  const remainingPercent = totalLeaveDays > 0 ? ((remainingLeaveDays / totalLeaveDays) * 100).toFixed(1) : '0.0';

  return {
    hasData: true,
    totalLeaveDays,
    usedLeaveDays,
    remainingLeaveDays,
    usedPercent,
    remainingPercent,
    donutDash: `${remainingPercent}, 100`,
    statusText: 'Sẵn sàng',
  };
}

/**
 * Builds personal salary view for Employee Portal from live payslips:
 * - Safely converts numeric strings (e.g. "1500000.00" + "500000.00") using Number() before addition
 * - Sums bhxh_amount + bhyt_amount + bhtn_amount for the 10.5% employee insurance deduction
 * - Preserves 0 on zero-income payslips and never fabricates numbers when payslips are absent
 */
export function buildPortalSalaryView(myPayslips, currentRole = {}) {
  if (Array.isArray(myPayslips) && myPayslips.length > 0 && myPayslips[0] && typeof myPayslips[0] === 'object') {
    const p = myPayslips[0];
    const netAmount = Number(p.net_salary ?? p.netSalary ?? 0);
    const baseAmount = Number(p.base_salary ?? p.baseSalary ?? 0);
    const bonusAmount = Number(p.bonus ?? 0);
    const allowanceAndOtAmount = Number(p.allowances ?? 0) + Number(p.ot_pay ?? p.overtime_pay ?? p.overtimePay ?? 0);
    const insuranceAmount = Number(p.bhxh_amount ?? 0) + Number(p.bhyt_amount ?? 0) + Number(p.bhtn_amount ?? 0);
    const taxAmount = Number(p.pit_amount ?? 0);

    return {
      hasPayslip: true,
      netAmount,
      baseAmount,
      bonusAmount,
      allowanceAndOtAmount,
      insuranceAmount,
      taxAmount,
      net: `${netAmount.toLocaleString('vi-VN')} VNĐ`,
      base: `+${baseAmount.toLocaleString('vi-VN')} đ`,
      bonus: `+${bonusAmount.toLocaleString('vi-VN')} đ (Thưởng KPI)`,
      allowance: `+${allowanceAndOtAmount.toLocaleString('vi-VN')} đ (Phụ cấp + OT)`,
      insurance: `-${insuranceAmount.toLocaleString('vi-VN')} đ (BHXH 10.5%)`,
      tax: `-${taxAmount.toLocaleString('vi-VN')} đ (Thuế TNCN)`,
      bank: p.bank_name ? `${p.bank_name} (${p.period || p.period_id || 'Kỳ hiện tại'})` : 'Tài khoản ngân hàng liên kết',
    };
  }

  const rawBase = currentRole?.baseSalary ?? currentRole?.base_salary ?? null;
  const baseSalary = rawBase !== null && rawBase !== undefined && rawBase !== '' ? Number(rawBase) : null;
  return {
    hasPayslip: false,
    netAmount: null,
    baseAmount: baseSalary,
    bonusAmount: null,
    allowanceAndOtAmount: null,
    insuranceAmount: null,
    taxAmount: null,
    net: 'Chờ quyết toán',
    base: baseSalary !== null && baseSalary > 0 ? `+${baseSalary.toLocaleString('vi-VN')} đ (Lương HĐ)` : 'Chưa có dữ liệu',
    bonus: 'Chưa có dữ liệu',
    allowance: 'Chưa có dữ liệu',
    insurance: 'Chưa có dữ liệu',
    tax: 'Chưa có dữ liệu',
    bank: 'Chưa có phiếu lương được chốt',
  };
}

/**
 * Formats today's work hours on Employee Portal without fabricating '8.0 giờ' when only checked in
 */
export function formatPortalWorkHours(todayAttendance, isClockedIn = false) {
  const rawHours = todayAttendance?.work_hours ?? todayAttendance?.working_hours;
  const numHours = rawHours !== null && rawHours !== undefined && rawHours !== '' ? Number(rawHours) : null;
  if (numHours !== null && !Number.isNaN(numHours) && numHours > 0) {
    return `${numHours} giờ`;
  }
  if (todayAttendance?.check_out_time && numHours !== null && !Number.isNaN(numHours)) {
    return `${numHours} giờ`;
  }
  if (isClockedIn) {
    return 'Đang trong ca';
  }
  if (numHours === 0) {
    return '0.0 giờ';
  }
  return 'Chưa ghi nhận';
}

/**
 * Normalizes a leave request to safe UI format
 */
export function normalizeLeaveRequest(leave) {
  if (!leave || typeof leave !== 'object') {
    return {
      id: '',
      employeeId: '',
      employeeName: 'Nhân viên',
      department: '',
      avatar: '',
      leaveType: 'annual',
      startDate: '',
      endDate: '',
      daysCount: 0,
      reason: '',
      status: 'pending',
      stage: 'PENDING_LM',
      appliedAt: '',
      rejectionReason: '',
    };
  }

  return {
    id: leave.id ?? '',
    employeeId: leave.employee_id ?? leave.employeeId ?? '',
    employeeName: leave.full_name ?? leave.employee_name ?? leave.employeeName ?? 'Nhân viên',
    department: leave.department_name ?? leave.departmentName ?? '',
    avatar: leave.avatar_url ?? leave.avatarUrl ?? '',
    leaveType: leave.leave_type ?? leave.leaveType ?? 'annual',
    startDate: leave.start_date ?? leave.startDate ?? '',
    endDate: leave.end_date ?? leave.endDate ?? '',
    daysCount: Number(leave.total_days ?? leave.days_count ?? leave.daysCount ?? 0),
    reason: leave.reason ?? '',
    status: leave.status ?? 'pending',
    stage: leave.stage ?? leave.current_stage ?? 'PENDING_LM',
    appliedAt: leave.created_at ?? leave.createdAt ?? leave.applied_at ?? '',
    rejectionReason: leave.rejection_reason ?? leave.rejectionReason ?? '',
  };
}

/**
 * Normalizes a payslip record to safe UI format
 */
export function normalizePayslip(slip) {
  if (!slip || typeof slip !== 'object') {
    return {
      id: '',
      employeeId: '',
      employeeName: 'Nhân viên',
      department: '',
      period: '',
      baseSalary: 0,
      allowances: 0,
      overtimePay: 0,
      deductions: 0,
      netSalary: 0,
      status: 'draft',
      anomalies: [],
    };
  }

  const base = Number(slip.base_salary ?? slip.baseSalary ?? 0);
  const allowances = Number(slip.allowances ?? 0);
  const overtime = Number(slip.overtime_pay ?? slip.overtimePay ?? slip.ot_pay ?? 0);
  const totalInsurance = Number(slip.bhxh_amount ?? 0) + Number(slip.bhyt_amount ?? 0) + Number(slip.bhtn_amount ?? 0);
  const tax = Number(slip.pit_amount ?? 0);
  const deductions = slip.total_deductions !== undefined && slip.total_deductions !== null
    ? Number(slip.total_deductions)
    : slip.deductions !== undefined && slip.deductions !== null
    ? Number(slip.deductions)
    : totalInsurance + tax;
  const net = slip.net_salary != null || slip.netSalary != null
    ? Number(slip.net_salary ?? slip.netSalary)
    : base + allowances + overtime - deductions;

  return {
    id: slip.id ?? '',
    employeeId: slip.employee_id ?? slip.employeeId ?? '',
    employeeName: slip.full_name ?? slip.employee_name ?? slip.employeeName ?? 'Nhân viên',
    department: slip.department_name ?? slip.departmentName ?? '',
    departmentId: slip.department_id ?? slip.departmentId ?? null,
    period: slip.period ?? '',
    baseSalary: base,
    allowances,
    overtimePay: overtime,
    insuranceDeductions: totalInsurance,
    taxDeductions: tax,
    deductions,
    netSalary: Math.max(0, net),
    status: slip.status ?? 'draft',
    anomalies: Array.isArray(slip.anomalies) ? slip.anomalies : [],
  };
}

/**
 * Normalizes a task record to safe UI format
 */
export function normalizeTask(task) {
  if (!task || typeof task !== 'object') {
    return {
      id: '',
      projectId: '',
      title: 'Công việc chưa đặt tên',
      description: '',
      assigneeId: '',
      assigneeName: 'Chưa phân công',
      assigneeAvatar: '',
      status: 'todo',
      priority: 'medium',
      dueDate: '',
      estimatedHours: 0,
      loggedHours: 0,
    };
  }

  return {
    id: task.id ?? '',
    projectId: task.project_id ?? task.projectId ?? '',
    title: task.title ?? 'Công việc chưa đặt tên',
    description: task.description ?? '',
    assigneeId: task.assignee_id ?? task.assigneeId ?? '',
    assigneeName: task.assignee_name ?? task.assigneeName ?? task.full_name ?? 'Chưa phân công',
    assigneeAvatar: task.assignee_avatar ?? task.avatar_url ?? '',
    status: task.stage ?? task.status ?? 'todo',
    stage: task.stage ?? task.status ?? 'todo',
    priority: task.priority ?? 'medium',
    dueDate: task.due_date ?? task.dueDate ?? '',
    progress: Number(task.progress ?? 0),
    kpiWeight: Number(task.kpi_weight ?? task.kpiWeight ?? 0),
    estimatedHours: Number(task.estimated_hours ?? task.estimatedHours ?? 0),
    loggedHours: Number(task.logged_hours ?? task.loggedHours ?? 0),
  };
}

/**
 * Normalizes a department record to safe UI format
 */
export function normalizeDepartment(dept) {
  if (!dept || typeof dept !== 'object') {
    return {
      id: '',
      name: 'Phòng ban',
      managerName: 'Chưa bổ nhiệm',
      employeeCount: 0,
      budget: 0,
    };
  }

  return {
    id: dept.id ?? '',
    name: dept.name ?? dept.department_name ?? 'Phòng ban',
    managerName: dept.manager_name ?? dept.managerName ?? 'Chưa bổ nhiệm',
    employeeCount: Number(dept.employee_count ?? dept.employeeCount ?? dept.count ?? 0),
    budget: Number(dept.budget ?? 0),
  };
}

/**
 * Currency formatter for Vietnamese Dong (VNĐ)
 */
export function formatVND(amount) {
  if (amount === null || amount === undefined || amount === '') return 'Chưa có dữ liệu';
  const num = Number(amount);
  if (Number.isNaN(num)) return 'Chưa có dữ liệu';
  return new Intl.NumberFormat('vi-VN').format(num) + ' VNĐ';
}

/**
 * Safe Date Formatter to DD/MM/YYYY
 */
export function formatDateVN(dateStr) {
  if (!dateStr) return '--/--/----';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '--/--/----';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '--/--/----';
  }
}
