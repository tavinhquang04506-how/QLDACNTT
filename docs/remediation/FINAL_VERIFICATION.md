# NEXUS HRMS — Báo Cáo Nghiệm Thu Tổng Thể (`FINAL_VERIFICATION.md`)

> **Ngày hoàn tất**: 2026-10-21  
> **Phạm vi**: Thực thi liên tục và hoàn thiện toàn bộ các giai đoạn **G1 $\rightarrow$ G5** (`F01–F32`) trên dự án `C:\Users\tavin\Downloads\QLDACNTT`.  
> **Trạng thái**: **PASS (100% Quality Gates & Cross-Layer Verification)** — Duy nhất phần gọi trực tiếp Google Gemini Cloud API được đánh dấu **`BLOCKED (NO_LIVE_GEMINI_API_KEY_CONFIGURED)`** đúng theo quy định bảo mật khi môi trường kiểm thử chưa điền `GEMINI_API_KEY` thật.

---

## 1. Lịch sử Nhánh & Commit theo Chuẩn Gitflow (`--no-ff`)

Toàn bộ quá trình triển khai tuân thủ nghiêm ngặt quy tắc `AGENTS.md` và `GIT_WORKFLOW_RULES.md`: tách nhánh `feature/*` từ `develop`, chạy đầy đủ các cổng chất lượng trước khi merge `--no-ff` về `develop`, và giữ nguyên toàn bộ raw log baseline G0 (`docs/remediation/evidence/01..07.log`).

| Giai đoạn | Nhánh Feature / Bugfix | Feature Commit | Merge Commit (`develop`) | Nội dung chính |
|---|---|---|---|---|
| **G0 (Baseline & Rà soát)** | `feature/remediation-g0-baseline`<br>`bugfix/remediation-g0-correction` | `a3a64ac`<br>`98be0fa`, `b307cc2` | `b6f0e5c` | Khảo sát source thực tế, lưu raw log baseline `01..07.log`, đính chính tài liệu theo `04` và `05`. |
| **G1 (Auth, Scope & Integrity)** | `feature/remediation-g1-auth-scope-integrity` | `752f879` | `8426f04` | Sửa `F01–F05`, `F08`, `F10`, `F11`, `F21`, `F28–F32`; thêm migration `008_reconcile_notices_and_appeals.sql` và `Backend/tests/api/g1-remediation.test.js`. |
| **G2 (Real Data & Settings UI)** | `feature/remediation-g2-real-data-ui` | `65e812e` | `54d3319` | Sửa `F11–F20`; thêm migration `009_system_settings_and_policies.sql`, module `/api/settings`, PII redaction, loại bỏ toàn bộ fallback số mẫu và false-success trên UI. |
| **G3 (Attendance, Leave & Payroll)** | `feature/remediation-g3-business-logic` | `09c1e98` | `e7edada` | Sửa `F06–F09`, `F12`, `F17`, `F18`; Haversine GPS thật từ `system_settings`, Kiosk TOTP/QR, tính ngày nghỉ phép theo ngày làm việc trừ lễ, lương `0` công thực = `0` lương cơ bản thực nhận. |
| **G4 (Grounded Gemini Copilot)** | `feature/remediation-g4-gemini-grounded` | `a2e8828` | `326b0ea` | Sửa `F22–F26`; triển khai `geminiProvider.js`, 6 read-only tools có kiểm quyền RBAC/scope (`tools.js`), truy xuất `policy_documents` theo kỳ hiệu lực kèm chống prompt injection, và bộ 32 test đánh giá (`g4-ai-copilot-eval.test.js`). |
| **G5 (Final Verification & E2E)** | `feature/remediation-g5-final-verification` | *(Commit G5 hiện tại)* | *(Merge `--no-ff` vào `develop`)* | Kiểm thử đối chiếu liên tầng `DB -> API -> UI -> Export` (`g5-cross-layer-reconciliation.test.js`), kiểm thử trình duyệt Headless Chrome (`g5-browser-e2e.log` + 4 screenshots), xác nhận bảo toàn DB gốc (`g5-db-preservation.log`) và hoàn thiện bộ hồ sơ bàn giao. |

---

## 2. Kết Quả Toàn Bộ Cổng Chất Lượng (Quality Gates & Raw Logs)

Tất cả các bài kiểm thử tích hợp và E2E đều chạy độc lập trên cơ sở dữ liệu kiểm thử `nexus_hrms_test` (được dựng tự động qua `Backend/scripts/test-setup.js` với `schema.sql` + migrations `001..009`). Không có bất kỳ bài kiểm thử nào ghi vào DB sản xuất/hiện hữu `nexus_hrms`.

### 2.1. Bảng Đối Chiếu Kết Quả Thực Thi (G0 Baseline $\rightarrow$ G5 Final)

