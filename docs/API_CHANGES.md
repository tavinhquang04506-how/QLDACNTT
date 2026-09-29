# API changes for the frontend team

The backend was completed in five phases (see `docs/superpowers/specs/2026-09-25-backend-completion-design.md`).
The frontend has **not** been changed. This file lists everything that behaves differently from the API the
frontend was written against, and how the mock-driven pages map to real endpoints. Full reference:
`Backend/docs/openapi.yaml`.

## 1. Breaking or behaviour-changing points

| Area | Change | What the frontend must do |
| :--- | :--- | :--- |
| Login | `POST /auth/login` now also returns `accessToken`, `refreshToken`, `expiresIn`, `mustChangePassword`. `token` is kept (same value as `accessToken`). | Store the refresh token; when a call returns 401 call `POST /auth/refresh` once, retry, otherwise go to the login page. Send the user to a "change password" screen when `mustChangePassword` is true. |
| Token lifetime | Default access token lifetime is 30 minutes (`JWT_EXPIRES_IN`). The local `.env` still says 24h so nothing breaks until the frontend refreshes tokens. | Implement refresh, then set `JWT_EXPIRES_IN=30m`. Serialize refresh calls: a refresh token is single-use and replaying one revokes the whole session. |
| Accounts | Every request re-checks the account: a deactivated/offboarded user gets 401 `ACCOUNT_DISABLED` immediately; role changes apply at once. | Treat 401 as "log in again". |
| Errors | Bodies are `{ success:false, code, message, details? }` (a `code` was added). 403 for a missing role no longer has `required`; the allowed roles are in `details`. Validation errors are 400 `VALIDATION_ERROR` with `details:[{path,message}]`. | Branch on `code`, not on message text. |
| Dates | `DATE` columns (`start_date`, `work_date`, `joined_date`, ...) are now `"YYYY-MM-DD"` strings. Before, they were UTC timestamps one day off in Vietnam. | Stop calling `new Date(x)` on them for display; format the string. Timestamps (`check_in_time`, `created_at`, ...) stay ISO 8601 UTC. |
| Lists | List endpoints are paginated (`?page&limit`, response `pagination`). Defaults: 50 (notifications/notices 30, payslips 100); maximums 100-500. Out-of-range values are clamped, not rejected. | Read `pagination.totalPages` instead of assuming one page. |
| Time zone | The company time zone is Asia/Ho_Chi_Minh. "Today", the 08:00 late threshold and month filters use it. | Nothing, but do not compute "today" from the browser's UTC date. |
| Sensitive data | `base_salary`, `citizen_id`, `bank_account`, `bank_name`, `date_of_birth`, `address`, `termination_reason` are returned only to the record's owner, HR_DIRECTOR and CEO. `face_encoding` is never returned. A LINE_MANAGER sees only their department. `GET /departments*` hides `budget_yearly` from everyone but CEO/HR_DIRECTOR. | Hide those fields/columns when they are absent (do not show 0 or blank). |
| KIOSK accounts | A KIOSK login can only call `POST /attendance/kiosk/punch`, `GET /auth/me` and `POST /auth/change-password`. | Kiosk screen only. |
| Attendance | Identification is **QR code**, not face recognition. Methods: `gps`, `manual`, `qr`, `kiosk` (`face_id` and `faceConfidence` are rejected). | Employee screen: `GET /attendance/qr` every ~50 s and render it as a QR code. Kiosk: scan and `POST /attendance/kiosk/punch { qrToken }` (first scan of the day = check-in, second = check-out). |
| Leave | Approval chain: employee -> department manager -> HR_DIRECTOR; requests of a manager/HR_DIRECTOR are approved only by the CEO; a CEO request is approved on submit; nobody acts on their own request. `PATCH approve/reject/cancel` now return the updated request in `data`. Overlapping requests -> 409 `LEAVE_OVERLAP`; not enough days -> 409 `INSUFFICIENT_BALANCE`. `totalDays` is optional (weekdays are computed). | Show `code`-specific messages; hide approve buttons the caller cannot use (`403`). |
| Payroll | A locked (`DA_CHOT`) or paid period cannot be recalculated (409 `PERIOD_LOCKED`). Employees see their payslips only after the period is locked. LINE_MANAGER sees only their own payslip. Personal income tax is progressive. `POST /calculate` no longer trusts the client for anything but `period`. | Add lock/transfer/anomaly screens (`/payroll/periods/:id/...`). |
| Projects | Visibility is scoped (an employee sees projects they take part in). Ids are `PRJ-<n>` / `TSK-<n>` from sequences. Task stage changes follow a workflow (409 `INVALID_TRANSITION`, 403 `SELF_REVIEW`). Project `progress` is computed from tasks. | Use `POST /tasks/:id/review` for acceptance; render `GET /tasks/:id/logs`. |
| Dashboard | `GET /dashboard/stats` returns `{ scope, overview, departmentStats, pendingLeaves }` and is live (no materialized view). `scope` is `company`, `department` or `self`; the `self` overview has different fields. `present_today` counts everyone who checked in (was: on-time only). | Render by `scope`. |
| Notifications | `GET /dashboard/notifications` still works; prefer `GET /notifications` (filters, paging, per-user read state) plus `unread-count`, `PATCH /:id/read`, `POST /read-all`. Approval flows create notifications automatically. | Poll `unread-count`. |

