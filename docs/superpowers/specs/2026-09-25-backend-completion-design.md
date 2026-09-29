# NEXUS HRMS Backend Completion — Design Spec

Date: 2026-09-25
Status: Draft, awaiting user review
Language note: spec and plan are written in English per the user's global instruction; API messages returned to clients stay Vietnamese as they are today.

## 1. Goal

Deliver a complete backend that matches the designed database (20 existing tables plus new tables listed below), with full authentication, role-based authorization, and documented REST APIs, so the frontend team can replace mock data with real data and adapt the frontend afterwards.

Success criteria:
1. Every table has an API path for the operations the frontend needs (full CRUD only where the UI needs it; read-mostly lookups stay read-only).
2. Authentication covers login, refresh, logout, change password, admin password reset, lockout.
3. Authorization is enforced by one central policy matrix, including data scope (self / department / all) and sensitive-field filtering.
4. Automated integration tests pass on a dedicated test database.
5. `Backend/docs/openapi.yaml` describes every endpoint, request, response and error code.
6. Existing route paths and response shapes keep working (`{ success, data, pagination? }`) so the current frontend does not break.

## 2. Confirmed decisions (from brainstorming)

- Architecture: keep Express + `pg`, no ORM. Layered modules, zod validation, central error handler, policy matrix, SQL migrations, integration tests. (Approach A.)
- AI Analytics is backed by new tables, not mock data.
- New-table scope: AI Analytics + employment contracts + OT requests + medical claims + company notices + handbook.
- Frontend is NOT modified in this work. It is adapted later using the OpenAPI document.
- Existing SQL triggers/functions (`fn_calc_attendance`, `fn_update_leave_balance`, `fn_audit_trail`, `fn_task_stage_log`, `fn_calculate_payslip`, `fn_search_employees`) are kept and reused.

Out of scope: WebSocket real-time chat (REST persistence of messages only), email sending, real file upload (URLs are stored only). Attendance uses short-lived QR codes, not face recognition (user decision, 2026-09-25).

## 3. Known defects to fix

- `GET /api/employees` only strips `base_salary`, `citizen_id`, `bank_account`, `bank_name` for `EMPLOYEE`. `LINE_MANAGER` still receives them. Must be restricted per section 6.
- `users.role_code` (enum includes `ADMIN`) vs `user_roles` N:N table: two sources of truth. `users.role_code` becomes authoritative; `user_roles` is kept in sync only.
- Access token currently lives 24h with no refresh or revocation.

## 4. Architecture

```
Backend/
  server.js                 thin entry: builds app, listens
  src/
    app.js                  express app assembly (testable without listening)
    config/                 env.js, db.js (pg pool, transaction helper)
    middleware/             authenticate, authorize, validate, errorHandler, rateLimit
    policies/               permission matrix + scope resolvers
    modules/<domain>/       routes.js, controller.js, service.js, schema.js (zod)
    utils/                  AppError, asyncHandler, pagination, audit
  migrations/               NNN_name.sql, applied in order
  scripts/migrate.js        migration runner (schema_migrations table)
  docs/openapi.yaml
  tests/                    node:test + supertest
```

Rules:
- Controller: parse and validate input, call service, shape response. No SQL.
- Service: business rules and SQL. Multi-table writes use a transaction helper.
- Errors: throw `AppError(status, code, message, details?)`. Error body: `{ success:false, code, message, details? }`.
- Every write records `audit_logs` (user, action, table, record, old/new values, ip, user agent).
- List endpoints share pagination: `?page&limit` (default 1/50, max 200), response `pagination:{total,page,limit,totalPages}`.
- Old `routes/*.js` files are migrated module by module; their URL paths are preserved.

## 5. Database changes (migrations)

`schema_migrations(name PRIMARY KEY, applied_at)` tracks applied files. `npm run migrate` applies pending ones. Migrations include demo seed rows so a fresh database is usable. `database/schema.sql` stays the base layer; migrations run on top.

New enum types as needed: `ot_stage_enum`, `claim_status_enum`, `contract_status_enum`, `pip_status_enum`, `notice_category_enum`.

