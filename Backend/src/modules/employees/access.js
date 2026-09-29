const { SENSITIVE_EMPLOYEE_FIELDS } = require('../../utils/redact');

const HR_ROLES = ['CEO', 'HR_DIRECTOR'];

/**
 * Remove what `user` may not see from an employee row (returns a copy).
 * face_encoding is never returned; the sensitive fields are kept only for the
 * record's owner, HR_DIRECTOR and CEO.
 */
function shapeEmployee(row, user) {
  // eslint-disable-next-line no-unused-vars
  const { face_encoding, ...rest } = row;
  const isOwner = Boolean(user.employeeId) && row.id === user.employeeId;
  if (HR_ROLES.includes(user.roleCode) || isOwner) return rest;
  for (const field of SENSITIVE_EMPLOYEE_FIELDS) delete rest[field];
  return rest;
}

/** May a user with the given permission scope open this employee's record? */
function canViewEmployee(scope, user, actorDepartmentId, row) {
  if (scope === 'all') return true;
  if (row.id === user.employeeId) return scope === 'department' || scope === 'self';
  if (scope === 'department') return Boolean(actorDepartmentId) && row.department_id === actorDepartmentId;
  return false;
}

module.exports = { shapeEmployee, canViewEmployee, HR_ROLES };
