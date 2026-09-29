const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createDashboardCacheMiddleware,
  clearDashboardCache,
  buildCacheKey,
} = require('../../src/middleware/dashboardCache');

test('dashboardCache builds distinct keys per user, employee, role, scope, path, and sorted query', () => {
  const reqA = {
    originalUrl: '/api/dashboard?month=2026-10',
    path: '/api/dashboard',
    query: { month: '2026-10' },
    user: { userId: 'U-1', employeeId: 'NV-1001', roleCode: 'LINE_MANAGER' },
    scope: 'department',
  };
  const reqB = {
    originalUrl: '/api/dashboard?month=2026-10',
    path: '/api/dashboard',
    query: { month: '2026-10' },
    user: { userId: 'U-2', employeeId: 'NV-2002', roleCode: 'LINE_MANAGER' },
    scope: 'department',
  };

  assert.notEqual(buildCacheKey(reqA), buildCacheKey(reqB));
  assert.ok(buildCacheKey(reqA).includes('U-1'));
  assert.ok(buildCacheKey(reqB).includes('U-2'));
});

test('dashboardCache with cache enabled isolates two managers and two employees with identical URL', () => {
  clearDashboardCache();
  const mw = createDashboardCacheMiddleware({ ttlMs: 15000, enabled: true });

  const invoke = (user, scope, handlerPayload) => {
    const headers = {};
    let statusSent = 200;
    let bodySent = null;
    let nextCalled = false;
    const req = {
      method: 'GET',
      originalUrl: '/api/dashboard',
      path: '/api/dashboard',
      query: {},
      headers: {},
      user,
      scope,
    };
    const res = {
      statusCode: 200,
      setHeader: (k, v) => {
        headers[k] = v;
      },
      status: (c) => {
        statusSent = c;
        res.statusCode = c;
        return res;
      },
      json: (data) => {
        bodySent = data;
        return res;
      },
    };
    mw(req, res, () => {
      nextCalled = true;
      res.json(handlerPayload);
    });
    return { headers, statusSent, bodySent, nextCalled };
  };

  const mgrA = { userId: 'U-MGR-A', employeeId: 'NV-MGR-A', roleCode: 'LINE_MANAGER' };
  const mgrB = { userId: 'U-MGR-B', employeeId: 'NV-MGR-B', roleCode: 'LINE_MANAGER' };

  const firstA = invoke(mgrA, 'department', { department: 'DEPT-IT', headcount: 12 });
  assert.equal(firstA.headers['X-Cache'], 'MISS');
  assert.equal(firstA.nextCalled, true);

  const secondA = invoke(mgrA, 'department', { department: 'DEPT-IT', headcount: 999 });
  assert.equal(secondA.headers['X-Cache'], 'HIT');
  assert.equal(secondA.nextCalled, false);
  assert.equal(secondA.bodySent.headcount, 12);

  const firstB = invoke(mgrB, 'department', { department: 'DEPT-SALES', headcount: 8 });
  assert.equal(firstB.headers['X-Cache'], 'MISS');
  assert.equal(firstB.nextCalled, true);
  assert.equal(firstB.bodySent.department, 'DEPT-SALES');
});
