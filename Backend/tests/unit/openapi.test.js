const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const catalog = require('../../src/catalog');

const text = fs.readFileSync(path.resolve(__dirname, '../../docs/openapi.yaml'), 'utf8');

// Minimal reader for the "  /path:" and "    method:" structure of our hand-written spec.
function documentedOperations() {
  const ops = new Set();
  let current = null;
  for (const line of text.split('\n')) {
    const p = line.match(/^  (\/\S+):\s*$/);
    if (p) { current = p[1]; continue; }
    const m = line.match(/^    (get|post|put|patch|delete):\s*$/);
    if (m && current) ops.add(`${m[1].toUpperCase()} ${current}`);
    if (/^\S/.test(line)) current = null;
  }
  return ops;
}

const toOpenApiPath = (p) => p.replace(/^\/api/, '').replace(/:([A-Za-z]+)/g, '{$1}');

const DOCUMENTED_MODULES = ['auth', 'users', 'employees', 'contracts', 'departments', 'positions', 'attendance', 'leaves', 'otRequests', 'medicalClaims', 'payroll', 'projects', 'tasks', 'squads', 'notifications', 'notices', 'handbook', 'analytics', 'dashboard', 'auditLogs'];

test('openapi.yaml declares the basics', () => {
  assert.match(text, /^openapi: 3\.0\.\d/m);
  assert.match(text, /^info:/m);
  assert.match(text, /bearerAuth/);
});

test('every catalog endpoint of the documented modules is described in openapi.yaml', () => {
  const documented = documentedOperations();
  const missing = [];
  for (const mod of DOCUMENTED_MODULES) {
    assert.ok(catalog.endpoints[mod], `catalog has no "${mod}" section`);
    for (const key of Object.keys(catalog.endpoints[mod])) {
      const [, method, route] = key.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/);
      if (!documented.has(`${method} ${toOpenApiPath(route)}`)) missing.push(key);
    }
  }
  assert.deepEqual(missing, []);
});

// --- structural validity (parsed with a real YAML parser) ---
const YAML = require('yaml');
const spec = YAML.parse(text);

test('openapi.yaml is valid YAML and every $ref resolves', () => {
  const missing = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (k === '$ref') {
          const [, , section, name] = v.split('/');
          if (!spec.components?.[section]?.[name]) missing.push(v);
        } else walk(v);
      }
    }
  };
  walk(spec);
  assert.deepEqual(missing, []);
});

test('every operation has tags, a summary and at least one response', () => {
  const bad = [];
  for (const [p, item] of Object.entries(spec.paths)) {
    for (const [method, o] of Object.entries(item)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      if (!o.tags?.length || !o.summary || !o.responses || Object.keys(o.responses).length === 0) bad.push(`${method} ${p}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('path parameters used in a path are declared on each operation', () => {
  const bad = [];
  const declared = (o) => (o.parameters || []).map((prm) => (prm.$ref ? spec.components.parameters[prm.$ref.split('/').pop()] : prm))
    .filter((prm) => prm.in === 'path').map((prm) => prm.name);
  for (const [p, item] of Object.entries(spec.paths)) {
    const inPath = [...p.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const [method, o] of Object.entries(item)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const have = declared(o);
      for (const name of inPath) if (!have.includes(name)) bad.push(`${method} ${p} missing {${name}}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every response and operation description is a string', () => {
  const bad = [];
  for (const [p, item] of Object.entries(spec.paths)) {
    for (const [method, o] of Object.entries(item)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      if (o.description !== undefined && typeof o.description !== 'string') bad.push(`${method} ${p} description`);
      for (const [code, r] of Object.entries(o.responses || {})) {
        if (!r.$ref && typeof r.description !== 'string') bad.push(`${method} ${p} ${code}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
