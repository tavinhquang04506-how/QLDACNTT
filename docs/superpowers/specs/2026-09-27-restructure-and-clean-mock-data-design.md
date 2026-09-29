# Spec: Restructure Frontend Architecture and Clean Mock/Hardcoded Data

## 1. Objectives
- Restructure `FrontEnd/src/` to follow a domain-driven component architecture.
- Rename hackathon-style numbered files (`Page1_...`, `Modal2A_...`) to standard PascalCase names (`LoginPage.jsx`, `LateAbsenceModal.jsx`).
- Completely remove all mock/hardcoded data files (`FrontEnd/src/data/mock*.js`) and inline mock arrays.
- Wire all pages and modals to real Backend REST APIs via standard services in `FrontEnd/src/services/`.
- Handle Loading and Empty states properly across all screens.
- Guarantee zero regression and verify successful production build via `npm run build`.

## 2. Directory Structure & File Naming Conventions

### 2.1 Pages (`FrontEnd/src/pages/`)
- `Page1_Login.jsx` -> `LoginPage.jsx`
- `Page2_Dashboard.jsx` -> `DashboardPage.jsx`
- `Page3_EmployeePortal.jsx` -> `EmployeePortalPage.jsx`
- `Page4_Directory.jsx` -> `DirectoryPage.jsx`
- `Page5_Attendance.jsx` -> `AttendancePage.jsx`
- `Page6_LeaveManagement.jsx` -> `LeaveManagementPage.jsx`
- `Page7_Payroll.jsx` -> `PayrollPage.jsx`
- `Page8_AiAnalytics.jsx` -> `AiAnalyticsPage.jsx`
- `Page9_ProjectsTasks.jsx` -> `ProjectsTasksPage.jsx`
- `Page_KioskFullscreen.jsx` -> `KioskFullscreenPage.jsx`
- `Page_Settings.jsx` -> `SettingsPage.jsx`

### 2.2 Modals (`FrontEnd/src/modals/`)
Categorized by domain modules:
- **`modals/common/`**:
  - `Modal_NotificationCenter.jsx` -> `NotificationCenterModal.jsx`
  - `Modal_NotificationDetailPopup.jsx` -> `NotificationDetailModal.jsx`
- **`modals/dashboard/`**: (migrated from `modals/page2/`)
  - `Modal2A_LateAbsence.jsx` -> `LateAbsenceModal.jsx`
  - `Modal2B_PdfReport.jsx` -> `PdfReportModal.jsx`
  - `Modal2C_LiveLogs.jsx` -> `LiveLogsModal.jsx`
- **`modals/portal/`**: (migrated from `modals/page3/`)
  - `Modal3A_OtRegister.jsx` -> `OtRegisterModal.jsx`
  - `Modal3B_NoticeDetail.jsx` -> `NoticeDetailModal.jsx`
  - `Modal3C_PayslipPdf.jsx` -> `PayslipPdfModal.jsx`
  - `Modal3D_Handbook.jsx` -> `HandbookModal.jsx`
- **`modals/directory/`**: (migrated from `modals/page4/`)
  - `Modal4A_Onboarding.jsx` -> `OnboardingModal.jsx`
  - `Modal4B_Profile360.jsx` -> `Profile360Modal.jsx`
  - `Modal4C_ImportExcel.jsx` -> `ImportExcelModal.jsx`
  - `Modal4D_Offboarding.jsx` -> `OffboardingModal.jsx`
  - `Modal4E_DepartmentManage.jsx` -> `DepartmentManageModal.jsx`
  - `Modal4F_JobTitleManage.jsx` -> `JobTitleManageModal.jsx`
  - `Modal4G_ContractPdfPreview.jsx` -> `ContractPdfPreviewModal.jsx`
- **`modals/attendance/`**: (migrated from `modals/page5/`)
  - `Modal5A_KioskGate.jsx` -> `KioskGateModal.jsx`
  - `Modal5B_TimesheetMatrix.jsx` -> `TimesheetMatrixModal.jsx`
  - `Modal5C_SnapshotLogs.jsx` -> `SnapshotLogsModal.jsx`
