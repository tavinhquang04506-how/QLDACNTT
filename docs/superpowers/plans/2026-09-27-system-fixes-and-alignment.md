# System Hardening, API Alignment & Comprehensive Defect Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate runtime crashes, API contract mismatches, security/routing vulnerabilities, and broken modal workflows while connecting missing services to achieve a robust, fully-aligned production build.

**Architecture:** 
- Fix the core HTTP client (`api.js`) for safe single-stream error decoding and multipart support.
- Implement an explicit `ProtectedRoute` layer and harden `AuthContext` to avoid unauthorized access.
- Correct API payload contracts across attendance, tasks, squads, and payroll.
- Apply defensive data handling across pages and modals to eliminate crashes from undefined fields.
- Expand the frontend service layer to cover remaining backend modules (contracts, OT, medical claims, notices, handbooks).

**Tech Stack:** React 19, Vite 6, React Router DOM 7, TailwindCSS 3.4, Lucide React, Express.js / Node.js Backend.

**Spec:** `docs/superpowers/specs/2026-09-27-system-fixes-and-alignment-design.md`

## Global Constraints
- Preserve 100% build compatibility with Vite (`npm run build` must produce 0 errors).
- Preserve existing modal key backward compatibility (`modal2A`... and semantic aliases).
- Maintain existing database schema and backend validation contracts without modifying backend files unless strictly necessary.
- Code defensively against null and undefined properties in all UI components.

## Review Focus
- Unauthenticated access to protected routes: Typing `/payroll` or `/settings` while logged out must redirect to `/login`.
- Login rejection handling: Entering incorrect credentials must display the server's error message, not "Không thể kết nối server" or fake success.
- Null dates in task lists: Tasks with `dueDate === null` must render a fallback placeholder instead of throwing a TypeError.
- Attendance punch error feedback: Backend 400 error must display an alert/toast and not trigger celebratory confetti.
- Modal action callback propagation: Clicking approve or reject in `LeaveDetailViewModal` must dispatch the appropriate service call and refresh parent state.

---

### Task 1: Harden HTTP Client in `api.js` (Single-Stream Read & FormData Support)

**Files:**
- Modify: `FrontEnd/src/services/api.js:15-56`

**Interfaces:**
- Consumes: Standard `fetch` Request / Response.
- Produces: `api.get`, `api.post`, `api.put`, `api.patch`, `api.delete` returning `{ success: boolean, data?: any, message?: string, status?: number }`.

- [ ] **Step 1: Inspect existing `api.js` error handling and FormData behavior**
Check lines 20-56 where double `response.json()` causes crashes on non-expired 401s, and where `typeof config.body === 'object'` serializes `FormData` to `{}`.

- [ ] **Step 2: Implement single-stream parsing, FormData detection, and robust error propagation**
Modify `FrontEnd/src/services/api.js`:
- If `config.body instanceof FormData`, do NOT set `'Content-Type': 'application/json'`.
- Read response body once: `const data = await response.json().catch(() => ({}));`.
- Handle 401: if message mentions expired/invalid, clear token and dispatch auth event.
- Return `{ success: response.ok, status: response.status, ...data }` if `!response.ok`.

- [ ] **Step 3: Verify build passes**
Run: `npm run build` in `FrontEnd`
Expected: 0 errors.

- [ ] **Step 4: Commit**
```bash
git add FrontEnd/src/services/api.js
git commit -m "fix(api): prevent double body stream read on 401 and support FormData"
```

---

### Task 2: Fix Runtime Crashes & Project Switching in `ProjectsTasksPage.jsx`

**Files:**
- Modify: `FrontEnd/src/pages/ProjectsTasksPage.jsx:136-160, 203-210, 1665-1680`

**Interfaces:**
- Consumes: `projectService.getAll()`, `projectService.getTasks(projectId)`
- Produces: Safe rendering of tasks with null/undefined `dueDate`, `title`, or `assignee`. Dynamic task loading on project selection.

- [ ] **Step 1: Locate unsafe string methods in `ProjectsTasksPage.jsx`**
Identify `task.dueDate.split('-')` (L1667, L1673), `task.title.toLowerCase()` and `task.assignee.name.toLowerCase()` (L203-207), and `selectedProject` task fetching.