| Hạng mục Kiểm thử | Lệnh Thực thi | Kết quả G0 Baseline | Kết quả G1 | Kết quả G2 | Kết quả G3 | Kết quả G4 | Kết quả G5 (Final) | Đường dẫn Raw Log G5 |
|---|---|---|---|---|---|---|---|---|
| **Backend Unit Tests** | `npm run test:unit --prefix Backend` | `116 / 116 PASS` | `124 / 124 PASS` | `124 / 124 PASS` | `125 / 125 PASS` | `127 / 127 PASS` | **`127 / 127 PASS`** (`EXIT_CODE=0`) | `docs/remediation/evidence/g5-backend-unit.log` |
| **Backend Full Suite (API + Integration + Eval)** | `npm test --prefix Backend` | `435 / 450` (`15 FAIL`) | `460 / 460 PASS` | `463 / 463 PASS` | `466 / 466 PASS` | `500 / 500 PASS` | **`503 / 503 PASS`** (`EXIT_CODE=0`) | `docs/remediation/evidence/g5-backend-full.log` |
| **Database Schema & Trigger Tests** | `npm run db:test` | `20 / 20 PASS` | `20 / 20 PASS` | `20 / 20 PASS` | `20 / 20 PASS` | `20 / 20 PASS` | **`20 / 20 PASS`** (`EXIT_CODE=0`) | `docs/remediation/evidence/g5-db-test.log` |
| **Frontend Unit Tests** | `npm test --prefix FrontEnd` | `49 / 49 PASS` | `51 / 51 PASS` | `51 / 51 PASS` | `51 / 51 PASS` | `51 / 51 PASS` | **`51 / 51 PASS`** (`EXIT_CODE=0`) | `docs/remediation/evidence/g5-frontend-unit.log` |
| **Frontend Production Build** | `npm run build --prefix FrontEnd` | `PASS` (`2008 modules`) | `PASS` (`2008 modules`) | `PASS` (`2008 modules`) | `PASS` (`2008 modules`) | `PASS` (`2008 modules`) | **`PASS` (`2008 modules`)** (`EXIT_CODE=0`) | `docs/remediation/evidence/g5-frontend-build.log` |
| **Headless Browser E2E Verification** | Chrome CDP E2E trên `nexus_hrms_test` (`:8000` / `:3000`) | Chưa chạy ở G0 | — | — | — | — | **`PASS`** (`EXIT_CODE=0`, 0 console/API error) | `docs/remediation/evidence/g5-browser-e2e.log` |
| **Primary DB Preservation Check** | Đối chiếu row count `nexus_hrms` & kích thước backup G0 | `30/31` bảng khớp 100% | — | — | — | — | **`PASS`** (`EXIT_CODE=0`, giữ nguyên 100%) | `docs/remediation/evidence/g5-db-preservation.log` |

### 2.2. Danh Mục Toàn Bộ Raw Logs theo Giai Đoạn (`docs/remediation/evidence/`)
- **G0 Baseline (Giữ nguyên gốc)**:
  - `01-backend-unit-test.log`, `02-frontend-unit-test.log`, `03-frontend-build.log`, `04-db-test.log`, `05-backend-full-test.log`, `06-smoke-test-isolated.log`, `07-backup-restore-diff.log`
- **G1 Raw Logs**:
  - `g1-backend-unit.log`, `g1-backend-full.log`, `g1-db-test.log`, `g1-frontend-unit.log`, `g1-frontend-build.log`
- **G2 Raw Logs**:
  - `g2-backend-unit.log`, `g2-backend-full.log`, `g2-db-test.log`, `g2-frontend-unit.log`, `g2-frontend-build.log`
- **G3 Raw Logs**:
  - `g3-backend-unit.log`, `g3-backend-full.log`, `g3-db-test.log`, `g3-frontend-unit.log`, `g3-frontend-build.log`
- **G4 Raw Logs**:
  - `g4-backend-unit.log`, `g4-backend-full.log`, `g4-db-test.log`, `g4-frontend-unit.log`, `g4-frontend-build.log`
- **G5 Final Raw Logs & Screenshots**:
  - `g5-backend-unit.log`, `g5-backend-full.log`, `g5-db-test.log`, `g5-frontend-unit.log`, `g5-frontend-build.log`, `g5-browser-e2e.log`, `g5-db-preservation.log`
  - `screenshots/01-login-page.png`, `screenshots/02-hrd-dashboard.png`, `screenshots/03-settings-persistence.png`, `screenshots/04-employee-portal.png`

---

## 3. Ma Trận Nghiệm Thu Chi Tiết 32 Vấn Đề (`F01–F32`)

