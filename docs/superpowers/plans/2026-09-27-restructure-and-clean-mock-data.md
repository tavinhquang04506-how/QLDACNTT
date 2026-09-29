# Frontend Restructuring and Mock Data Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the React frontend directory structure and file naming to standard conventions, remove all mock/hardcoded data, and wire all UI components to real Backend REST APIs with proper loading and empty states.

**Architecture:** Adopt a Domain-Driven Component Architecture for `FrontEnd/src/pages` and `FrontEnd/src/modals`. Complete the `FrontEnd/src/services/` layer to map 1:1 with Backend endpoints, replace all static arrays with API states, and purge the `src/data/` mock files.

**Tech Stack:** React 18, Vite, Tailwind CSS, Lucide React, Framer Motion, Fetch API (JWT interceptor).

**Spec:** `docs/superpowers/specs/2026-09-27-restructure-and-clean-mock-data-design.md`

## Global Constraints
- All renamed page files must follow PascalCase with the `Page.jsx` suffix in `FrontEnd/src/pages/`.
- All renamed modal files must follow PascalCase with the `Modal.jsx` suffix in domain subdirectories within `FrontEnd/src/modals/`.
- `ModalContainer.jsx` must support legacy modal IDs (`modal2A`, `modal4B`, etc.) to prevent runtime breakage.
- All references to `FrontEnd/src/data/mock*.js` must be eliminated, and the mock files deleted.
- `npm run build` in `FrontEnd/` must succeed with zero errors.

## Review Focus
- Empty API responses (`data: []`) must render clean empty states rather than throwing undefined property errors.
- `ModalContainer.jsx` triggers with old modal keys must continue opening the correct renamed modals.
- Route paths in `App.jsx` and navigation links in `Sidebar.jsx` must remain intact and functional.
- API payload fields (e.g. `full_name`, `job_title`) must be safely mapped so existing UI styling and cards don't break.
- Production build (`npm run build`) must pass without missing import or unresolved path warnings.

---

### Task 1: Complete and Extend the Services Layer

**Files:**
- Create: `FrontEnd/src/services/analyticsService.js`
- Create: `FrontEnd/src/services/notificationService.js`
- Modify: `FrontEnd/src/services/attendanceService.js`
- Modify: `FrontEnd/src/services/employeeService.js`
- Modify: `FrontEnd/src/services/projectService.js`
- Modify: `FrontEnd/src/services/payrollService.js`

**Interfaces:**
- Produces:
  - `analyticsService`: `getSummary()`, `getNineBox()`, `getTurnoverRisk(empId)`, `getPip()`, `getReviews()`
  - `notificationService`: `getAll()`, `getUnreadCount()`, `markAsRead(id)`, `markAllAsRead()`
  - `attendanceService`: `getTimesheet(params)`, `getExceptions(date)`, `getLive()`
  - `employeeService`: `getDepartments()`, `getPositions()`
  - `payrollService`: `getAnomalies(periodId)`, `getBankTransfer(periodId)`

- [ ] **Step 1: Create `analyticsService.js` and `notificationService.js`**
  Implement API calls calling `/analytics/*` and `/notifications/*` endpoints.

- [ ] **Step 2: Extend `attendanceService.js`, `employeeService.js`, `projectService.js`, and `payrollService.js`**
  Add missing endpoint methods matching `Backend/src/catalog.js`.

- [ ] **Step 3: Verification**
  Check that all service methods export correctly and use the base `api` wrapper.

---

### Task 2: Restructure and Rename Modals by Domain

