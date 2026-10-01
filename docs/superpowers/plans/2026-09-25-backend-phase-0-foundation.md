# Backend Phase 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the backend on the layered structure from the spec (config, error/validation/authorization middleware, policy matrix, migration runner, audit helper, test harness with a dedicated test DB) without changing the behavior of any existing endpoint.

**Architecture:** Keep Express + `pg`. Split the app into `src/app.js` (testable, no `listen`) and a thin `server.js`. Add shared primitives under `src/`. Move the 8 existing route files into `src/modules/<domain>/routes.js` unchanged except for import paths and the switch from `authorize(...roles)` to `requirePermission(permission)`. A characterization test suite written BEFORE the move proves nothing changed.

**Tech Stack:** Node 22, Express 4, `pg`, `zod`, `helmet`, `express-rate-limit`, `node:test`, `supertest`, PostgreSQL 16 (Docker container `nexus-hrms-pg`, 127.0.0.1:5432, user `postgres`, password `nexus123`).

**Spec:** `docs/superpowers/specs/2026-09-25-backend-completion-design.md` (sections 4, 5, 6, 8 Phase 0, 9). Phases 1–4 get their own plans, written after this phase lands, because their code depends on the exact names produced here.

## Global Constraints

- No `git push`. All work stays local. Work on branch `feat/backend-completion` (created in Task 1); commits are local.
- Existing route paths and response shapes must keep working: success `{ success, data, pagination? }`; errors `{ success:false, message }` (a `code` field is added, never removed fields).
- API messages returned to clients stay Vietnamese. Code, comments, tests, docs in English.
- Do not modify `FrontEnd/`.
- Do not modify `database/schema.sql`. Schema changes go in `Backend/migrations/NNN_name.sql` (none are needed in this phase).
- Existing SQL triggers/functions are kept.
- Tests must never touch the development database `nexus_hrms`. The test DB name must end in `_test`.
- Working directory for all commands: `/home/giabao/dev/QLDACNTT_THUC_HIEN_LAM_TEST/Backend` unless stated.

## Review Focus

1. Test setup pointed at the dev database — `test-setup.js` must refuse any DB name not ending in `_test` (test in Task 2).
2. Invalid JSON body or oversized body — must return 400 `INVALID_JSON` / 413, not 500 (Task 1).
3. `?page=0`, `?page=-3`, `?limit=abc`, `?limit=100000` — pagination must clamp to sane values (Task 1).
4. Postgres constraint errors (unique, foreign key, check, bad UUID text) — must map to 409/400, not 500 (Task 1).
5. A migration that fails halfway — nothing from that file may stay applied and its name must not be recorded (Task 3).
6. `requirePermission` called with a permission name that is not in the matrix — must fail at startup, not silently allow (Task 4).

---

### Task 1: Dependencies, config, DB module, and shared primitives

**Files:**
- Modify: `Backend/package.json`
- Create: `Backend/src/config/env.js`
- Create: `Backend/src/config/db.js`
- Modify: `Backend/db.js` (becomes a shim)
- Create: `Backend/src/utils/AppError.js`
- Create: `Backend/src/utils/asyncHandler.js`
- Create: `Backend/src/utils/pagination.js`
- Create: `Backend/src/middleware/errorHandler.js`
- Create: `Backend/src/middleware/validate.js`
- Create: `Backend/tests/helpers/env.js`
- Test: `Backend/tests/unit/errorHandler.test.js`, `Backend/tests/unit/pagination.test.js`, `Backend/tests/unit/validate.test.js`

**Interfaces:**
- Produces:
  - `config` (from `src/config/env.js`): `{ env, isTest, port, db:{host,port,database,user,password}, jwt:{secret,expiresIn}, corsOrigins:string[] }`
  - `db` (from `src/config/db.js`): `{ pool, query(text, params), getClient(), withTransaction(async (client) => result) }`
  - `AppError(status, code, message, details?)` plus factories `badRequest(message, details?)`, `unauthorized(message?)`, `forbidden(message?, details?)`, `notFound(message?)`, `conflict(message, details?)`, all from `src/utils/AppError.js`
  - `asyncHandler(fn)` from `src/utils/asyncHandler.js`
  - `parsePagination(query, {defaultLimit=50, maxLimit=200}) -> {page, limit, offset}` and `paginationMeta(total, page, limit) -> {total,page,limit,totalPages}` from `src/utils/pagination.js`
  - `notFoundHandler(req,res)`, `errorHandler(err,req,res,next)` from `src/middleware/errorHandler.js`
  - `validate({params?, query?, body?})` (zod schemas) from `src/middleware/validate.js`

- [ ] **Step 1: Create the branch and install dependencies**

```bash
cd /home/giabao/dev/QLDACNTT_THUC_HIEN_LAM_TEST
git checkout -b feat/backend-completion
cd Backend
npm install zod@^3.23.8 helmet@^8.0.0 express-rate-limit@^7.4.0
npm install --save-dev supertest@^7.0.0
```

Expected: `package.json` lists the new dependencies; no errors.

- [ ] **Step 2: Add npm scripts**

Edit `Backend/package.json` `scripts` to:

```json
"scripts": {
  "dev": "node --watch server.js",
  "start": "node server.js",
  "migrate": "node scripts/migrate.js",
  "db:test": "node scripts/test-db.js",
  "test:smoke": "node scripts/smoke-test.js",
  "test:unit": "node --require ./tests/helpers/env.js --test \"tests/unit/**/*.test.js\"",
  "test": "node scripts/test-setup.js && node --require ./tests/helpers/env.js --test --test-concurrency=1 \"tests/**/*.test.js\""
}
```

- [ ] **Step 3: Create the test env preload**

`Backend/tests/helpers/env.js`:

```js
// Preloaded with `node --require` before every test file.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret';
```

- [ ] **Step 4: Create config**

`Backend/src/config/env.js`:

