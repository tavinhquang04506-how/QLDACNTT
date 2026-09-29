# NEXUS HRMS — Tiến độ Hoàn thiện & Khắc phục (`PROGRESS.md`)

> **Cập nhật lần cuối**: 2026-10-20 (Hoàn tất đính chính Checkpoint G0 theo `04-REVIEW-G0-VA-PROMPT-DINH-CHINH.md`)  
> **Giai đoạn hiện tại**: **G0 — Đã đính chính tài liệu & bằng chứng raw log (Chờ duyệt chuyển sang G1)**  
> **Nguyên tắc**: Chỉ sửa tài liệu & bằng chứng G0 trong lượt này; **chưa sửa bất kỳ file mã nguồn sản phẩm nào** (`Backend/src/**`, `FrontEnd/src/**`, `database/**`).

---

## 1. Bảng Tổng hợp Trạng thái các Giai đoạn (G0 – G5)

| Giai đoạn | Mục tiêu trọng tâm | Trạng thái | Ghi chú / Kết quả kiểm chứng |
|---|---|---|---|
| **G0** | Khảo sát, xác minh mã nguồn thực tế, lưu raw log baseline, đối chiếu backup DB cách ly, lập `BASELINE.md`, `ISSUES.md`, `DATA_SOURCE_MATRIX.md`, `PROGRESS.md` | **READY FOR RE-REVIEW** | Đã đính chính toàn bộ 11 điểm nhận xét độc lập và bổ sung 7 file raw log tại `docs/remediation/evidence/`. |
| **G1** | Quyền hạn, tính toàn vẹn giao dịch, cache, WebSocket auth, session persona, refresh queue & chặn false-success trọng yếu (`F01–F05`, `F08`, `F10`, `F11`, `F21`, `F28–F32`) | **PENDING** | Đã điều chỉnh kế hoạch chi tiết theo cấu trúc thực tế của `policies/matrix.js`, `AuthContext.jsx`, `dashboard/service.js`, `projects/access.js`, `employees/lifecycle.js`. |
| **G2** | Loại bỏ dữ liệu giả/hardcode trên toàn bộ UI, chuẩn hóa enum/numeric/pagination, lưu cấu hình Settings thật (`F11–F20`) | **PENDING** | Bám sát phần `AS-IS` $\rightarrow$ `TO-BE` trong `DATA_SOURCE_MATRIX.md`. |
| **G3** | Chuẩn hóa nghiệp vụ Chấm công (GPS/Kiosk), Nghỉ phép (lịch làm việc/ngày lễ/nửa ngày), Bảng lương (`0` công vs thiếu log, snapshot chính sách, xuất lệnh chi ngân hàng) (`F06`, `F07`, `F09`, `F12`, `F17`, `F18`, `F26`) | **PENDING** | Thực hiện sau G2 và xác nhận quy tắc nghiệp vụ. |
| **G4** | Tích hợp Gemini Copilot chuẩn kiến trúc bảo mật, allowlist read-only tools có kiểm quyền, nguồn chính sách có phiên bản/ACL, bộ eval $\ge 30$ cases (`F22–F26`) | **PENDING** | Theo `02-THIET-KE-GEMINI.md`. |
| **G5** | Nghiệm thu tổng thể: Unit + Integration + E2E trên `nexus_hrms_test`, kiểm tra UI đa vai trò, bundle/build, báo cáo bàn giao (`F27`) | **PENDING** | — |

---

## 2. Tổng hợp các điểm đã đính chính tại G0 (`04-REVIEW-G0-VA-PROMPT-DINH-CHINH.md`)

1. **Test runner & Raw Logs (`BASELINE.md`, `docs/remediation/evidence/01..07.log`)**:
   - Đính chính `FrontEnd` dùng Node built-in test runner (`node --test "tests/**/*.test.js"` tại `FrontEnd/package.json:10`, kết quả `tests 49, suites 13, pass 49, fail 0`), **không phải Vitest**.
   - Lưu đầy đủ raw stdout/stderr kèm `[EXIT_CODE=...]` cho toàn bộ lệnh baseline tại `docs/remediation/evidence/` và trích dẫn nguyên văn trong `BASELINE.md` (`2008 modules transformed` khi build Vite; `tests 116, suites 0, pass 116` cho unit test backend; `tests 450, suites 0, pass 435, fail 15` cho full test backend).
