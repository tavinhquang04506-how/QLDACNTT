const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, closeDb } = require('../helpers/api');
const { deleteTestUsers } = require('../helpers/users');
const { deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');
const { createProject, createTask, deleteTestProjects } = require('../helpers/projects');

after(async () => {
  await deleteTestProjects();
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

// A project managed by `mgr`, with `worker` assigned to a task.
async function scene() {
  const mgr = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
  const worker = await employeeSession({ departmentId: 'DEPT-IT' });
  const outsider = await employeeSession({ departmentId: 'DEPT-IT' });
  const project = await createProject('CEO', { departmentId: 'DEPT-IT', managerId: mgr.employeeId });
  const task = await createTask(mgr, project.id, { title: 'Build it', assigneeId: worker.employeeId });
  return { mgr, worker, outsider, project, task };
}
const move = (s, stage, note) => callWith(s.token, 'patch', `/api/tasks/${s.taskId}/stage`, note ? { stage, note } : { stage });

test('create: the manager assigns work, the id and defaults are generated', async () => {
  const { mgr, worker, project } = await scene();
  const res = await callWith(mgr.token, 'post', `/api/projects/${project.id}/tasks`, {
    title: 'Design DB', description: 'ERD', assigneeId: worker.employeeId, deadline: '2027-05-01', priority: 'Cao', kpiWeight: 30, estimatedHours: 12,
  });
  assert.equal(res.status, 201);
  assert.match(res.body.data.id, /^TSK-\d+$/);
  assert.equal(res.body.data.assignee_id, worker.employeeId);
  assert.equal(res.body.data.creator_id, mgr.employeeId);
  assert.equal(res.body.data.stage, 'todo');
  assert.equal(res.body.data.progress, 0);
  assert.equal(res.body.data.deadline, '2027-05-01');
  assert.equal(res.body.data.kpi_weight, 30);
});

test('create: legacy snake_case fields, defaults and self-assignment by a participant', async () => {
  const { worker, project } = await scene();
  const res = await callWith(worker.token, 'post', `/api/projects/${project.id}/tasks`, { title: 'My own', kpi_weight: 10, estimated_hours: 3 });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.assignee_id, worker.employeeId);
  assert.equal(res.body.data.kpi_weight, 10);
  assert.equal(Number(res.body.data.estimated_hours), 3);
  const dflt = await callWith(worker.token, 'post', `/api/projects/${project.id}/tasks`, { title: 'Defaults' });
  assert.equal(dflt.body.data.kpi_weight, 20);
  assert.equal(Number(dflt.body.data.estimated_hours), 8);
});

test('create: participants cannot assign others; outsiders cannot create; unknown project/assignee', async () => {
  const { mgr, worker, outsider, project } = await scene();
  const other = await employeeSession();
  assert.equal((await callWith(worker.token, 'post', `/api/projects/${project.id}/tasks`, { title: 'x', assigneeId: other.employeeId })).status, 403);
  assert.equal((await callWith(outsider.token, 'post', `/api/projects/${project.id}/tasks`, { title: 'x' })).status, 403);
  assert.equal((await callWith(mgr.token, 'post', '/api/projects/PRJ-NOPE/tasks', { title: 'x' })).status, 404);
  assert.equal((await callWith(mgr.token, 'post', `/api/projects/${project.id}/tasks`, { title: 'x', assigneeId: 'NV-NOPE' })).status, 404);
});

test('create: validation', async () => {
  const { mgr, project } = await scene();
  const bad = [{ title: '' }, { title: undefined }, { deadline: '31/12/2027' }, { priority: 'Sớm' }, { kpiWeight: 101 }, { kpiWeight: -1 }, { estimatedHours: -2 }, { stage: 'done' }];
  for (const extra of bad) assert.equal((await callWith(mgr.token, 'post', `/api/projects/${project.id}/tasks`, { title: 'ok', ...extra })).status, 400, JSON.stringify(extra));
});

test('list and detail follow project visibility', async () => {
  const { mgr, worker, outsider, project, task } = await scene();
  const list = await callWith(worker.token, 'get', `/api/projects/${project.id}/tasks`);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((t) => t.id === task.id && t.assignee_name && t.creator_name));
  assert.equal((await callWith(outsider.token, 'get', `/api/projects/${project.id}/tasks`)).status, 403);
  assert.equal((await callWith(mgr.token, 'get', `/api/tasks/${task.id}`)).status, 200);
  assert.equal((await callWith(outsider.token, 'get', `/api/tasks/${task.id}`)).status, 403);
  assert.equal((await call('CEO', 'get', '/api/tasks/TSK-NOPE')).status, 404);
  assert.equal((await call('CEO', 'get', '/api/projects/PRJ-NOPE/tasks')).status, 404);
});

test('workflow: assignee todo -> in_progress -> review, reviewer accepts, task done at 100%', async () => {
  const { mgr, worker, project, task } = await scene();
  const w = { ...worker, taskId: task.id };
  const m = { ...mgr, taskId: task.id };
  assert.equal((await move(w, 'in_progress')).status, 200);
  const submit = await callWith(worker.token, 'put', `/api/tasks/${task.id}`, { deliverableUrl: 'https://files.example.test/out.zip', deliverableNote: 'Done', progress: 90 });
  assert.equal(submit.status, 200);
  assert.equal((await move(w, 'review')).status, 200);
  assert.equal((await move(w, 'done')).status, 403); // the assignee cannot accept their own work
  const accepted = await move(m, 'done', 'Đạt yêu cầu');
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.stage, 'done');
  assert.equal(accepted.body.data.progress, 100);
  assert.equal(accepted.body.data.reviewed_by, mgr.employeeId);
  assert.equal(accepted.body.data.review_note, 'Đạt yêu cầu');
  assert.ok(accepted.body.data.reviewed_at);
  assert.equal((await call('CEO', 'get', `/api/projects`)).body.data.find((p) => p.id === project.id).progress, 100);
});

