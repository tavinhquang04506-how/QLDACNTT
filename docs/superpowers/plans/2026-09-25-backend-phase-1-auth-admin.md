# Backend Phase 1 — Auth Hardening and Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (chosen by the user; the user pre-authorized continuous execution without per-phase approval). Steps are TDD: write the failing test, watch it fail, implement, watch it pass, run the full suite, commit.

**Goal:** Add refresh-token sessions, logout, admin password reset, user/role management, department and position CRUD, and an audit-log reader, all behind the permission matrix and covered by integration tests.

**Architecture:** Same layering as Phase 0. Each new module has `routes.js` (wiring + `requirePermission` + `validate`), `controller.js` (HTTP shaping), `service.js` (rules + SQL, transactions via `db.withTransaction`, audit via `writeAudit`), `schema.js` (zod). Schema changes go in `Backend/migrations/001_auth_sessions.sql`.

**Tech Stack:** Node 22, Express 4, `pg`, `zod`, `bcryptjs`, `jsonwebtoken`, `node:test`, `supertest`.

**Spec:** `docs/superpowers/specs/2026-09-25-backend-completion-design.md` (sections 5, 6, 7 modules 1–4 and 13-audit, 8 Phase 1).

## Global Constraints

- Work on `main` only after each task's tests are green; commit per task; push `main` to remote `fork` after the phase (user authorized continuous merge/push to `fork`).
- Existing paths and response shapes keep working. `POST /auth/login` still returns `token` (same value as `accessToken`).
- Access token 30 minutes by default (`JWT_EXPIRES_IN`); refresh token 7 days, opaque, stored SHA-256 hashed, rotated on every use; reuse of a rotated token revokes the whole family.
- Password policy for new passwords: length >= 8, at least one letter and one digit.
- Every write records `audit_logs` via `writeAudit`; secrets never appear in audit values.
- Role-assignment rule: `CEO` and `ADMIN` may assign any role; `HR_DIRECTOR` may assign only `EMPLOYEE`, `LINE_MANAGER`, `KIOSK`. Nobody may change their own role or deactivate themselves.
- API messages to clients are Vietnamese; code, tests and docs are English.
- Do not modify `FrontEnd/` or `database/schema.sql`.

## Review Focus

1. Refresh token replay after rotation must revoke the family and force re-login.
2. A deactivated or locked user must not be able to refresh.
3. `HR_DIRECTOR` must not be able to create, promote to, or reset the password of a `CEO`/`ADMIN`.
4. Temporary passwords are shown once and never stored/logged in plain text (including audit logs).
5. Deleting a department that still has active employees must be refused, not orphan them.
6. Duplicate email / department code / position code must return 409, not 500.

---

### Task 1: Sessions — migration, token service, login/refresh/logout/change-password

**Files:** Create `Backend/migrations/001_auth_sessions.sql`, `Backend/src/modules/auth/tokens.js`, `Backend/src/modules/auth/schema.js`, `Backend/src/modules/auth/session.controller.js`; Modify `Backend/src/modules/auth/routes.js`, `Backend/src/config/env.js` (default expiry), `Backend/.env.example`, `Backend/src/app.js` (limiter on refresh). Tests: `Backend/tests/api/auth-sessions.test.js`, `Backend/tests/unit/tokens.test.js`.

**Interfaces:**
- Migration: `refresh_tokens(id UUID PK, user_id UUID FK users ON DELETE CASCADE, family_id UUID, token_hash VARCHAR(64) UNIQUE, expires_at, revoked_at, replaced_by UUID, ip VARCHAR(45), user_agent TEXT, created_at)`; `users.must_change_password BOOLEAN NOT NULL DEFAULT FALSE`.
- `tokens.signAccessToken(user) -> string` (payload `{userId, employeeId, roleCode, email}`), `tokens.hashToken(raw) -> hex sha256`, `tokens.issueRefreshToken(executor, userId, req, familyId?) -> {token, familyId}`, `tokens.rotateRefreshToken(rawToken, req) -> {user, refresh:{token}}` (throws AppError 401 `INVALID_REFRESH_TOKEN` / `REFRESH_TOKEN_REUSED`), `tokens.revokeRefreshToken(rawToken) -> boolean`, `tokens.revokeAllForUser(executor, userId)`.
- Endpoints: `POST /api/auth/login` (extended: `accessToken`, `refreshToken`, `expiresIn`, `mustChangePassword`), `POST /api/auth/refresh {refreshToken}`, `POST /api/auth/logout {refreshToken}`, `POST /api/auth/change-password {currentPassword,newPassword}` (min 8, letter+digit; clears `must_change_password`; revokes all refresh tokens).