2. **Hệ thống quyền & Route Appeals (`ISSUES.md` — `F02`, `F03`)**:
   - Đính chính ma trận phân quyền nằm tại `Backend/src/policies/matrix.js` và `Backend/src/policies/index.js` với tên quyền dạng dấu chấm (`attendance.punch`, `attendance.read`, `attendance.report`, `attendance.kiosk`, `attendance.adjust`, `attendance.appeals.review`), **không tồn tại** `Backend/src/config/permissions.js`.
   - Tại `Backend/src/modules/attendance/routes.js:24-26`, `PUT /api/attendance/appeals/:id/review` **đã gắn** `requirePermission('attendance.appeals.review')` (`CEO: 'all'`, `HR_DIRECTOR: 'all'`, `LINE_MANAGER: 'department'`), còn `POST /appeals` và `GET /appeals` chưa gắn `requirePermission`. Lỗi cốt lõi ở `reviewAppeal` là `controller.js:76-84` và `appealService.js:105-180` không áp dụng `req.scope` và đọc sai `req.user?.id || req.user?.employee_id`.
3. **Module AI (`ISSUES.md` — `F22`, `F23`, `F24`, `F25`)**:
   - Đính chính `Backend/src/modules/ai/routes.js:10,13,34` **đã có** `router.use(authenticate)` và 2 endpoint thực tế là `POST /api/ai/copilot` và `GET /api/ai/knowledge` (không có `ai/controller.js` và không có `/api/ai/chat`).
   - Đã kiểm chứng bằng grep: `Backend/src/modules/ai/service.js:18` chỉ đọc `process.env.GEMINI_API_KEY`; **không có** `VITE_GEMINI_API_KEY` trong `Backend/src` hay `FrontEnd/src`.
4. **Module Analytics (`ISSUES.md` — `F26`, `DATA_SOURCE_MATRIX.md` mục 8)**:
   - Đính chính toàn bộ route phân tích nằm dưới `/api/analytics/*` trong `Backend/src/modules/analytics/{routes,controller,reviews,nineBox,turnover,risk,pip,schema}.js` (không có `/api/performance-reviews` hay `/api/pip-plans`) và modal thực tế là `NineBoxDetailModal.jsx`, `PipPlanModal.jsx`, `TurnoverRiskModal.jsx`.
5. **`AuthContext.jsx` (`ISSUES.md` — `F10`, `F29`)**:
   - Đính chính `FrontEnd/src/context/AuthContext.jsx:5-96` **đã có** `ROLES.KIOSK` (`id: 'KIOSK-01'`), chỉ thiếu `ROLES.ADMIN` (có alias `ROLES.ADMIN_CEO = ROLES.CEO`); `ROLES.EMPLOYEE` có tên `'Phạm Minh Quân'` (`id: 'NV-0842'`); `AuthContext.jsx` không tự định nghĩa `baseSalary`/`leaveBalance` mà các component tiêu thụ (`AiCopilotDrawerModal.jsx:59`, `Profile360Modal.jsx:55`, `PayrollPage.jsx:228`) đọc `currentRole?.leaveBalance || 12` / `currentRole?.baseSalary` rồi fallback sang số cứng.
6. **`dashboardCache.js` (`ISSUES.md` — `F01`)**:
   - Đính chính `Backend/src/middleware/dashboardCache.js:6,12` có `CACHE_TTL_MS = 15000` (15 giây) và key `${req.user.id}:${req.user.roleCode}:${req.scope || ''}` (không có tiền tố `dashboard:`) trên route `GET /api/dashboard/stats`.
7. **Giải thích lỗi Git trước đó (`BASELINE.md` mục 1.1)**:
   - Loại bỏ suy đoán chưa kiểm chứng về tiến trình nền của OS; chỉ ghi nhận sự khác biệt đã xác minh giữa môi trường sandbox hạn chế quyền và môi trường thực thi hiện tại (`EXIT_CODE=0`).
