const db = require('../../src/config/db');
const { call, callWith } = require('./api');

let n = 0;
const code = () => `TST-${Date.now().toString(36)}${++n}`.toUpperCase().slice(0, 20);

/** Create a project through the API as `actor` (role name or {token}). Returns the response body's data. */
async function createProject(actor, extra = {}) {
  const body = { name: `Test project ${n}`, code: code(), departmentId: 'DEPT-IT', ...extra };
  const res = typeof actor === 'string' ? await call(actor, 'post', '/api/projects', body) : await callWith(actor.token, 'post', '/api/projects', body);
  if (res.status !== 201) throw new Error(`createProject failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

async function createTask(actor, projectId, extra = {}) {
  const body = { title: `Task ${++n}`, ...extra };
  const url = `/api/projects/${projectId}/tasks`;
  const res = typeof actor === 'string' ? await call(actor, 'post', url, body) : await callWith(actor.token, 'post', url, body);
  if (res.status !== 201) throw new Error(`createTask failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

async function deleteTestProjects() {
  await db.query("DELETE FROM squads WHERE project_id IN (SELECT id FROM projects WHERE code LIKE 'TST-%')");
  await db.query("DELETE FROM projects WHERE code LIKE 'TST-%'");
  await db.query("DELETE FROM audit_logs WHERE table_name IN ('projects', 'tasks') AND action LIKE '%\\_%'");
}

module.exports = { createProject, createTask, deleteTestProjects, code };
