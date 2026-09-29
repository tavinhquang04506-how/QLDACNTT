# Spec: System Hardening, API Alignment & Comprehensive Defect Remediation

## 1. Objectives
- Eliminate all high-risk runtime crash vectors (unchecked string manipulation on undefined attributes).
- Resolve API contract mismatches causing HTTP 400/409 validation failures (attendance punch, task review, squad messages, payroll lock).
- Secure the application with a dedicated `ProtectedRoute` and safe unauthenticated states (prevent unauthenticated fallback to `HR_DIRECTOR`).
- Fix broken modal workflows (missing action callbacks in `ModalContainer`, prop mismatches, hardcoded inputs).
- Correct business logic calculations (9-Box grid mapping, leave request counter double subtraction, payroll anomaly acknowledgement).
- Wire the Employee Portal and remaining modals to real backend endpoints via dedicated services (`contractService`, `otService`, `medicalService`, `noticeService`, `handbookService`).
- Guarantee zero build regressions with clean `npm run build` pass.

---

## 2. Core Architecture & Design Decisions

### 2.1 API & Network Layer (`FrontEnd/src/services/api.js`)
- **Single Stream Reading**: Read `const data = await response.json().catch(() => ({}))` once before inspecting `response.status === 401`. Eliminate duplicate `response.json()` calls.
- **Multipart / FormData Compatibility**: Check if `options.body instanceof FormData`. If true, delete the default `'Content-Type': 'application/json'` header so browser sets multipart boundary automatically.
- **Proper Error Propagation**: When `!response.ok`, return `{ success: false, status: response.status, message: data.message || ... }` without crashing or falsely claiming network connection failure.

### 2.2 Security & Routing Guard (`FrontEnd/src/components/common/ProtectedRoute.jsx` & `AuthContext.jsx`)
- **`ProtectedRoute`**: Inspect `isAuthenticated` and token validity from `useAuth()`. Redirect unauthenticated users to `/login?redirect=...`. For role-restricted routes (e.g. `/payroll`, `/ai-analytics`), verify user role matches allowed roles or redirect to `/dashboard`.
- **Default Auth State**: Unauthenticated users must have `user = null` and `currentRole = null` (or redirect). Remove fallback to `'HR_DIRECTOR'` in `AuthContext.jsx`.
- **Server-side Logout**: `authService.logout()` must invoke `POST /api/auth/logout` with refreshToken if available, then purge `localStorage`.

### 2.3 Contract Alignment
- **Attendance Punch**: Change `method: 'face_id'` in `AttendancePage.jsx` to valid backend enum (`'gps'` or `'manual'` or `'kiosk'`). Only trigger celebration confetti if backend returns `success: true`.
- **Task Review**: `projectService.reviewTask(taskId, approved, note)` must send `{ decision: approved ? 'accept' : 'reject', note }` matching Backend Zod schema.
- **Squad Message**: `projectService.sendSquadMessage(squadId, message)` must send `{ content: message }`.
- **Payroll Lock**: `payrollService.lockPeriod(id, acknowledgeAnomalies)` must support sending `{ acknowledgeAnomalies: true }` in the POST body.
- **Notification Unread Count**: Topbar must consume `res.count ?? res.unreadCount`.

### 2.4 Defensive Rendering & Runtime Stability
- **ProjectsTasksPage**: Safely access `task.dueDate?.split('-')` with fallback, `task.title?.toLowerCase()`, `task.assignee?.name?.toLowerCase()`.
- **ProjectsTasksPage Switching**: Re-fetch tasks dynamically when user clicks a different project.
- **DirectoryPage**: Change undefined event listener call `loadEmployees()` to `fetchData()`.

### 2.5 Modal Subsystem Alignment
- **`ModalContainer.jsx`**:
  - Pass `onApprove` and `onReject` handlers to `LeaveDetailViewModal` that call `leaveService.approve(id)` / `leaveService.reject(id, note)`.
  - Pass both `payload` and `emp` to `ContractPdfPreviewModal` (`emp={payload}`).
- **`OnboardingModal.jsx`**: Allow user input for `dob` and `phone` instead of hardcoding `'1998-04-12'` and `'0912 888 999'`.

### 2.6 Business Logic Correction
- **Leave Management**: Change `pendingRequestsCount` to `deptPendingRequests.length` (do not subtract `approvedList.length`).
- **9-Box Grid**: Realign `NINE_BOX_TEMPLATES` in `AiAnalyticsPage.jsx` with backend `nineBox.js`:
  - Cell 1: Cần cải thiện (PIP) (Low Perf, Low Pot)
  - Cell 2: Đạt yêu cầu (Med Perf, Low Pot)
  - Cell 3: Chuyên gia chuyên môn (High Perf, Low Pot)
  - Cell 4: Nhân tố tiềm năng (Low Perf, Med Pot)
  - Cell 5: Trụ cột ổn định (Med Perf, Med Pot)
  - Cell 6: Tác động cao (High Perf, Med Pot)
  - Cell 7: Triển vọng tương lai (Low Perf, High Pot)
  - Cell 8: Ngôi sao đang lên (Med Perf, High Pot)
  - Cell 9: Ngôi sao xuất sắc (High Perf, High Pot)

### 2.7 Service Extensions & Portal Integration
- Add `contractService.js` (`/api/contracts`), `otService.js` (`/api/ot-requests`), `medicalService.js` (`/api/medical-claims`), `noticeService.js` (`/api/notices`), `handbookService.js` (`/api/handbook`).
- Connect `EmployeePortalPage.jsx` to `attendanceService.getMyToday()`, `leaveService.getBalances('me')`, `payrollService.getMyPayslips()`.
- Connect `OtRegisterModal` to `otService.create()`.
- Connect `MedicalClaimModal` to `medicalService.create()`.