## 2. Mock data -> endpoint map

| Page / modal | Endpoints |
| :--- | :--- |
| Page1 Login | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/change-password` |
| Page2 Dashboard, 2A late/absence, 2C live logs | `GET /dashboard/stats`, `GET /attendance/exceptions`, `GET /attendance/live` |
| Page3 Employee portal, 3A OT, 3B notices, 3C payslip, 3D handbook | `GET /payroll/me`, `GET /payroll/payslips/:id`, `POST /ot-requests`, `GET /notices`, `GET /handbook`, `GET /leaves/balances/me` |
| Page4 Directory, 4A onboarding, 4B profile 360, 4C import, 4D offboarding, 4E/4F departments and job titles, 4G contract | `GET /employees`, `POST /employees`, `GET /employees/:id`, `POST /employees/import`, `POST /employees/:id/offboard`, `/departments`, `/positions`, `GET /employees/:id/contracts` |
| Page5 Attendance, 5A kiosk, 5B timesheet matrix, 5C snapshot logs | `GET /attendance`, `GET /attendance/qr`, `POST /attendance/kiosk/punch`, `GET /attendance/timesheet`, `POST /attendance/adjust` |
| Page6 Leave, 6A calendar, 6B medical claim, 6C rejection, 6D create, 6E detail | `GET /leaves`, `GET /leaves/calendar`, `POST /medical-claims`, `PATCH /leaves/:id/reject`, `POST /leaves`, `GET /leaves/:id` |
| Page7 Payroll, 7A anomalies, 7B bank transfer, 7C lock | `GET /payroll/periods`, `GET /payroll/periods/:id/anomalies`, `GET /payroll/periods/:id/bank-transfer`, `POST /payroll/periods/:id/lock` and `/transfer`, `POST /payroll/calculate` |
| Page8 AI analytics, 8A risk, 8C PIP, 8D 9-box | `GET /analytics/summary`, `/analytics/turnover-risk[/:employeeId]`, `/analytics/pip`, `/analytics/nine-box`, `/analytics/department-scores`, `/analytics/reviews` |
| Page9 Projects/tasks, squad chat | `GET /projects`, `GET /projects/:id/tasks`, `PATCH /tasks/:id/stage`, `POST /tasks/:id/review`, `GET /squads`, `GET/POST /squads/:id/messages` |
| Notification center | `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `POST /notifications/read-all` |
| Settings | `POST /auth/change-password`, `GET /users` (admin) |

## 3. Demo accounts

`ceo@fwbnexus.vn / Ceo@123456`, `hrd@fwbnexus.vn / Hrd@123456`, `lead@fwbnexus.vn / Lead@12345`,
`employee@fwbnexus.vn / Emp@123456`. Create a KIOSK account with `POST /users` (role `KIOSK`, no employee needed).

## 4. Operations

- Migrations: `npm run migrate --prefix Backend` (files in `Backend/migrations`, applied in order, each in a transaction).
- Tests: `npm test --prefix Backend` recreates `nexus_hrms_test` and runs every suite; `npm run test:unit` needs no database.
- Environment: `Backend/.env.example` lists every variable (`JWT_EXPIRES_IN`, `TRUST_PROXY`, `APP_TIMEZONE`, `PUNCH_MIN_GAP_SECONDS`, `CORS_ORIGINS`, `DB_NAME_TEST`).