8. **Mức kiểm chứng bảo toàn DB `nexus_hrms` (`BASELINE.md` mục 2.2, `07-backup-restore-diff.log`)**:
   - Thực hiện restore bản backup G0 vào DB tạm hoàn toàn cách ly `nexus_hrms_verify_tmp`, so sánh row count + MD5 row-to-json checksum của cả 31 bảng và 21 sequences với `nexus_hrms`, sau đó xóa `nexus_hrms_verify_tmp`.
   - Ghi nhận chính xác: **30/31 bảng** và **21/21 sequences** khớp 100% checksum với bản backup G0; chỉ **1 dòng** trong bảng `users` (`role_code = HR_DIRECTOR`) thay đổi `last_login_at` và `updated_at` do lần chạy smoke test đầu tiên chạm vào `nexus_hrms`. Lần chạy smoke test chuẩn hóa (`06-smoke-test-isolated.log`) được chạy hoàn toàn trên `nexus_hrms_test` (`PORT=8099`).
9. **Tách bạch `AS-IS` và `TO-BE` trong `DATA_SOURCE_MATRIX.md`**:
   - Toàn bộ 10 phân hệ trong `DATA_SOURCE_MATRIX.md` đã tách riêng cột **Hiện trạng AS-IS** (chỉ ghi những gì đang có thật trong code) và cột **Mục tiêu TO-BE**.
10. **Đồng bộ bảng thống kê mức độ trong `ISSUES.md`**:
    - Khớp chính xác số lượng và danh sách mã lỗi: **Critical: 7**, **High: 20**, **Medium: 5** (Tổng cộng: **32**).

---

## 3. Phân loại Trạng thái Kiểm chứng (`VERIFIED` vs `UNVERIFIED / BLOCKED`)

### 3.1. Hạng mục đã kiểm chứng bằng bằng chứng thực tế (`VERIFIED`)
- **Môi trường Git & Nhánh Gitflow**: `git status`, `git branch`, `git log` hoạt động bình thường; giữ nguyên thay đổi của thành viên khác.
- **Database Test độc lập (`nexus_hrms_test`)**: Tự động dựng lại từ `database/schema.sql` + 7 migrations qua `Backend/scripts/test-setup.js`.
- **Đối chiếu DB chính (`nexus_hrms`) với Backup G0**: Đã kiểm chứng qua `docs/remediation/evidence/07-backup-restore-diff.log`.
- **Baseline 6 lệnh kiểm thử/build**: Đã lưu raw log tại `docs/remediation/evidence/01..06.log`.
- **Danh mục 32 vấn đề (`F01–F32`) và `DATA_SOURCE_MATRIX.md`**: Đã đối chiếu từng đường dẫn file, dòng code, tên route và trường dữ liệu thực tế.

### 3.2. Hạng mục chưa kiểm chứng ở G0 hoặc cần xác nhận (`UNVERIFIED / BLOCKED FOR G3–G5`)
- **Kiểm thử E2E qua trình duyệt (Browser UI Verification)**: Chưa thực hiện ở G0 (sẽ thực hiện ở G2–G5 sau khi sửa code).
- **Gọi Gemini API thật**: Chưa thực hiện ở G0 để tránh phát sinh chi phí và vì chỉ triển khai ở G4 khi có cấu hình `GEMINI_API_KEY` tại backend.
- **Các quyết định nghiệp vụ cho G3/G4 cần xác nhận trước khi chốt công thức lương/phép**:
  1. Quy tắc tính ngày nghỉ phép (`F17`): trừ Thứ Bảy + Chủ Nhật hay chỉ Chủ Nhật; danh sách ngày lễ từ bảng `public_holidays`; quy tắc nghỉ nửa ngày (`0.5` ngày).
  2. Quy tắc xử lý nhân viên hoàn toàn không có bản ghi `attendance_logs` trong kỳ lương (`F09`): chặn khóa kỳ lương (`409/422`) hay tính `0` công kèm cảnh báo trong `/api/payroll/periods/:id/anomalies`.
  3. Quy tắc duyệt giải trình chấm công (`F03`): duyệt 1 cấp (`LINE_MANAGER` phòng ban hoặc `HR_DIRECTOR`/`CEO`) và cấm tự duyệt đơn của chính mình.
  4. Hiệu lực mức giảm trừ gia cảnh thuế TNCN (`F25`, `F26`): áp dụng theo kỳ hiệu lực trong cấu hình hệ thống (`11.000.000 / 4.400.000` trước kỳ hiệu lực mới vs `15.500.000 / 6.200.000`).

