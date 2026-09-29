# Backend Phase 2 — HR Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, TDD; the user pre-authorized continuous execution and pushing `main` to remote `fork`).

**Goal:** Complete the employee lifecycle API (validated create/update, offboarding, bulk import), add employment contracts, and fix the sensitive-data leaks (Line Manager salary access, `face_encoding` exposure, audit-log PII).

**Architecture:** Same layered modules. `employees` is rewritten to controller/service/schema while keeping every existing path and response shape. New `contracts` module. Migration `002_hr_core.sql` adds `contracts`, `employees.termination_reason`, and replaces the `fn_audit_trail` trigger function so it attributes the acting user (via `set_config('app.user_id', …)`) and never stores `face_encoding`.

**Tech Stack:** Node 22, Express 4, `pg`, `zod`, `node:test`, `supertest`.

**Spec:** `docs/superpowers/specs/2026-09-25-backend-completion-design.md` (sections 3, 5 `contracts`, 6 sensitive fields, 7 modules 5–6, 8 Phase 2).

## Global Constraints

- Existing endpoint paths and response shapes stay valid (`{success, data, pagination?}`; employee row fields stay snake_case; input stays camelCase as today).
- Sensitive fields: `base_salary`, `citizen_id`, `bank_account`, `bank_name`, `date_of_birth`, `address`. Visible to the record owner, `HR_DIRECTOR`, `CEO`. Everyone else gets them removed. `face_encoding` is never returned by any API and never written to `audit_logs`. `ADMIN` never sees the sensitive fields, including through the audit log.
- Line Manager scope is their own department (plus themselves); a manager with no department sees only themselves.
- Every write is audited: employees through the DB trigger (with actor attribution), contracts and other writes through `writeAudit`.
- Migrations are additive (new table/column, `CREATE OR REPLACE FUNCTION`). Do not edit `database/schema.sql`.
- Do not modify `FrontEnd/`.

## Review Focus

1. A Line Manager must not obtain salary/CCCD/bank data of employees through list, detail, or the audit log.
2. `face_encoding` must not appear in any response or audit row, including rows written by the trigger.
3. Offboarding must leave no working session: user deactivated, refresh tokens revoked, contract terminated, department head cleared.
4. Bulk import must not partially corrupt on a bad row and must not allow more than 500 rows.
5. Only one active contract per employee (DB-enforced), and contract salary/type stay in sync with the employee row.
6. An employee's own contracts are readable by them, nobody else's.

---

### Task 1: Migration 002, audit attribution and redaction

**Files:** Create `Backend/migrations/002_hr_core.sql`, `Backend/src/utils/redact.js`; Modify `Backend/src/utils/audit.js` (add `setAuditActor`), `Backend/src/modules/audit/service.js`, `Backend/src/modules/audit/controller.js`. Tests: `Backend/tests/unit/redact.test.js`, `Backend/tests/db/audit-trigger.test.js`, additions to `Backend/tests/api/audit.test.js`.

**Interfaces:**
- SQL: `contract_status_enum('CHO_KY','HIEU_LUC','HET_HAN','DA_CHAM_DUT')`; `contracts(id VARCHAR(30) PK 'CT-…', employee_id FK, contract_no UNIQUE, type contract_type_enum, start_date, end_date NULL, salary NUMERIC(12,2) >= 0, status, file_url, signed_at, note, created_at, updated_at, CHECK(end_date IS NULL OR end_date >= start_date))`; partial unique index one `HIEU_LUC` per employee; `employees.termination_reason TEXT`; sequences `seq_contract_id`, `seq_emp_code` (start 5000); seed one `HIEU_LUC` contract per existing non-terminated employee; new `fn_audit_trail()` = strips `face_encoding`, fills `user_id`/`employee_id` from `current_setting('app.user_id', true)` / `app.employee_id`.
- `redact.redactAuditValues(values, roleCode) -> values` — always replaces `face_encoding`, `password_hash`, `token_hash`; additionally for role `ADMIN` replaces the six sensitive employee fields with `"[REDACTED]"` (any depth).
- `audit.setAuditActor(client, actor)` — `SELECT set_config('app.user_id', …, true)` so the trigger attributes writes made in that transaction.