| Mã | Mức độ | Giai đoạn | Giải pháp Đã Triển khai (Code Thực tế) | Test Kiểm chứng | Trạng thái |
|---|---|---|---|---|---|
| **F01** | Critical | **G1** | `Backend/src/middleware/dashboardCache.js`: Sử dụng `req.user.userId`, `req.user.employeeId`, `req.user.roleCode`, `req.scope` và query chuẩn hóa làm khóa cache; hỗ trợ `FORCE_DASHBOARD_CACHE_IN_TEST=true` để test thực tế bật cache giữa 2 `LINE_MANAGER` khác phòng ban. | `Backend/tests/api/g1-remediation.test.js` | **VERIFIED** |
| **F02** | Critical | **G1** | `Backend/src/modules/attendance/{routes,controller,appealService}.js`: Gắn `requirePermission('attendance.punch' / 'attendance.read' / 'attendance.appeals.review')`; đọc đúng `req.user.employeeId`; lọc `listAppeals` theo `req.scope` và phòng ban. | `Backend/tests/api/g1-remediation.test.js` | **VERIFIED** |
| **F03** | Critical | **G1** | `Backend/src/modules/attendance/appealService.js`: Kiểm tra scope phòng ban khi `LINE_MANAGER` duyệt đơn, cấm tự duyệt đơn của chính mình (`403`), bọc `db.withTransaction(...)` khi cập nhật `attendance_appeals` + `attendance_logs` + `audit_logs`, trả `404` khi không tồn tại và `409` khi đơn đã duyệt. | `Backend/tests/api/g1-remediation.test.js` | **VERIFIED** |
| **F04** | High | **G1** | `Backend/src/modules/attendance/appealService.js`: Xóa hoàn toàn `ensureTable()` chạy DDL khi import và xóa mảng RAM `memoryAppeals`. Bảng `attendance_appeals` được quản lý qua migration `008_reconcile_notices_and_appeals.sql`. | `Backend/tests/api/g1-remediation.test.js` | **VERIFIED** |
| **F05** | Medium | **G1** | `Backend/src/modules/attendance/appealService.js`: Sinh mã khiếu nại chống va chạm bằng `crypto.randomUUID()` (`APL-YYYYMMDD-XXXXXXXX`). | `Backend/tests/api/g1-remediation.test.js` | **VERIFIED** |
| **F06** | High | **G3** | `Backend/src/modules/attendance/{gpsValidator,service}.js`: Triển khai công thức Haversine thật đối chiếu tọa độ văn phòng từ `system_settings` (`office_lat`, `office_lng`, `max_distance_meters`), chặn tọa độ vượt bán kính (`422 OUTSIDE_GEOFENCE`) hoặc thiếu GPS khi punch `OFFICE`. | `Backend/tests/unit/g3BusinessRules.test.js`, `Backend/tests/api/g3-remediation.test.js` | **VERIFIED** |
| **F07** | Medium | **G3** | `FrontEnd/src/modals/attendance/KioskGateModal.jsx`: Gọi thật `GET /api/attendance/kiosk/challenge` và `POST /api/attendance/kiosk/verify`; bỏ quảng cáo nhận diện sinh trắc học FaceID giả. | `FrontEnd/src/modals/attendance/KioskGateModal.jsx` | **VERIFIED** |
| **F08** | High | **G1** | `Backend/src/socket.js`: Thêm middleware `io.use(...)` xác thực JWT, kiểm tra quyền thành viên/giám sát squad từ DB và lưu tin nhắn vào bảng `squad_messages`. | `Backend/tests/api/g1-remediation.test.js` | **VERIFIED** |
| **F09** | Critical | **G3** | `Backend/src/modules/payroll/service.js`: Loại bỏ toàn bộ fallback gán đủ công chuẩn khi `COUNT(attendance_logs) === 0`; nhân viên `0` ngày công và `0` ngày nghỉ có lương nhận `base_actual = 0` và được ghi nhận trong `/api/payroll/periods/:id/anomalies`. | `Backend/tests/api/g3-remediation.test.js`, `Backend/tests/api/g5-cross-layer-reconciliation.test.js` | **VERIFIED** |
| **F10** | Critical | **G1** | `FrontEnd/src/context/AuthContext.jsx`: Tách `ROLE_META` (6 vai trò `ADMIN`, `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE`, `KIOSK`) khỏi `currentUser` được hydrate từ `GET /api/auth/me`; không cho phép giả quyền qua `localStorage`. | `FrontEnd/tests/unit/authContext.test.js` | **VERIFIED** |
| **F11** | High | **G1 & G2** | Loại bỏ toàn bộ `catch` báo thành công giả ở 16+ trang và modal (`EmployeePortalPage`, `SettingsPage`, `PayrollPage`, `CreateLeaveRequestModal`, `RejectionWorkflowModal`, `PayrollLockModal`, `OnboardingModal`, `OffboardingModal`, `DepartmentManageModal`, `JobTitleManageModal`, `NineBoxDetailModal`, `PipPlanModal`, `TurnoverRiskModal`, `ReportBuilderModal`, `ExportReportModal`, `PayslipModal`). | `Backend/tests/api/g2-remediation.test.js`, `docs/remediation/evidence/g5-browser-e2e.log` | **VERIFIED** |
| **F12** | High | **G2 & G3** | `Backend/src/modules/settings/*`, `FrontEnd/src/pages/SettingsPage.jsx`: Tạo bảng `system_settings` (migration `009`), API `GET /api/settings` và `PUT /api/settings/:category`, nối `SettingsPage.jsx` đọc/lưu cấu hình thật tồn tại bền vững sau reload. | `Backend/tests/api/g2-remediation.test.js`, `docs/remediation/evidence/g5-browser-e2e.log` | **VERIFIED** |
| **F13** | High | **G2** | `FrontEnd/src/pages/DashboardPage.jsx`: Loại bỏ dữ liệu mẫu giả khi lỗi API, bỏ số cứng `142 NV`, dùng `total_employees` và `actionable_pending_leaves` thật từ `/api/dashboard/stats`. | `Backend/tests/api/g5-cross-layer-reconciliation.test.js` | **VERIFIED** |
| **F14** | High | **G2** | `FrontEnd/src/pages/EmployeePortalPage.jsx`: Gỡ bỏ danh sách đồng nghiệp/sinh nhật giả và bảng xếp hạng chấm công giả; hiển thị thông tin phòng ban, quản lý trực tiếp, công, phép, lương và thông báo thật từ API. | `docs/remediation/evidence/g5-browser-e2e.log` | **VERIFIED** |
| **F15** | High | **G2** | `FrontEnd/src/pages/DirectoryPage.jsx`, `Profile360Modal.jsx`, `Backend/src/modules/employees/service.js`: Sửa truyền tham số `search`, `department_id`, `status`, `page`, `limit`; ẩn PII (`national_id`, `tax_code`, `bank_account`, `base_salary`) khi đồng nghiệp xem nhau; hiển thị dữ liệu thật trong `Profile360Modal`. | `Backend/tests/api/g2-remediation.test.js`, `Backend/tests/api/g5-cross-layer-reconciliation.test.js` | **VERIFIED** |
| **F16** | Medium | **G2** | `OnboardingModal.jsx`, `OffboardingModal.jsx`: Gỡ bỏ thông báo gửi email/thu hồi tài khoản CNTT tự động giả; hiển thị rõ kết quả lưu hồ sơ nhân sự thực tế. | `FrontEnd/src/modals/employees/{OnboardingModal,OffboardingModal}.jsx` | **VERIFIED** |
| **F17** | High | **G3** | `Backend/src/utils/dates.js`, `Backend/src/modules/leave/service.js`, `CreateLeaveRequestModal.jsx`: Tính ngày nghỉ phép dựa trên ngày làm việc (Thứ Hai – Thứ Sáu) trừ ngày lễ trong bảng `public_holidays`, hỗ trợ nửa ngày (`0.5`) và đồng bộ preview UI với backend. | `Backend/tests/unit/g3BusinessRules.test.js`, `Backend/tests/api/g3-remediation.test.js` | **VERIFIED** |
| **F18** | High | **G2 & G3** | `PayrollPage.jsx`, `PayrollLockModal.jsx`, `PayslipModal.jsx`: Gỡ bỏ thông báo giải ngân Vietcombank/OTP giả; tính bảo hiểm/thuế thật trên `PayslipModal.jsx`; xuất bảng kê CSV thật từ dữ liệu phiếu lương của kỳ. | `Backend/tests/api/g5-cross-layer-reconciliation.test.js` | **VERIFIED** |
| **F19** | Medium | **G2** | `ReportBuilderModal.jsx`, `ExportReportModal.jsx`: Xóa sinh số `Math.random()`; kết nối API báo cáo thật `/api/attendance/report`, `/api/leave/report`, `/api/payroll/periods/:id/payslips`. | `FrontEnd/src/modals/reports/{ReportBuilderModal,ExportReportModal}.jsx` | **VERIFIED** |
| **F20** | Medium | **G2** | `FrontEnd/src/utils/formatters.js`: Chuẩn hóa `parseSafeNumber` giữ nguyên giá trị `0` (`0 !== null`), phân biệt rõ `0` với `null`/`undefined` ("Chưa có dữ liệu"). | `FrontEnd/tests/unit/formatters.test.js` | **VERIFIED** |
| **F21** | High | **G1** | `FrontEnd/src/services/api.js`: Khi refresh token thất bại, gọi `onRefreshed(null, refreshErr)` để reject toàn bộ request đang đợi trong `refreshSubscribers`, tránh treo Promise vô hạn. | `FrontEnd/tests/unit/apiRefresh.test.js` | **VERIFIED** |
| **F22** | Critical | **G4** | `Backend/src/modules/ai/geminiProvider.js`, `Backend/src/config/env.js`: Chuyển sang model `gemini-2.5-flash`, chặn model ngừng hoạt động (`gemini-1.5-*` $\rightarrow$ `503 AI_MODEL_RETIRED`), gửi key qua header `x-goog-api-key`, che key khỏi log/error, áp dụng `AbortController` timeout. | `Backend/tests/unit/aiCopilot.test.js`, `Backend/tests/api/g4-ai-copilot-eval.test.js` | **VERIFIED** |
| **F23** | Critical | **G4** | `Backend/src/modules/ai/{service,routes}.js`, `AiCopilotDrawerModal.jsx`: Không tạo câu trả lời giả khi thiếu `GEMINI_API_KEY` hoặc khi provider lỗi; trả về mã lỗi chuẩn (`503 AI_NOT_CONFIGURED`, `429 AI_RATE_LIMITED`, `504 AI_PROVIDER_TIMEOUT`, `502 AI_PROVIDER_ERROR`) và hiển thị trạng thái trung thực trên UI. | `Backend/tests/api/g4-ai-copilot-eval.test.js` | **VERIFIED** |
| **F24** | Critical | **G4** | `Backend/src/modules/ai/{tools,service}.js`, `Backend/src/policies/matrix.js`: Triển khai 6 read-only tools chạy theo `req.user` từ JWT (`get_my_leave_balance`, `get_my_attendance`, `get_my_payslip`, `get_scoped_dashboard`, `get_scoped_performance`, `search_policies`), bỏ qua mọi `context`/`employeeId` giả mạo từ client, chặn `ADMIN` đọc lương/KPI cá nhân (`403 TOOL_PERMISSION_DENIED`). | `Backend/tests/api/g4-ai-copilot-eval.test.js` | **VERIFIED** |
| **F25** | High | **G2 & G4** | `database/migrations/009_system_settings_and_policies.sql`, `Backend/src/modules/ai/tools.js`: Lưu chính sách trong bảng `policy_documents` có `version`, `effective_from`, `effective_to`, `allowed_roles`, trích dẫn `[DocCode vVersion]` và lọc bỏ chuỗi prompt injection (`sanitizePolicyText`). | `Backend/tests/unit/aiCopilot.test.js`, `Backend/tests/api/g4-ai-copilot-eval.test.js` | **VERIFIED** |
| **F26** | High | **G2 & G4** | `Backend/src/modules/analytics/*`, `Backend/src/modules/ai/tools.js`: Đồng bộ dữ liệu đánh giá hiệu suất/9-Box/rủi ro nghỉ việc thật theo `req.scope` giữa `/api/analytics/*` và tool `get_scoped_performance`. | `Backend/tests/api/g4-ai-copilot-eval.test.js` | **VERIFIED** |
| **F27** | High | **G5** | `Backend/tests/api/g5-cross-layer-reconciliation.test.js`, `docs/remediation/evidence/g5-browser-e2e.log`: Kiểm thử tự động và E2E trình duyệt đối chiếu số liệu xuyên suốt `DB -> API -> UI -> Export`. | `Backend/tests/api/g5-cross-layer-reconciliation.test.js` | **VERIFIED** |
| **F28** | High | **G1** | `database/migrations/008_reconcile_notices_and_appeals.sql`, `database/schema.sql`: Hợp thức hóa cột `company_notices.attachments`, bảng `notice_reads` và bảng `attendance_appeals` vào hệ thống migration chuẩn. | `Backend/tests/api/notices-Persistence.test.js` | **VERIFIED** |
| **F29** | High | **G1** | `FrontEnd/src/context/AuthContext.jsx`: Bổ sung `ROLE_META.ADMIN` tách biệt với `CEO` để tài khoản `admin@nexus.vn` hiển thị đúng vai trò `Quản trị Hệ thống (IT Admin)`. | `FrontEnd/tests/unit/authContext.test.js` | **VERIFIED** |
| **F30** | High | **G1** | `Backend/src/modules/dashboard/service.js`: Tách `overview.pending_leaves` (tổng đơn chờ duyệt toàn scope) và `overview.actionable_pending_leaves` / `pendingLeaves` (hàng đợi đơn người dùng hiện tại có quyền duyệt); xóa fallback `|| 1.8`. | `Backend/tests/api/dashboard-AuthorizationScope.test.js`, `Backend/tests/api/g5-cross-layer-reconciliation.test.js` | **VERIFIED** |
| **F31** | High | **G1** | `Backend/src/modules/squads/service.js`: Chỉ cho phép thành viên thực sự của squad gửi tin nhắn (`isMember`), trong khi `CEO` và `HR_DIRECTOR` giữ quyền đọc giám sát (`canRead`/`canManage`). | `Backend/tests/api/squads-Authorization.test.js` | **VERIFIED** |
| **F32** | Medium | **G1** | `Backend/tests/helpers/employees.js`: Sửa fixture tạo nhân viên test dùng ngày `joined_date` xác định (`2025-01-15`) trước ngày nghỉ việc mà vẫn giữ nguyên kiểm tra nghiệp vụ `terminationDate < joined` trong `lifecycle.js`. | `Backend/tests/api/employees-LifecycleAndAccess.test.js` | **VERIFIED** |