**Files:**
- Move/Rename:
  - `FrontEnd/src/modals/page2/*` -> `FrontEnd/src/modals/dashboard/` (`LateAbsenceModal.jsx`, `PdfReportModal.jsx`, `LiveLogsModal.jsx`)
  - `FrontEnd/src/modals/page3/*` -> `FrontEnd/src/modals/portal/` (`OtRegisterModal.jsx`, `NoticeDetailModal.jsx`, `PayslipPdfModal.jsx`, `HandbookModal.jsx`)
  - `FrontEnd/src/modals/page4/*` -> `FrontEnd/src/modals/directory/` (`OnboardingModal.jsx`, `Profile360Modal.jsx`, `ImportExcelModal.jsx`, `OffboardingModal.jsx`, `DepartmentManageModal.jsx`, `JobTitleManageModal.jsx`, `ContractPdfPreviewModal.jsx`)
  - `FrontEnd/src/modals/page5/*` -> `FrontEnd/src/modals/attendance/` (`KioskGateModal.jsx`, `TimesheetMatrixModal.jsx`, `SnapshotLogsModal.jsx`)
  - `FrontEnd/src/modals/page6/*` -> `FrontEnd/src/modals/leave/` (`LeaveCalendarModal.jsx`, `MedicalClaimModal.jsx`, `RejectionWorkflowModal.jsx`, `CreateLeaveRequestModal.jsx`, `LeaveDetailViewModal.jsx`)
  - `FrontEnd/src/modals/page7/*` -> `FrontEnd/src/modals/payroll/` (`PayrollAnomalyModal.jsx`, `BankTransferModal.jsx`, `PayrollLockModal.jsx`)
  - `FrontEnd/src/modals/page8/*` -> `FrontEnd/src/modals/analytics/` (`TurnoverRiskModal.jsx`, `AiCopilotDrawerModal.jsx`, `PipPlanModal.jsx`, `NineBoxDetailModal.jsx`)
  - `FrontEnd/src/modals/common/*` -> `NotificationCenterModal.jsx`, `NotificationDetailModal.jsx`
- Modify: `FrontEnd/src/modals/ModalContainer.jsx`

- [ ] **Step 1: Create domain directories and move/rename modal files using git mv**
  Create `dashboard`, `portal`, `directory`, `attendance`, `leave`, `payroll`, `analytics` under `FrontEnd/src/modals/` and move the files.

- [ ] **Step 2: Update `ModalContainer.jsx` imports and registration**
  Import all renamed modals from their domain folders and map both legacy IDs (`modal2A`, `modal4B`, etc.) and new aliases.

- [ ] **Step 3: Update relative imports inside the moved modal files**
  Fix any relative paths (`../../components/`, `../../services/`, `../../utils/`) broken by the directory move.

---

### Task 3: Restructure and Rename Pages & Update Routing

**Files:**
- Move/Rename:
  - `FrontEnd/src/pages/Page1_Login.jsx` -> `LoginPage.jsx`
  - `FrontEnd/src/pages/Page2_Dashboard.jsx` -> `DashboardPage.jsx`
  - `FrontEnd/src/pages/Page3_EmployeePortal.jsx` -> `EmployeePortalPage.jsx`
  - `FrontEnd/src/pages/Page4_Directory.jsx` -> `DirectoryPage.jsx`
  - `FrontEnd/src/pages/Page5_Attendance.jsx` -> `AttendancePage.jsx`
  - `FrontEnd/src/pages/Page6_LeaveManagement.jsx` -> `LeaveManagementPage.jsx`
  - `FrontEnd/src/pages/Page7_Payroll.jsx` -> `PayrollPage.jsx`
  - `FrontEnd/src/pages/Page8_AiAnalytics.jsx` -> `AiAnalyticsPage.jsx`
  - `FrontEnd/src/pages/Page9_ProjectsTasks.jsx` -> `ProjectsTasksPage.jsx`
  - `FrontEnd/src/pages/Page_KioskFullscreen.jsx` -> `KioskFullscreenPage.jsx`
  - `FrontEnd/src/pages/Page_Settings.jsx` -> `SettingsPage.jsx`