```js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const isTest = process.env.NODE_ENV === 'test';

const list = (value, fallback) =>
  value ? value.split(',').map((s) => s.trim()).filter(Boolean) : fallback;

const defaultOrigins = [3000, 3001, 3002, 3003, 3004, 3005, 5173].flatMap((port) => [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
]);

const config = {
  env: process.env.NODE_ENV || 'development',
  isTest,
  port: parseInt(process.env.PORT || '8000', 10),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: isTest ? process.env.DB_NAME_TEST || 'nexus_hrms_test' : process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  corsOrigins: [
    ...new Set([...list(process.env.CORS_ORIGINS, defaultOrigins), process.env.FRONTEND_URL].filter(Boolean)),
  ],
};

if (!config.jwt.secret) {
  throw new Error('JWT_SECRET is required (set it in Backend/.env)');
}

module.exports = config;
```

- [ ] **Step 5: Create the DB module and shim the old one**

`Backend/src/config/db.js`:

```js
const { Pool } = require('pg');
const config = require('./env');

const pool = new Pool({
  ...config.db,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err.message);
});

const query = (text, params) => pool.query(text, params);
const getClient = () => pool.connect();

/**
 * Run `fn(client)` inside BEGIN/COMMIT; ROLLBACK and rethrow on any error.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, getClient, withTransaction };
```

Replace the whole content of `Backend/db.js` with:

```js
// Compatibility shim: existing scripts and routes still `require('../db')`.
module.exports = require('./src/config/db');
```

- [ ] **Step 6: Write the failing unit tests**

`Backend/tests/unit/pagination.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePagination, paginationMeta } = require('../../src/utils/pagination');

test('defaults to page 1, limit 50', () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 50, offset: 0 });
});

test('computes offset from page and limit', () => {
  assert.deepEqual(parsePagination({ page: '3', limit: '20' }), { page: 3, limit: 20, offset: 40 });
});

test('clamps page below 1 to 1', () => {
  assert.equal(parsePagination({ page: '0' }).page, 1);
  assert.equal(parsePagination({ page: '-3' }).page, 1);
});

test('non-numeric values fall back to defaults', () => {
  assert.deepEqual(parsePagination({ page: 'abc', limit: 'xyz' }), { page: 1, limit: 50, offset: 0 });
});

test('limit is clamped to [1, maxLimit]', () => {
  assert.equal(parsePagination({ limit: '100000' }).limit, 200);
  assert.equal(parsePagination({ limit: '-5' }).limit, 1);
  assert.equal(parsePagination({ limit: '0' }).limit, 50);
  assert.equal(parsePagination({ limit: '500' }, { maxLimit: 1000 }).limit, 500);
});

test('paginationMeta computes totalPages', () => {
  assert.deepEqual(paginationMeta(101, 2, 50), { total: 101, page: 2, limit: 50, totalPages: 3 });
  assert.deepEqual(paginationMeta(0, 1, 50), { total: 0, page: 1, limit: 50, totalPages: 0 });
});
```

`Backend/tests/unit/errorHandler.test.js`:

```js
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const { AppError, notFound } = require('../../src/utils/AppError');
const { errorHandler, notFoundHandler } = require('../../src/middleware/errorHandler');

function run(err) {
  const out = {};
  const res = {
    status(s) { out.status = s; return this; },
    json(b) { out.body = b; return this; },
  };
  errorHandler(err, {}, res, () => {});
  return out;
}

test('AppError maps to its status, code and message', () => {
  const out = run(new AppError(418, 'TEAPOT', 'Tôi là ấm trà', { a: 1 }));
  assert.equal(out.status, 418);
  assert.deepEqual(out.body, { success: false, code: 'TEAPOT', message: 'Tôi là ấm trà', details: { a: 1 } });
});

test('AppError without details omits the details key', () => {
  const out = run(notFound());
  assert.equal(out.status, 404);
  assert.equal('details' in out.body, false);
  assert.equal(out.body.code, 'NOT_FOUND');
});

test('ZodError maps to 400 VALIDATION_ERROR with field paths', () => {
  const result = z.object({ email: z.string().email() }).safeParse({ email: 'nope' });
  const out = run(result.error);
  assert.equal(out.status, 400);
  assert.equal(out.body.code, 'VALIDATION_ERROR');
  assert.equal(out.body.details[0].path, 'email');
});

test('malformed JSON body maps to 400 INVALID_JSON', () => {
  const out = run(Object.assign(new SyntaxError('bad'), { type: 'entity.parse.failed' }));
  assert.equal(out.status, 400);
  assert.equal(out.body.code, 'INVALID_JSON');
});

test('oversized body maps to 413', () => {
  const out = run(Object.assign(new Error('big'), { type: 'entity.too.large' }));
  assert.equal(out.status, 413);
  assert.equal(out.body.code, 'PAYLOAD_TOO_LARGE');
});

test('Postgres unique violation maps to 409', () => {
  const out = run(Object.assign(new Error('dup'), { code: '23505' }));
  assert.equal(out.status, 409);
  assert.equal(out.body.code, 'CONFLICT');
});

test('Postgres foreign key violation maps to 409', () => {
  const out = run(Object.assign(new Error('fk'), { code: '23503' }));
  assert.equal(out.status, 409);
  assert.equal(out.body.code, 'REFERENCE_ERROR');
});

test('Postgres check violation and invalid text representation map to 400', () => {
  assert.equal(run(Object.assign(new Error('chk'), { code: '23514' })).status, 400);
  assert.equal(run(Object.assign(new Error('uuid'), { code: '22P02' })).status, 400);
});

test('unknown errors map to 500 without leaking the message', () => {
  const spy = mock.method(console, 'error', () => {});
  const out = run(new Error('secret db password leaked'));
  spy.mock.restore();
  assert.equal(out.status, 500);
  assert.equal(out.body.code, 'INTERNAL_ERROR');
  assert.equal(out.body.message, 'Internal Server Error');
});

test('notFoundHandler keeps the legacy Vietnamese message', () => {
  const out = {};
  const res = { status(s) { out.status = s; return this; }, json(b) { out.body = b; return this; } };
  notFoundHandler({ method: 'GET', originalUrl: '/api/x' }, res);
  assert.equal(out.status, 404);
  assert.equal(out.body.success, false);
  assert.equal(out.body.message, 'Route GET /api/x không tồn tại');
});
```

