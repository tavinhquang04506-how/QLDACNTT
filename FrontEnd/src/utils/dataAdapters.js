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
  const deductions = Number(slip.total_deductions ?? slip.deductions ?? 0);
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