| Table | Purpose | Key columns |
|---|---|---|
| `refresh_tokens` | Session refresh and revocation | id UUID, user_id FK, token_hash, expires_at, revoked_at, replaced_by, ip, user_agent, created_at |
| `contracts` | Employment contracts and history | id, employee_id FK, contract_no UNIQUE, type (`contract_type_enum`), start_date, end_date, salary, status, file_url, signed_at, note |
| `ot_requests` | Overtime registration | id, employee_id FK, work_date, start_time, end_time, hours, reason, stage, approver_id FK, reviewed_at, reject_reason |
| `medical_claims` | Medical reimbursement | id, employee_id FK, claim_date, amount, hospital, description, attachment_url, status, reviewed_by FK, reviewed_at, reject_reason |
| `company_notices` | Internal notices | id, title, content, category, priority, author_id FK, target_role, target_department_id FK, is_pinned, published_at, expires_at |
| `handbook_docs` | Handbook articles | id, title, category, content, version, is_active, updated_by FK, updated_at |
| `performance_reviews` | Feeds 9-box | id, employee_id FK, period (e.g. `2026-Q3`), reviewer_id FK, performance_score, potential_score, nine_box_cell 1..9, comments, created_at; UNIQUE(employee_id, period) |
| `pip_plans` | Performance improvement plans | id, employee_id FK, created_by FK, start_date, end_date, goals JSONB, status, outcome, created_at |

Constraints: CHECK on score ranges, `end_date >= start_date`, `hours > 0`, `amount >= 0`, `nine_box_cell BETWEEN 1 AND 9`. Indexes on all FKs and on `(employee_id, work_date)` for OT. `updated_at` uses the existing `fn_update_timestamp` trigger where the table has that column. Financial and PII columns are never logged in `audit_logs` new_values in plain form beyond what the existing `fn_audit_trail` already does.

Turnover risk has no table. It is computed on demand from existing data: OT hours trend (`attendance_logs`), salary vs average of the same position (`employees`), months since last position/contract change (`contracts`), latest `performance_reviews`, abnormal leave. The scoring rule lives in one service function with unit tests.

## 6. Authentication and authorization

Authentication:
- `POST /auth/login` returns `{ accessToken, refreshToken, user }` and, for backward compatibility, also `token` (same value as `accessToken`).
- Access token: JWT, 30 minutes. Refresh token: opaque random string, 7 days, stored hashed, rotated on every use; reuse of a rotated token revokes the whole chain.
- `POST /auth/refresh`, `POST /auth/logout` (revokes current refresh token), `GET /auth/me`, `POST /auth/change-password`.
- `POST /users/:id/reset-password` (CEO/HR_DIRECTOR): sets a temporary password and `must_change_password` flag. Requires adding that column to `users` in a migration; login returns the flag.
- Lockout: 5 failed attempts lock the account for 15 minutes (existing behavior kept).
- Passwords: bcryptjs, cost 10; minimum policy enforced by zod (length >= 8, mixed characters).
- Hardening: `helmet`, rate limit on `/auth/login` and `/auth/refresh`, CORS origins from env, body size limit.