`Backend/tests/unit/validate.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const { validate } = require('../../src/middleware/validate');

test('valid input is replaced by the parsed value (coercion applied)', () => {
  const mw = validate({ query: z.object({ page: z.coerce.number().int().min(1) }) });
  const req = { query: { page: '2' } };
  let err = 'unset';
  mw(req, {}, (e) => { err = e; });
  assert.equal(err, undefined);
  assert.deepEqual(req.query, { page: 2 });
});

test('invalid body forwards a ZodError to next', () => {
  const mw = validate({ body: z.object({ name: z.string().min(1) }) });
  let err;
  mw({ body: { name: '' } }, {}, (e) => { err = e; });
  assert.equal(err.name, 'ZodError');
});

test('missing body (undefined) is validated, not skipped', () => {
  const mw = validate({ body: z.object({ name: z.string() }) });
  let err;
  mw({ body: undefined }, {}, (e) => { err = e; });
  assert.equal(err.name, 'ZodError');
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL with `Cannot find module '../../src/utils/pagination'` (and the others).

- [ ] **Step 8: Implement the primitives**

`Backend/src/utils/AppError.js`:

```js
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message, details);
const unauthorized = (message = 'Chưa xác thực') => new AppError(401, 'UNAUTHORIZED', message);
const forbidden = (message = 'Không có quyền truy cập', details) => new AppError(403, 'FORBIDDEN', message, details);
const notFound = (message = 'Không tìm thấy dữ liệu') => new AppError(404, 'NOT_FOUND', message);
const conflict = (message, details) => new AppError(409, 'CONFLICT', message, details);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };
```

`Backend/src/utils/asyncHandler.js`:

```js
/** Wrap an async Express handler so rejected promises reach the error middleware. */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
```

`Backend/src/utils/pagination.js`:

```js
function parsePagination(query = {}, { defaultLimit = 50, maxLimit = 200 } = {}) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  return { page, limit, offset: (page - 1) * limit };
}

const paginationMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});

module.exports = { parsePagination, paginationMeta };
```

`Backend/src/middleware/errorHandler.js`:

```js
const { ZodError } = require('zod');
const { AppError } = require('../utils/AppError');

const notFoundHandler = (req, res) =>
  res.status(404).json({
    success: false,
    code: 'ROUTE_NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} không tồn tại`,
  });

const fail = (status, code, message, extra = {}) => ({
  status,
  body: { success: false, code, message, ...extra },
});

function toResponse(err) {
  if (err instanceof AppError) {
    return fail(err.status, err.code, err.message, err.details !== undefined ? { details: err.details } : {});
  }
  if (err instanceof ZodError) {
    return fail(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', {
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err && err.type === 'entity.parse.failed') return fail(400, 'INVALID_JSON', 'Body JSON không hợp lệ');
  if (err && err.type === 'entity.too.large') return fail(413, 'PAYLOAD_TOO_LARGE', 'Dữ liệu gửi lên quá lớn');
  if (err && err.code === '23505') return fail(409, 'CONFLICT', 'Dữ liệu đã tồn tại');
  if (err && err.code === '23503') return fail(409, 'REFERENCE_ERROR', 'Dữ liệu tham chiếu không hợp lệ');
  if (err && (err.code === '23514' || err.code === '22P02')) {
    return fail(400, 'VALIDATION_ERROR', 'Dữ liệu vi phạm ràng buộc');
  }
  return fail(500, 'INTERNAL_ERROR', 'Internal Server Error');
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const { status, body } = toResponse(err);
  if (status === 500) console.error('❌ Unhandled error:', err);
  res.status(status).json(body);
}

module.exports = { notFoundHandler, errorHandler };
```

`Backend/src/middleware/validate.js`:

```js
/**
 * validate({ params, query, body }) — each value is a zod schema.
 * On success the parsed (coerced) value replaces req.params/query/body.
 * On failure the ZodError is forwarded to the error handler (400 VALIDATION_ERROR).
 */
const validate = (schemas) => (req, res, next) => {
  try {
    for (const part of ['params', 'query', 'body']) {
      if (schemas[part]) req[part] = schemas[part].parse(req[part]);
    }
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { validate };
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS, all tests green.

- [ ] **Step 10: Confirm the running server still works with the db shim**

Run: `node -e "require('./db'); console.log('shim ok'); process.exit(0)"`
Expected: `shim ok`.

- [ ] **Step 11: Commit**

```bash
git add Backend/package.json Backend/package-lock.json Backend/db.js Backend/src Backend/tests
git commit -m "feat(backend): add config, db helper, error handling, validation and pagination primitives"
```

---

### Task 2: App/server split, test database harness, characterization tests

**Files:**
- Create: `Backend/src/catalog.js` (moved from `server.js`)
- Create: `Backend/src/app.js`
- Modify: `Backend/server.js`
- Create: `Backend/scripts/test-setup.js`
- Create: `Backend/tests/helpers/api.js`
- Test: `Backend/tests/unit/testSetupGuard.test.js`
- Test: `Backend/tests/regression/existing-api.test.js`

**Interfaces:**
- Consumes: `config`, `db`, `notFoundHandler`, `errorHandler` from Task 1.
- Produces:
  - `app` (Express app, not listening) from `src/app.js`
  - `assertTestDatabaseName(name)` exported from `scripts/test-setup.js` (throws unless name matches `/^[a-z0-9_]+_test$/`)
  - `call(role|null, method, url, body?) -> supertest Test`, `claimsFor(role) -> {userId, employeeId, roleCode, email}`, `closeDb()`, `ACCOUNTS` from `tests/helpers/api.js`

- [ ] **Step 1: Extract the endpoint catalog from `server.js`**

```bash
awk '/app.get\(.\/api., \(req, res\) => \{/{f=1;next} f&&/^  res.json\(\{/{p=1;print "module.exports = {";next} p&&/^  \}\);/{print "};";exit} p{print substr($0,3)}' server.js > src/catalog.js
node -e "const c=require('./src/catalog'); console.log(c.name, Object.keys(c.endpoints).join(','))"
```

Expected: `NEXUS HR Management System API auth,employees,departments,attendance,leaves,payroll,projects,dashboard`.

- [ ] **Step 2: Create `src/app.js`**

```js
const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const db = require('./config/db');
const catalog = require('./catalog');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging (dev only)
if (config.env === 'development') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      const color = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
      console.log(`${color}${req.method}\x1b[0m ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
    });
    next();
  });
}

