# RELEASE BACKLOG & STATUS TRACKER (`b45bd89` → `9c25e85` → `fe918e1` → `f8de997` → `7b5fca3` → `89ab5f5` → `984ac62` → `R48`)

- **Baseline Commits**: `b45bd89` (Plan 10) → `9c25e85` (Review 11) → `fe918e1` (Review 12) → `f8de997` (Review 13) → `7b5fca3` (Review 14) → `89ab5f5` (Review 15) → `984ac62` (Review 16)
- **Implementation Branch**: `bugfix/remediation-r48-cross-process-attachment-locks` (merged into `develop` with `--no-ff`)
- **Primary DB (`nexus_hrms`)**: Preserved untouched (`32` tables, `DEPLOYMENT_PENDING` for migrations `010`/`011` until operator maintenance window)
- **Test DB (`nexus_hrms_test`)**: Verified via `assertSafeTestDatabase` (`current_database() = 'nexus_hrms_test'`, `34` tables, `READY`)
- **Production Attachment Storage (`Backend/storage/notice_attachments`)**: Preserved untouched; all `NODE_ENV=test` runs use run-owned isolated temporary storage (`ALLOWED_TEST_STORAGE_ROOT/<run-dir>`) stamped with `.nexus-test-storage-owner.json` (`CURRENT_TEST_RUN_ID`) and guarded by `assertSafeStorageDir` (`R46`)

---

## 1. Finding `R48` (Report `16-REVIEW-984ac62-VA-NGHIEM-THU-CUOI.md`)

| ID | Priority | Module / Files | Description | Status | Verification Evidence |
|---|---|---|---|---|---|
| **R48** | **P1** | `Backend/src/modules/notices/service.js`, `Backend/scripts/reproduce-r48-before-fix.js`, `Backend/tests/unit/noticeStorageGuard.test.js`, `Backend/tests/api/r46-r47-storage-reconciliation.test.js`, `docs/remediation/OPERATOR_RUNBOOK.md` | Unified cross-process PostgreSQL transaction advisory locking (`pg_try_advisory_xact_lock`) across bind (`create`/`update`/`remove`), TTL cleanup (`cleanupExpiredOrphanAttachments`), storage reconciliation (`reconcileAttachmentStorage`), and staged deletion (`deleteAttachment`):<br>1) Added `runInAttachmentTransaction` and `tryAcquireDbAttachmentLock(client, attachmentId)` so every cleanup, reconciliation, and delete path opens a transaction on a dedicated PostgreSQL client and acquires the exact same `pg_try_advisory_xact_lock(hashtext('nexus_notice_att:' || id))` key used by `create`/`update`/`remove` before reading DB references or unlinking files.<br>2) If an attachment is currently locked by an uncommitted `create`/`update` transaction in another OS process/connection, `cleanupExpiredOrphanAttachments` and `reconcileAttachmentStorage` record `skippedInFlight` and leave the file untouched, while `deleteAttachment` rejects with `409 ATTACHMENT_CONCURRENT_CONFLICT`.<br>3) `create` and `update` re-verify attachment existence and metadata (`prepareVerifiedAttachmentsForNotice`) AFTER acquiring the DB advisory lock so a file deleted before lock acquisition cannot be bound to a committed notice.<br>4) Updated Docker persistence verification requirement in `OPERATOR_RUNBOOK.md` and `FINAL_VERIFICATION.md` from `docker compose restart backend` to container recreation (`docker compose -p nexus-test up -d --force-recreate backend`). | **`FRESH_VERIFIED`** (Offline Unit Tests & Multi-Process / CLI Barrier Integration Tests) | `Backend/tests/unit/noticeStorageGuard.test.js` (`R47 & R48`), `Backend/tests/api/r46-r47-storage-reconciliation.test.js` (`R48`), `docs/remediation/evidence/r48-reproduction-before-fix.log`, `docs/remediation/evidence/r48-backend-unit.log`, `docs/remediation/evidence/r48-backend-full.log` |

---

## 2. Findings `R46–R47` (Report `15-REVIEW-89ab5f5-VA-GATE-CON-LAI.md`)

| ID | Priority | Module / Files | Description | Status | Verification Evidence |
|---|---|---|---|---|---|
| **R46** | **P1** | `Backend/src/modules/notices/service.js`, `Backend/tests/unit/noticeStorageGuard.test.js`, `Backend/tests/api/r46-r47-storage-reconciliation.test.js` | Strict test storage containment, non-inheritance of production env vars, and run-ownership verification (`.nexus-test-storage-owner.json` + `CURRENT_TEST_RUN_ID`) before cleanup | **`FRESH_VERIFIED`** | `Backend/tests/unit/noticeStorageGuard.test.js` (`R46`), `Backend/tests/api/r46-r47-storage-reconciliation.test.js` (`R46`) |
| **R47** | **P1** | `Backend/src/modules/notices/service.js`, `Backend/server.js`, `Backend/scripts/reconcile-attachments.js`, `Backend/package.json`, `package.json`, `docs/remediation/OPERATOR_RUNBOOK.md` | Post-commit crash protection, fail-closed DB reference verification before TTL deletion (`findReferencingNoticeInDb`), operational reconciliation (`server.js` + CLI `npm run attachments:reconcile --prefix Backend`), and idempotent retry handling | **`FRESH_VERIFIED`** | `Backend/tests/unit/noticeStorageGuard.test.js` (`R47`), `Backend/tests/api/r46-r47-storage-reconciliation.test.js` (`R47 Part 1..3`) |

