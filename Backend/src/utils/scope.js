/**
 * Build the SQL predicate for a permission scope and push its parameter.
 *  - 'all'        -> null (no restriction)
 *  - 'self'       -> cols.employee = <user's employee id>
 *  - 'department' -> cols.department = <user's department>; a user without a department only sees themselves
 * `cols` = { employee: 'a.employee_id', department: 'e.department_id' }.
 */
async function scopeCondition(executor, user, scope, cols, params) {
  if (scope === 'all') return null;
  if (scope === 'department') {
    const { rows } = user.employeeId
      ? await executor.query('SELECT department_id FROM employees WHERE id = $1', [user.employeeId])
      : { rows: [] };
    const dept = rows[0]?.department_id;
    if (dept) {
      params.push(dept);
      return `${cols.department} = $${params.length}`;
    }
  } else if (scope !== 'self') {
    throw new Error(`Unknown scope "${scope}"`);
  }
  params.push(user.employeeId ?? '');
  return `${cols.employee} = $${params.length}`;
}

module.exports = { scopeCondition };