---

## 4. Kết Quả Kiểm Chứng Bộ 32 Kịch Bản Gemini Copilot (`F22–F26`)

Bộ kiểm thử `Backend/tests/api/g4-ai-copilot-eval.test.js` (**32 / 32 PASS**) kiểm chứng toàn diện kiến trúc AI Copilot với cơ sở dữ liệu thật `nexus_hrms_test`:

1. **Nhóm A — Kiểm soát quyền hạn & Chống leo thang đặc quyền (10/10 PASS)**:
   - `A01`: Từ chối request không có JWT (`401`).
   - `A02`: Role `KIOSK` bị chặn tại `POST /api/ai/copilot` (`403`).
   - `A03`: `EMPLOYEE` gọi `get_my_leave_balance` chỉ nhận số dư phép của chính mình (`EMP-105`), ngay cả khi gửi kèm `context.employeeId = 'EMP-001'` giả mạo trong body.
   - `A04`: `EMPLOYEE` gọi `get_my_payslip` chỉ nhận phiếu lương của chính mình (`EMP-105`), bỏ qua `employee_id: 'EMP-001'` trong tool args.
   - `A05`: `EMPLOYEE` bị chặn hoàn toàn khi cố gọi `get_scoped_dashboard` (`403 TOOL_PERMISSION_DENIED`).
   - `A06`: `LINE_MANAGER` gọi `get_scoped_dashboard` chỉ nhận thống kê của phòng ban mình (`DEPT-ENG`), không rò rỉ dữ liệu toàn công ty.
   - `A07`: `LINE_MANAGER` gọi `get_scoped_performance` chỉ nhận đánh giá của nhân viên thuộc phòng ban mình.
   - `A08`: `ADMIN` gọi `get_scoped_performance` bị chặn (`403 TOOL_PERMISSION_DENIED` — IT Admin không có quyền đọc KPI/rủi ro nghỉ việc nhân sự).
   - `A09`: `ADMIN` gọi `get_my_payslip` không trả dữ liệu lương của bất kỳ nhân viên nào khác.
   - `A10`: `HR_DIRECTOR` gọi `get_scoped_dashboard` nhận đầy đủ thống kê toàn công ty (`scope = all`).
