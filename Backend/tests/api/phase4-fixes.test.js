const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, closeDb } = require('../helpers/api');
const { deleteTestUsers } = require('../helpers/users');
const { createTestEmployee, deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');
const { createProject, createTask, deleteTestProjects } = require('../helpers/projects');
const { deleteTestLeaves } = require('../helpers/leaves');

after(async () => {
  await db.query("DELETE FROM squads WHERE lead_id LIKE 'NV-T%'");
  await deleteTestProjects();
  await deleteTestLeaves();
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

test('a squad lead cannot attach their squad to a project they cannot manage', async () => {
  const lead = await employeeSession({ departmentId: 'DEPT-IT' });
  const foreign = await createProject('CEO', { departmentId: 'DEPT-ACC' });
  const squad = (await call('CEO', 'post', '/api/squads', { name: `Fix ${Date.now()}`, leadId: lead.employeeId })).body.data;

  assert.equal((await callWith(lead.token, 'put', `/api/squads/${squad.id}`, { projectId: foreign.id })).status, 403);
  assert.equal((await callWith(lead.token, 'get', `/api/projects/${foreign.id}`)).status, 403); // still no access
  assert.equal((await call('HR_DIRECTOR', 'put', `/api/squads/${squad.id}`, { projectId: foreign.id })).status, 200);
  assert.equal((await callWith(lead.token, 'put', `/api/squads/${squad.id}`, { name: 'Renamed by lead' })).status, 200); // other edits stay allowed
  assert.equal((await callWith(lead.token, 'put', `/api/squads/${squad.id}`, { projectId: null })).status, 200); // detaching is harmless
});

test('a manager may attach a squad only to projects they manage', async () => {
  const lm = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-MKT' });
  const own = await createProject('CEO', { departmentId: 'DEPT-MKT' });
  const foreign = await createProject('CEO', { departmentId: 'DEPT-ACC' });
  const squad = (await callWith(lm.token, 'post', '/api/squads', { name: `Mgr ${Date.now()}`, projectId: own.id })).body.data;
  assert.equal((await callWith(lm.token, 'put', `/api/squads/${squad.id}`, { projectId: foreign.id })).status, 403);
  assert.equal((await callWith(lm.token, 'put', `/api/squads/${squad.id}`, { projectId: own.id })).status, 200);
});

test('a task creator cannot hand work to someone else, the project manager can', async () => {
  const mgr = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
  const worker = await employeeSession({ departmentId: 'DEPT-IT' });
  const other = await employeeSession({ departmentId: 'DEPT-IT' });
  const project = await createProject('CEO', { managerId: mgr.employeeId });
  await createTask(mgr, project.id, { assigneeId: worker.employeeId });
  const mine = await createTask(worker, project.id, { title: 'Self assigned' });

  assert.equal((await callWith(worker.token, 'put', `/api/tasks/${mine.id}`, { assigneeId: other.employeeId })).status, 403);
  assert.equal((await callWith(worker.token, 'put', `/api/tasks/${mine.id}`, { title: 'Still editable' })).status, 200);
  assert.equal((await callWith(worker.token, 'put', `/api/tasks/${mine.id}`, { assigneeId: worker.employeeId })).status, 200); // unchanged
  assert.equal((await callWith(mgr.token, 'put', `/api/tasks/${mine.id}`, { assigneeId: other.employeeId })).status, 200);
});

test('a project cannot be moved into a department its editor does not run', async () => {
  const lm = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-SALES' });
  const project = await createProject('CEO', { departmentId: 'DEPT-SALES', managerId: lm.employeeId });
  assert.equal((await callWith(lm.token, 'put', `/api/projects/${project.id}`, { departmentId: 'DEPT-HR' })).status, 403);
  assert.equal((await callWith(lm.token, 'put', `/api/projects/${project.id}`, { departmentId: 'DEPT-SALES', name: 'Same dept' })).status, 200);
  const moved = await call('HR_DIRECTOR', 'put', `/api/projects/${project.id}`, { departmentId: 'DEPT-HR' });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.data.department_id, 'DEPT-HR');
});

test('a manager can work on a project of another department when it involves them', async () => {
  const lm = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
  const foreign = await createProject('CEO', { departmentId: 'DEPT-ACC' });
  assert.equal((await callWith(lm.token, 'get', `/api/projects/${foreign.id}`)).status, 403);
  const task = await createTask('CEO', foreign.id, { assigneeId: lm.employeeId });

  assert.equal((await callWith(lm.token, 'get', `/api/projects/${foreign.id}`)).status, 200);
  assert.equal((await callWith(lm.token, 'get', `/api/projects/${foreign.id}/tasks`)).status, 200);
  assert.equal((await callWith(lm.token, 'patch', `/api/tasks/${task.id}/stage`, { stage: 'in_progress' })).status, 200);
  assert.ok((await callWith(lm.token, 'get', '/api/projects')).body.data.some((p) => p.id === foreign.id));
});

test('the dashboard of a manager without a department is empty, not the whole department-less population', async () => {
  const orphanMgr = await createTestEmployee({ departmentId: null });
  const orphans = [await createTestEmployee({ departmentId: null }), await createTestEmployee({ departmentId: null })];
  const { createTestUser } = require('../helpers/users');
  const { loginUser } = require('../helpers/api');
  const u = await createTestUser({ role: 'LINE_MANAGER', employeeId: orphanMgr.id });
  const { accessToken } = await loginUser(u);
  await db.query(
    `INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, total_days, reason, stage)
     VALUES ($1, $2, 'LT-AL', '2027-02-01', '2027-02-01', 1, 't', 'CHO_TRUONG_PHONG_DUYET')`, [`LP-T-${Date.now()}`, orphans[0].id]);

  const res = await callWith(accessToken, 'get', '/api/dashboard/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.scope, 'department');
  assert.equal(res.body.data.overview.total_active, 0);
  assert.equal(res.body.data.overview.pending_leaves, 0);
  assert.deepEqual(res.body.data.departmentStats, []);
  assert.deepEqual(res.body.data.pendingLeaves, []);
});

test('reopening a done task clears the stale acceptance stamp', async () => {
  const mgr = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
  const worker = await employeeSession({ departmentId: 'DEPT-IT' });
  const project = await createProject('CEO', { managerId: mgr.employeeId });
  const task = await createTask(mgr, project.id, { assigneeId: worker.employeeId });
  for (const stage of ['in_progress', 'review']) await callWith(worker.token, 'patch', `/api/tasks/${task.id}/stage`, { stage });
  await callWith(mgr.token, 'post', `/api/tasks/${task.id}/review`, { decision: 'accept', note: 'ok' });
  const reopened = await callWith(mgr.token, 'patch', `/api/tasks/${task.id}/stage`, { stage: 'in_progress' });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.data.reviewed_by, null);
  assert.equal(reopened.body.data.reviewed_at, null);
});

test('turnover risk compares the two most recent reviews by date, not alphabetically', async () => {
  const emp = await createTestEmployee({ departmentId: 'DEPT-ACC' });
  const review = (period, performanceScore) => call('HR_DIRECTOR', 'post', '/api/analytics/reviews', { employeeId: emp.id, period, performanceScore, potentialScore: 70 });
  await review('2027-Q1', 75); // ends in March
  await review('2027-H1', 55); // ends in June: this is the latest
  const res = await call('HR_DIRECTOR', 'get', `/api/analytics/turnover-risk/${emp.id}`);
  const codes = res.body.data.signals.map((s) => s.code);
  assert.ok(codes.includes('PERFORMANCE_DROP'), codes.join());
  assert.ok(codes.includes('LOW_PERFORMANCE'), codes.join());
});

test('the legacy dashboard notifications route goes through the permission matrix too', async () => {
  const { createTestUser } = require('../helpers/users');
  const { loginUser } = require('../helpers/api');
  const admin = await createTestUser({ role: 'ADMIN' });
  const { accessToken } = await loginUser(admin);
  assert.equal((await callWith(accessToken, 'get', '/api/dashboard/notifications')).status, 200); // ADMIN reads notifications
  assert.equal((await call(null, 'get', '/api/dashboard/notifications')).status, 401);
});
