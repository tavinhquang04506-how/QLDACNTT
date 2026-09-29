# Backend Phase 4 — Work and Insight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, TDD; the user pre-authorized continuous execution and pushing `main` to remote `fork`).

**Goal:** Finish the remaining modules: projects/tasks/squads with scoped access and a real review workflow, notifications wired to the approval flows, company notices and handbook, and analytics (performance reviews, 9-box, turnover risk, PIP plans, dashboard statistics).

**Architecture:** Same layered modules. Migration `005_work_and_insight.sql` adds `notification_reads`, `company_notices`, `handbook_docs`, `performance_reviews`, `pip_plans`, id sequences for projects/tasks/squads, and replaces `fn_task_stage_log` so task logs carry the acting employee. A small `utils/notify.js` writes notifications inside the caller's transaction. Turnover risk is computed on demand (no table) by a pure scoring function with unit tests.

**Tech Stack:** Node 22, Express 4, `pg`, `zod`, `node:test`, `supertest`.

**Spec:** `docs/superpowers/specs/2026-09-25-backend-completion-design.md` (sections 5, 7 modules 10–13, 8 Phase 4).

## Global Constraints

- Existing paths and response shapes stay valid (`/api/projects`, `/api/projects/:id/tasks`, `PATCH /api/projects/tasks/:id/stage`, `/api/projects/squads`, `/api/dashboard/stats`, `/api/dashboard/notifications`).
- Visibility: CEO and HR_DIRECTOR see all projects; LINE_MANAGER those of their department or that they manage; EMPLOYEE only projects they take part in (manager, task assignee/creator, squad member). KIOSK has no access (auth middleware).
- Task workflow: the assignee (or the project manager, CEO, HR_DIRECTOR) moves `todo -> in_progress -> review`; only the reviewer side (project manager, task creator, CEO, HR_DIRECTOR — never the assignee alone) moves `review -> done` or back to `in_progress` with a review note; only the project manager, CEO or HR_DIRECTOR reopen a `done` task. Moving to `done` sets progress 100; project progress is the average of its task progress.
- Analytics data (`performance_reviews`, `pip_plans`, turnover risk) is sensitive: CEO and HR_DIRECTOR see everything, LINE_MANAGER only their department, EMPLOYEE only their own review results (never the risk score or PIP internals of others). ADMIN and KIOSK have no access.
- Notifications: a user sees notifications addressed to them or to their role; read state is per user.
- Every write is audited (`writeAudit`; trigger tables use `setAuditActor`).
- Do not modify `FrontEnd/` or `database/schema.sql`.

## Review Focus

1. Project/task visibility and mutation rights (an EMPLOYEE must not see or move tasks of projects they are not part of; nobody accepts their own deliverable).
2. Notification read state must be per user for role-addressed notifications; a user must not read or mark another user's notification.
3. Turnover-risk and PIP data must not be readable by ADMIN, KIOSK, the employee concerned (risk score), or other departments' managers.
4. Company notices targeted at a role or department must not appear for other audiences.
5. Deleting a project with tasks, removing the only squad lead, and squad chat by non-members must be refused.
6. Scoring of turnover risk must be deterministic and bounded (0-100), with each signal explained.

---

### Task 1: Migration 005, projects and tasks
Files: `Backend/migrations/005_work_and_insight.sql`; `Backend/src/modules/projects/{controller,service,schema}.js`, `Backend/src/modules/tasks/*`; matrix. Tests `tests/api/projects.test.js`, `tests/api/tasks.test.js`.
Endpoints: `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/:id`, `GET/POST /api/projects/:id/tasks`, `GET/PUT/DELETE /api/tasks/:id`, `PATCH /api/tasks/:id/stage` and the legacy `PATCH /api/projects/tasks/:id/stage`, `POST /api/tasks/:id/review {decision, note}`, `GET /api/tasks/:id/logs`.

### Task 2: Squads and squad chat
Files: `Backend/src/modules/squads/*`. Endpoints: `GET/POST /api/squads` (+ legacy `/api/projects/squads`), `GET/PUT/DELETE /api/squads/:id`, `POST/DELETE /api/squads/:id/members`, `GET/POST /api/squads/:id/messages`. Rules: members/lead/HR/CEO read and post; the lead cannot be removed as a member; message length limit; `since` cursor for polling.

### Task 3: Notifications
Files: `Backend/src/modules/notifications/*`, `Backend/src/utils/notify.js`; wire into leaves, OT and medical creation/decision. Endpoints: `GET /api/notifications`, `GET /api/notifications/unread-count`, `PATCH /api/notifications/:id/read`, `POST /api/notifications/read-all`, `DELETE /api/notifications/:id`, `POST /api/notifications` (CEO/HRD broadcast or targeted); keep `GET /api/dashboard/notifications`.

### Task 4: Company notices and handbook
Files: `Backend/src/modules/notices/*`, `Backend/src/modules/handbook/*`. Notices: CRUD (CEO/HRD write), audience by role/department/all, pinned and expiry, unread ordering; handbook: CRUD with versioning (CEO/HRD write, everyone reads active docs).

### Task 5: Analytics and dashboard
Files: `Backend/src/modules/analytics/*`, `Backend/src/modules/dashboard/*`. Endpoints: `/api/analytics/reviews` CRUD, `/api/analytics/nine-box`, `/api/analytics/turnover-risk` (+ `/:employeeId`), `/api/analytics/department-scores`, `/api/analytics/pip` CRUD; `GET /api/dashboard/stats` rewritten without materialized-view refresh and scoped by role. Pure `risk.js` scoring with unit tests.

### Task 6: Docs, review fixes, wrap-up
Catalog, OpenAPI (with structural test), README, `docs/API_CHANGES.md` for the frontend team, fresh review of Phase 4 and test-first fixes, push `main` to `fork`.

## Definition of Done
- `npm test --prefix Backend` green; smoke test green; all migrations applied to the dev DB.
- Every Review Focus item covered by a test; OpenAPI test extended to all new modules.
