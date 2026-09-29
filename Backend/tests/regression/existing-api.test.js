const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../../src/app');
const { call, claimsFor, closeDb } = require('../helpers/api');

after(closeDb);

test('GET /api/health reports OK on the test database', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'OK');
  assert.equal(res.body.database, 'nexus_hrms_test');
});

test('GET /api returns the endpoint catalog', async () => {
  const res = await request(app).get('/api');
  assert.equal(res.status, 200);
  assert.ok(res.body.endpoints.auth);
});

test('unknown route returns 404 with success:false', async () => {
  const res = await request(app).get('/api/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
});

test('malformed JSON body returns 400, not 500', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send('{"email": ');
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_JSON');
});

test('login: missing fields -> 400', async () => {
  const res = await call(null, 'post', '/api/auth/login', { email: 'ceo@fwbnexus.vn' });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});

test('login: unknown email -> 401', async () => {
  const res = await call(null, 'post', '/api/auth/login', { email: 'nobody@fwbnexus.vn', password: 'x' });
  assert.equal(res.status, 401);
});

test('login: seeded CEO gets a token', async () => {
  const claims = await claimsFor('CEO');
  assert.equal(claims.roleCode, 'CEO');
  assert.ok(claims.employeeId);
});

test('protected route without a token -> 401', async () => {
  const res = await call(null, 'get', '/api/employees');
  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
});

test('protected route with a garbage token -> 401', async () => {
  const res = await request(app).get('/api/employees').set('Authorization', 'Bearer not.a.token');
  assert.equal(res.status, 401);
});

test('GET /api/auth/me works for an authenticated user', async () => {
  const res = await call('EMPLOYEE', 'get', '/api/auth/me');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

test('employees list: CEO sees base_salary', async () => {
  const res = await call('CEO', 'get', '/api/employees');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length > 0);
  assert.ok('base_salary' in res.body.data[0]);
  assert.ok(res.body.pagination.total >= res.body.data.length);
});

test("employees list: EMPLOYEE does not see other people's salary or citizen id", async () => {
  const { employeeId } = await claimsFor('EMPLOYEE');
  const res = await call('EMPLOYEE', 'get', '/api/employees');
  assert.equal(res.status, 200);
  const others = res.body.data.filter((e) => e.id !== employeeId);
  assert.ok(others.length > 0);
  for (const e of others) {
    assert.equal('base_salary' in e, false);
    assert.equal('citizen_id' in e, false);
  }
});

test('POST /api/employees as EMPLOYEE -> 403', async () => {
  const res = await call('EMPLOYEE', 'post', '/api/employees', {});
  assert.equal(res.status, 403);
});

test('GET /api/departments returns seeded departments', async () => {
  const res = await call('EMPLOYEE', 'get', '/api/departments');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length > 0);
});

test('GET /api/leaves/types is readable by an employee', async () => {
  const res = await call('EMPLOYEE', 'get', '/api/leaves/types');
  assert.equal(res.status, 200);
});

test('approve/reject leave as EMPLOYEE -> 403', async () => {
  const a = await call('EMPLOYEE', 'patch', '/api/leaves/LP-2026-001/approve', {});
  const r = await call('EMPLOYEE', 'patch', '/api/leaves/LP-2026-001/reject', {});
  assert.equal(a.status, 403);
  assert.equal(r.status, 403);
});

test('payroll periods: EMPLOYEE 403, HR_DIRECTOR 200', async () => {
  assert.equal((await call('EMPLOYEE', 'get', '/api/payroll/periods')).status, 403);
  assert.equal((await call('HR_DIRECTOR', 'get', '/api/payroll/periods')).status, 200);
});

test('POST /api/payroll/calculate as EMPLOYEE -> 403', async () => {
  const res = await call('EMPLOYEE', 'post', '/api/payroll/calculate', {});
  assert.equal(res.status, 403);
});

test('projects: LINE_MANAGER can list, EMPLOYEE cannot create', async () => {
  assert.equal((await call('LINE_MANAGER', 'get', '/api/projects')).status, 200);
  assert.equal((await call('EMPLOYEE', 'post', '/api/projects', {})).status, 403);
});

test('GET /api/dashboard/stats works for the CEO', async () => {
  const res = await call('CEO', 'get', '/api/dashboard/stats');
  assert.equal(res.status, 200);
});
