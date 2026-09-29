const { matrix } = require('./matrix');
const { forbidden, unauthorized } = require('../utils/AppError');

function scopeOf(roleCode, permission) {
  const entry = matrix[permission];
  if (!entry) throw new Error(`Unknown permission "${permission}"`);
  return entry[roleCode] || null;
}

const can = (roleCode, permission) => scopeOf(roleCode, permission) !== null;

/**
 * Route guard. Must run after `authenticate`. Sets req.scope ('all'|'department'|'self')
 * for the service layer to turn into a SQL predicate.
 */
function requirePermission(permission) {
  if (!matrix[permission]) throw new Error(`Unknown permission "${permission}"`);
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    const scope = scopeOf(req.user.roleCode, permission);
    if (!scope) {
      return next(
        forbidden(
          `Vai trò "${req.user.roleCode}" không có quyền truy cập chức năng này`,
          Object.keys(matrix[permission])
        )
      );
    }
    req.scope = scope;
    return next();
  };
}

module.exports = { matrix, scopeOf, can, requirePermission };
