# RELEASE BACKLOG & STATUS TRACKER (`b45bd89` → Release Readiness)

- **Baseline Commit**: `b45bd89` (`develop`)
- **Implementation Branch**: `feature/remediation-r27-r30-release-readiness`
- **Primary DB (`nexus_hrms`)**: Preserved untouched (`32` tables, `DEPLOYMENT_PENDING` for migrations `010`/`011` until operator maintenance window)
- **Test DB (`nexus_hrms_test`)**: Verified via `assertSafeTestDatabase` (`current_database() = 'nexus_hrms_test'`, `34` tables, `READY`)

---

## 1. Findings `R27–R30` (Plan `10-KE-HOACH-TONG-THE-HOAN-THIEN-b45bd89.md`)

| ID | Priority | Module / Files | Description | Status | Verification Evidence |
|---|---|---|---|---|---|
| **R27** | **P1** | `Backend/src/config/db.js`, `Backend/src/modules/payroll/service.js` | Atomic `REPEATABLE READ READ ONLY` transaction (`db.withReadSnapshot`) for `listPayslips` and `bankTransfer`; `snapshot_token` includes joined employee/department fields (`e.full_name`, `e.job_title`, `e.department_id`, `d.name`, `pp.status`, `scope`); server-side `409 PAYROLL_SNAPSHOT_INCONSISTENT` guard | **VERIFIED** | `Backend/tests/api/r27-r30-review-fixes.test.js`, `docs/remediation/evidence/r27-r30-verification-after-fix.log`, `docs/remediation/evidence/r27-r30-ui-e2e-verify.log` |
| **R28** | **P1** | `FrontEnd/src/pages/ProjectsTasksPage.jsx`, `FrontEnd/src/utils/projectsTasksState.js` | Removed sample fallbacks (`|| 1200` budget hours, `: 20` team count, `'90.0'` allocation rate, random `TSK-*` ID fabrication, and hardcoded `DEPT-IT` on project creation); added `projects-load-error-banner` + retry button and department selector (`create-project-department-select`) | **VERIFIED** | `FrontEnd/tests/projectsTasksState.test.js`, `Backend/tests/api/r27-r30-review-fixes.test.js`, `docs/remediation/evidence/r27-r30-ui-e2e-verify.log` |
| **R29** | **P1** | `Backend/src/modules/ai/tools.js`, `Backend/src/modules/ai/service.js` | Centralized timezone-aware clock (`getCurrentClock` using `APP_TIMEZONE = 'Asia/Ho_Chi_Minh'`) replacing hardcoded `2026` and `'2026-09'`; strict `INVALID_ARGUMENT` validation on date/month/year/range inputs; historical policy version resolution in `search_policies` via `settingsService.getSettingsForPeriod` (`system_policy_versions`) returning `POLICY_VERSION_NOT_FOUND` for periods before earliest stored version; mid-conversation scope invalidation and redacted audit logging | **VERIFIED** (Code & Mocked E2E) / **BLOCKED** (Live Gemini API without key) | `Backend/tests/api/r27-r30-review-fixes.test.js`, `docs/remediation/evidence/r27-r30-verification-after-fix.log` |
| **R30** | **P2** | `FrontEnd/src/pages/PayrollPage.jsx`, `FrontEnd/src/components/layout/Sidebar.jsx` | Restricted company-level payroll API calls (`getPeriods`, `getAllPayslipsForPeriod`, `getAnomalies`) to `CEO` and `HR_DIRECTOR` (`canManageCompanyPayroll`); removed hardcoded `DEPT-IT` / `'Kỹ thuật'` filters and `20000000` / `95` fallbacks; added explicit `payroll-role-restricted` screen for `ADMIN`/`KIOSK`; updated CEO sidebar label to `'Quản trị bảng lương & quyết toán'` | **VERIFIED** | `FrontEnd/tests/projectsTasksState.test.js`, `Backend/tests/api/r27-r30-review-fixes.test.js`, `docs/remediation/evidence/r27-r30-ui-e2e-verify.log` |

---

## 2. Historical Findings `R01–R26` Summary

| Group | IDs | Summary | Status | Notes / Remaining Conditions |
|---|---|---|---|---|
| **G1–G5 Review (`R01–R08`)** | `R01`–`R08` | Biometric/GPS punch validation (`R01`), unrecorded workdays anomaly & lock guard (`R02`), zero-workday allowance persistence (`R03`), server-side holiday-aware leave `totalDays` (`R04`), period-effective payroll settings (`R05`), no default settings on DB failure (`R06`), portal numeric-string/10.5% insurance/check-in hours (`R07`), grounded AI copilot (`R08`) | **VERIFIED** (`R01, R05, R06, R07`) / **PARTIAL** (`R02, R03, R04` pending policy sign-off) / **BLOCKED** (`R08` live Gemini key) | See `docs/remediation/POLICY_DECISIONS.md` for `DEC-01`..`DEC-04` |
| **Review `aa7cfbb` (`R09–R15`)** | `R09`–`R15` | Multi-version `system_policy_versions` (`R09`), `acknowledgeAnomalies = false` default & anomaly list (`R10`), zero-net payslip exclusion from bank transfer (`R11`), leave balance adjustment when editing dates (`R12`), `LOCK_PAYROLL` audit note (`R13`), real UI E2E harness (`R14`), tracker sync (`R15`) | **VERIFIED** | Covered by `r09-r15-review-fixes.test.js` & `e2e-browser-verify.js` |
| **Review `5335e7c` (`R16–R19`)** | `R16`–`R19` | Clone migration rehearsal & schema readiness (`R16`), settings baseline load lock before save (`R17`), stale payroll detection (`409 PAYROLL_STALE`) (`R18`), UI CSV export cell-by-cell DB verification (`R19`) | **VERIFIED** (`R17–R19`) / **DEPLOYMENT_PENDING** (`R16` on `nexus_hrms`) | Rehearsed on `nexus_hrms_rehearsal_test`; `nexus_hrms` awaits operator window |
| **Review `b4adde0` (`R20–R23`)** | `R20`–`R23` | No fallback to `apiPeriods[0]` on uncreated period (`R20`), manual adjustment preservation & conflict detection (`R21`), 501+ multi-page loader (`R22`), `assertSafeTestDatabase` runtime `current_database()` guard (`R23`) | **VERIFIED** | Covered by `r20-r23-review-fixes.test.js` & `e2e-browser-verify.js` |
| **Review `4077088` (`R24–R26`)** | `R24`–`R26` | Interactive `ADJUSTMENT_SOURCE_CONFLICT` reconciliation modal with `expectedSourceValues` (`R24`), honest payroll recalculate label (`R25`), multi-page duplicate & `snapshotToken` integrity guard (`R26`) | **VERIFIED** | Covered by `r24-r26-review-fixes.test.js` & `e2e-browser-verify.js` |

---

## 3. Original Audit Items `F01–F32` Status Summary

- **VERIFIED (`26/32`)**: `F01, F02, F05, F06, F07, F08, F09, F10, F11, F14, F16, F17, F19, F20, F21, F22, F23, F24, F25, F26, F27, F28, F29, F30, F31, F32`.
- **PARTIAL — Pending Business Policy Sign-off (`4/32`)**: `F03, F04, F12, F13` (tracked in `docs/remediation/POLICY_DECISIONS.md`).
- **BLOCKED — Pending Live `GEMINI_API_KEY` (`2/32`)**: `F15, F18` (all mocked provider, tool-calling, RBAC, injection, and `R29` clock/policy-version tests pass; live external Gemini call awaits operator API key per `docs/remediation/AI_SETUP_AND_UAT.md`).