// Routes (moved into src/modules in Task 5)
app.use('/api/auth', require('../routes/auth'));
app.use('/api/employees', require('../routes/employees'));
app.use('/api/departments', require('../routes/departments'));
app.use('/api/attendance', require('../routes/attendance'));
app.use('/api/leaves', require('../routes/leaves'));
app.use('/api/payroll', require('../routes/payroll'));
app.use('/api/projects', require('../routes/projects'));
app.use('/api/dashboard', require('../routes/dashboard'));

app.get('/api/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW() AS server_time, current_database() AS db_name');
    return res.json({
      status: 'OK',
      server: 'NEXUS HR Backend API',
      database: result.rows[0].db_name,
      serverTime: result.rows[0].server_time,
      uptime: Math.floor(process.uptime()) + 's',
    });
  } catch (error) {
    return res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

app.get('/api', (req, res) => res.json(catalog));

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
```

- [ ] **Step 3: Replace `server.js`**

```js
// ============================================
// server.js — NEXUS HR Backend Entry Point
// ============================================
const config = require('./src/config/env');
const app = require('./src/app');
const db = require('./src/config/db');

app.listen(config.port, async () => {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║   🚀 NEXUS HR Backend API                 ║');
  console.log(`║   📡 http://localhost:${config.port}                 ║`);
  console.log(`║   📖 http://localhost:${config.port}/api              ║`);
  console.log(`║   💚 http://localhost:${config.port}/api/health       ║`);
  console.log('╚════════════════════════════════════════════╝');
  console.log('');

  try {
    const result = await db.query(
      'SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema = $1',
      ['public']
    );
    console.log(`📦 Database: ${config.db.database} (${result.rows[0].tables} tables)`);
    console.log(`🔗 PostgreSQL: ${config.db.host}:${config.db.port}`);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }
});
```

- [ ] **Step 4: Write the failing test for the test-DB guard**

`Backend/tests/unit/testSetupGuard.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertTestDatabaseName } = require('../../scripts/test-setup');

test('accepts names ending in _test', () => {
  assert.doesNotThrow(() => assertTestDatabaseName('nexus_hrms_test'));
});

test('refuses the development database', () => {
  assert.throws(() => assertTestDatabaseName('nexus_hrms'), /_test/);
});

test('refuses names that could be SQL injection', () => {
  assert.throws(() => assertTestDatabaseName('x"; DROP DATABASE nexus_hrms; --_test'));
});

test('refuses empty or undefined names', () => {
  assert.throws(() => assertTestDatabaseName(''));
  assert.throws(() => assertTestDatabaseName(undefined));
});
```

Run: `npm run test:unit`
Expected: FAIL with `Cannot find module '../../scripts/test-setup'`.

- [ ] **Step 5: Implement `scripts/test-setup.js`**

```js
// Recreates the dedicated test database from database/schema.sql (+ migrations, added in Task 3).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('../src/config/env');

function assertTestDatabaseName(name) {
  if (typeof name !== 'string' || !/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`Refusing to use database "${name}": test database name must match /^[a-z0-9_]+_test$/ (must end with _test)`);
  }
}

async function main() {
  const dbName = config.db.database;
  assertTestDatabaseName(dbName);

  const admin = new Client({ ...config.db, database: 'postgres' });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();

  const client = new Client(config.db);
  await client.connect();
  const schemaSql = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
  await client.query(schemaSql);
  await client.end();

  console.log(`✅ Test database "${dbName}" recreated from schema.sql`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ test-setup failed:', err.message);
    process.exit(1);
  });
}

module.exports = { assertTestDatabaseName };
```

Run: `npm run test:unit`
Expected: PASS (including the guard tests).

- [ ] **Step 6: Create the API test helper**

`Backend/tests/helpers/api.js`:

```js
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');

const ACCOUNTS = {
  CEO: { email: 'ceo@fwbnexus.vn', password: 'Ceo@123456' },
  HR_DIRECTOR: { email: 'hrd@fwbnexus.vn', password: 'Hrd@123456' },
  LINE_MANAGER: { email: 'lead@fwbnexus.vn', password: 'Lead@12345' },
  EMPLOYEE: { email: 'employee@fwbnexus.vn', password: 'Emp@123456' },
};

const tokens = {};