---

## 3. Findings `R01–R45` Summary

| Group | IDs | Summary | Status | Notes / Remaining Conditions |
|---|---|---|---|---|
| **Review 14 (`R41–R45`)** | `R41`–`R45` | Positive clause-level evidence grounding & server-owned templates (`R41`), unified live authorization across `company_notices` and `notifications` (`R42`), rollback-safe `staged -> bound -> deletion-pending` lifecycle (`R43`), environment-isolated storage + Nginx `10m` proxy limit + Docker volume (`R44`), expanded browser E2E behavioral checks (`R45`) | **`FRESH_VERIFIED`** / **`STATIC_VERIFIED` (`ENV_BLOCKED` Docker)** / **`BLOCKED` (Live Gemini key)** | Covered by `r41-r45-review-fixes.test.js` & `e2e-browser-verify.js` (`ASSERT 10..12`) |
| **Review 13 (`R37–R40` & Phase B)** | `R37`–`R40` | Positive clause-level tool-less contract (`R37`), positive field ownership + `verifiedClaims` (`R38`), real server-side notice attachments (`R39`), PostgreSQL-independent unit tests (`R40`), hook order & role landing paths | **`FRESH_VERIFIED`** / **`BLOCKED`** (Live Gemini key) | Covered by `r37-r40-review-fixes.test.js`, `aiCopilot.test.js` & `e2e-browser-verify.js` (`ASSERT 10..12`) |
| **Review 12 (`R35–R36`)** | `R35`–`R36` | Semantic field/entity/period binding (`R35`) and pre-release DB scope/active-status re-verification (`R36`) | **`FRESH_VERIFIED`** / **`BLOCKED`** (Live Gemini key) | Covered by `r35-r36-ai-gate.test.js` & `e2e-browser-verify.js` (`ASSERT 10`) |
| **Review 11 (`R31–R34`)** | `R31`–`R34` | DB scope resolution & history invalidation (`R31`), tool-grounding gate (`R32`), real `GET /api/tasks/:id/logs` & `kpi_weight = 0` (`R33`), UAT matrix route alignment (`R34`) | **`FRESH_VERIFIED`** / **`BLOCKED`** (Live Gemini key) | Covered by `r31-r34-review-fixes.test.js` & `e2e-browser-verify.js` (`ASSERT 9`) |
| **Plan 10 (`R27–R30`)** | `R27`–`R30` | Atomic `REPEATABLE READ READ ONLY` payroll snapshot (`R27`), removal of `/tasks` sample fallbacks (`R28`), timezone-aware AI clock & historical policy lookup (`R29`), `/payroll` role-restricted UI (`R30`) | **`FRESH_VERIFIED`** / **`BLOCKED`** (Live Gemini key) | Covered by `r27-r30-review-fixes.test.js` & `e2e-browser-verify.js` (`ASSERT 8`) |
| **Reviews #1–#5 (`R01–R26`)** | `R01`–`R26` | Biometric/GPS punch validation (`R01`), unrecorded workdays anomaly (`R02`), zero-workday allowance (`R03`), holiday-aware leave days (`R04`), period-effective payroll settings (`R05`), no default settings on DB failure (`R06`, `R17`), portal numeric/insurance/hours (`R07`), multi-version policies (`R09`), anomaly lock & zero-net bank exclusion (`R10`, `R11`, `R13`, `R18`, `R19`), leave edit balance (`R12`), clone migration rehearsal (`R16`), uncreated period & 501+ multi-page loader (`R20`, `R22`, `R26`), manual adjustment conflict modal (`R21`, `R24`, `R25`), `assertSafeTestDatabase` (`R23`) | **`FRESH_VERIFIED`** (`R01, R05–R07, R09–R15, R17–R26`) / **`PARTIAL`** (`R02, R03, R04` pending policy sign-off) / **`DEPLOYMENT_PENDING`** (`R16` on `nexus_hrms`) | See `docs/remediation/POLICY_DECISIONS.md` (`DEC-01`..`DEC-07`) and `docs/remediation/OPERATOR_RUNBOOK.md` |

---

## 4. Original Audit Items `F01–F32` Status Summary

- **VERIFIED (`24/32`)**: `F01, F02, F04, F05, F07, F08, F10, F11, F12, F14, F15, F16, F18, F19, F20, F21, F23, F24, F27, F28, F29, F30, F31, F32`.
- **PARTIAL — Pending Business Policy Sign-off & Primary DB Maintenance Window (`6/32`)**: `F03, F06, F09, F13, F17, F26` (tracked in `docs/remediation/POLICY_DECISIONS.md` and `docs/remediation/OPERATOR_RUNBOOK.md`).
- **BLOCKED — Pending Live `GEMINI_API_KEY` (`2/32`)**: `F22, F25` (all mocked provider, tool-calling, RBAC, injection, `R29` clock/policy-version, `R31` DB scope invalidation, `R32` grounding enforcement, `R35` semantic field/period/entity binding, `R36` pre-release DB scope/active-status re-verification, `R37` positive clause-level tool-less boundary, `R38` positive field ownership + `verifiedClaims`, and `R41` clause-level evidence grounding + server-owned template rendering pass; live external Gemini call awaits operator API key per `docs/remediation/AI_SETUP_AND_UAT.md`).