- **`modals/leave/`**: (migrated from `modals/page6/`)
  - `Modal6A_LeaveCalendar.jsx` -> `LeaveCalendarModal.jsx`
  - `Modal6B_MedicalClaim.jsx` -> `MedicalClaimModal.jsx`
  - `Modal6C_RejectionWorkflow.jsx` -> `RejectionWorkflowModal.jsx`
  - `Modal6D_CreateLeaveRequest.jsx` -> `CreateLeaveRequestModal.jsx`
  - `Modal6E_LeaveDetailView.jsx` -> `LeaveDetailViewModal.jsx`
- **`modals/payroll/`**: (migrated from `modals/page7/`)
  - `Modal7A_PayrollAnomaly.jsx` -> `PayrollAnomalyModal.jsx`
  - `Modal7B_BankTransfer.jsx` -> `BankTransferModal.jsx`
  - `Modal7C_PayrollLock.jsx` -> `PayrollLockModal.jsx`
- **`modals/analytics/`**: (migrated from `modals/page8/`)
  - `Modal8A_TurnoverRisk.jsx` -> `TurnoverRiskModal.jsx`
  - `Modal8B_AiCopilotDrawer.jsx` -> `AiCopilotDrawerModal.jsx`
  - `Modal8C_PipPlan.jsx` -> `PipPlanModal.jsx`
  - `Modal8D_NineBoxDetail.jsx` -> `NineBoxDetailModal.jsx`

### 2.3 Modal Registration Compatibility (`ModalContainer.jsx`)
`ModalContainer.jsx` supports both legacy modal keys (`modal2A`, `modal4B`, etc.) and new semantic aliases (`lateAbsence`, `profile360`, etc.) to prevent regressions from any caller.

## 3. API Services Layer (`FrontEnd/src/services/`)
- Add `analyticsService.js`:
  - `getSummary()`: GET `/analytics/summary`
  - `getNineBox()`: GET `/analytics/nine-box`
  - `getTurnoverRisk(empId)`: GET `/analytics/turnover-risk` or `/analytics/turnover-risk/${empId}`
  - `getPip()`: GET `/analytics/pip`
  - `createPip(data)`: POST `/analytics/pip`
  - `getReviews()`: GET `/analytics/reviews`
  - `createReview(data)`: POST `/analytics/reviews`
- Add `notificationService.js`:
  - `getAll()`: GET `/notifications`
  - `getUnreadCount()`: GET `/notifications/unread-count`
  - `markAsRead(id)`: PATCH `/notifications/${id}/read`
  - `markAllAsRead()`: POST `/notifications/read-all`
- Extend existing services:
  - `attendanceService.js`: add `getTimesheet(month, year)`, `getExceptions()`, `getLive()`
  - `employeeService.js`: add `getDepartments()`, `getPositions()`
  - `projectService.js`: add `getSquadMessages(squadId)`, `sendSquadMessage(squadId, data)`

## 4. UI Wiring and Mock Elimination
- **DirectoryPage**: Remove `mockEmployees` and `initialSquads`. Fetch from `employeeService.getAll()` and `projectService.getSquads()`.
- **LeaveManagementPage**: Remove inline `mockMyLeaveRequests` and `mockDeptPendingRequests`. Use `leaveService.getAll()`.
- **PayrollPage**: Remove `mockPayrollSummary` and `mockPayrollAnomalies`. Compute totals dynamically from `apiPayslips` or `/api/payroll/periods/:id`.
- **AiAnalyticsPage**: Remove `mockFlightRisk`, `mockNineBox`, `mockPipPlan`. Fetch data from `analyticsService`.
- **ProjectsTasksPage**: Remove `initialProjects`, `initialTasks`, `departmentMembers`. Fetch real data from `projectService` and `employeeService`.
- **Topbar & NotificationCenterModal**: Replace `mockNotificationsData` and `mockEmployees` with `notificationService` and `employeeService`.
- **LateAbsenceModal, LiveLogsModal, TimesheetMatrixModal**: Replace inline mocks with `attendanceService` calls.

## 5. Purge & Verification
- Delete `FrontEnd/src/data/mock*.js`.
- Clean up any unused legacy modal folders if empty (`modals/page2/`, etc.).
- Run `npm run build` in `FrontEnd/` to ensure zero compilation or import errors.
