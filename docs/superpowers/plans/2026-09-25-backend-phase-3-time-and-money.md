# Backend Phase 3 — Time and Money Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, TDD; the user pre-authorized continuous execution and pushing `main` to remote `fork`).

**Goal:** Finish attendance, leave, overtime, medical-claim and payroll APIs with correct time-zone handling, a single tested approval chain, scoped access, and a payroll lifecycle (calculate, lock, transfer, anomalies, bank export).

**Architecture:** Same layered modules. A shared pure module `src/modules/approvals/chain.js` decides who may approve/reject a request at a given stage; leaves, OT requests and medical claims all use it. Payroll gets a pure `tax.js` (progressive PIT) plus a `service.js` with an explicit period state machine `DU_THAO -> DA_CHOT -> DA_CHUYEN_KHOAN`. Migration `003_time_and_money.sql` adds `ot_requests`, `medical_claims` and a leave-id sequence and pins the database time zone behavior.

**Tech Stack:** Node 22, Express 4, `pg`, `zod`, `node:test`, `supertest`.

**Spec:** `docs/superpowers/specs/2026-09-25-backend-completion-design.md` (sections 5, 6 leave chain and payroll rules, 7 modules 7–9, 8 Phase 3).

## Global Constraints

- Existing paths and response shapes stay valid (`{success, data}`; rows snake_case; input accepts both camelCase and snake_case on the legacy leave create endpoint).
- Company time zone is `Asia/Ho_Chi_Minh` (config `APP_TIMEZONE`). "Today", the 08:00 late threshold and month boundaries are evaluated in that zone (pool sets `timezone` on every connection). Tests use fixed dates where they can and the DB `CURRENT_DATE` otherwise.
- Approval chain: employee -> LINE_MANAGER (same department) -> HR_DIRECTOR. Requests from LINE_MANAGER and HR_DIRECTOR skip to the last step and are approved only by the CEO. A CEO's own request is approved automatically. CEO can approve any pending step directly. Nobody approves their own request. Applies to leaves, OT requests and medical claims.
- Payroll access: only CEO and HR_DIRECTOR read or run payroll; an EMPLOYEE reads only their own payslips and only after the period is locked (`DA_CHOT` or `DA_CHUYEN_KHOAN`); LINE_MANAGER has no payroll access. A locked or transferred period can never be recalculated.
- Every write records an audit row (`writeAudit`; DB-trigger tables use `setAuditActor`).
- Do not modify `FrontEnd/` or `database/schema.sql`.

## Review Focus

1. "Today"/late minutes/month filters must be correct around midnight and for 08:00 Vietnam time (not UTC).
2. A LINE_MANAGER must not approve or reject a request outside their department, their own request, or a request of another manager/HRD.
3. Leave balance must never go negative; approving more days than remain returns a clear 409, not a 500; cancelling an approved leave refunds via the trigger.
4. Overlapping leave requests for the same employee must be refused.
5. `POST /payroll/calculate` on a locked/transferred period must be refused and must not delete payslips.
6. Payslips of a draft period must not be visible to the employee; LINE_MANAGER must not see any payslip.
7. Kiosk endpoints must be usable only by KIOSK/HR roles; a QR token is single-use, short-lived, and unusable as an access token; an employee can never clock in for someone else.

---

### Task 1: Time zone and attendance

**Files:** Modify `Backend/src/config/env.js` (`timezone`), `Backend/src/config/db.js` (pool `options: -c timezone=...`), `Backend/src/modules/attendance/routes.js` (rewritten to controller/service/schema), matrix; Create `Backend/src/modules/attendance/{controller,service,schema}.js`. Tests: `Backend/tests/db/timezone.test.js`, `Backend/tests/api/attendance.test.js`.