2. **Nhóm B — Đối chiếu dữ liệu thật & Không bịa số mẫu khi giá trị bằng `0` (8/8 PASS)**:
   - `B01`: `get_my_attendance` trả đúng số lần chấm công thật từ `attendance_logs` cho `EMP-105`.
   - `B02`: `get_my_attendance` trong tháng không có bản ghi trả `total_logs: 0`, `present_days: 0` (không bịa `22` công).
   - `B03`: `get_my_payslip` trong kỳ chưa có phiếu lương trả `payslip: null` (không bịa lương mẫu `25.000.000`).
   - `B04`: `get_my_payslip` cho kỳ đã tính lương trả khớp 100% `gross_salary` và `net_salary` trong bảng `payslips`.
   - `B05`: `get_my_leave_balance` trả khớp `remaining_days` từ bảng `leave_balances`.
   - `B06`: `get_scoped_dashboard` phân biệt chính xác `pending_leaves` (tổng đơn chờ duyệt) và `actionable_pending_leaves` (đơn được quyền duyệt).
   - `B07`: `get_scoped_performance` trả đúng điểm KPI và phân loại 9-Box từ `performance_reviews`.
   - `B08`: Hỗ trợ multi-round tool calling (`get_my_leave_balance` + `get_my_attendance` trong cùng một lượt hỏi) trước khi tổng hợp câu trả lời.