Tests: redact unit cases (nesting, arrays, non-objects, ADMIN vs CEO); trigger test (update an employee inside a transaction with `setAuditActor` → audit row has `user_id`, and `new_values` has no `face_encoding` key even when the row has one); audit reader as ADMIN never shows `base_salary`/`citizen_id` while CEO sees `base_salary`; seeded contracts exist (one active per active employee).

### Task 2: Employees module rewrite (list/detail/create/update) with access shaping

**Files:** Create `Backend/src/modules/employees/{controller,service,schema,access}.js`; Modify `routes.js`, matrix (`employee.read` scopes: CEO/HRD `all`, LINE_MANAGER `department`, EMPLOYEE `self`, ADMIN `all`). Tests: `Backend/tests/unit/employeeAccess.test.js`, `Backend/tests/api/employees.test.js`.

**Interfaces:** `access.shapeEmployee(row, user) -> row` (drops `face_encoding` always; drops the six sensitive fields unless `CEO`/`HR_DIRECTOR` or `row.id === user.employeeId`); `access.canViewEmployee(user, row) -> boolean` (`all`: yes; `department`: same department or self; `self`: self).
Endpoints (paths unchanged): `GET /api/employees`, `GET /api/employees/:id`, `POST /api/employees` (optional `id`, auto `NV-<seq>`; creates the initial `HIEU_LUC` contract), `PUT /api/employees/:id` (partial; `status: DA_NGHI_VIEC` refused — use offboarding; manager/department/position must exist).

Tests: LM list scoped to own department without sensitive fields but with own salary; LM detail of another department 403; EMPLOYEE self only; CEO/HRD detail has sensitive fields and never `face_encoding` (row seeded with one); validation matrix for create (email, CCCD 9/12 digits, dates, unknown department/position/manager → 404, duplicate id/email → 409, auto id, initial contract created); PUT partial update, cannot set terminated status, cannot manage self, null manager clears it; trigger audit row carries the actor.

### Task 3: Offboarding and bulk import

**Files:** Create `Backend/src/modules/employees/{offboard,import}.js` (service helpers) and extend controller/routes/schema/matrix (`employee.offboard`, `employee.import`: CEO/HRD). Tests in `Backend/tests/api/employees-lifecycle.test.js`.

**Interfaces:** `POST /api/employees/:id/offboard {terminationDate, reason, note?}` and `POST /api/employees/import {rows: [...], dryRun?: boolean}` (1..500 rows; per-row savepoint; response `{created, failed:[{row, code, message}]}`).

Tests: offboard happy path (employee terminated with date and reason; user deactivated; refresh tokens revoked; active contract `DA_CHAM_DUT` with end date; department manager cleared); already terminated 409; self 400; unknown 404; missing reason / bad date 400; EMPLOYEE/LM 403. Import: mixed valid/invalid rows report per-row errors and keep the valid ones; `dryRun` inserts nothing; duplicate email inside the batch and against the DB flagged; 0 or 501 rows 400; auto ids assigned; access 403 for non-HR.

### Task 4: Contracts module

**Files:** Create `Backend/src/modules/contracts/{routes,controller,service,schema}.js`; Modify matrix (`contract.read`: CEO/HRD `all`, EMPLOYEE `self`; `contract.manage`: CEO/HRD) and `Backend/src/app.js`. Tests `Backend/tests/api/contracts.test.js`.

**Endpoints:** `GET /api/employees/:id/contracts`, `POST /api/employees/:id/contracts` (activating a new one closes the previous active with `DA_CHAM_DUT` and `end_date = start_date - 1 day`; syncs `employees.base_salary` and `contract_type`), `GET /api/contracts/:id`, `PUT /api/contracts/:id` (fileUrl, signedAt, note, endDate, salary — salary edits on the active contract sync the employee), `POST /api/contracts/:id/terminate {terminationDate?, note?}`.

Tests: create/close/sync; only one active (concurrent-safe via the partial unique index); self can read own, not others; LM 403; date and salary validation; duplicate contract number 409; auto contract number; terminate; unknown ids 404.

### Task 5: Docs, review fixes, wrap-up

Update `catalog.js`, `openapi.yaml` (employees, contracts, offboarding, import), README; run a fresh whole-branch review of Phases 1–2 and fix Critical/Important findings by TDD; push `main` to `fork`.

## Definition of Done

- `npm test --prefix Backend` green; smoke test green; migration applied to the dev DB.
- Review Focus items each covered by a test; OpenAPI test extended to `employees` and `contracts`.
