const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { call, callWith, closeDb } = require('../helpers/api');
const { deleteTestUsers } = require('../helpers/users');
const { deleteTestEmployees } = require('../helpers/employees');
const { employeeSession } = require('../helpers/sessions');
const { createProject, deleteTestProjects } = require('../helpers/projects');

const squadIds = [];
after(async () => {
  for (const id of squadIds) await db.query('DELETE FROM squads WHERE id = $1', [id]);
  await db.query("DELETE FROM audit_logs WHERE table_name = 'squads'");
  await deleteTestProjects();
  await deleteTestUsers();
  await deleteTestEmployees();
  await closeDb();
});

async function makeSquad(actor, extra = {}) {
  const body = { name: `Squad ${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`, ...extra };
  const res = typeof actor === 'string' ? await call(actor, 'post', '/api/squads', body) : await callWith(actor.token, 'post', '/api/squads', body);
  if (res.status !== 201) throw new Error(`makeSquad failed: ${res.status} ${JSON.stringify(res.body)}`);
  squadIds.push(res.body.data.id);
  return res.body.data;
}

test('create: HR/CEO/manager create a squad; the lead is also a member', async () => {
  const lm = await employeeSession({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT' });
  const lead = await employeeSession();
  const project = await createProject('CEO', { managerId: lm.employeeId });
  const res = await callWith(lm.token, 'post', '/api/squads', { name: 'Core team', projectId: project.id, leadId: lead.employeeId, target: 'Ship v1' });
  assert.equal(res.status, 201);
  squadIds.push(res.body.data.id);
  assert.match(res.body.data.id, /^SQ-\d+$/);
  assert.equal(res.body.data.lead_id, lead.employeeId);
  assert.equal(res.body.data.project_id, project.id);
  assert.ok(res.body.data.members.some((m) => m.id === lead.employeeId && m.role_in_squad === 'TechLead'));
  assert.equal((await call('HR_DIRECTOR', 'post', '/api/squads', { name: `HR squad ${Date.now()}` })).status, 201);
  const emp = await employeeSession();
  assert.equal((await callWith(emp.token, 'post', '/api/squads', { name: 'nope' })).status, 403);
});

test('create: validation and unknown references', async () => {
  for (const body of [{ name: '' }, {}, { name: 'x', target: 5 }]) assert.equal((await call('CEO', 'post', '/api/squads', body)).status, 400, JSON.stringify(body));
  assert.equal((await call('CEO', 'post', '/api/squads', { name: 'x', projectId: 'PRJ-NOPE' })).status, 404);
  assert.equal((await call('CEO', 'post', '/api/squads', { name: 'x', leadId: 'NV-NOPE' })).status, 404);
});

test('visibility: members and the lead see their squad, outsiders do not, HR and CEO see all', async () => {
  const lead = await employeeSession();
  const member = await employeeSession();
  const outsider = await employeeSession();
  const squad = await makeSquad('CEO', { leadId: lead.employeeId });
  await call('CEO', 'post', `/api/squads/${squad.id}/members`, { employeeId: member.employeeId });

  const ids = async (s) => (await callWith(s.token, 'get', '/api/squads')).body.data.map((q) => q.id);
  assert.ok((await ids(lead)).includes(squad.id));
  assert.ok((await ids(member)).includes(squad.id));
  assert.equal((await ids(outsider)).includes(squad.id), false);
  assert.ok((await call('HR_DIRECTOR', 'get', '/api/squads')).body.data.some((q) => q.id === squad.id));

  assert.equal((await callWith(member.token, 'get', `/api/squads/${squad.id}`)).status, 200);
  assert.equal((await callWith(outsider.token, 'get', `/api/squads/${squad.id}`)).status, 403);
  assert.equal((await call('CEO', 'get', '/api/squads/SQ-NOPE')).status, 404);
});

test('legacy path GET /api/projects/squads returns the same visible squads with members', async () => {
  const lead = await employeeSession();
  const squad = await makeSquad('CEO', { leadId: lead.employeeId });
  const res = await callWith(lead.token, 'get', '/api/projects/squads');
  assert.equal(res.status, 200);
  const row = res.body.data.find((q) => q.id === squad.id);
  assert.ok(row);
  assert.ok(Array.isArray(row.members));
  assert.ok(row.lead_name);
});

test('update and delete: the lead, the project manager, HR and CEO; members cannot', async () => {
  const lead = await employeeSession();
  const member = await employeeSession();
  const squad = await makeSquad('CEO', { leadId: lead.employeeId });
  await call('CEO', 'post', `/api/squads/${squad.id}/members`, { employeeId: member.employeeId });

  assert.equal((await callWith(member.token, 'put', `/api/squads/${squad.id}`, { name: 'hijack' })).status, 403);
  const ok = await callWith(lead.token, 'put', `/api/squads/${squad.id}`, { name: 'Renamed', target: 'New goal' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.name, 'Renamed');
  assert.equal((await callWith(lead.token, 'put', `/api/squads/${squad.id}`, {})).status, 400);
  assert.equal((await call('CEO', 'put', '/api/squads/SQ-NOPE', { name: 'x' })).status, 404);
  assert.equal((await callWith(member.token, 'delete', `/api/squads/${squad.id}`)).status, 403);
  assert.equal((await callWith(lead.token, 'delete', `/api/squads/${squad.id}`)).status, 200);
  assert.equal((await call('CEO', 'get', `/api/squads/${squad.id}`)).status, 404);
});

test('changing the lead adds the new lead as a member', async () => {
  const oldLead = await employeeSession();
  const newLead = await employeeSession();
  const squad = await makeSquad('CEO', { leadId: oldLead.employeeId });
  const res = await call('CEO', 'put', `/api/squads/${squad.id}`, { leadId: newLead.employeeId });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.lead_id, newLead.employeeId);
  assert.ok(res.body.data.members.some((m) => m.id === newLead.employeeId));
});

test('members: add, duplicate, remove, and the lead cannot be removed', async () => {
  const lead = await employeeSession();
  const a = await employeeSession();
  const squad = await makeSquad('CEO', { leadId: lead.employeeId });
  const url = `/api/squads/${squad.id}/members`;

  const add = await callWith(lead.token, 'post', url, { employeeId: a.employeeId, role: 'Reviewer' });
  assert.equal(add.status, 201);
  assert.ok(add.body.data.members.some((m) => m.id === a.employeeId && m.role_in_squad === 'Reviewer'));
  assert.equal((await callWith(lead.token, 'post', url, { employeeId: a.employeeId })).status, 409);
  assert.equal((await callWith(lead.token, 'post', url, { employeeId: 'NV-NOPE' })).status, 404);
  assert.equal((await callWith(lead.token, 'post', url, {})).status, 400);
  assert.equal((await callWith(a.token, 'post', url, { employeeId: lead.employeeId })).status, 403);

  const gone = await callWith(lead.token, 'delete', `${url}/${a.employeeId}`);
  assert.equal(gone.status, 200);
  assert.equal(gone.body.data.members.some((m) => m.id === a.employeeId), false);
  const noLead = await callWith(lead.token, 'delete', `${url}/${lead.employeeId}`);
  assert.equal(noLead.status, 409);
  assert.equal(noLead.body.code, 'CANNOT_REMOVE_LEAD');
  assert.equal((await callWith(lead.token, 'delete', `${url}/${a.employeeId}`)).status, 404);
});

test('chat: only members post; members, HR and CEO read; outsiders neither', async () => {
  const lead = await employeeSession();
  const member = await employeeSession();
  const outsider = await employeeSession();
  const squad = await makeSquad('CEO', { leadId: lead.employeeId });
  await call('CEO', 'post', `/api/squads/${squad.id}/members`, { employeeId: member.employeeId });
  const url = `/api/squads/${squad.id}/messages`;

  const posted = await callWith(member.token, 'post', url, { content: 'Xin chào cả nhóm' });
  assert.equal(posted.status, 201);
  assert.equal(posted.body.data.sender_id, member.employeeId);
  assert.equal(posted.body.data.is_system_notice, false);
  assert.equal((await callWith(outsider.token, 'post', url, { content: 'hi' })).status, 403);
  assert.equal((await callWith(outsider.token, 'get', url)).status, 403);
  assert.equal((await call('HR_DIRECTOR', 'post', url, { content: 'hr posting' })).status, 403); // read-only oversight
  assert.equal((await call('HR_DIRECTOR', 'get', url)).status, 200);
  assert.equal((await call('CEO', 'get', url)).status, 200);
  assert.equal((await callWith(lead.token, 'post', url, { content: 'Reply' })).status, 201);
  assert.equal((await call('CEO', 'get', '/api/squads/SQ-NOPE/messages')).status, 404);
});

test('chat: validation, ordering and polling with a cursor', async () => {
  const lead = await employeeSession();
  const squad = await makeSquad('CEO', { leadId: lead.employeeId });
  const url = `/api/squads/${squad.id}/messages`;
  assert.equal((await callWith(lead.token, 'post', url, { content: '' })).status, 400);
  assert.equal((await callWith(lead.token, 'post', url, { content: '   ' })).status, 400);
  assert.equal((await callWith(lead.token, 'post', url, { content: 'x'.repeat(2001) })).status, 400);
  assert.equal((await callWith(lead.token, 'post', url, {})).status, 400);

  const ids = [];
  for (const text of ['one', 'two', 'three']) ids.push((await callWith(lead.token, 'post', url, { content: text })).body.data.id);
  const all = await callWith(lead.token, 'get', url);
  assert.deepEqual(all.body.data.map((m) => m.content), ['one', 'two', 'three']);
  assert.ok(all.body.data[0].sender_name);
  const since = await callWith(lead.token, 'get', `${url}?since=${ids[0]}`);
  assert.deepEqual(since.body.data.map((m) => m.content), ['two', 'three']);
  const last = await callWith(lead.token, 'get', `${url}?limit=2`);
  assert.deepEqual(last.body.data.map((m) => m.content), ['two', 'three']);
  assert.equal((await callWith(lead.token, 'get', `${url}?since=abc`)).status, 400);
  assert.equal((await callWith(lead.token, 'get', `${url}?limit=100000`)).status, 200);
});

test('squad writes are audited', async () => {
  const lead = await employeeSession();
  const squad = await makeSquad('CEO', { leadId: lead.employeeId });
  await callWith(lead.token, 'put', `/api/squads/${squad.id}`, { target: 'x' });
  await callWith(lead.token, 'delete', `/api/squads/${squad.id}`);
  const { rows } = await db.query("SELECT action FROM audit_logs WHERE table_name = 'squads' AND record_id = $1 ORDER BY id", [squad.id]);
  assert.deepEqual(rows.map((r) => r.action), ['CREATE_SQUAD', 'UPDATE_SQUAD', 'DELETE_SQUAD']);
});