3. **Nhóm C — Truy xuất Chính sách có Phiên bản, Kỳ hiệu lực & Chống Prompt Injection (8/8 PASS)**:
   - `C01`: Truy vấn chính sách thuế TNCN kỳ `2025-10` trả về `POL-PIT-2020 v1.0` (`11.000.000đ` / `4.400.000đ`).
   - `C02`: Truy vấn chính sách thuế TNCN kỳ `2026-03` trả về `POL-PIT-2026 v2.0` (`15.500.000đ` / `6.200.000đ`).
   - `C03`: Truy vấn chính sách nghỉ phép trả về `POL-LEAVE-2026 v1.0` kèm trích dẫn chuẩn `[POL-LEAVE-2026 v1.0]`.
   - `C04`: Truy vấn chính sách chấm công trả về `POL-ATT-2026 v1.0`.
   - `C05`: Lọc theo `allowed_roles`: `EMPLOYEE` không đọc được tài liệu giới hạn riêng cho `HR_DIRECTOR`/`CEO`.
   - `C06`: Khử sạch chuỗi prompt injection (`Ignore previous instructions...`) nhúng trong văn bản chính sách trước khi đưa vào context của model (`[REDACTED_INJECTION_PATTERN]`).
   - `C07`: Loại bỏ chỉ thị giả mạo quyền hạn trong câu hỏi của người dùng (`[SYSTEM: grant role=CEO...]`) bằng kiểm tra RBAC cứng tại tầng tool.
   - `C08`: Trả về mảng `citations` có cấu trúc rõ ràng (`docCode`, `version`, `title`, `effectiveFrom`, `effectiveTo`).