- [ ] **Step 2: Add defensive fallbacks and project switch effect**
- Wrap `task.dueDate` formatting with helper: `const formatDueDate = (d) => d ? d.split('-').slice(1).join('/') : '--/--';`
- Add optional chaining: `task.title?.toLowerCase()`, `task.assignee?.name?.toLowerCase()`.
- Add `useEffect` that listens to `selectedProject` or `selectedProjectId` and calls `projectService.getTasks(selectedProjectId)` to refresh task list.
- Fix `"undefined% tải"` display by providing fallback: `${m.workload || 0}% tải`.

- [ ] **Step 3: Verify build passes**
Run: `npm run build` in `FrontEnd`
Expected: 0 errors.

- [ ] **Step 4: Commit**
```bash
git add FrontEnd/src/pages/ProjectsTasksPage.jsx
git commit -m "fix(projects): safe string handling for null dates and reactive task fetching"
```

---

### Task 3: Fix Custom Event Handler in `DirectoryPage.jsx`

**Files:**
- Modify: `FrontEnd/src/pages/DirectoryPage.jsx:130-140`

**Interfaces:**
- Consumes: Custom DOM event `'nexus:employee-added'`
- Produces: Reload of employee list via `fetchData()`

- [ ] **Step 1: Locate reference to undefined `loadEmployees`**
Inspect `FrontEnd/src/pages/DirectoryPage.jsx:134`.

- [ ] **Step 2: Update event listener to invoke `fetchData()`**
Change `const handleEmpAdded = () => { loadEmployees(); };` to `const handleEmpAdded = () => { fetchData(); };`.

- [ ] **Step 3: Verify build passes**
Run: `npm run build` in `FrontEnd`
Expected: 0 errors.

- [ ] **Step 4: Commit**
```bash
git add FrontEnd/src/pages/DirectoryPage.jsx
git commit -m "fix(directory): resolve ReferenceError on employee-added event"
```

---

### Task 4: Fix API Contract Mismatches (Attendance, Tasks, Squads, Payroll, Topbar)

**Files:**
- Modify: `FrontEnd/src/pages/AttendancePage.jsx:45-75`
- Modify: `FrontEnd/src/services/projectService.js:16-35`
- Modify: `FrontEnd/src/services/payrollService.js:16-20`
- Modify: `FrontEnd/src/components/layout/Topbar.jsx:25-30`

**Interfaces:**
- Consumes: Backend Zod validation schemas
- Produces: Valid HTTP payloads preventing 400/409 responses

- [ ] **Step 1: Correct `AttendancePage.jsx` punch method and error handling**
- Change `method: 'face_id'` to `method: 'manual'` (or `'gps'`) matching Backend Zod enum.
- In `handlePunch`: inspect `res.success`. Only trigger `confetti()` and success toast if `res.success` is truthy. If `!res.success`, display `res.message || 'Chấm công thất bại'`.

- [ ] **Step 2: Correct `projectService.js` payloads**
- `reviewTask(taskId, approved, note)`: send `{ decision: approved ? 'accept' : 'reject', note }`.
- `sendSquadMessage(squadId, message)`: send `{ content: message }`.

- [ ] **Step 3: Correct `payrollService.lockPeriod`**
- Change signature to `lockPeriod: (id, acknowledgeAnomalies = true) => api.post(\`/payroll/periods/\${id}/lock\`, { acknowledgeAnomalies })`.

- [ ] **Step 4: Correct Topbar unread count field**
- Change `notifRes.unreadCount` to `notifRes.count ?? notifRes.unreadCount ?? 0`.

- [ ] **Step 5: Verify build passes**
Run: `npm run build` in `FrontEnd`
Expected: 0 errors.

- [ ] **Step 6: Commit**
```bash
git add FrontEnd/src/pages/AttendancePage.jsx FrontEnd/src/services/projectService.js FrontEnd/src/services/payrollService.js FrontEnd/src/components/layout/Topbar.jsx
git commit -m "fix(contracts): align attendance punch, task review, squad message and unread count"
```

---

### Task 5: Implement `ProtectedRoute` & Harden Routing in `App.jsx`

