/**
 * R28: Pure state & metric helpers for ProjectsTasksPage.jsx.
 * Eliminates sample/fallback numbers (1200h, 20 members, 90.0%, random TSK-* IDs, hardcoded DEPT-IT).
 */

/**
 * Maps a raw task row from the backend API into the UI task shape.
 * Returns `null` if the record has no real server `id` so the UI never fabricates
 * actionable fake `TSK-*` IDs.
 */
export function mapServerTask(t, prjName, currentRoleName = '') {
  if (!t || (typeof t.id !== 'string' && typeof t.id !== 'number') || String(t.id).trim() === '') {
    return null;
  }

  return {
    id: String(t.id).trim(),
    projectId: t.project_id,
    projectName: prjName || t.project_name || 'Dự án',
    title: t.title || 'Nhiệm vụ',
    description: t.description || '',
    assigneeId: t.assignee_id || '',
    assigneeName: t.assignee_name || (t.assignee_id ? `Nhân viên (${t.assignee_id})` : 'Chưa phân công'),
    assigneeRole: t.assignee_role || 'Nhân sự',
    assigneeAvatar:
      t.assignee_avatar ||
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
    creator: t.creator_name
      ? `${t.creator_name} (Quản lý)`
      : currentRoleName
      ? `${currentRoleName} (Quản lý)`
      : 'Quản lý dự án',
    deadline: t.deadline ? new Date(t.deadline).toLocaleDateString('vi-VN') : '-',
    priority: t.priority || 'Trung bình',
    stage: t.stage || 'todo',
    progress: Number(t.progress) || 0,
    kpiWeight: Number(t.kpi_weight) || 20,
    submissionNote: t.deliverable_note || '',
    logs: [
      {
        time: (t.created_at ? new Date(t.created_at) : new Date()).toLocaleDateString('vi-VN') + ' 09:00',
        author: t.creator_name || currentRoleName || 'Quản lý',
        note: 'Nhiệm vụ được đồng bộ trực tiếp từ CSDL PostgreSQL.',
      },
    ],
  };
}

/**
 * Maps an array of raw server tasks, skipping any malformed entries without a valid server `id`.
 */
export function mapServerTaskList(rawTasks, prjName, currentRoleName = '') {
  if (!Array.isArray(rawTasks)) return [];
  return rawTasks.map((t) => mapServerTask(t, prjName, currentRoleName)).filter(Boolean);
}

/**
 * Computes real project & HR workload metrics without sample fallbacks (no 1200h, 20, or 90.0%).
 */
export function computeProjectsTasksMetrics({ projects = [], tasks = [], members = [] } = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeMembers = Array.isArray(members) ? members : [];

  const completedProjects = safeProjects.filter((p) => p.status === 'completed');
  const runningProjects = safeProjects.filter((p) => p.status !== 'completed');

  const totalBudgetHours = safeProjects.reduce((acc, p) => acc + (Number(p.budgetHours) || 0), 0);
  const totalUsedHours = safeProjects.reduce((acc, p) => acc + (Number(p.usedHours) || 0), 0);
  const budgetPercentage =
    totalBudgetHours > 0 ? ((totalUsedHours / totalBudgetHours) * 100).toFixed(1) : '0.0';

  const avgPlanProgress =
    safeProjects.length > 0
      ? (
          safeProjects.reduce((acc, p) => acc + (Number(p.progress) || 0), 0) / safeProjects.length
        ).toFixed(1)
      : '0.0';

  const atRiskProjects = safeProjects.filter(
    (p) => p.status === 'at_risk' || (p.priority === 'Cao' && Number(p.progress) < 50)
  );

  const memberIdSet = new Set(safeMembers.map((m) => m.id).filter(Boolean));
  const assignedEmpIds = new Set(
    safeTasks
      .map((t) => t.assigneeId)
      .filter((id) => Boolean(id) && (memberIdSet.size === 0 || memberIdSet.has(id)))
  );
  const totalTeamCount = safeMembers.length;
  const allocationRate =
    totalTeamCount > 0 ? ((assignedEmpIds.size / totalTeamCount) * 100).toFixed(1) : '0.0';

  const memberTaskCounts = {};
  safeTasks
    .filter((t) => t.stage !== 'done')
    .forEach((t) => {
      if (t.assigneeName && t.assigneeId) {
        memberTaskCounts[t.assigneeName] = (memberTaskCounts[t.assigneeName] || 0) + 1;
      }
    });
  const overloadedMembers = Object.entries(memberTaskCounts).filter(([, count]) => count >= 3);

  return {
    completedProjects,
    runningProjects,
    totalBudgetHours,
    totalUsedHours,
    budgetPercentage,
    avgPlanProgress,
    atRiskProjects,
    assignedEmpIds,
    totalTeamCount,
    allocationRate,
    memberTaskCounts,
    overloadedMembers,
  };
}

/**
 * Resolves the create-project payload without ever falling back to hardcoded 'DEPT-IT'.
 * Line managers use their bound `user.departmentId`; global roles (CEO/HR_DIRECTOR) must
 * either have `user.departmentId` or select a real `departmentId` in the form.
 */
export function buildCreateProjectPayload({ newProject = {}, user = null, isLineManager = false } = {}) {
  const name = String(newProject.name || '').trim();
  if (!name) {
    return { ok: false, error: 'Vui lòng nhập tên dự án.' };
  }

  const resolvedDeptId = String(user?.departmentId || newProject.departmentId || '').trim();
  if (!isLineManager && !resolvedDeptId) {
    return {
      ok: false,
      error: 'Vui lòng chọn phòng ban phụ trách dự án trước khi khởi tạo.',
    };
  }

  const budgetNumeric = Number(newProject.budgetHours);
  const payload = {
    name,
    code: newProject.code?.trim() || undefined,
    priority: newProject.priority || 'Cao',
    description: newProject.description || '',
    budget_hours: Number.isFinite(budgetNumeric) && budgetNumeric >= 0 ? budgetNumeric : 0,
  };

  if (resolvedDeptId) {
    payload.department_id = resolvedDeptId;
  }

  return { ok: true, payload };
}
