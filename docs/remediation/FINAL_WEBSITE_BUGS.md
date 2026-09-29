# BÁO CÁO LỖI PHÁT HIỆN & KHẮC PHỤC TRONG ĐỢT NGHIỆM THU CUỐI (`FINAL_WEBSITE_BUGS.md`)

- **Dự án**: `C:\Users\tavin\Downloads\QLDACNTT` (**NEXUS HRMS**)
- **Ngày thực hiện**: `2026-10-25`
- **Nhánh thực hiện (Gitflow)**: `feature/final-website-uat` (tách từ `develop` tại `4014721`, sau đó merge `--no-ff` về `develop`)
- **Môi trường kiểm thử**:
  - **Database kiểm thử cô lập**: `nexus_hrms_test` (`PostgreSQL 16.15`, `34` bảng, `11/11` migrations `READY`)
  - **Storage kiểm thử cô lập**: Thư mục tạm cấp phát riêng mỗi lần chạy trong `%TEMP%\nexus-hrms-notice-attachments-test-runs\run-*` có dấu xác thực quyền sở hữu `.nexus-test-storage-owner.json`
  - **Database chính được bảo vệ**: `nexus_hrms` (giữ nguyên 100% số bảng `32` và số bản ghi, không reset/seed/migrate)

---

## 1. Danh Sách Lỗi Phát Hiện & Đã Sửa Trong Đợt Nghiệm Thu Cuối (`BUG-UAT-01` .. `BUG-UAT-03`)

Mỗi lỗi dưới đây đều được ghi nhận theo đúng chuẩn: **Bước tái hiện → Expected / Actual → Nguyên nhân → Cách sửa → Kiểm thử lại**.

---

### `BUG-UAT-01` (Mức độ: P1 — Cô lập cổng và `VITE_API_URL` khi chạy nghiệm thu trình duyệt song song với `npm run dev`)

- **Bước tái hiện**:
  1. Khởi chạy dự án phục vụ người dùng tại cổng mặc định (`npm run dev`: Backend lắng nghe `:8000` trên DB `nexus_hrms`, Frontend Vite lắng nghe `:3000`).
  2. Chạy kịch bản kiểm thử trình duyệt thật `node Backend/scripts/e2e-browser-verify.js` (hoặc đặt `E2E_BACKEND_PORT=8005`, `E2E_FRONTEND_PORT=3005`).
- **Expected vs Actual**:
  - **Expected**: Bộ kiểm thử trình duyệt thật phải chạy trên cặp cổng cô lập (`:8005` / `:3005`), xác minh `/api/health` kết nối đúng `nexus_hrms_test`, xác minh thư mục lưu trữ tệp đính kèm là thư mục test cô lập trước mọi thao tác ghi, và truyền `VITE_API_URL=http://127.0.0.1:8005/api` cho tiến trình Vite test để trình duyệt không bao giờ gửi request sang `:8000` (`nexus_hrms`).
  - **Actual (Trước khi sửa)**:
    - Mặc định `e2e-browser-verify.js` dùng `BACKEND_PORT=8000` và `FRONTEND_PORT=3000`, gây xung đột `EADDRINUSE` với dịch vụ đang chạy hoặc tái sử dụng tiến trình Vite `:3000` đang trỏ vào `:8000` (`nexus_hrms`).
    - Khi đổi sang cổng khác (`8005`/`3005`), `e2e-browser-verify.js` spawn `vite` mà không truyền `VITE_API_URL`, khiến `FrontEnd/src/services/api.js` và `noticeService.js` vẫn fallback về `http://localhost:8000/api` (`nexus_hrms`).
- **Nguyên nhân**: `Backend/scripts/e2e-browser-verify.js` đặt cổng mặc định trùng với dev server (`8000`/`3000`), có nhánh `viteAlreadyUp` tái sử dụng Vite đang mở và chưa truyền `VITE_API_URL` vào `env` khi khởi tạo `viteProc`.
- **Cách sửa**:
  - Cập nhật [Backend/scripts/e2e-browser-verify.js](../../Backend/scripts/e2e-browser-verify.js):
    - Đổi cổng mặc định sang `E2E_BACKEND_PORT = 8005`, `E2E_FRONTEND_PORT = 3005` (nằm trong danh sách `defaultOrigins` của CORS).
    - Trước khi chạy kịch bản trình duyệt, kiểm tra `noticesStartupSvc.assertSafeStorageDir(activeStorageDir, { forCleanup: true })` và gọi `GET http://127.0.0.1:8005/api/health` xác nhận `database === 'nexus_hrms_test'`.
    - Luôn spawn tiến trình Vite riêng với `--strictPort` và `VITE_API_URL=http://127.0.0.1:${BACKEND_PORT}/api`.