async function tokenFor(role) {
  if (!tokens[role]) {
    const res = await request(app).post('/api/auth/login').send(ACCOUNTS[role]);
    if (res.status !== 200 || !res.body.token) {
      throw new Error(`Test login failed for ${role}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    tokens[role] = res.body.token;
  }
  return tokens[role];
}

/** Decoded JWT payload for a seeded role: { userId, employeeId, roleCode, email, ... } */
async function claimsFor(role) {
  const token = await tokenFor(role);
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

/**
 * call(role, 'get', '/api/employees')            -> authenticated as `role`
 * call(null, 'post', '/api/auth/login', {...})   -> anonymous
 */
async function call(role, method, url, body) {
  let req = request(app)[method](url);
  if (role) req = req.set('Authorization', `Bearer ${await tokenFor(role)}`);
  return body === undefined ? req : req.send(body);
}

const closeDb = () => db.pool.end();

module.exports = { ACCOUNTS, tokenFor, claimsFor, call, closeDb };
```

- [ ] **Step 7: Write the characterization tests (against the CURRENT behavior)**

`Backend/tests/regression/existing-api.test.js`:

```js
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
```

- [ ] **Step 8: Recreate the test DB and run the whole suite**

Run: `npm test`
Expected: `✅ Test database "nexus_hrms_test" recreated from schema.sql`, then all tests PASS.

If a characterization test fails because the current code behaves differently from the assumption (for example the `/api/auth/me` shape), change the ASSERTION to match the current behavior and add a one-line comment `// characterizes current behavior`. Do not change application code in this task. The malformed-JSON test must pass because `errorHandler` (Task 1) is already mounted.

- [ ] **Step 9: Verify the dev server still starts and the smoke test passes**

The dev server (`npm run dev`, `node --watch`) restarts automatically. Run: `npm run test:smoke`
Expected: all smoke steps pass (the server on port 8000 uses the dev database).

- [ ] **Step 10: Commit**

```bash
git add Backend/server.js Backend/src Backend/scripts/test-setup.js Backend/tests
git commit -m "feat(backend): split app from server, add test DB harness and characterization tests"
```

---

### Task 3: Audit helper and migration runner

**Files:**
- Create: `Backend/src/utils/audit.js`
- Create: `Backend/scripts/migrate.js`
- Create: `Backend/migrations/.gitkeep`
- Modify: `Backend/scripts/test-setup.js` (apply migrations after schema)
- Test: `Backend/tests/db/audit.test.js`, `Backend/tests/db/migrate.test.js`

**Interfaces:**
- Consumes: `db` (`pool`, `query`) from Task 1.
- Produces:
  - `writeAudit(executor, { user, action, table, recordId, oldValues, newValues, req }) -> Promise<void>` from `src/utils/audit.js`. `executor` is anything with `.query(text, params)` (the `db` module or a transaction client). `user` is `req.user` (`{userId, employeeId}`) or null. Keys `password_hash`, `token_hash`, `face_encoding` (any depth) are stored as `"[REDACTED]"`.
  - `runMigrations({ pool, dir?, log? }) -> Promise<string[]>` (names applied this run) from `scripts/migrate.js`. Files must match `^\d+_.+\.sql$` and are applied in lexicographic order, each inside one transaction, recorded in `schema_migrations(name, applied_at)`.

- [ ] **Step 1: Write the failing tests**

`Backend/tests/db/audit.test.js`:

```js
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');
const { writeAudit } = require('../../src/utils/audit');

after(async () => {
  await db.query("DELETE FROM audit_logs WHERE action LIKE 'TEST_%'");
  await db.pool.end();
});
beforeEach(() => db.query("DELETE FROM audit_logs WHERE action LIKE 'TEST_%'"));

async function firstUser() {
  const { rows } = await db.query('SELECT id, employee_id FROM users ORDER BY created_at LIMIT 1');
  return { userId: rows[0].id, employeeId: rows[0].employee_id };
}

test('writes a row with user, table, record and JSON values', async () => {
  const user = await firstUser();
  await writeAudit(db, {
    user, action: 'TEST_UPDATE', table: 'employees', recordId: 'NV-0001',
    oldValues: { job_title: 'A' }, newValues: { job_title: 'B' },
    req: { ip: '::ffff:127.0.0.1', headers: { 'user-agent': 'node-test' } },
  });
  const { rows } = await db.query("SELECT * FROM audit_logs WHERE action = 'TEST_UPDATE'");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, user.userId);
  assert.equal(rows[0].employee_id, user.employeeId);
  assert.equal(rows[0].record_id, 'NV-0001');
  assert.deepEqual(rows[0].old_values, { job_title: 'A' });
  assert.deepEqual(rows[0].new_values, { job_title: 'B' });
  assert.equal(rows[0].user_agent, 'node-test');
});

test('redacts secrets at any depth', async () => {
  await writeAudit(db, {
    user: null, action: 'TEST_SECRET', table: 'users', recordId: 1,
    newValues: { email: 'a@b.c', password_hash: 'xyz', nested: { token_hash: 'abc', face_encoding: 'bin', ok: 1 } },
  });
  const { rows } = await db.query("SELECT new_values, user_id, record_id FROM audit_logs WHERE action = 'TEST_SECRET'");
  assert.deepEqual(rows[0].new_values, {
    email: 'a@b.c', password_hash: '[REDACTED]', nested: { token_hash: '[REDACTED]', face_encoding: '[REDACTED]', ok: 1 },
  });
  assert.equal(rows[0].user_id, null);
  assert.equal(rows[0].record_id, '1');
});

test('works inside a transaction and rolls back with it', async () => {
  await assert.rejects(
    db.withTransaction(async (client) => {
      await writeAudit(client, { user: null, action: 'TEST_ROLLBACK', table: 'employees', recordId: 'X' });
      throw new Error('boom');
    }),
    /boom/
  );
  const { rows } = await db.query("SELECT 1 FROM audit_logs WHERE action = 'TEST_ROLLBACK'");
  assert.equal(rows.length, 0);
});

test('truncates an over-long ip to fit varchar(45)', async () => {
  await writeAudit(db, {
    user: null, action: 'TEST_IP', table: 'employees', recordId: 'X',
    req: { ip: 'x'.repeat(100), headers: {} },
  });
  const { rows } = await db.query("SELECT ip_address FROM audit_logs WHERE action = 'TEST_IP'");
  assert.equal(rows[0].ip_address.length, 45);
});
```

`Backend/tests/db/migrate.test.js`:

```js
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../../src/config/db');
const { runMigrations } = require('../../scripts/migrate');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
const write = (name, sql) => fs.writeFileSync(path.join(dir, name), sql);

after(async () => {
  await db.query('DROP TABLE IF EXISTS zz_mig_a, zz_mig_b, zz_mig_c');
  await db.query("DELETE FROM schema_migrations WHERE name LIKE 'zz%'");
  await db.pool.end();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('applies pending files in order, then is idempotent', async () => {
  write('zz001_a.sql', 'CREATE TABLE zz_mig_a (id int);');
  write('zz002_b.sql', 'CREATE TABLE zz_mig_b (id int);');
  write('README.txt', 'ignored: not a migration');

  const first = await runMigrations({ pool: db.pool, dir });
  assert.deepEqual(first, ['zz001_a.sql', 'zz002_b.sql']);

  const second = await runMigrations({ pool: db.pool, dir });
  assert.deepEqual(second, []);

  const { rows } = await db.query("SELECT name FROM schema_migrations WHERE name LIKE 'zz%' ORDER BY name");
  assert.deepEqual(rows.map((r) => r.name), ['zz001_a.sql', 'zz002_b.sql']);
});

test('a failing migration rolls back fully and is not recorded', async () => {
  write('zz003_bad.sql', 'CREATE TABLE zz_mig_c (id int); SELECT * FROM table_that_does_not_exist;');

  await assert.rejects(runMigrations({ pool: db.pool, dir }), /zz003_bad\.sql/);

  const table = await db.query("SELECT to_regclass('public.zz_mig_c') AS t");
  assert.equal(table.rows[0].t, null);
  const rec = await db.query("SELECT 1 FROM schema_migrations WHERE name = 'zz003_bad.sql'");
  assert.equal(rec.rows.length, 0);
});

test('a missing directory means nothing to apply', async () => {
  const applied = await runMigrations({ pool: db.pool, dir: path.join(dir, 'does-not-exist') });
  assert.deepEqual(applied, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '../../src/utils/audit'` and `'../../scripts/migrate'`.

- [ ] **Step 3: Implement `src/utils/audit.js`**

```js
const SECRET_KEYS = new Set(['password_hash', 'token_hash', 'face_encoding']);

function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEYS.has(k) ? '[REDACTED]' : scrub(v)])
    );
  }
  return value;
}

const toJson = (v) => (v == null ? null : JSON.stringify(scrub(v)));

/**
 * Append one row to audit_logs. `executor` is `db` or a transaction client so the
 * audit row commits/rolls back together with the change it describes.
 */
async function writeAudit(executor, { user, action, table, recordId, oldValues, newValues, req }) {
  await executor.query(
    `INSERT INTO audit_logs
       (user_id, employee_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      user?.userId ?? null,
      user?.employeeId ?? null,
      action,
      table,
      recordId == null ? null : String(recordId),
      toJson(oldValues),
      toJson(newValues),
      req?.ip ? String(req.ip).slice(0, 45) : null,
      req?.headers?.['user-agent'] ?? null,
    ]
  );
}

module.exports = { writeAudit };
```

- [ ] **Step 4: Implement `scripts/migrate.js`**

```js
const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = path.resolve(__dirname, '../migrations');

async function runMigrations({ pool, dir = DEFAULT_DIR, log = () => {} }) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       VARCHAR(200) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()
    : [];
  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  const applied = [];

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
      log(`applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      err.message = `Migration ${file} failed: ${err.message}`;
      throw err;
    } finally {
      client.release();
    }
  }
  return applied;
}

if (require.main === module) {
  const db = require('../src/config/db');
  runMigrations({ pool: db.pool, log: console.log })
    .then((applied) => {
      console.log(applied.length ? `✅ ${applied.length} migration(s) applied` : '✅ Database is up to date');
      return db.pool.end();
    })
    .catch((err) => {
      console.error('❌', err.message);
      process.exit(1);
    });
}

module.exports = { runMigrations };
```

Create the empty directory marker: `touch migrations/.gitkeep`.

- [ ] **Step 5: Apply migrations in the test setup**

In `Backend/scripts/test-setup.js`, add near the top with the other requires:

```js
const { runMigrations } = require('./migrate');
```

and in `main()`, replace the lines after `await client.end();` and before the final `console.log` with:

```js
  await client.end();

  const db = require('../src/config/db');
  const applied = await runMigrations({ pool: db.pool });
  await db.pool.end();
  if (applied.length) console.log(`✅ Applied ${applied.length} migration(s): ${applied.join(', ')}`);

  console.log(`✅ Test database "${dbName}" recreated from schema.sql`);
```

(Remove the earlier duplicate `console.log` line so it appears once.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — unit, regression, and the new `db/` tests.

- [ ] **Step 7: Verify the CLI against the dev database**

Run: `npm run migrate`
Expected: `✅ Database is up to date` (no migrations yet). This also creates `schema_migrations` in the dev DB.

- [ ] **Step 8: Commit**

```bash
git add Backend/src/utils/audit.js Backend/scripts/migrate.js Backend/scripts/test-setup.js Backend/migrations Backend/tests/db
git commit -m "feat(backend): add audit helper and SQL migration runner"
```

---

### Task 4: Policy matrix and `requirePermission`

**Files:**
- Create: `Backend/src/policies/matrix.js`
- Create: `Backend/src/policies/index.js`
- Test: `Backend/tests/unit/policies.test.js`

**Interfaces:**
- Consumes: `forbidden`, `unauthorized` from `src/utils/AppError.js`.
- Produces from `src/policies/index.js`:
  - `scopeOf(roleCode, permission) -> 'all'|'department'|'self'|null` (throws `Error` on an unknown permission)
  - `can(roleCode, permission) -> boolean`
  - `requirePermission(permission) -> express middleware`. Throws at call time if `permission` is not in the matrix. At request time: no `req.user` → `unauthorized()`; role not allowed → `forbidden(msg, allowedRoles)`; otherwise sets `req.scope` and calls `next()`.
  - `matrix` object from `src/policies/matrix.js`, shape `{ '<resource>.<action>': { <ROLE_CODE>: scope } }`.
- Initial permissions (mirror today's `authorize(...)` calls exactly): `employee.create`, `employee.update`, `payroll.periods.read`, `payroll.calculate`, `leave.approve`, `leave.reject`, `project.create`.

- [ ] **Step 1: Write the failing tests**

`Backend/tests/unit/policies.test.js`:

```js
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
    assert.match(permission, /^[a-z]+(\.[a-z]+)+$/, permission);
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit`
Expected: FAIL with `Cannot find module '../../src/policies'`.

- [ ] **Step 3: Implement**

`Backend/src/policies/matrix.js`:

```js
// permission -> { ROLE_CODE: scope }.  scope: 'all' | 'department' | 'self'
// Phase 0 mirrors the authorize(...) calls that exist today; later phases add entries here only.
const ALL = 'all';
const DEPT = 'department';

const matrix = {
  'employee.create': { CEO: ALL, HR_DIRECTOR: ALL },
  'employee.update': { CEO: ALL, HR_DIRECTOR: ALL },
  'payroll.periods.read': { CEO: ALL, HR_DIRECTOR: ALL },
  'payroll.calculate': { CEO: ALL, HR_DIRECTOR: ALL },
  'leave.approve': { CEO: ALL, HR_DIRECTOR: ALL, LINE_MANAGER: DEPT },
  'leave.reject': { CEO: ALL, HR_DIRECTOR: ALL, LINE_MANAGER: DEPT },
  'project.create': { CEO: ALL, HR_DIRECTOR: ALL, LINE_MANAGER: DEPT },
};

module.exports = { matrix };
```

`Backend/src/policies/index.js`:

```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Backend/src/policies Backend/tests/unit/policies.test.js
git commit -m "feat(backend): add permission matrix and requirePermission guard"
```

---

### Task 5: Move routes into modules, wire permissions, harden the app

**Files:**
- Move (git mv): `Backend/routes/{auth,employees,departments,attendance,leaves,payroll,projects,dashboard}.js` → `Backend/src/modules/<name>/routes.js`
- Move (git mv): `Backend/middleware/auth.js` → `Backend/src/middleware/auth.js`
- Modify: each moved route file (imports; `authorize` → `requirePermission`)
- Modify: `Backend/src/middleware/auth.js` (remove `authorize`)
- Modify: `Backend/src/app.js` (module paths, helmet, rate limit)
- Create: `Backend/src/middleware/rateLimit.js`
- Modify: `Backend/.env.example`, `README.md`
- Test: `Backend/tests/unit/rateLimit.test.js` (existing `tests/regression/existing-api.test.js` must pass UNCHANGED)

**Interfaces:**
- Consumes: `requirePermission` (Task 4), `notFoundHandler`/`errorHandler` (Task 1).
- Produces:
  - `authenticate` middleware from `src/middleware/auth.js` (unchanged behavior; `authorize` removed)
  - `createAuthLimiter({ limit = 30, windowMs = 900000 })` and `authLimiter` (no-op in test env) from `src/middleware/rateLimit.js`

- [ ] **Step 1: Move the files with git**

```bash
mkdir -p src/modules/auth src/modules/employees src/modules/departments src/modules/attendance src/modules/leaves src/modules/payroll src/modules/projects src/modules/dashboard
for m in auth employees departments attendance leaves payroll projects dashboard; do git mv routes/$m.js src/modules/$m/routes.js; done
git mv middleware/auth.js src/middleware/auth.js
ls routes middleware 2>&1 | head
```

Expected: `routes` and `middleware` are now empty or gone. Remove leftovers: `rmdir routes middleware 2>/dev/null; true`.

- [ ] **Step 2: Fix imports in the moved files**

```bash
sed -i "s#require('\.\./db')#require('../../config/db')#; s#require('\.\./middleware/auth')#require('../../middleware/auth')#" src/modules/*/routes.js
sed -i "s#require('\.\./db')#require('../config/db')#" src/middleware/auth.js
grep -rn "require('\.\./db')\|require('\.\./middleware" src/ || echo "imports clean"
```

Expected: `imports clean`.

- [ ] **Step 3: Replace `authorize(...)` with `requirePermission(...)` (7 call sites)**

```bash
sed -i "/router\.post('\/', authenticate/s/authorize('CEO', 'HR_DIRECTOR')/requirePermission('employee.create')/" src/modules/employees/routes.js
sed -i "/router\.put('\/:id', authenticate/s/authorize('CEO', 'HR_DIRECTOR')/requirePermission('employee.update')/" src/modules/employees/routes.js
sed -i "/router\.get('\/periods', authenticate/s/authorize('CEO', 'HR_DIRECTOR')/requirePermission('payroll.periods.read')/" src/modules/payroll/routes.js
sed -i "/router\.post('\/calculate', authenticate/s/authorize('CEO', 'HR_DIRECTOR')/requirePermission('payroll.calculate')/" src/modules/payroll/routes.js
sed -i "/router\.patch('\/:id\/approve', authenticate/s/authorize('CEO', 'HR_DIRECTOR', 'LINE_MANAGER')/requirePermission('leave.approve')/" src/modules/leaves/routes.js
sed -i "/router\.patch('\/:id\/reject', authenticate/s/authorize('CEO', 'HR_DIRECTOR', 'LINE_MANAGER')/requirePermission('leave.reject')/" src/modules/leaves/routes.js
sed -i "/router\.post('\/', authenticate/s/authorize('CEO', 'HR_DIRECTOR', 'LINE_MANAGER')/requirePermission('project.create')/" src/modules/projects/routes.js
```

Then fix the import lines in the 5 files that used `authorize` (employees, payroll, leaves, projects, attendance):

```bash
for m in employees payroll leaves projects attendance; do
  sed -i "s#const { authenticate, authorize } = require('../../middleware/auth');#const { authenticate } = require('../../middleware/auth');\nconst { requirePermission } = require('../../policies');#" src/modules/$m/routes.js
done
grep -rn "authorize" src/modules || echo "no authorize left in modules"
grep -rn "requirePermission(" src/modules | wc -l
```

Expected: `no authorize left in modules`, and the count is `7`.

`attendance/routes.js` imported `authorize` but has no call sites (the grep above proves it). The `requirePermission` import added there is unused; remove that one line from `src/modules/attendance/routes.js`:

```bash
sed -i "/const { requirePermission } = require('..\/..\/policies');/d" src/modules/attendance/routes.js
```

- [ ] **Step 4: Remove `authorize` from the auth middleware**

In `Backend/src/middleware/auth.js`, delete the whole `authorize` function (from its JSDoc comment `/** Middleware Factory: ...` through the closing `};`) and change the last line to:

```js
module.exports = { authenticate };
```

Verify: `grep -n "authorize" src/middleware/auth.js || echo clean` prints `clean`.

- [ ] **Step 5: Write the failing rate-limit test**

`Backend/tests/unit/rateLimit.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { createAuthLimiter, authLimiter } = require('../../src/middleware/rateLimit');

test('createAuthLimiter answers 429 with a JSON body after the limit', async () => {
  const app = express();
  app.use(createAuthLimiter({ limit: 2, windowMs: 60000 }));
  app.post('/x', (req, res) => res.json({ ok: true }));

  assert.equal((await request(app).post('/x')).status, 200);
  assert.equal((await request(app).post('/x')).status, 200);
  const blocked = await request(app).post('/x');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, 'RATE_LIMITED');
  assert.equal(blocked.body.success, false);
});

test('authLimiter is a no-op in the test environment', async () => {
  const app = express();
  app.use(authLimiter);
  app.post('/x', (req, res) => res.json({ ok: true }));
  for (let i = 0; i < 40; i++) {
    assert.equal((await request(app).post('/x')).status, 200);
  }
});
```

Run: `npm run test:unit`
Expected: FAIL with `Cannot find module '../../src/middleware/rateLimit'`.

- [ ] **Step 6: Implement the rate limiter**

`Backend/src/middleware/rateLimit.js`:

```js
const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const createAuthLimiter = ({ limit = 30, windowMs = 15 * 60 * 1000 } = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message: 'Quá nhiều yêu cầu, vui lòng thử lại sau',
      }),
  });

const passthrough = (req, res, next) => next();

// Tests log in many times; the account lockout already protects against brute force there.
const authLimiter = config.isTest ? passthrough : createAuthLimiter();

module.exports = { createAuthLimiter, authLimiter };
```

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 7: Update `src/app.js` — module paths, helmet, rate limit**

Replace the require/`use` block so the top and routes section read:

```js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/env');
const db = require('./config/db');
const catalog = require('./catalog');
const { authLimiter } = require('./middleware/rateLimit');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
```

(keep the dev request-logging block as it is), and replace the eight `app.use('/api/...', require('../routes/...'))` lines with:

```js
app.use('/api/auth/login', authLimiter);
app.use('/api/auth', require('./modules/auth/routes'));
app.use('/api/employees', require('./modules/employees/routes'));
app.use('/api/departments', require('./modules/departments/routes'));
app.use('/api/attendance', require('./modules/attendance/routes'));
app.use('/api/leaves', require('./modules/leaves/routes'));
app.use('/api/payroll', require('./modules/payroll/routes'));
app.use('/api/projects', require('./modules/projects/routes'));
app.use('/api/dashboard', require('./modules/dashboard/routes'));
```

- [ ] **Step 8: Run the whole suite — regression tests must pass unchanged**

Run: `npm test`
Expected: PASS, including every test in `tests/regression/existing-api.test.js` without edits. If a regression test fails, the move changed behavior: fix the code, not the test.

- [ ] **Step 9: Verify against the live dev server and smoke test**

The dev server restarts automatically (`node --watch`). Run:

```bash
sleep 3; curl -s localhost:8000/api/health | head -c 200; echo
npm run test:smoke
```

Expected: health shows `"database":"nexus_hrms"` and `"status":"OK"`; all smoke steps pass. Also check the security headers: `curl -sI localhost:8000/api/health | grep -i "x-content-type-options"` prints `X-Content-Type-Options: nosniff`.

- [ ] **Step 10: Update docs and env example**

Append to `Backend/.env.example`:

```env

# Test database (created/dropped by `npm test`; must end with _test)
DB_NAME_TEST=nexus_hrms_test

# Optional: comma-separated CORS origins (defaults to localhost 3000-3005 and 5173)
# CORS_ORIGINS=http://localhost:3002
```

In `README.md`, add a section `### Backend tests and migrations` under the "Bộ công cụ Kiểm thử Tự động" heading with:

```markdown
### Backend tests and migrations

```bash
npm run test:unit --prefix Backend   # unit tests (no database)
npm test --prefix Backend            # recreates nexus_hrms_test from database/schema.sql + migrations, then runs all tests
npm run migrate --prefix Backend     # applies pending SQL files from Backend/migrations to the DB in Backend/.env
```

Schema changes go in `Backend/migrations/NNN_description.sql`; never edit `database/schema.sql` for new changes.
```

- [ ] **Step 11: Commit**

```bash
git add -A Backend README.md
git commit -m "refactor(backend): move routes into modules, use permission matrix, add helmet and login rate limit"
```

---

## Phase 0 Definition of Done

- [ ] `npm test --prefix Backend` is green (unit, db, regression).
- [ ] `npm run test:smoke --prefix Backend` passes against the running dev server.
- [ ] No file under `FrontEnd/` and no `database/schema.sql` change in `git diff main --stat`.
- [ ] `grep -rn "authorize(" Backend/src` returns nothing.
- [ ] Response shapes of the 8 existing route groups are unchanged (regression suite unchanged since Task 2).

## Next Plans (written after this phase lands)

| Plan file (to be created) | Phase | Depends on from Phase 0 |
|---|---|---|
| `2026-09-2x-backend-phase-1-auth-admin.md` | 1 — refresh/logout, `refresh_tokens`, `must_change_password`, users, departments, positions, audit logs | `withTransaction`, `writeAudit`, `runMigrations`, `requirePermission`, `validate`, `call` test helper |
| `…-phase-2-hr-core.md` | 2 — employees complete + offboarding + import, contracts, sensitive-field filtering fix | policy matrix scopes, migrations |
| `…-phase-3-time-and-money.md` | 3 — attendance extensions, leaves/OT/medical, payroll lock/transfer/anomalies | same |
| `…-phase-4-work-and-insight.md` | 4 — projects/tasks/squads, notifications, notices, handbook, analytics | same |