**Files:**
- Create: `FrontEnd/src/components/common/ProtectedRoute.jsx`
- Modify: `FrontEnd/src/App.jsx:1-60`

**Interfaces:**
- Consumes: `useAuth()` hook (`isAuthenticated`, `currentRole`, `loading`)
- Produces: Guarded routes that redirect unauthenticated users to `/login` and role-restricted routes to appropriate fallbacks.

- [ ] **Step 1: Create `ProtectedRoute.jsx`**
Create `FrontEnd/src/components/common/ProtectedRoute.jsx`:
- Checks `isAuthenticated`. If false, return `<Navigate to="/login" replace state={{ from: location }} />`.
- If `allowedRoles` array passed and `!allowedRoles.includes(currentRole)`, redirect to `/dashboard`.
- Render `<Outlet />` or `children`.

- [ ] **Step 2: Wrap internal routes in `App.jsx`**
Wrap `/dashboard`, `/directory`, `/attendance`, `/leaves`, `/payroll`, `/projects`, `/ai-analytics`, `/employee-portal`, `/settings` inside `<ProtectedRoute>`.
- Restrict `/payroll` and `/ai-analytics` to `['CEO', 'HR_DIRECTOR', 'LINE_MANAGER']`.
- Provide a catch-all route `<Route path="*" element={<Navigate to="/dashboard" replace />} />`.

- [ ] **Step 3: Verify build passes**
Run: `npm run build` in `FrontEnd`
Expected: 0 errors.

- [ ] **Step 4: Commit**
```bash
git add FrontEnd/src/components/common/ProtectedRoute.jsx FrontEnd/src/App.jsx
git commit -m "feat(security): implement ProtectedRoute guard and role-based route access"
```

---

### Task 6: Secure `AuthContext` Default State & Server Logout

**Files:**
- Modify: `FrontEnd/src/context/AuthContext.jsx:1-120`
- Modify: `FrontEnd/src/services/authService.js:15-35`
- Modify: `FrontEnd/src/components/layout/Topbar.jsx:75-90`

**Interfaces:**
- Consumes: `localStorage`, Backend `/api/auth/me`, `/api/auth/logout`
- Produces: Safe unauthenticated state (`null` role), server-side token revocation on logout.

- [ ] **Step 1: Fix unauthenticated fallback in `AuthContext.jsx`**
- Change default role fallback from `'HR_DIRECTOR'` to `null` (or only if authenticated user profile exists).
- Compute `isAuthenticated = Boolean(token && user)`.
- If token exists, fetch `/auth/me` on mount. If token is invalid or request fails with 401, purge storage and set user to `null`.

- [ ] **Step 2: Connect server logout**
- In `authService.js`: update `logout` to make `api.post('/auth/logout').catch(() => ({}))` before clearing `localStorage`.
- In `Topbar.jsx`: ensure logout handler calls `authService.logout()` and `navigate('/login')`.

- [ ] **Step 3: Verify build passes**
Run: `npm run build` in `FrontEnd`
Expected: 0 errors.

- [ ] **Step 4: Commit**
```bash
git add FrontEnd/src/context/AuthContext.jsx FrontEnd/src/services/authService.js FrontEnd/src/components/layout/Topbar.jsx
git commit -m "fix(auth): secure unauthenticated role state and add server-side logout"
```

---

### Task 7: Fix Login Error Swallowing in `LoginPage.jsx`

**Files:**
- Modify: `FrontEnd/src/pages/LoginPage.jsx:80-120`

**Interfaces:**
- Consumes: `authService.login(email, password)`
- Produces: Displays true server error message on 401/400; stops fallback to demo credentials.

- [ ] **Step 1: Inspect `handleSubmit` in `LoginPage.jsx`**
Notice where `authService.login` failure falls back to setting mock token and logging in anyway.

- [ ] **Step 2: Enforce strict backend authentication**
- On API failure (`!res.success`), set `error` state with `res.message || 'Tài khoản hoặc mật khẩu không chính xác'`.
- Do NOT set fake tokens or auto-login when the server explicitly rejects credentials.
- Retain demo role buttons only to populate the email/password fields for easy testing.