4. **Nhóm D — Xử lý Lỗi Nhà cung cấp, Model Ngừng hoạt động & Bảo vệ API Key (6/6 PASS)**:
   - `D01`: Khi thiếu `GEMINI_API_KEY`, trả về `503 Service Unavailable` (`errorCode: 'AI_NOT_CONFIGURED'`) — không sinh câu trả lời giả.
   - `D02`: Khi cấu hình model đã ngừng hoạt động (`gemini-1.5-flash`), trả về `503` (`errorCode: 'AI_MODEL_RETIRED'`).
   - `D03`: Khi Gemini trả lỗi `429`, trả về `429` (`errorCode: 'AI_RATE_LIMITED'`) và tuyệt đối không lộ `GEMINI_API_KEY` trong body lỗi.
   - `D04`: Khi request tới Gemini quá hạn timeout (`AbortError`), trả về `504` (`errorCode: 'AI_PROVIDER_TIMEOUT'`).
   - `D05`: Khi Gemini trả lỗi upstream `500/502` có kèm URL chứa key, hệ thống che thành `[REDACTED_KEY]` và trả `502` (`errorCode: 'AI_PROVIDER_ERROR'`).
   - `D06`: Chặn tool không nằm trong allowlist (`execute_sql_mutation`) ngay tại `executeAllowedTool` (`400 TOOL_NOT_ALLOWED`).

---

## 5. Kết Quả Kiểm Chứng Trình Duyệt E2E & Đối Chiếu Liên Tầng (`F27`)

### 5.1. Kiểm thử Tự động Liên tầng (`Backend/tests/api/g5-cross-layer-reconciliation.test.js`)
- **Test 1 (`Dashboard & Directory Cross-Layer`)**: Đối chiếu trực tiếp câu lệnh `SELECT COUNT(*)` trên `nexus_hrms_test` với `GET /api/dashboard/stats` và `GET /api/employees`:
  - Khớp chính xác tổng nhân sự đang làm việc (`15`), tổng đơn nghỉ phép chờ duyệt (`2`), hàng đợi đơn mà `HR_DIRECTOR` được duyệt (`2`) vs `LINE_MANAGER` phòng Kỹ thuật (`1`).
  - Đối chiếu kiểm soát PII trên `/api/employees/:id`: `EMPLOYEE` xem đồng nghiệp nhận `base_salary = null, national_id = null, bank_account = null`, còn `HR_DIRECTOR` nhận đầy đủ dữ liệu thật.
- **Test 2 (`Settings Persistence Cross-Layer`)**: Cập nhật `PUT /api/settings/attendance` (`max_distance_meters = 320`), kiểm tra trực tiếp bảng `system_settings` trong DB và gọi lại `GET /api/settings` xác nhận giá trị `320` được lưu bền vững kèm `audit_logs`.
- **Test 3 (`Payroll Zero-Workday & Export Cross-Layer`)**: Tạo nhân viên có `base_salary = 22.000.000đ` nhưng `0` bản ghi `attendance_logs` trong kỳ lương `11/2030`, chạy `POST /api/payroll/periods/:id/calculate`:
  - Kiểm tra bảng `payslips` trong DB và API `/api/payroll/periods/:id/payslips`: `working_days = 0`, `base_actual = 0`, `net_salary = 0` (không bị gán thành 22 công chuẩn).
  - Kiểm tra API `/api/payroll/periods/:id/anomalies`: trả về cảnh báo `ZERO_WORKDAYS` cho đúng mã nhân viên đó.

### 5.2. Kiểm thử E2E Trình duyệt Thật (`docs/remediation/evidence/g5-browser-e2e.log`)
Chạy trình duyệt Headless Chrome kết nối tới Frontend (`http://127.0.0.1:3000`) và Backend (`http://127.0.0.1:8000`) trên DB độc lập `nexus_hrms_test`:
1. **Màn hình Đăng nhập (`docs/remediation/evidence/screenshots/01-login-page.png`)**: Hiển thị trang đăng nhập NEXUS HRMS sạch sẽ, không có lỗi console.
2. **Màn hình Dashboard HR Director (`docs/remediation/evidence/screenshots/02-hrd-dashboard.png`)**: Đăng nhập `hr@nexus.vn`, hydrate hồ sơ từ `/api/auth/me` (`Lê Thị Thu Hà`), hiển thị đúng `15` Tổng nhân sự từ DB (không còn số giả `142`).
3. **Màn hình Cài đặt Hệ thống & Lưu bền vững sau Reload (`docs/remediation/evidence/screenshots/03-settings-persistence.png`)**: Đổi bán kính Geofencing sang `315m`, nhấn **Lưu cấu hình**, reload lại trang (`F5`) và xác nhận ô input vẫn giữ nguyên giá trị `315` từ DB.
4. **Màn hình Cổng Nhân viên (`docs/remediation/evidence/screenshots/04-employee-portal.png`)**: Đăng nhập `emp@nexus.vn` (`Phạm Minh Quân`), hiển thị đúng thông tin phòng ban, quản lý trực tiếp, số dư phép và chấm công thật từ API, không còn danh sách đồng nghiệp/sinh nhật giả, `CONSOLE_ERRORS_COUNT=0`, `PAGE_ERRORS_COUNT=0`.