- Modify: `FrontEnd/src/App.jsx`
- Modify: `FrontEnd/src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Move and rename page files using git mv**
  Rename all page files in `FrontEnd/src/pages/` to PascalCase with `Page.jsx`.

- [ ] **Step 2: Update `App.jsx`**
  Update imports and route elements with the new page component names.

- [ ] **Step 3: Update navigation references**
  Ensure `Sidebar.jsx`, `Topbar.jsx`, and internal `useNavigate` calls match the existing route paths (`/dashboard`, `/directory`, `/attendance`, `/leaves`, `/payroll`, `/tasks`, `/ai-analytics`, `/portal`, `/settings`, `/login`, `/kiosk`).

---

### Task 4: Clean Mock Data and Wire Real APIs in Core Pages

**Files:**
- Modify: `FrontEnd/src/pages/DirectoryPage.jsx`
- Modify: `FrontEnd/src/pages/LeaveManagementPage.jsx`
- Modify: `FrontEnd/src/pages/PayrollPage.jsx`
- Modify: `FrontEnd/src/pages/AiAnalyticsPage.jsx`
- Modify: `FrontEnd/src/pages/ProjectsTasksPage.jsx`
- Modify: `FrontEnd/src/pages/DashboardPage.jsx`

- [ ] **Step 1: Refactor `DirectoryPage.jsx`**
  Remove `mockEmployees` and `initialSquads` imports. Initialize states with `[]`. Fetch via `employeeService.getAll()` and `projectService.getSquads()`. Handle loading and empty states.

- [ ] **Step 2: Refactor `LeaveManagementPage.jsx`**
  Remove inline `mockMyLeaveRequests` and `mockDeptPendingRequests`. Use `leaveService.getAll()`. Display empty states when no records exist.

- [ ] **Step 3: Refactor `PayrollPage.jsx`**
  Remove `mockPayrollSummary`, `mockPayrollAnomalies`, and `mockEmployees` imports. Calculate totals from `apiPayslips`/`apiPeriods`. Filter and display `apiPayslips`.

- [ ] **Step 4: Refactor `AiAnalyticsPage.jsx`**
  Remove `mockFlightRisk`, `mockNineBox`, `mockPipPlan` imports. Add `useEffect` to fetch real analytics from `analyticsService.getSummary()`, `analyticsService.getNineBox()`, and `analyticsService.getPip()`.

- [ ] **Step 5: Refactor `ProjectsTasksPage.jsx`**
  Remove `initialProjects`, `initialTasks`, `departmentMembers` imports from `mockProjectsTasks`. Initialize with empty arrays and populate exclusively from `projectService` and `employeeService`.

- [ ] **Step 6: Refactor `DashboardPage.jsx`**
  Bind `stats` from `dashboardService.getStats()` dynamically into the KPI summary cards, with fallback values (`0`) when loading/empty.

---

### Task 5: Clean Mock Data in Layout and Modals

**Files:**
- Modify: `FrontEnd/src/components/layout/Topbar.jsx`
- Modify: `FrontEnd/src/modals/common/NotificationCenterModal.jsx`
- Modify: `FrontEnd/src/modals/attendance/TimesheetMatrixModal.jsx`
- Modify: `FrontEnd/src/modals/dashboard/LateAbsenceModal.jsx`
- Modify: `FrontEnd/src/modals/dashboard/LiveLogsModal.jsx`
- Modify: `FrontEnd/src/modals/leave/LeaveDetailViewModal.jsx`

- [ ] **Step 1: Clean `Topbar.jsx` and `NotificationCenterModal.jsx`**
  Remove `mockNotificationsData` and `mockEmployees`. Wire to `notificationService` for live notifications and `employeeService.getAll()` for live search.

- [ ] **Step 2: Clean Attendance Modals**
  - In `LateAbsenceModal.jsx`: remove `mockLateEmployees`, fetch from `attendanceService.getExceptions()`.
  - In `LiveLogsModal.jsx`: remove `mockLiveLogs`, fetch from `attendanceService.getLive()`.
  - In `TimesheetMatrixModal.jsx`: remove `mockEmployees`, fetch from `employeeService.getAll()`.

- [ ] **Step 3: Clean Leave & Payroll Modals**
  Remove any leftover fallback mock objects in `LeaveDetailViewModal.jsx`, `PayrollAnomalyModal.jsx`, etc.

---

### Task 6: Purge Mock Files and Verify Build

**Files:**
- Delete: `FrontEnd/src/data/mockAiAnalytics.js`
- Delete: `FrontEnd/src/data/mockEmployees.js`
- Delete: `FrontEnd/src/data/mockLeaveRequests.js`
- Delete: `FrontEnd/src/data/mockNotifications.js`
- Delete: `FrontEnd/src/data/mockPayroll.js`
- Delete: `FrontEnd/src/data/mockProjectsTasks.js`
- Remove empty legacy directories: `FrontEnd/src/modals/page*` and `FrontEnd/src/data` (if empty)

- [ ] **Step 1: Delete all 6 mock data files using git rm**
- [ ] **Step 2: Remove legacy empty directories**
- [ ] **Step 3: Verification search**
  Run `git grep -i "mock" -- "FrontEnd/src/*"` and confirm zero mock data file imports remain.
- [ ] **Step 4: Run production build**
  Run `npm run build` in `FrontEnd/` and verify that the build completes with code 0.
- [ ] **Step 5: Commit changes**
  Commit the entire restructuring and cleanup.
