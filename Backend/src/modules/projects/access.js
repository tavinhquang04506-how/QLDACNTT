const HR_ROLES = ['CEO', 'HR_DIRECTOR'];

async function departmentOf(executor, employeeId) {
  if (!employeeId) return null;
  const { rows } = await executor.query('SELECT department_id FROM employees WHERE id = $1', [employeeId]);
  return rows[0]?.department_id ?? null;
}

/**
 * SQL predicate (on alias `p` = projects) limiting which projects `user` may see; pushes its parameters.
 *  - CEO / HR_DIRECTOR: everything (null)
 *  - LINE_MANAGER: their department's projects plus the same participation rule as everyone else
 *  - everyone else: projects they manage, have a task in, or belong to through a squad
 */
async function visibilityPredicate(executor, user, params) {
  if (HR_ROLES.includes(user.roleCode)) return null;
  const emp = user.employeeId ?? '';
  params.push(emp);
  const e = `$${params.length}`;
  const participation = `(p.manager_id = ${e}
    OR EXISTS (SELECT 1 FROM tasks t WHERE t.project_id = p.id AND (t.assignee_id = ${e} OR t.creator_id = ${e}))
    OR EXISTS (SELECT 1 FROM squads s WHERE s.project_id = p.id
                AND (s.lead_id = ${e} OR EXISTS (SELECT 1 FROM squad_members sm WHERE sm.squad_id = s.id AND sm.employee_id = ${e}))))`;
  if (user.roleCode === 'LINE_MANAGER') {
    const dept = await departmentOf(executor, user.employeeId);
    if (dept) {
      params.push(dept);
      return `(p.department_id = $${params.length} OR ${participation})`;
    }
  }
  return participation;
}

async function canSeeProject(executor, user, projectId) {
  const params = [projectId];
  const predicate = await visibilityPredicate(executor, user, params);
  const { rows } = await executor.query(`SELECT 1 FROM projects p WHERE p.id = $1 ${predicate ? `AND ${predicate}` : ''}`, params);
  return rows.length > 0;
}

/** May the user edit/delete this project and its tasks (CEO, HR, the project manager, or the department's manager)? */
async function canManageProject(executor, user, project) {
  if (HR_ROLES.includes(user.roleCode)) return true;
  if (user.employeeId && project.manager_id === user.employeeId) return true;
  if (user.roleCode === 'LINE_MANAGER') {
    const dept = await departmentOf(executor, user.employeeId);
    return Boolean(dept) && dept === project.department_id;
  }
  return false;
}

module.exports = { HR_ROLES, departmentOf, visibilityPredicate, canSeeProject, canManageProject };