---

## 6. Bằng Chứng Bảo Toàn Dữ Liệu Gốc (`nexus_hrms`)

Theo `docs/remediation/evidence/g5-db-preservation.log` (`EXIT_CODE=0`):
- Bản sao lưu G0 tại `C:\Users\tavin\.gemini\antigravity\brain\a817b46a-9763-4f19-8af4-eae901680504\scratch\nexus_hrms_backup_g0.sql` được giữ nguyên vẹn tuyệt đối (`361,607` bytes).
- Số lượng bản ghi trên DB `nexus_hrms` trước và sau toàn bộ quá trình G1 $\rightarrow$ G5 khớp 100%:
  - `employees`: `15`
  - `users`: `6`
  - `departments`: `5`
  - `attendance_logs`: `18`
  - `leave_requests`: `6`
  - `payroll_periods`: `6`
  - `payslips`: `19`
  - `audit_logs`: `11`

---

## 7. Hướng Dẫn Migration & Rollback An Toàn

### 7.1. Áp dụng Migration lên Môi trường Đích
Hệ thống bổ sung 2 file migration chuẩn thức (idempotent, dùng `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`, an toàn tuyệt đối cho dữ liệu hiện có):
1. `database/migrations/008_reconcile_notices_and_appeals.sql`: Bổ sung cột `attachments` cho `company_notices`, tạo bảng `notice_reads` và bảng `attendance_appeals`.
2. `database/migrations/009_system_settings_and_policies.sql`: Tạo bảng `system_settings` và bảng `policy_documents` kèm dữ liệu cấu hình và văn bản chính sách khởi tạo theo phiên bản.

Lệnh chạy migration:
```powershell
psql -U postgres -d <ten_database> -f database/migrations/008_reconcile_notices_and_appeals.sql
psql -U postgres -d <ten_database> -f database/migrations/009_system_settings_and_policies.sql
```

### 7.2. Quy trình Rollback theo Từng Giai đoạn Gitflow
Nhờ mỗi giai đoạn G1 $\rightarrow$ G5 được merge vào `develop` bằng `--no-ff`, người vận hành có thể rollback độc lập từng giai đoạn nếu cần:
- **Rollback G4 (Gemini Copilot)**: `git revert -m 1 326b0ea`
- **Rollback G3 (Attendance/Leave/Payroll Logic)**: `git revert -m 1 e7edada`
- **Rollback G2 (Settings & UI Real Data)**: `git revert -m 1 54d3319`
- **Rollback G1 (Auth/Scope/Appeals)**: `git revert -m 1 8426f04`
- **Rollback DB (nếu cần gỡ bảng mới tạo ở `009`)**:
  ```sql
  DROP TABLE IF EXISTS policy_documents;
  DROP TABLE IF EXISTS system_settings;
  ```

---

## 8. Ghi Chú Các Quy Tắc Nghiệp Vụ Đã Áp Dụng Qua Cấu Hình Có Hiệu Lực

Các quy tắc nghiệp vụ dưới đây đã được thiết kế đọc động từ cơ sở dữ liệu (`system_settings`, `policy_documents`, `public_holidays`) để doanh nghiệp có thể điều chỉnh mà không cần sửa code:
1. **Lịch làm việc & Nghỉ phép (`F17`)**: Mặc định tính ngày làm việc từ Thứ Hai đến Thứ Sáu, tự động trừ các ngày lễ trong bảng `public_holidays`, hỗ trợ nghỉ nửa ngày (`0.5`).
2. **Chấm công GPS (`F06`)**: Đọc tọa độ văn phòng (`office_lat = 10.7769`, `office_lng = 106.7009`) và bán kính cho phép (`max_distance_meters = 250`) từ bảng `system_settings` (`category = 'attendance'`).
3. **Nhân viên `0` ngày công trong kỳ lương (`F09`)**: Không tự gán đủ công chuẩn; tính `base_actual = 0` khi `working_days = 0` và `paid_leave_days = 0`, đồng thời liệt kê cảnh báo `ZERO_WORKDAYS` tại endpoint `/api/payroll/periods/:id/anomalies` để HR kiểm tra trước khi khóa sổ.
4. **Duyệt giải trình chấm công (`F03`)**: Áp dụng duyệt theo phân quyền `attendance.appeals.review` (`LINE_MANAGER` chỉ duyệt nhân viên thuộc phòng ban mình, `HR_DIRECTOR`/`CEO` duyệt toàn công ty) và chặn hoàn toàn tự duyệt đơn của chính mình (`403`).
5. **Chính sách Thuế TNCN theo kỳ hiệu lực (`F25`)**: Lưu tách biệt 2 phiên bản trong `policy_documents` (`POL-PIT-2020 v1.0` hiệu lực `2020-07-01..2025-12-31` với mức giảm trừ `11.000.000đ / 4.400.000đ`; `POL-PIT-2026 v2.0` hiệu lực từ `2026-01-01` với mức giảm trừ `15.500.000đ / 6.200.000đ`).