test('workflow: invalid transitions and stage values are refused', async () => {
  const { mgr, worker, task } = await scene();
  const w = { ...worker, taskId: task.id };
  assert.equal((await move(w, 'review')).status, 409); // todo -> review skips work
  assert.equal((await move(w, 'done')).status, 409);
  assert.equal((await move(w, 'todo')).status, 409); // already there
  assert.equal((await move(w, 'flying')).status, 400);
  assert.equal((await callWith(mgr.token, 'patch', `/api/tasks/${task.id}/stage`, {})).status, 400);
  assert.equal((await callWith(mgr.token, 'patch', '/api/tasks/TSK-NOPE/stage', { stage: 'todo' })).status, 404);
});

test('workflow: outsiders cannot move tasks; only the reviewer side reopens a done task', async () => {
  const { mgr, worker, outsider, task } = await scene();
  const w = { ...worker, taskId: task.id };
  const m = { ...mgr, taskId: task.id };
  const o = { ...outsider, taskId: task.id };
  assert.equal((await move(o, 'in_progress')).status, 403);
  await move(w, 'in_progress');
  await move(w, 'review');
  await move(m, 'done');
  assert.equal((await move(w, 'in_progress')).status, 403);
  const reopened = await move(m, 'in_progress', 'Cần bổ sung');
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.data.stage, 'in_progress');
});

test('review: accept or reject with a note; nobody reviews their own deliverable', async () => {
  const { mgr, worker, task } = await scene();
  const review = (s, body) => callWith(s.token, 'post', `/api/tasks/${task.id}/review`, body);
  assert.equal((await review(mgr, { decision: 'accept' })).status, 409); // not in review yet
  await callWith(worker.token, 'patch', `/api/tasks/${task.id}/stage`, { stage: 'in_progress' });
  await callWith(worker.token, 'patch', `/api/tasks/${task.id}/stage`, { stage: 'review' });

  assert.equal((await review(worker, { decision: 'accept' })).status, 403);
  assert.equal((await review(mgr, { decision: 'reject' })).status, 400); // needs a note
  assert.equal((await review(mgr, { decision: 'maybe' })).status, 400);
  const rejected = await review(mgr, { decision: 'reject', note: 'Thiếu test' });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.data.stage, 'in_progress');
  assert.equal(rejected.body.data.review_note, 'Thiếu test');

  await callWith(worker.token, 'patch', `/api/tasks/${task.id}/stage`, { stage: 'review' });
  const ok = await review(mgr, { decision: 'accept', note: 'Tốt' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.stage, 'done');
  assert.equal((await review(mgr, { decision: 'accept' })).status, 409);
});

test('a project manager who is also the assignee cannot accept their own work; the CEO can', async () => {
  const mgr = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
  const project = await createProject('CEO', { managerId: mgr.employeeId });
  const task = await createTask(mgr, project.id, { title: 'Own task' });
  await callWith(mgr.token, 'patch', `/api/tasks/${task.id}/stage`, { stage: 'in_progress' });
  await callWith(mgr.token, 'patch', `/api/tasks/${task.id}/stage`, { stage: 'review' });
  assert.equal((await callWith(mgr.token, 'post', `/api/tasks/${task.id}/review`, { decision: 'accept' })).status, 403);
  assert.equal((await call('CEO', 'post', `/api/tasks/${task.id}/review`, { decision: 'accept' })).status, 200);
});

