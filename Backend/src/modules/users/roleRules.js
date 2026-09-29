const crypto = require('crypto');

// Roles a delegated administrator may hand out. CEO and ADMIN accounts, and (for ADMIN) HR_DIRECTOR accounts, give
// access to salary and personal data, so only the CEO manages them.
const LIMITED_ASSIGNABLE = ['EMPLOYEE', 'LINE_MANAGER', 'KIOSK'];
const HRD_PROTECTED = ['CEO', 'ADMIN'];

/** May `actorRole` give an account the role `targetRole`? */
function canAssignRole(actorRole, targetRole) {
  if (actorRole === 'CEO') return true;
  if (actorRole === 'HR_DIRECTOR' || actorRole === 'ADMIN') return LIMITED_ASSIGNABLE.includes(targetRole);
  return false;
}

/** May `actorRole` edit / reset / unlock an existing account whose role is `subjectRole`? */
function canManageUserWithRole(actorRole, subjectRole) {
  if (actorRole === 'CEO') return true;
  if (actorRole === 'HR_DIRECTOR') return !HRD_PROTECTED.includes(subjectRole);
  if (actorRole === 'ADMIN') return LIMITED_ASSIGNABLE.includes(subjectRole);
  return false;
}

/** 12 random url-safe chars plus a fixed "@1" so letter, digit and symbol are always present. */
function generateTemporaryPassword() {
  return `${crypto.randomBytes(9).toString('base64url')}@1`;
}

module.exports = { canAssignRole, canManageUserWithRole, generateTemporaryPassword };