Tests (RED first): login returns refreshToken and still `token`; refresh returns new pair and old refresh is rejected; replaying the OLD token revokes the family (new token also dead); refresh with garbage -> 401; refresh for deactivated user -> 401; logout revokes then refresh fails 401, logout twice is idempotent 200; change-password weak -> 400, wrong current -> 401, success revokes refresh tokens; unit: `hashToken` deterministic and 64 hex, `signAccessToken` payload/expiry.

### Task 2: Users module

**Files:** Create `Backend/src/modules/users/{routes,controller,service,schema,roleRules}.js`; Modify `Backend/src/policies/matrix.js`, `Backend/src/app.js`. Tests `Backend/tests/api/users.test.js`, `Backend/tests/unit/roleRules.test.js`.

**Interfaces:** matrix keys `user.read` (CEO, HR_DIRECTOR, ADMIN), `user.create`, `user.update`, `user.resetPassword` (same); `roleRules.canAssignRole(actorRole, targetRole) -> boolean`, `roleRules.canManageUserWithRole(actorRole, targetRole) -> boolean` (HRD cannot manage CEO/ADMIN accounts); `generateTemporaryPassword() -> string` (12+ chars, letter+digit+symbol).
Endpoints: `GET /api/users?search&role&active&page&limit`, `GET /api/users/:id`, `POST /api/users {employeeId,email,role,password?}` (returns `temporaryPassword` once when no password supplied; sets `must_change_password`; syncs `user_roles`), `PATCH /api/users/:id {role?,isActive?}`, `POST /api/users/:id/reset-password`, `POST /api/users/:id/unlock`.

Tests: list requires role; EMPLOYEE 403; HRD cannot create CEO (403), CEO can; duplicate email 409; employee without account required (unknown employee 404, employee already has account 409); create returns temporary password once and login works with it and reports `mustChangePassword`; PATCH role syncs `user_roles`; cannot change own role/deactivate self (400); deactivate revokes refresh tokens; reset-password returns temp password, unlocks, revokes tokens, HRD cannot reset CEO (403); audit row written and contains no password.

### Task 3: Departments and positions

**Files:** Modify `Backend/src/modules/departments/routes.js`; Create `Backend/src/modules/departments/{controller,service,schema}.js`, `Backend/src/modules/positions/{routes,controller,service,schema}.js`; Modify matrix and app. Tests `Backend/tests/api/departments.test.js`, `Backend/tests/api/positions.test.js`.

**Interfaces:** matrix `department.manage`, `position.manage` (CEO, HR_DIRECTOR). Endpoints: `GET /api/departments/:id`, `POST /api/departments {code,name,description?,budgetYearly?,managerId?}` (id `DEPT-<CODE>`), `PUT /api/departments/:id`, `DELETE /api/departments/:id` (soft deactivate; 409 `DEPARTMENT_HAS_EMPLOYEES` when active employees remain); `GET /api/positions?includeInactive`, `GET /api/positions/:id`, `POST /api/positions {code,name,level,description?}` (id `POS-<CODE>`), `PUT /api/positions/:id`, `DELETE /api/positions/:id` (soft deactivate; 409 if active employees use it).

Tests: create/get/update/deactivate happy paths; EMPLOYEE 403 on writes but can read; duplicate code 409; invalid code 400; unknown id 404; delete department with employees 409; manager must exist (404/409); audit rows written.

### Task 4: Audit-log reader, catalog, OpenAPI, docs

**Files:** Create `Backend/src/modules/audit/{routes,controller,service,schema}.js`, `Backend/docs/openapi.yaml`; Modify matrix (`audit.read`: CEO, ADMIN), `Backend/src/app.js`, `Backend/src/catalog.js`, `README.md`. Tests `Backend/tests/api/audit.test.js`, `Backend/tests/unit/openapi.test.js`.

Endpoint: `GET /api/audit-logs?table&action&userId&from&to&page&limit` newest first. OpenAPI documents Phase 0/1 endpoints (auth, users, departments, positions, audit-logs, health); a unit test parses the YAML-as-JSON structure is avoided by keeping a JSON-compatible YAML subset and asserts every path registered in `catalog.js` for these modules is documented.

Tests: CEO 200 and results sorted desc; HRD/EMPLOYEE 403; filters by table and action; pagination clamps `limit`; a write elsewhere (create department) appears in the log.

## Definition of Done

- `npm test --prefix Backend` green; smoke test green against the dev server.
- Migration applies on the dev DB (`npm run migrate --prefix Backend`).
- Catalog, README and OpenAPI updated; `main` pushed to `fork`.