Authorization:
- `policies/` holds a matrix `resource.action -> { roles, scope }`. Scope values: `self`, `department`, `all`. Routes call `authorize('leave.approve')`; scope resolvers turn the scope into SQL predicates. No inline role checks in controllers.
- Roles: `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE`, `KIOSK`, `ADMIN`. `KIOSK` may only scan QR codes (`POST /attendance/kiosk/punch`) and manage its own login. `ADMIN` is a technical role for user support and audit logs: it can only create/manage EMPLOYEE, LINE_MANAGER and KIOSK accounts, and never sees payroll or personal data (also redacted in the audit log).
- Sensitive fields (`base_salary`, `citizen_id`, `bank_account`, `bank_name`, `date_of_birth`, `address`, contract salary): visible to the record owner, `HR_DIRECTOR`, `CEO`. `LINE_MANAGER` sees own department members without those fields. `face_encoding` is never returned.
- Leave approval chain: employee → `LINE_MANAGER` → `HR_DIRECTOR`. Requests from `LINE_MANAGER` and from `HR_DIRECTOR` are approved directly by `CEO`. A user can never approve their own request. OT and medical claims use the same chain.
- Payroll: `CEO`/`HR_DIRECTOR` manage periods; every employee, including a `LINE_MANAGER`, reads only their own payslips and only after the period is locked (the manager has no access to anyone else's payroll). `ADMIN` and `KIOSK` have none.

## 7. API surface (target ~90 endpoints, 13 modules)

Existing paths are kept. New/extended endpoints per module:

1. **auth**: login, refresh, logout, me, change-password.
2. **users** (CEO/HRD/ADMIN): list, get, create, update role/active, reset-password, unlock.
3. **departments**: list, get, create, update, deactivate, employees; set manager.
4. **positions**: list, create, update, deactivate (Job Title modal).
5. **employees**: list, get (profile 360), create (onboarding), update, offboarding (`POST /employees/:id/offboard`), bulk import (`POST /employees/import`, JSON rows), sensitive-field filtering.
6. **contracts**: list by employee, get, create, update, terminate.
7. **attendance**: check-in, check-out, me/today, list, manual adjustment (HRD), kiosk check-in, monthly timesheet matrix (`GET /attendance/timesheet?month=`), late/absence report, live logs.
8. **leaves**: types, balances, create, list, get, approve, reject, cancel, leave calendar; **OT** (`/leaves/ot` or `/ot-requests`): create, list, approve, reject; **medical claims** (`/medical-claims`): create, list, approve, reject.
9. **payroll**: periods (list/create), calculate, lock, mark transferred, payslips list/get, me, anomalies report (OT over legal limit, unapproved items), bank-transfer batch export (JSON).
10. **projects**: projects CRUD, tasks CRUD, stage change, task logs; **squads**: list, members add/remove, messages list/post.
11. **notifications**: list, unread count, mark read, mark all read, create (HRD/CEO), delete own.
12. **notices and handbook**: notices CRUD (HRD/CEO write, all read by target), handbook docs CRUD (HRD write, all read).
13. **analytics**: dashboard stats (extended), department scores, performance reviews CRUD, nine-box distribution and employees per cell, turnover-risk list and detail, PIP plans CRUD, audit logs list (CEO/ADMIN).

Each endpoint is declared in `openapi.yaml` with request schema, response schema, required role/scope and error codes.

## 8. Phasing

Each phase is releasable and fully tested before the next starts.

| Phase | Content |
|---|---|
| 0 | Foundation: `src/` layout, config, error/validation/authorization middleware, policy matrix, migration runner, test harness and test DB, move existing routes without behavior change |
| 1 | Auth hardening and admin: refresh/logout, `refresh_tokens`, `must_change_password`, users, departments, positions, audit logs |
| 2 | HR core: employees complete + offboarding + import, contracts, sensitive-field filtering fix |
| 3 | Time and money: attendance extensions, leaves, OT, medical claims, payroll lock/transfer/anomalies |
| 4 | Work and insight: projects/tasks/squads extensions, notifications, notices, handbook, analytics (reviews, PIP, turnover risk, 9-box) |

## 9. Testing

- Runner: `node:test` with `supertest`, `npm test`. Test DB `nexus_hrms_test` is created in the existing Docker Postgres; setup applies `schema.sql`, all migrations and seed, and truncates between suites.
- Each module tests: 401 without token, 403 for a disallowed role, scope filtering (self/department/all), 400 on invalid input, success path, and audit log written for writes.
- Dedicated tests: sensitive-field filtering per role, leave approval chain including CEO direct approval and self-approval rejection, refresh rotation and reuse detection, lockout, turnover-risk scoring, payroll lock immutability, DB triggers (attendance calc, leave balance).
- Existing `scripts/smoke-test.js` keeps working against a running server.
- Definition of done per phase: tests green, OpenAPI updated, `GET /api` listing updated, no regression in smoke test.

## 10. Delivery and constraints

- All work stays local. No `git push`. Commits are made only when the user asks.
- Frontend files are not modified. Frontend adaptation (token refresh flow, new endpoints, removal of mocks) is a separate follow-up driven by `openapi.yaml`.
- Environment: PostgreSQL 16 in Docker container `nexus-hrms-pg` (127.0.0.1:5432), Node 22, Backend on port 8000.

## 11. Risks

- Scope size (~90 endpoints, 8 tables). Mitigation: phase gating and tests per phase; low-value CRUD skipped unless a frontend screen needs it.
- Token lifetime change (24h to 30m) breaks the current frontend until it adopts refresh. Mitigation: backward-compatible `token` field and a configurable `JWT_EXPIRES_IN`; the frontend adopts refresh in the follow-up.
- Turnover-risk scores are heuristic, not ML. Mitigation: rules documented and unit-tested; results labeled as indicative.
- Migration on existing data. Mitigation: migrations are additive (new tables/columns), never destructive.
