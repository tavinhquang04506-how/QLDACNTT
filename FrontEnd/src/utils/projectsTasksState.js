/**
 * R28 & R33: Pure state & metric helpers for ProjectsTasksPage.jsx.
 * Eliminates sample/fallback numbers (1200h, 20 members, 90.0%, random TSK-* IDs, hardcoded DEPT-IT,
 * fabricated '09:00' task history logs, current-date fallback when created_at is missing,
 * viewer-dependent creator/author fallback, and KPI weight 0 -> 20 coercion).
 */

const STAGE_LABELS = {
  todo: 'Cần làm',
  in_progress: 'Đang thực hiện',
  review: 'Chờ nghiệm thu',
  done: 'Hoàn thành',
};

const ACTION_LABELS = {
  STAGE_CHANGE: 'Chuyển trạng thái',
  REVIEW_ACCEPTED: 'Nghiệm thu đạt',
  REVIEW_REJECTED: 'Trả lại chỉnh sửa',
  PROGRESS_UPDATE: 'Cập nhật tiến độ',
  CREATE_TASK: 'Khởi tạo nhiệm vụ',
};

/**
 * R33: Maps a single server task_logs record (`GET /api/tasks/:id/logs`) into UI history entry.
 * Never fabricates timestamps, events, or viewer-dependent authors.
 */
export function mapServerTaskLog(l) {
  if (!l || typeof l !== 'object') return null;

  const author =
    l.actor_name && String(l.actor_name).trim()
      ? String(l.actor_name).trim()
      : l.actor_id && String(l.actor_id).trim()
      ? `Nhân sự (${String(l.actor_id).trim()})`
      : 'Hệ thống';

  let time = 'Chưa ghi nhận thời gian';
  if (l.created_at) {
    const dt = new Date(l.created_at);
    if (!Number.isNaN(dt.getTime())) {
      time = dt.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }

  const actionCode = l.action ? String(l.action).trim() : 'LOG';
  const actionLabel = ACTION_LABELS[actionCode] || actionCode;
  const fromLabel = l.from_stage ? STAGE_LABELS[l.from_stage] || l.from_stage : null;
  const toLabel = l.to_stage ? STAGE_LABELS[l.to_stage] || l.to_stage : null;
  const transitionText =
    fromLabel && toLabel && l.from_stage !== l.to_stage
      ? `${actionLabel}: ${fromLabel} → ${toLabel}`
      : actionLabel;
  const noteText = l.note && String(l.note).trim() ? String(l.note).trim() : null;
  const displayNote = noteText ? `${transitionText} — ${noteText}` : transitionText;

  return {
    id: l.id ?? null,
    taskId: l.task_id || null,
    actorId: l.actor_id || null,
    author,
    action: actionCode,
    actionLabel,
    fromStage: l.from_stage || null,
    toStage: l.to_stage || null,
    rawNote: noteText,
    note: displayNote,
    time,
    createdAt: l.created_at || null,
  };
}

/**
 * R33: Maps an array of server task_logs records from `GET /api/tasks/:id/logs`.
 */
export function mapServerTaskLogs(rawLogs) {
  if (!Array.isArray(rawLogs)) return [];
  return rawLogs.map((l) => mapServerTaskLog(l)).filter(Boolean);
}

/**
 * Maps a raw task row from the backend API into the UI task shape.
 * Returns `null` if the record has no real server `id` so the UI never fabricates
 * actionable fake `TSK-*` IDs.
 * R33:
 * - Preserves valid `kpi_weight = 0` as `0` (does not coerce `0` to `20`).
 * - Does not fabricate a synthetic `09:00` / `Nhiệm vụ được đồng bộ...` log entry.
 * - Does not substitute current date when `created_at` is missing.
 * - Does not use the viewer's `currentRoleName` as fallback creator/author.
 */
export function mapServerTask(t, prjName) {
  if (!t || (typeof t.id !== 'string' && typeof t.id !== 'number') || String(t.id).trim() === '') {
    return null;
  }

  const hasRawKpi =
    t.kpi_weight !== null && t.kpi_weight !== undefined && String(t.kpi_weight).trim() !== '';
  const numericKpi = hasRawKpi ? Number(t.kpi_weight) : null;
  const kpiWeight = Number.isFinite(numericKpi) && numericKpi >= 0 ? numericKpi : 0;

  let createdAtDisplay = null;
  if (t.created_at) {
    const dt = new Date(t.created_at);
    if (!Number.isNaN(dt.getTime())) {
      createdAtDisplay = dt.toLocaleDateString('vi-VN');
    }
  }

  let deadlineDisplay = '-';
  if (t.deadline) {
    const dl = new Date(t.deadline);
    if (!Number.isNaN(dl.getTime())) {
      deadlineDisplay = dl.toLocaleDateString('vi-VN');
    }
  }

  const creator =
    t.creator_name && String(t.creator_name).trim()
      ? `${String(t.creator_name).trim()} (Quản lý)`
      : t.creator_id && String(t.creator_id).trim()
      ? `Nhân sự (${String(t.creator_id).trim()})`
      : 'Chưa ghi nhận người giao';

  const serverLogs = Array.isArray(t.task_logs)
    ? mapServerTaskLogs(t.task_logs)
    : Array.isArray(t.logs)
    ? mapServerTaskLogs(t.logs)
    : [];

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
      '/default-avatar.jpg',
    creatorId: t.creator_id || null,
    creator,
    createdAt: createdAtDisplay,
    deadline: deadlineDisplay,
    priority: t.priority || 'Trung bình',
    stage: t.stage || 'todo',
    progress: Number(t.progress) || 0,
    kpiWeight,
    submissionNote: t.deliverable_note || '',
    reviewNote: t.review_note || '',
    logs: serverLogs,
  };
}

/**
 * Maps an array of raw server tasks, skipping any malformed entries without a valid server `id`.
 */
export function mapServerTaskList(rawTasks, prjName) {
  if (!Array.isArray(rawTasks)) return [];
  return rawTasks.map((t) => mapServerTask(t, prjName)).filter(Boolean);
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