- **Kiểm thử lại**:
  - Chạy `node Backend/scripts/e2e-browser-verify.js` trong khi `npm run dev` (`:8000`/`:3000`) đang hoạt động.
  - Kết quả: Toàn bộ `ASSERT 1..13` chạy cô lập trên `:8005`/`:3005` (`EXIT_CODE=0`), và `node Backend/scripts/check-phase-a-baseline.js` xác nhận `nexus_hrms` giữ nguyên tuyệt đối (`refresh_tokens = 50`, `audit_logs = 106`).

---

### `BUG-UAT-02` (Mức độ: P2 — Vai trò `LINE_MANAGER` khi vào `/dashboard` tự động gọi `GET /api/payroll/periods` gây lỗi `403 Forbidden`)

- **Bước tái hiện**:
  1. Đăng nhập trên trình duyệt thật tại `/login` bằng tài khoản vai trò `LINE_MANAGER`.
  2. Sau khi đăng nhập, ứng dụng điều hướng về `/dashboard` (`DashboardPage.jsx`).
  3. Kiểm tra danh sách request mạng và Console trình duyệt.
- **Expected vs Actual**:
  - **Expected**: Theo ma trận phân quyền RBAC (`Backend/src/policies/matrix.js`), quyền `payroll.periods.read` chỉ cấp cho `CEO` và `HR_DIRECTOR`. Khi `LINE_MANAGER` mở `/dashboard`, giao diện chỉ hiển thị số liệu phạm vi phòng ban và không được gọi `/api/payroll/periods` (`0` lỗi `403`).
  - **Actual (Trước khi sửa)**: Hàm `fetchDashboardData` trong `FrontEnd/src/pages/DashboardPage.jsx` gọi `payrollService.getPeriods()` vô điều kiện trong `Promise.allSettled`, làm phát sinh `GET /api/payroll/periods -> 403 Forbidden` mỗi lần `LINE_MANAGER` truy cập `/dashboard`.
- **Nguyên nhân**: Ở đợt sửa `R30`, lời gọi `payrollService.getPeriods()` đã được chặn cho `LINE_MANAGER` tại `PayrollPage.jsx`, nhưng tại `DashboardPage.jsx` (dòng 67) vẫn gọi `payrollService.getPeriods()` cho mọi vai trò.
- **Cách sửa**:
  - Cập nhật [FrontEnd/src/pages/DashboardPage.jsx](../../FrontEnd/src/pages/DashboardPage.jsx): chỉ gọi `payrollService.getPeriods()` khi `currentRole?.key === 'HR_DIRECTOR' || currentRole?.key === 'CEO'`, các vai trò khác trả về `Promise.resolve({ success: true, data: [] })`.
- **Kiểm thử lại**:
  - Kiểm thử trình duyệt thật tại `Scenario 13b` trong [Backend/scripts/e2e-browser-verify.js](../../Backend/scripts/e2e-browser-verify.js): `LINE_MANAGER` đăng nhập vào `/dashboard` ghi nhận `dashboardPeriodsCallsForMgr === 0`.
  - Bổ sung unit test tại [FrontEnd/tests/aiCopilotState.test.js](../../FrontEnd/tests/aiCopilotState.test.js) (`PASS`).

---

### `BUG-UAT-03` (Mức độ: P2 — Truy vấn `GET /api/payroll/payslips` lỗi SQL nếu CSDL chưa chạy Migration `010`)

- **Bước tái hiện**:
  1. Trên môi trường CSDL chưa chạy migration `010_payroll_policy_snapshot_and_holidays.sql` (ví dụ `nexus_hrms` đang ở trạng thái `DEPLOYMENT_PENDING` với `9/11` migrations), gọi `GET /api/payroll/payslips`.