---

## 4. Đề xuất Phạm vi Giai đoạn G1 (Đã điều chỉnh theo rà soát G0)

1. **`F01` (Dashboard Cache Isolation)**:
   - Sửa `Backend/src/middleware/dashboardCache.js` dùng `req.user.userId`, `req.user.employeeId`, `req.user.roleCode`, `req.scope` và query chuẩn hóa làm cache key; hỗ trợ bật cache trong test để kiểm chứng 2 `LINE_MANAGER` khác phòng ban không nhìn thấy dữ liệu của nhau.
2. **`F02`, `F03`, `F04`, `F05`, `F28` (Appeals & Schema Migration)**:
   - Tạo migration chính thức `008_reconcile_notices_and_appeals.sql` (cập nhật cả `database/schema.sql`) bổ sung `company_notices.attachments`, bảng `notice_reads` và bảng `attendance_appeals` (xóa DDL khi import và xóa `memoryAppeals`).
   - Gắn `requirePermission` từ `Backend/src/policies/matrix.js` cho `POST /api/attendance/appeals` và `GET /api/attendance/appeals`.
   - Chuẩn hóa đọc `req.user.employeeId`, `req.user.roleCode`, `req.scope` trong `attendance/controller.js` và `appealService.js`: kiểm tra scope phòng ban khi `LINE_MANAGER` duyệt đơn, cấm tự duyệt đơn của chính mình, bọc cập nhật `attendance_appeals` + `attendance_logs` + `audit_logs` trong `db.withTransaction(...)`, trả `404` khi ID không tồn tại và `409` khi đơn đã xử lý.
3. **`F08`, `F31` (Squad Access & WebSocket Auth)**:
   - Trong `Backend/src/modules/projects/access.js` và `squads.js`: tại `Backend/src/modules/squads/service.js:31`, giới hạn `isMember` chỉ cho thành viên thực sự (`squad.lead_id === user.employeeId` hoặc trong `squad.members`), giữ quyền đọc giám sát của `HR_ROLES = ['CEO', 'HR_DIRECTOR']` qua `canRead`/`canManage`.
   - Trong `Backend/src/socket.js`: xác thực JWT khi kết nối WebSocket, kiểm tra quyền squad từ DB và lưu tin nhắn vào `squad_messages`.
4. **`F30` (Dashboard Company KPI vs Actionable Queue)**:
   - Trong `Backend/src/modules/dashboard/service.js`: tách điều kiện đếm `overview.pending_leaves` (tổng đơn chờ duyệt toàn scope công ty/phòng ban) khỏi bộ lọc `pendingLeaves` (hàng đợi đơn mà vai trò hiện tại được phép duyệt); bỏ fallback `|| 1.8`.
5. **`F32` (Deterministic Lifecycle Test Fixture)**:
   - Giữ nguyên validation `terminationDate < joined` trong `Backend/src/modules/employees/lifecycle.js:23`; cập nhật `Backend/tests/helpers/employees.js` / test lifecycle dùng `joinedDate` xác định trước ngày nghỉ việc (ví dụ `'2025-01-15'`) để giải quyết 4 test offboarding fail.
6. **`F10`, `F29`, `F21`, `F11` (Frontend Auth Hydration, Refresh Queue & Trọng tâm False-Success)**:
   - Tách `ROLE_META` (đủ 6 role `ADMIN`, `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE`, `KIOSK`) khỏi `currentUser` được hydrate từ `GET /api/auth/me` trong `AuthContext.jsx`.
   - Sửa `FrontEnd/src/services/api.js` để reject toàn bộ `refreshSubscribers` khi refresh token thất bại.
   - Chặn false-success ở các thao tác ghi trọng yếu (`EmployeePortalPage` punch, `CreateLeaveRequestModal`, `RejectionWorkflowModal`, `PayrollLockModal`, `OnboardingModal`, `OffboardingModal`, `DepartmentManageModal`, `JobTitleManageModal`).
