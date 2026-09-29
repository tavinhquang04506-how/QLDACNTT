const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scopeOf, can, requirePermission } = require('../../src/policies');
const { matrix } = require('../../src/policies/matrix');

function run(mw, req) {
  let result = 'unset';
  mw(req, {}, (err) => { result = err; });
  return result;
}

test('every matrix entry uses a valid scope and a real role code', () => {
  const roles = ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER', 'EMPLOYEE', 'KIOSK', 'ADMIN'];
  for (const [permission, byRole] of Object.entries(matrix)) {
    assert.match(permission, /^[a-z]+(\.[a-zA-Z]+)+$/, permission);
    for (const [role, scope] of Object.entries(byRole)) {
      assert.ok(roles.includes(role), `${permission}: unknown role ${role}`);
      assert.ok(['all', 'department', 'self'].includes(scope), `${permission}: bad scope ${scope}`);
    }
  }
});

test('scopeOf returns the scope for allowed roles and null otherwise', () => {
  assert.equal(scopeOf('CEO', 'leave.approve'), 'all');
  assert.equal(scopeOf('LINE_MANAGER', 'leave.approve'), 'department');
  assert.equal(scopeOf('EMPLOYEE', 'leave.approve'), null);
});

test('scopeOf throws on an unknown permission (no silent allow)', () => {
  assert.throws(() => scopeOf('CEO', 'nope.nothing'), /Unknown permission/);
});

test('can mirrors scopeOf', () => {
  assert.equal(can('HR_DIRECTOR', 'payroll.calculate'), true);
  assert.equal(can('LINE_MANAGER', 'payroll.calculate'), false);
});

test('requirePermission fails at startup for an unknown permission', () => {
  assert.throws(() => requirePermission('nope.nothing'), /Unknown permission/);
});

test('requirePermission: no req.user -> 401 error', () => {
  const err = run(requirePermission('employee.create'), {});
  assert.equal(err.status, 401);
});

test('requirePermission: disallowed role -> 403 with allowed roles in details', () => {
  const err = run(requirePermission('employee.create'), { user: { roleCode: 'EMPLOYEE' } });
  assert.equal(err.status, 403);
  assert.deepEqual(err.details.sort(), ['CEO', 'HR_DIRECTOR']);
});

test('requirePermission: allowed role passes and sets req.scope', () => {
  const req = { user: { roleCode: 'LINE_MANAGER' } };
  const err = run(requirePermission('leave.approve'), req);
  assert.equal(err, undefined);
  assert.equal(req.scope, 'department');
});