- [ ] **Step 3: Verify build passes**
Run: `npm run build` in `FrontEnd`
Expected: 0 errors.

- [ ] **Step 4: Commit**
```bash
git add FrontEnd/src/pages/LoginPage.jsx
git commit -m "fix(login): display real server error and eliminate silent auth bypass"
```

---

### Task 8: Fix Modal Action Callbacks & Registration in `ModalContainer.jsx`

**Files:**
- Modify: `FrontEnd/src/modals/ModalContainer.jsx:135-180`
- Modify: `FrontEnd/src/modals/directory/ContractPdfPreviewModal.jsx:5-20`
- Modify: `FrontEnd/src/modals/directory/OnboardingModal.jsx:100-140`

**Interfaces:**
- Consumes: `leaveService.approve`, `leaveService.reject`, `employeeService.create`
- Produces: Functional leave approvals, rendering contract PDFs without blank screens, clean employee onboarding.

- [ ] **Step 1: Wire action callbacks in `ModalContainer.jsx`**
- In `LeaveDetailViewModal` container block: define `handleApprove = async (id, note) => { await leaveService.approve(id, note); closeModal(); }` and `handleReject = async (id, note) => { ... }`. Pass `onApprove={handleApprove}` and `onReject={handleReject}`.
- In `ContractPdfPreviewModal`: pass `emp={payload}` as well as `payload={payload}`.

- [ ] **Step 2: Update `ContractPdfPreviewModal.jsx` and `OnboardingModal.jsx`**
- In `ContractPdfPreviewModal.jsx`: accept `{ emp, payload }` and resolve employee object as `const employee = payload || emp;`.
- In `OnboardingModal.jsx`: add state fields for `dob` and `phone` with sensible default inputs, rather than hardcoding `'1998-04-12'` and `'0912 888 999'` in payload.

- [ ] **Step 3: Verify build passes**
Run: `npm run build` in `FrontEnd`
Expected: 0 errors.

- [ ] **Step 4: Commit**
```bash
git add FrontEnd/src/modals/ModalContainer.jsx FrontEnd/src/modals/directory/ContractPdfPreviewModal.jsx FrontEnd/src/modals/directory/OnboardingModal.jsx
git commit -m "fix(modals): provide action callbacks and resolve prop/payload mismatches"
```

---

### Task 9: Fix Business Calculations in `LeaveManagementPage.jsx` & `AiAnalyticsPage.jsx`

**Files:**
- Modify: `FrontEnd/src/pages/LeaveManagementPage.jsx:50-55`
- Modify: `FrontEnd/src/pages/AiAnalyticsPage.jsx:40-90`

**Interfaces:**
- Consumes: `leaveService.getAll()`, `analyticsService.getSummary()`, `analyticsService.getNineBox()`
- Produces: Accurate pending leave counter and correct 9-Box matrix mapping matching Backend.

- [ ] **Step 1: Fix pending count in `LeaveManagementPage.jsx`**
Change `const pendingRequestsCount = Math.max(0, deptPendingRequests.length - approvedList.length);` to `const pendingRequestsCount = deptPendingRequests.length;`.

- [ ] **Step 2: Realign 9-Box grid in `AiAnalyticsPage.jsx`**
Update `NINE_BOX_TEMPLATES` to match backend `nineBox.js`:
- Cell 1: Cần cải thiện (PIP) (Low Perf, Low Pot)
- Cell 2: Đạt yêu cầu (Med Perf, Low Pot)
- Cell 3: Chuyên gia chuyên môn (High Perf, Low Pot)
- Cell 4: Nhân tố tiềm năng (Low Perf, Med Pot)
- Cell 5: Trụ cột ổn định (Med Perf, Med Pot)
- Cell 6: Tác động cao (High Perf, Med Pot)
- Cell 7: Triển vọng tương lai (Low Perf, High Pot)
- Cell 8: Ngôi sao đang lên (Med Perf, High Pot)
- Cell 9: Ngôi sao xuất sắc (High Perf, High Pot)
- Bind `analyticsData` values (avgScore, atRiskCount, topTalentsCount) to the top KPI cards.

- [ ] **Step 3: Verify build passes**
Run: `npm run build` in `FrontEnd`
Expected: 0 errors.

