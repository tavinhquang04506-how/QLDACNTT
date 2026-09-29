const ALWAYS = new Set(['face_encoding', 'password_hash', 'token_hash']);
// Employee fields only the owner, HR_DIRECTOR and CEO may see.
const SENSITIVE_EMPLOYEE_FIELDS = [
  'base_salary', 'citizen_id', 'bank_account', 'bank_name', 'date_of_birth', 'address', 'termination_reason',
];
const ADMIN_HIDDEN = new Set([...SENSITIVE_EMPLOYEE_FIELDS, 'salary']);

/**
 * Copy of an audit old/new value with secrets replaced by "[REDACTED]".
 * ADMIN is a technical role and additionally loses salary and personal data.
 */
function redactAuditValues(value, roleCode) {
  const hidden = (key) => ALWAYS.has(key) || (roleCode === 'ADMIN' && ADMIN_HIDDEN.has(key));
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, hidden(k) ? '[REDACTED]' : walk(x)]));
    }
    return v;
  };
  return walk(value);
}

module.exports = { redactAuditValues, SENSITIVE_EMPLOYEE_FIELDS };
