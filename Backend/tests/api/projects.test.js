const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, closeDb } = require('../helpers/api');
const { deleteTestUsers } = require('../helpers/users');
const { deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');
const { createProject, createTask, deleteTestProjects, code } = require('../helpers/projects');

after(async () => {
  await deleteTestProjects();
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

test('create: HR/CEO/manager create a project; the manager defaults to the creator', async () => {
  const lm = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
  const res = await callWith(lm.token, 'post', '/api/projects', { name: 'Portal', code: code(), departmentId: 'DEPT-IT', priority: 'Cao' });
  assert.equal(res.status, 201);
  assert.match(res.body.data.id, /^PRJ-\d+$/);
  assert.equal(res.body.data.manager_id, lm.employeeId);
  assert.equal(res.body.data.status, 'planned');
  assert.equal(res.body.data.progress, 0);
  assert.equal(res.body.data.priority, 'Cao');
  assert.equal((await call('HR_DIRECTOR', 'post', '/api/projects', { name: 'HR project', code: code(), departmentId: 'DEPT-HR' })).status, 201);
  assert.equal((await call('CEO', 'post', '/api/projects', { name: 'CEO project', code: code(), departmentId: 'DEPT-SALES' })).status, 201);
});

test('create: a LINE_MANAGER cannot open a project for another department; EMPLOYEE cannot create at all', async () => {
  const lm = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
  assert.equal((await callWith(lm.token, 'post', '/api/projects', { name: 'X', code: code(), departmentId: 'DEPT-HR' })).status, 403);
  const emp = await employeeSession();
  assert.equal((await callWith(emp.token, 'post', '/api/projects', { name: 'X', code: code() })).status, 403);
});

test('create: the legacy snake_case body still works', async () => {
  const res = await call('CEO', 'post', '/api/projects', { name: 'Legacy', code: code(), department_id: 'DEPT-IT', start_date: '2027-01-04', end_date: '2027-03-01', budget_hours: 250 });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.start_date, '2027-01-04');
  assert.equal(res.body.data.budget_hours, 250);
});

test('create: validation, duplicates and unknown references', async () => {
  const good = { name: 'P', code: code(), departmentId: 'DEPT-IT' };
  const bad = [{ name: '' }, { name: undefined }, { endDate: '2027-01-01', startDate: '2027-02-01' }, { priority: 'Sớm' }, { budgetHours: -1 }, { startDate: '01/02/2027' }, { code: 'has space' }];
  for (const extra of bad) assert.equal((await call('CEO', 'post', '/api/projects', { ...good, ...extra, code: extra.code ?? code() })).status, 400, JSON.stringify(extra));
  const first = await call('CEO', 'post', '/api/projects', good);
  assert.equal(first.status, 201);
  assert.equal((await call('CEO', 'post', '/api/projects', { ...good, name: 'Other' })).status, 409);
  assert.equal((await call('CEO', 'post', '/api/projects', { ...good, code: code(), departmentId: 'DEPT-NOPE' })).status, 404);
  assert.equal((await call('CEO', 'post', '/api/projects', { ...good, code: code(), managerId: 'NV-NOPE' })).status, 404);
});

test('visibility: CEO/HR see all, a manager their department or their own projects, an employee only where they take part', async () => {
  const lm = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-MKT' });
  const emp = await employeeSession({ departmentId: 'DEPT-MKT' });
  const outsider = await employeeSession({ departmentId: 'DEPT-MKT' });
  const inDept = await createProject('CEO', { departmentId: 'DEPT-MKT' });
  const elsewhere = await createProject('CEO', { departmentId: 'DEPT-ACC' });
  const managed = await createProject('CEO', { departmentId: 'DEPT-ACC', managerId: lm.employeeId });
  await createTask('CEO', inDept.id, { assigneeId: emp.employeeId });

  const ids = async (s) => (await callWith(s.token, 'get', '/api/projects')).body.data.map((p) => p.id);
  const lmIds = await ids(lm);
  assert.ok(lmIds.includes(inDept.id) && lmIds.includes(managed.id));
  assert.equal(lmIds.includes(elsewhere.id), false);

  const empIds = await ids(emp);
  assert.deepEqual(empIds.filter((id) => [inDept.id, elsewhere.id, managed.id].includes(id)), [inDept.id]);
  assert.equal((await ids(outsider)).includes(inDept.id), false);

  const all = (await call('HR_DIRECTOR', 'get', '/api/projects')).body.data.map((p) => p.id);
  for (const p of [inDept, elsewhere, managed]) assert.ok(all.includes(p.id));
});

test('list: rows carry integer task counts and names', async () => {
  const p = await createProject('CEO');
  const t = await createTask('CEO', p.id);
  await createTask('CEO', p.id);
  await call('CEO', 'patch', `/api/tasks/${t.id}/stage`, { stage: 'in_progress' });
  const row = (await call('CEO', 'get', '/api/projects')).body.data.find((r) => r.id === p.id);
  assert.equal(row.total_tasks, 2);
  assert.equal(row.done_tasks, 0);
  assert.ok(row.manager_name);
  assert.ok(row.department_name);
});

test('detail: allowed, hidden and unknown', async () => {
  const emp = await employeeSession();
  const outsider = await employeeSession();
  const p = await createProject('CEO');
  await createTask('CEO', p.id, { assigneeId: emp.employeeId });
  assert.equal((await callWith(emp.token, 'get', `/api/projects/${p.id}`)).status, 200);
  assert.equal((await callWith(outsider.token, 'get', `/api/projects/${p.id}`)).status, 403);
  assert.equal((await call('CEO', 'get', '/api/projects/PRJ-NOPE')).status, 404);
});

test('update: manager, department manager, HR and CEO may; participants and outsiders may not', async () => {
  const lm = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-SALES' });
  const otherLm = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-ACC' });
  const emp = await employeeSession({ departmentId: 'DEPT-SALES' });
  const p = await createProject('CEO', { departmentId: 'DEPT-SALES' });
  await createTask('CEO', p.id, { assigneeId: emp.employeeId });

  assert.equal((await callWith(lm.token, 'put', `/api/projects/${p.id}`, { description: 'by dept manager' })).status, 200);
  assert.equal((await callWith(otherLm.token, 'put', `/api/projects/${p.id}`, { description: 'x' })).status, 403);
  assert.equal((await callWith(emp.token, 'put', `/api/projects/${p.id}`, { description: 'x' })).status, 403);
  const res = await call('HR_DIRECTOR', 'put', `/api/projects/${p.id}`, { status: 'in_progress', name: 'Renamed', managerId: lm.employeeId });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'in_progress');
  assert.equal(res.body.data.manager_id, lm.employeeId);
  assert.equal((await callWith(lm.token, 'put', `/api/projects/${p.id}`, { name: 'by manager now' })).status, 200);
});

test('update: validation and unknown ids', async () => {
  const p = await createProject('CEO');
  assert.equal((await call('CEO', 'put', `/api/projects/${p.id}`, {})).status, 400);
  assert.equal((await call('CEO', 'put', `/api/projects/${p.id}`, { status: 'flying' })).status, 400);
  assert.equal((await call('CEO', 'put', `/api/projects/${p.id}`, { startDate: '2028-02-01', endDate: '2028-01-01' })).status, 400);
  assert.equal((await call('CEO', 'put', `/api/projects/${p.id}`, { managerId: 'NV-NOPE' })).status, 404);
  assert.equal((await call('CEO', 'put', '/api/projects/PRJ-NOPE', { name: 'x' })).status, 404);
});

test('delete: refused while tasks exist, allowed when empty, only for the right people', async () => {
  const lm = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
  const emp = await employeeSession({ departmentId: 'DEPT-IT' });
  const withTasks = await createProject('CEO');
  await createTask('CEO', withTasks.id);
  const refused = await call('CEO', 'delete', `/api/projects/${withTasks.id}`);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'PROJECT_HAS_TASKS');

  const empty = await createProject('CEO', { managerId: lm.employeeId });
  assert.equal((await callWith(emp.token, 'delete', `/api/projects/${empty.id}`)).status, 403);
  assert.equal((await callWith(lm.token, 'delete', `/api/projects/${empty.id}`)).status, 200);
  assert.equal((await call('CEO', 'get', `/api/projects/${empty.id}`)).status, 404);
  assert.equal((await call('CEO', 'delete', '/api/projects/PRJ-NOPE')).status, 404);
});

test('project writes are audited', async () => {
  const p = await createProject('CEO');
  await call('CEO', 'put', `/api/projects/${p.id}`, { description: 'x' });
  await call('CEO', 'delete', `/api/projects/${p.id}`);
  const { rows } = await db.query("SELECT action FROM audit_logs WHERE table_name = 'projects' AND record_id = $1 ORDER BY id", [p.id]);
  assert.deepEqual(rows.map((r) => r.action), ['CREATE_PROJECT', 'UPDATE_PROJECT', 'DELETE_PROJECT']);
});