test('logs record who moved the task, plus review notes', async () => {
  const { mgr, worker, task } = await scene();
  await callWith(worker.token, 'patch', `/api/tasks/${task.id}/stage`, { stage: 'in_progress' });
  await callWith(worker.token, 'patch', `/api/tasks/${task.id}/stage`, { stage: 'review' });
  await callWith(mgr.token, 'post', `/api/tasks/${task.id}/review`, { decision: 'reject', note: 'Làm lại' });
  const res = await callWith(mgr.token, 'get', `/api/tasks/${task.id}/logs`);
  assert.equal(res.status, 200);
  const stage = res.body.data.filter((l) => l.action === 'STAGE_CHANGE');
  assert.deepEqual(stage.map((l) => `${l.from_stage}>${l.to_stage}`), ['todo>in_progress', 'in_progress>review', 'review>in_progress']);
  assert.equal(stage[0].actor_id, worker.employeeId);
  assert.ok(stage[0].actor_name);
  const rev = res.body.data.find((l) => l.action === 'REVIEW_REJECTED');
  assert.equal(rev.note, 'Làm lại');
  assert.equal(rev.actor_id, mgr.employeeId);
  const out = await employeeSession();
  assert.equal((await callWith(out.token, 'get', `/api/tasks/${task.id}/logs`)).status, 403);
});

test('legacy path: PATCH /api/projects/tasks/:id/stage still moves a task', async () => {
  const { worker, task } = await scene();
  const res = await callWith(worker.token, 'patch', `/api/projects/tasks/${task.id}/stage`, { stage: 'in_progress' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.stage, 'in_progress');
});

test('update: the manager edits everything, the assignee only their working fields', async () => {
  const { mgr, worker, task } = await scene();
  const other = await employeeSession();
  const a = await callWith(mgr.token, 'put', `/api/tasks/${task.id}`, { title: 'Renamed', priority: 'Khẩn cấp', deadline: '2027-06-01', assigneeId: other.employeeId });
  assert.equal(a.status, 200);
  assert.equal(a.body.data.title, 'Renamed');
  assert.equal(a.body.data.assignee_id, other.employeeId);
  const w = { ...other };
  assert.equal((await callWith(w.token, 'put', `/api/tasks/${task.id}`, { progress: 40, deliverableNote: 'wip' })).status, 200);
  assert.equal((await callWith(w.token, 'put', `/api/tasks/${task.id}`, { title: 'Hijack' })).status, 403);
  assert.equal((await callWith(worker.token, 'put', `/api/tasks/${task.id}`, { progress: 10 })).status, 403);
  assert.equal((await callWith(mgr.token, 'put', `/api/tasks/${task.id}`, {})).status, 400);
  assert.equal((await callWith(mgr.token, 'put', `/api/tasks/${task.id}`, { progress: 120 })).status, 400);
  assert.equal((await callWith(mgr.token, 'put', `/api/tasks/${task.id}`, { assigneeId: 'NV-NOPE' })).status, 404);
  assert.equal((await callWith(mgr.token, 'put', '/api/tasks/TSK-NOPE', { title: 'x' })).status, 404);
});

test('delete: manager/creator/HR only, and project progress follows the remaining tasks', async () => {
  const { mgr, worker, project, task } = await scene();
  const second = await createTask(mgr, project.id, { title: 'Second', assigneeId: worker.employeeId });
  await callWith(worker.token, 'patch', `/api/tasks/${task.id}/stage`, { stage: 'in_progress' });
  await callWith(worker.token, 'patch', `/api/tasks/${task.id}/stage`, { stage: 'review' });
  await callWith(mgr.token, 'post', `/api/tasks/${task.id}/review`, { decision: 'accept' });
  const progress = async () => (await call('CEO', 'get', '/api/projects')).body.data.find((p) => p.id === project.id).progress;
  assert.equal(await progress(), 50);

  assert.equal((await callWith(worker.token, 'delete', `/api/tasks/${second.id}`)).status, 403);
  assert.equal((await callWith(mgr.token, 'delete', `/api/tasks/${second.id}`)).status, 200);
  assert.equal(await progress(), 100);
  assert.equal((await call('CEO', 'get', `/api/tasks/${second.id}`)).status, 404);
  assert.equal((await call('CEO', 'delete', '/api/tasks/TSK-NOPE')).status, 404);
});

test('task writes are audited', async () => {
  const { mgr, task } = await scene();
  await callWith(mgr.token, 'put', `/api/tasks/${task.id}`, { title: 'Audited' });
  await callWith(mgr.token, 'delete', `/api/tasks/${task.id}`);
  const { rows } = await db.query("SELECT action FROM audit_logs WHERE table_name = 'tasks' AND record_id = $1 ORDER BY id", [task.id]);
  assert.deepEqual(rows.map((r) => r.action), ['CREATE_TASK', 'UPDATE_TASK', 'DELETE_TASK']);
});