**Endpoints:** keep `POST /check-in`, `POST /check-out`, `GET /`, `GET /me/today`; add `GET /qr` (the caller's short-lived QR token, 60 s, signed with a key derived from the JWT secret so it can never act as an access token) and `POST /kiosk/punch {qrToken}` (KIOSK/HR; token is single-use; first punch of the day is check-in, second is check-out, third 409; method is recorded as `qr`), `PUT /` style adjustment `POST /adjust {employeeId, workDate, checkIn?, checkOut?, status?, note}` (CEO/HRD upsert), `GET /timesheet?month&department`, `GET /exceptions?date` (late and absent), `GET /live` (latest punches today).
**Rules:** attendance is QR-based, not face-based: accepted methods are `gps`, `manual`, `qr`, `kiosk` (`face_id` and `faceConfidence` are no longer accepted), validation (method enum, GPS ranges), scope (`self` / `department` / `all`), user without an employee link gets 403 on self punches, check-out before check-in refused, `work_date` from the company time zone.

### Task 2: Approval chain and leaves

**Files:** Create `Backend/src/modules/approvals/chain.js`, `Backend/migrations/003_time_and_money.sql`, `Backend/src/modules/leaves/{controller,service,schema}.js`; Modify `routes.js`, matrix. Tests `Backend/tests/unit/approvalChain.test.js`, `Backend/tests/api/leaves.test.js`.

**Interfaces:** `chain.initialStage(requesterRole) -> {stage, autoApprove}`; `chain.decide({stage, requesterRole, requesterId, requesterDepartmentId, actorRole, actorId, actorDepartmentId}) -> {ok:true, next:'CHO_HR_PHE_CHUAN'|'DA_PHE_DUYET'} | {ok:false, reason}`; same function used to authorize reject.
**Endpoints:** keep all existing leave routes; add `GET /leaves/:id`, `GET /leaves/calendar?month`; `GET /leaves` gains `employeeId`, pagination and scope.
**Rules:** date validation and overlap refusal, `totalDays` must be a multiple of 0.5 and not exceed the calendar span, balance check at submit and at approval (409 `INSUFFICIENT_BALANCE`), leave id from `seq_leave_id` (no COUNT race), inactive leave type refused, self-approval refused, CEO auto-approval on submit, cancel by owner (refund via trigger), audit rows.

### Task 3: Overtime requests and medical claims

**Files:** Migration 003 adds `ot_requests` and `medical_claims`; Create `Backend/src/modules/ot/{routes,controller,service,schema}.js`, `Backend/src/modules/medical/{routes,controller,service,schema}.js`; matrix and app wiring. Tests `Backend/tests/api/ot-requests.test.js`, `Backend/tests/api/medical-claims.test.js`.
**Endpoints:** `POST/GET /api/ot-requests`, `GET /api/ot-requests/:id`, `PATCH /api/ot-requests/:id/{approve,reject,cancel}`; same shape under `/api/medical-claims`.
**Rules:** same chain and scopes as leaves; OT hours computed from start/end (0 < hours <= 4 per day, per law limits; no overlap with another active request that day); medical claim amount > 0, optional link to an approved sick leave.

### Task 4: Payroll

**Files:** Create `Backend/src/modules/payroll/{tax.js,service.js,controller.js,schema.js}`; Modify `routes.js`, matrix. Tests `Backend/tests/unit/payrollTax.test.js`, `Backend/tests/api/payroll.test.js`.
**Endpoints:** keep `GET /periods`, `GET /payslips`, `GET /me`, `POST /calculate`; add `GET /periods/:id`, `POST /periods/:id/lock`, `POST /periods/:id/transfer`, `GET /periods/:id/anomalies`, `GET /periods/:id/bank-transfer`, `GET /payslips/:id`.
**Rules:** progressive PIT (`tax.pit(taxableIncome)`), probation employees included, calculate refused unless period is `DU_THAO`, lock needs payslips, transfer needs `DA_CHOT` and every payslip to have a bank account, anomaly report (OT > 40 h/month, OT without an approved OT request, missing bank account, no attendance), bank export sums equal `total_net`.

### Task 5: Docs, review fixes, wrap-up

Update catalog/OpenAPI/README, run a fresh review of Phase 3 and fix Critical/Important findings test-first, push `main` to `fork`.

## Definition of Done

- `npm test --prefix Backend` green; smoke test green; migration applied to the dev DB.
- Every Review Focus item covered by a test; OpenAPI test extended to the new modules.