- [ ] **Step 4: Commit**
```bash
git add FrontEnd/src/pages/LeaveManagementPage.jsx FrontEnd/src/pages/AiAnalyticsPage.jsx
git commit -m "fix(analytics-leaves): align 9-Box matrix with backend and fix pending counter"
```

---

### Task 10: Create Missing Services (`contracts`, `ot`, `medical`, `notices`, `handbook`)

**Files:**
- Create: `FrontEnd/src/services/contractService.js`
- Create: `FrontEnd/src/services/otService.js`
- Create: `FrontEnd/src/services/medicalService.js`
- Create: `FrontEnd/src/services/noticeService.js`
- Create: `FrontEnd/src/services/handbookService.js`
- Modify: `FrontEnd/src/services/index.js`

**Interfaces:**
- Consumes: Backend API routes (`/api/contracts`, `/api/ot-requests`, `/api/medical-claims`, `/api/notices`, `/api/handbook`)
- Produces: Clean frontend API service functions.

- [ ] **Step 1: Create new service files**
Implement:
- `contractService.js`: `getAll`, `getById`, `getByEmployeeId`, `create`, `update`, `sign`, `terminate`.
- `otService.js`: `getAll`, `getMy`, `create`, `approve`, `reject`, `cancel`.
- `medicalService.js`: `getAll`, `getMy`, `create`, `approve`, `reject`.
- `noticeService.js`: `getAll`, `getById`, `create`, `update`, `delete`.
- `handbookService.js`: `getAll`, `getById`, `create`, `update`.

- [ ] **Step 2: Export in `services/index.js`**
Add all new services to the barrel export.

- [ ] **Step 3: Verify build passes**
Run: `npm run build` in `FrontEnd`
Expected: 0 errors.

- [ ] **Step 4: Commit**
```bash
git add FrontEnd/src/services/
git commit -m "feat(services): add services for contracts, OT requests, medical claims, notices and handbook"
```

---

### Task 11: Connect `EmployeePortalPage.jsx` & Modals to Real Services

**Files:**
- Modify: `FrontEnd/src/pages/EmployeePortalPage.jsx:1-150`
- Modify: `FrontEnd/src/modals/portal/OtRegisterModal.jsx:1-60`
- Modify: `FrontEnd/src/modals/leave/MedicalClaimModal.jsx:1-60`

**Interfaces:**
- Consumes: `attendanceService.getMyToday`, `leaveService.getBalances`, `payrollService.getMyPayslips`, `otService.create`, `medicalService.create`
- Produces: Live employee portal experience without hardcoded user stats.

- [ ] **Step 1: Connect `EmployeePortalPage.jsx` to live endpoints**
- Fetch today's attendance via `attendanceService.getMyToday()`.
- Fetch leave balance via `leaveService.getBalances('me')`.
- Fetch latest payslip via `payrollService.getMyPayslips()`.
- Wire check-in button to `attendanceService.checkIn({ method: 'manual' })` and update status banner.

- [ ] **Step 2: Connect `OtRegisterModal.jsx` and `MedicalClaimModal.jsx`**
- In `OtRegisterModal`: call `otService.create(formData)` on submit.
- In `MedicalClaimModal`: call `medicalService.create(formData)` on submit.

- [ ] **Step 3: Verify build passes**
Run: `npm run build` in `FrontEnd`
Expected: 0 errors.

- [ ] **Step 4: Commit**
```bash
git add FrontEnd/src/pages/EmployeePortalPage.jsx FrontEnd/src/modals/portal/OtRegisterModal.jsx FrontEnd/src/modals/leave/MedicalClaimModal.jsx
git commit -m "feat(portal): wire employee portal and self-service modals to live backend APIs"
```

---

### Task 12: System Verification & Final Build Check

**Files:**
- All changed files

**Interfaces:**
- Production build validation

- [ ] **Step 1: Run production build**
Run: `npm run build` in `FrontEnd`
Expected: 0 errors, clean asset output.

- [ ] **Step 2: Run backend health check or tests if applicable**
Verify Backend node server starts cleanly or checks pass.

- [ ] **Step 3: Summary and Review**
Confirm all 11 high/medium severity findings from the audit report are resolved.