- **Expected vs Actual**:
  - **Expected**: `GET /api/payroll/payslips` đọc danh sách phiếu lương hiện có an toàn mà không ném lỗi SQL khi cột `policy_snapshot` chưa được thêm vào bảng `payroll_periods`, đồng thời vẫn trích xuất chính xác `source_fingerprint` khi cột `policy_snapshot` đã có mặt (như trên `nexus_hrms_test`).
  - **Actual (Trước khi sửa)**: Câu truy vấn tổng hợp trong `listPayslips` (`Backend/src/modules/payroll/service.js`, dòng 1075) tham chiếu trực tiếp `COALESCE(pp.policy_snapshot->>'source_fingerprint', '')`, gây lỗi PostgreSQL `column pp.policy_snapshot does not exist` nếu chưa chạy migration `010`.
- **Nguyên nhân**: Truy cập trực tiếp cột `pp.policy_snapshot` thay vì đọc qua JSONB của bản ghi `to_jsonb(pp)->'policy_snapshot'->>'source_fingerprint'`.
- **Cách sửa**:
  - Cập nhật [Backend/src/modules/payroll/service.js](../../Backend/src/modules/payroll/service.js) dòng 1075: dùng `COALESCE(to_jsonb(pp)->'policy_snapshot'->>'source_fingerprint', '')`.
- **Kiểm thử lại**:
  - Chạy toàn bộ kịch bản đối chiếu lương & CSV đa trang (`ASSERT 5, 6, 7, 8` trong `e2e-browser-verify.js`) và bộ unit/API tests bảng lương: đạt `100% PASS`, bảo toàn kiểm tra `snapshot_token` (`R26`/`R27`).

---

## 2. Lỗi Còn Mở Trong Phạm Vi Code Nghiệm Thu

- **Số lỗi nghiêm trọng / sai dữ liệu / vượt quyền / mất file / chặn luồng chính còn mở**: **`0`**
- Mọi luồng nghiệp vụ chính trong phạm vi nghiệm thu đều đã vượt qua kiểm thử tự động và kiểm thử trình duyệt thật (`ASSERT 1..13`).

---

## 3. Các Hạng Mục Thuộc Điều Kiện Vận Hành Hoặc Backlog Tùy Chọn (Không Tự Mở Rộng Sửa Code)

| Phân loại | Mã hạng mục | Mô tả | Trạng thái / Hướng xử lý |
|---|---|---|---|
| **Điều kiện môi trường (Operator)** | `LIVE_AI` (`GEMINI_API_KEY`) | Chưa cấu hình `GEMINI_API_KEY` trong `Backend/.env`. Khi chưa có khóa, Backend trả `503 AI_NOT_CONFIGURED` trung thực và `run-ai-v1-live-eval.js` báo `BLOCKED` (preflight đạt `PASS`). | **BLOCKED (Chờ Operator nạp key)** — Xem hướng dẫn tại `FINAL_WEBSITE_UAT.md` Mục 6. |
| **Điều kiện môi trường (Operator)** | `DOCKER_RUNTIME` | Docker Desktop daemon trên máy hiện đang tắt (`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`). Cấu hình `docker-compose.test.yml` và guard cô lập `verify-docker-test-isolation.js` đã đạt `VERIFIED_SAFE`. | **BLOCKED (Chờ bật Docker Desktop)** — Có thể chạy và sử dụng website trực tiếp ở môi trường local (`npm run dev`). |
| **Điều kiện triển khai DB chính** | `PRIMARY_DB_MIGRATIONS` (`010`, `011`) | CSDL chính `nexus_hrms` đang ở `9/11` migrations (`DEPLOYMENT_PENDING`: thiếu `010_payroll_policy_snapshot_and_holidays.sql` và `011_system_policy_versions.sql` vì quy tắc cấm AI tự migrate DB chính). | **DEPLOYMENT_PENDING (Chờ Operator chạy migrate)** — Chạy `npm run db:migrate --prefix Backend` sau khi sao lưu theo hướng dẫn tại `FINAL_WEBSITE_UAT.md` Mục 6. |
| **Backlog tùy chọn (Ngoài phạm vi V1)** | `BACKLOG-UI-AI` | Các cải tiến tùy chọn sau V1 (streaming SSE từng từ, lưu lịch sử hội thoại AI xuống bảng PostgreSQL riêng, xuất PDF từ câu trả lời AI). | Đã đưa vào backlog trong `AI_V1_HANDOFF.md`, không làm ảnh hưởng nghiệm thu hiện tại. |
