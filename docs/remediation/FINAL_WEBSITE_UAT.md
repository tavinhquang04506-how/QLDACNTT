# BÁO CÁO NGHIỆM THU CUỐI CÙNG TOÀN WEBSITE (`FINAL_WEBSITE_UAT.md`)

- **Dự án**: `C:\Users\tavin\Downloads\QLDACNTT` (**NEXUS HRMS — Enterprise Human Resource Management System**)
- **Ngày nghiệm thu**: `2026-10-25`
- **Nhánh Gitflow thực hiện**: `feature/final-website-uat` (tách từ `develop` tại `4014721`, merge `--no-ff` vào `develop`)
- **Môi trường kiểm thử cô lập**:
  - **Hệ điều hành & Runtime**: Windows (`win32-x64`), Node.js `v24.16.0`, PostgreSQL `16.15` (`127.0.0.1:5432`)
  - **Database kiểm thử cô lập**: `nexus_hrms_test` (`current_database()` được xác minh qua `assertSafeTestDatabase` và `/api/health`, `34` bảng, `11/11` migrations ở trạng thái `READY`)
  - **Storage kiểm thử cô lập**: `%TEMP%\nexus-hrms-notice-attachments-test-runs\run-*` (có tệp xác thực quyền sở hữu `.nexus-test-storage-owner.json`, kiểm tra qua `assertSafeStorageDir`)
  - **Cổng kiểm thử trình duyệt thật cô lập**: Backend `http://127.0.0.1:8005` + Frontend Vite `http://127.0.0.1:3005` (`VITE_API_URL=http://127.0.0.1:8005/api`), hoàn toàn tách biệt với dịch vụ dev đang chạy tại `:8000` / `:3000`
  - **Trình duyệt thực thi**: Google Chrome Headless (`CDP` đa `BrowserContext` cô lập cho kiểm thử đa phiên/đa vai trò, kích thước `1440x900` Desktop, `768x1024` Tablet, `390x844` Mobile)
  - **Bảo toàn môi trường chính**: CSDL `nexus_hrms` (`32` bảng, `50` nhân viên, `50` tài khoản, `100` phiếu lương, `99` bản ghi công, `8` đơn phép, `4` dự án, `8` công việc, `106` audit logs, `50` refresh tokens) và `Backend/storage/notice_attachments` không bị tác động.

---

## 1. Ma Trận Nghiệm Thu Phân Hệ / Vai Trò / Kịch Bản (`PASS` / `FAIL` / `BLOCKED` / `NOT_RUN`)

| Mã kịch bản | Phân hệ | Vai trò kiểm tra | Nội dung kiểm tra (UI + API + DB + Cross-cutting) | Kết quả thực tế | Bằng chứng (Loại bằng chứng & Đường dẫn) | Trạng thái |
|---|---|---|---|---|---|---|
| **UAT-M01** | **1. Xác thực, Phiên & Phân quyền (`Auth, Session & RBAC`)** | `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE`, `ADMIN`, `KIOSK` | - Đăng nhập qua form `/login` cho cả 6 vai trò; kiểm tra điều hướng mặc định (`/dashboard`, `/portal`, `/directory`, `/kiosk`).<br>- Đăng xuất từ menu tài khoản trên `Topbar`: xóa `nexus_token`, `nexus_refresh_token` khỏi `localStorage` và chuyển hướng về `/login`.<br>- Hết hạn phiên (`401` khi cả access token & refresh token hết hạn/không hợp lệ): tự động xóa phiên và đưa về `/login`.<br>- Chặn truy cập trái quyền: `ADMIN` và `KIOSK` vào `/payroll` bị chặn bởi `[data-testid="payroll-role-restricted"]`; `EMPLOYEE` gọi `PUT /api/settings` bị chặn `403`. | Đạt 100% trên trình duyệt thật (`ASSERT 1`, `ASSERT 2`, `ASSERT 3a`, `ASSERT 8d`, `ASSERT 12a/12b/12c`, `ASSERT 13a`). | - **Mới (`FRESH_VERIFIED` 2026-10-25)**: `docs/remediation/evidence/final-website-uat-browser.log` (`ASSERT 1, 2, 3a, 8d, 12, 13a`)<br>- **Kế thừa hợp lệ (`2026-10-24`)**: `Backend/tests/api/auth.test.js` (`r48-backend-full.log`) | **`PASS`** |
| **UAT-M02** | **2. Bảng điều khiển (`Dashboard`)** | `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE` | - Đối chiếu chỉ số nhân sự đang làm việc (`total_active`) trên `/dashboard` khớp với `GET /api/dashboard/stats` và câu truy vấn `SELECT COUNT(*) FROM employees WHERE status IN ('DANG_LAM_VIEC', 'THU_VIEC')`.<br>- Kiểm tra phạm vi tài khoản: `HR_DIRECTOR`/`CEO` xem toàn công ty; `LINE_MANAGER` xem phạm vi bộ phận và phát sinh `0` request tới `/api/payroll/periods` (`BUG-UAT-02`).<br>- `EMPLOYEE` tại `/portal` chỉ hiển thị đúng dữ liệu cá nhân (`9.5` ngày phép của Nhân viên A vs `4.0` ngày phép của Nhân viên B). | Đạt 100% sau khi sửa `BUG-UAT-02` (`ASSERT 2`, `ASSERT 13b`). Không còn lỗi `403` ngầm trên `/dashboard` đối với `LINE_MANAGER`. | - **Mới (`FRESH_VERIFIED` 2026-10-25)**: `docs/remediation/evidence/final-website-uat-browser.log` (`ASSERT 2`, `ASSERT 13b`), ảnh chụp `docs/remediation/evidence/screenshots/final-uat-dashboard-1440.png` | **`PASS`** |
| **UAT-M03** | **3. Hồ sơ Nhân sự (`Directory / Employees`)** | `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE`, `ADMIN` | - Danh sách nhân sự, tìm kiếm theo họ tên, lọc phòng ban/trạng thái.<br>- Phân trang thực tế với `> 50` bản ghi (`55+` nhân viên qua các nút `Sau`/`Trước`, tổng số dòng DOM khớp 100% DB, `0` ID trùng).<br>- Cô lập phòng ban giữa 2 `LINE_MANAGER` (`DEPT-IT` không thấy nhân sự `DEPT-SALES` và ngược lại).<br>- Khi API trả lỗi `500`: hiển thị banner lỗi và `0` dòng giả lập.<br>- Bảo mật dữ liệu nhạy cảm: `face_encoding` luôn bị loại bỏ; `HR_DIRECTOR` xem được `base_salary` chuẩn xác. | Đạt 100% (`ASSERT 2c/2d`, `ASSERT 3b`, `ASSERT 4`, `ASSERT 13c`). | - **Mới (`FRESH_VERIFIED` 2026-10-25)**: `docs/remediation/evidence/final-website-uat-browser.log` (`ASSERT 2, 3b, 4, 13c`)<br>- **Kế thừa hợp lệ (`2026-10-24`)**: `Backend/tests/api/employees.test.js` (`r48-backend-full.log`) | **`PASS`** |
| **UAT-M04** | **4. Chấm công, Kiosk QR & Giải trình (`Attendance & Appeals`)** | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `KIOSK` | - Nhân viên sinh mã QR (`GET /api/attendance/qr` -> `200`).<br>- Quét mã tại Kiosk (`POST /api/attendance/kiosk/punch` -> `201/200`); quét lại cùng `qrToken` bị từ chối ngay với `401` (chống gửi trùng/replay).<br>- Giao diện `/kiosk` hiển thị đầy đủ header `KIOSK ĐIỂM DANH CỔNG A1`, badge `ONLINE`, bảo mật TOTP và nút `Thoát Kiosk`.<br>- Nhân viên gửi đơn giải trình công (`POST /api/attendance/appeals` -> `201`); Trưởng phòng khác bộ phận duyệt bị chặn `403`; Trưởng phòng cùng bộ phận duyệt thành công (`200 DA_DUYET`). | Đạt 100% (`ASSERT 12c`, `ASSERT 13d`). | - **Mới (`FRESH_VERIFIED` 2026-10-25)**: `docs/remediation/evidence/final-website-uat-browser.log` (`ASSERT 12c, 13d`), unit test `Backend/tests/unit/attendanceAppeal.test.js` | **`PASS`** |
| **UAT-M05** | **5. Nghỉ phép & Chuỗi duyệt 2 cấp (`Leave Management`)** | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `CEO` | - Nhân viên tạo đơn nghỉ phép qua kỳ nghỉ lễ Quốc khánh (`2026-09-01` đến `2026-09-03`, trong đó `2026-09-02` là ngày lễ trong `public_holidays`): hệ thống tự động trừ ngày lễ, tính đúng `total_days = 2`.<br>- Duyệt 2 bước: `LINE_MANAGER` duyệt bước 1 (`CHO_HR_PHE_CHUAN`) -> `HR_DIRECTOR` phê chuẩn bước 2 (`DA_PHE_DUYET`).<br>- Kiểm tra sau lưu & reload: số dư phép của nhân viên giảm chính xác từ `9.5` xuống `7.5` ngày trên cả DB `leave_balances` và giao diện `/portal` sau khi reload. | Đạt 100% (`ASSERT 2a/2b`, `ASSERT 13d`). | - **Mới (`FRESH_VERIFIED` 2026-10-25)**: `docs/remediation/evidence/final-website-uat-browser.log` (`ASSERT 2, 13d`)<br>- **Kế thừa hợp lệ (`2026-10-24`)**: `Backend/tests/api/r31-r34-review-fixes.test.js` | **`PASS`** |
| **UAT-M06** | **6. Bảng lương, Đối soát xung đột, Khóa sổ & Xuất CSV (`Payroll & CSV`)** | `HR_DIRECTOR`, `CEO`, `LINE_MANAGER`, `EMPLOYEE`, `ADMIN`, `KIOSK` | - Chọn kỳ lương chưa khởi tạo (`2028-11`), đang tải chậm hoặc lỗi `500`: khóa toàn bộ nút thao tác, hiển thị `0 đ`, không lấy nhầm kỳ cũ (`R20`).<br>- Điều chỉnh tay & đối soát xung đột nguồn (`409 ADJUSTMENT_SOURCE_CONFLICT` — `R24`): chặn submit khi chưa chọn phương án, hủy an toàn, phát hiện nguồn đổi thêm khi modal đang mở, lưu và ghi `audit_logs`.<br>- Cảnh báo `PAYROLL_STALE` & `NO_ATTENDANCE` trong `PayrollLockModal`, bắt buộc tích xác nhận mới khóa sổ (`DA_CHOT`).<br>- Xuất CSV tổng hợp & CSV ngân hàng đa trang (`505+` phiếu qua nhiều trang trong snapshot `REPEATABLE READ READ ONLY`), đối chiếu khớp 100% tổng `gross`, `net`, số dòng và chặn tải khi phát hiện hoán đổi lương hoặc trùng nhân viên (`R19, R22, R26, R27`). | Đạt 100% (`ASSERT 5`, `ASSERT 6`, `ASSERT 7`, `ASSERT 8a/8c/8d`). | - **Mới (`FRESH_VERIFIED` 2026-10-25)**: `docs/remediation/evidence/final-website-uat-browser.log` (`ASSERT 5, 6, 7, 8`) | **`PASS`** |
| **UAT-M07** | **7. Dự án, Nhiệm vụ & Lịch sử hoạt động (`Projects & Tasks`)** | `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE` | - Khi API `/api/projects` lỗi `500`: hiển thị banner lỗi và nút `Thử lại`, tuyệt đối không hiển thị dữ liệu mẫu giả (`1200h` hay `20 nhân sự` — `R28`).<br>- Khi danh sách trống: hiển thị `0/0 nhân sự tham gia`.<br>- Tạo dự án gắn phòng ban thực và giao nhiệm vụ có `kpi_weight = 0`: hiển thị đúng `0%` (không tự đổi thành `10%` hay `20%`).<br>- Mở chi tiết nhiệm vụ tải lịch sử thật từ `GET /api/tasks/:id/logs`: kiểm tra trạng thái trống, lỗi + thử lại, và hiển thị đúng bản ghi chuyển trạng thái / cập nhật tiến độ `45%` từ DB (`R33`). | Đạt 100% (`ASSERT 8b`, `ASSERT 9`). | - **Mới (`FRESH_VERIFIED` 2026-10-25)**: `docs/remediation/evidence/final-website-uat-browser.log` (`ASSERT 8b, 9`) | **`PASS`** |
| **UAT-M08** | **8. Thông báo nội bộ & Tệp đính kèm (`Notices & Attachments`)** | `HR_DIRECTOR`, `EMPLOYEE` (`DEPT-IT` & `DEPT-SALES`) | - `HR_DIRECTOR` tải tệp `> 5MB` bị chặn ngay trên UI; lỗi upload `500` hiển thị banner lỗi; xóa tệp tạm dọn sạch khỏi DOM & ổ đĩa.<br>- Tải lên tệp PDF thật (`< 5MB`), phát hành thông báo cho `DEPT-IT`, chỉnh sửa thông báo vẫn giữ nguyên tệp đính kèm.<br>- Phiên trình duyệt cô lập `Context B` (`EMPLOYEE` thuộc `DEPT-IT`) xem thông báo, tải tệp PDF về máy và đối chiếu khớp 100% mã băm `SHA-256`.<br>- Phiên trình duyệt cô lập `Context C` (`EMPLOYEE` thuộc `DEPT-SALES`) không thấy thông báo trên `/portal` lẫn chuông `NotificationCenterModal` (`R42`), gọi trực tiếp URL tải tệp bị chặn `403`.<br>- Thông báo cũ chứa `blob:` URL hiển thị rõ `"Không khả dụng — cần tải lên lại"` và khóa nút tải. | Đạt 100% (`ASSERT 11`). | - **Mới (`FRESH_VERIFIED` 2026-10-25)**: `docs/remediation/evidence/final-website-uat-browser.log` (`ASSERT 11`), ảnh chụp `r39-notice-attachment-verified-download.png`, `r39-legacy-attachment-unavailable.png` | **`PASS`** |
| **UAT-M09** | **9. Cài đặt hệ thống & Phiên bản chính sách (`Settings & Policy Versions`)** | `HR_DIRECTOR`, `CEO`, `ADMIN`, `EMPLOYEE` | - Khi `GET /api/settings` lỗi `500`: vô hiệu hóa các ô nhập và nút Lưu, không điền giá trị mặc định giả (`40h`, `11.000.000đ`), bấm Lưu cưỡng bức phát sinh `0` request `PUT` (`R17`).<br>- Bấm `Thử tải lại dữ liệu` khôi phục đúng cấu hình từ server, sửa `max_ot_per_month` + `effective_from` và lưu thành công.<br>- Reload trình duyệt đối chiếu giá trị trên DOM khớp 100% với bảng `system_settings` và `system_policy_versions` trong PostgreSQL (`ASSERT 1`, `ASSERT 3c`). | Đạt 100% (`ASSERT 1`, `ASSERT 3a/3b/3c`). | - **Mới (`FRESH_VERIFIED` 2026-10-25)**: `docs/remediation/evidence/final-website-uat-browser.log` (`ASSERT 1, 3`) | **`PASS`** |
| **UAT-M10** | **10. Trợ lý AI NEXUS V1 (`Grounded AI Copilot V1`)** | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `ADMIN`, `KIOSK` | - Hỏi phép, lương, quy chế trả lời tiếng Việt có căn cứ (`VERIFIED`), hiển thị `sources`, `answerSections`, `followUpSuggestions`, `navigationActions`.<br>- So sánh `"hai kỳ gần nhất"` tự động lấy 2 kỳ đã công bố từ DB (`2026-08` và `2026-06`, bỏ qua kỳ dự thảo `2026-10` — `AI-V1-F02`), giữ trường `bonus = NULL` là `"Chưa đủ dữ liệu đối chiếu"` khác với `0 ₫` (`AI-V1-F03`).<br>- Câu hỏi mơ hồ (`"So sánh lương cho tôi"`) hiển thị nút chọn `clarification`.<br>- Chặn câu trả lời sai nguồn/tráo trường (`ANSWER_SOURCE_MISMATCH`), câu khẳng định không gọi tool (`UNGROUNDED_ANSWER_REJECTED`), và lọc bỏ mệnh đề bịa đặt (`R35, R37, R38, R41`).<br>- Nút `Làm mới` xóa ngữ cảnh về lời chào động theo thời gian thực. | Đạt 100% trên trình duyệt với mock transport & DB thật (`ASSERT 10a..10i`) và `34/34` bài test tích hợp trong `ai-v1-evaluation-30.test.js`. | - **Mới (`FRESH_VERIFIED` 2026-10-25)**: `docs/remediation/evidence/final-website-uat-browser.log` (`ASSERT 10`), ảnh chụp `ai-v1-copilot-desktop-1440.png` & `ai-v1-copilot-mobile-390.png` | **`PASS`** *(Mock & DB thật)* |
| **UAT-M11** | **11. Đáp ứng đa thiết bị (`1440px` / `768px` / `390px`), Bàn phím & Hiệu năng (`Responsive, A11y & Telemetry`)** | Toàn bộ 6 vai trò | - Kiểm tra kích thước `1440x900` (Desktop), `768x1024` (Tablet), `390x844` (Mobile): không tràn ngang (`scrollWidth <= innerWidth + 1`), modal có `overflow-y: auto` cuộn được, đóng bằng phím `Escape`, điều hướng focus bằng bàn phím hoạt động tốt.<br>- `0` lỗi `Runtime.exceptionThrown` trên toàn bộ phiên kiểm thử trình duyệt. | Đạt 100% (`ASSERT 12d`, `ASSERT 13e`). | - **Mới (`FRESH_VERIFIED` 2026-10-25)**: `docs/remediation/evidence/final-website-uat-browser.log` (`ASSERT 12, 13e`), ảnh chụp `phase-b-viewport-390.png`, `phase-b-viewport-768.png`, `phase-b-viewport-1440.png` | **`PASS`** |
| **UAT-LIVE-AI** | **12. Nghiệm thu Gemini API Thật (`Live Gemini Provider`)** | 5 vai trò synthetic fixtures (`NV-LIVE-*`) | - Chạy `node Backend/scripts/run-ai-v1-live-eval.js` trên `nexus_hrms_test`.<br>- Bước `preflight` (kiểm tra DB `_test`, hàm export, cột schema, cấp phát & thu hồi synthetic fixtures cho 5 vai trò) đạt `PASS`.<br>- Bước gọi mạng Gemini thật đang ở trạng thái `BLOCKED` do biến `GEMINI_API_KEY` chưa được nạp trong `Backend/.env`. | `preflight.passed = true`; trạng thái cổng `LIVE_AI = BLOCKED` trung thực. | - **Mới (`FRESH_VERIFIED` 2026-10-25)**: `Backend/scripts/run-ai-v1-live-eval.js` (`EXIT_CODE=0`) | **`BLOCKED`** *(Chờ `GEMINI_API_KEY`)* |
| **UAT-DOCKER** | **13. Kiểm thử Docker + Nginx Runtime (`docker-compose.test.yml`)** | Operator / DevOps | - Chạy guard cô lập `npm run docker:test:verify --prefix Backend` kiểm tra cấu hình đã resolve của `docker-compose.test.yml`: đạt `VERIFIED_SAFE` (tách biệt hoàn toàn container, volume, network, port `15432/18000/13000`, DB `nexus_hrms_docker_test`, storage `/app/storage_test`).<br>- Chưa khởi chạy container thực tế do Docker Desktop daemon trên máy đang tắt. | Cấu hình & Guard: `PASS`; Container runtime: `BLOCKED` do Docker Desktop chưa bật. | - **Mới (`FRESH_VERIFIED` 2026-10-25)**: `npm run docker:test:verify --prefix Backend` (`EXIT_CODE=0`) | **`BLOCKED`** *(Chờ bật Docker Desktop)* |

---

## 2. Phân Biệt Bằng Chứng Kiểm Thử Chạy Mới (`2026-10-25`) và Bằng Chứng Kế Thừa Hợp Lệ (`2026-10-24`)

### 2.1. Bằng chứng chạy mới trong đợt nghiệm thu cuối (`FRESH_VERIFIED` — `2026-10-25`)

| STT | Lệnh thực thi | Phạm vi kiểm chứng | Kết quả | Exit Code | File log / Bằng chứng |
|---|---|---|---|---|---|
| 1 | `node Backend/scripts/e2e-browser-verify.js` | Kiểm thử trình duyệt Chrome thật (`ASSERT 1..13`) trên `nexus_hrms_test` (`:8005`/`:3005`), bao gồm cả 6 vai trò, 10 phân hệ, đa `BrowserContext`, responsive `390px`/`768px`/`1440px`, bàn phím & hiệu năng | **`13/13 ASSERT GROUPS PASS`** (`0` uncaught exceptions) | `0` | `docs/remediation/evidence/final-website-uat-browser.log` |
| 2 | `npm test --prefix FrontEnd` | Bộ kiểm thử đơn vị Frontend (`aiCopilotState.test.js` gồm test mới cho `BUG-UAT-02`, data adapters, payroll/settings/tasks state) | **`77/77 PASS`** | `0` | Console & `docs/remediation/evidence/final-website-uat-unit-build.log` |
| 3 | `npm run build --prefix FrontEnd` | Đóng gói bản dựng Production của Frontend Vite (`dist/`) | **`PASS` (`2013 modules`)** | `0` | `docs/remediation/evidence/final-website-uat-unit-build.log` |
| 4 | `$env:DB_PORT="59999"; npm run test:unit --prefix Backend` | Bộ kiểm thử đơn vị Backend ở chế độ độc lập CSDL (`DB_PORT=59999`), bao gồm `aiV1Modules.test.js`, `noticeStorageGuard.test.js`, `dockerTestIsolationGuard.test.js` | **`150/150 PASS`** | `0` | `docs/remediation/evidence/final-website-uat-unit-build.log` |
| 5 | `npm run db:test` | Kiểm tra kết nối PostgreSQL 16.15 và 20 bảng chuẩn + 2 views trên `nexus_hrms_test` | **`20/20 PASS` (`100%`)** | `0` | Console output |
| 6 | `node --require ./Backend/tests/helpers/env.js --test "Backend/tests/api/ai-*.test.js"` | Bộ kiểm thử tích hợp API cho AI Copilot (`14/14` bảo mật + `34/34` tình huống nghiệm thu V1 & mock transport runner) trên `nexus_hrms_test` | **`48/48 PASS`** | `0` | Console output |
| 7 | `npm run docker:test:verify --prefix Backend` | Guard kiểm tra cô lập cấu hình `docker-compose.test.yml` qua Docker Compose CLI (đã che toàn bộ secret `[REDACTED]`) | **`VERIFIED_SAFE`** | `0` | Console output |
| 8 | `node Backend/scripts/run-ai-v1-live-eval.js` | Preflight + kiểm tra cổng Gemini thật trên `nexus_hrms_test` | **`PREFLIGHT PASS / LIVE BLOCKED`** | `0` | `docs/remediation/evidence/logs/ai-v1-live-eval-report.json` |
| 9 | `node Backend/scripts/check-phase-a-baseline.js` & `$env:DB_NAME='nexus_hrms'; node Backend/scripts/check-schema-readiness.js --report-only` | Kiểm tra chỉ đọc trạng thái migration và đối chiếu tính toàn vẹn 100% số bảng/số dòng của CSDL chính `nexus_hrms` trước và sau nghiệm thu | **`UNCHANGED 100%`** (`32` bảng, `9/11` migrations trên `nexus_hrms`; `34` bảng, `11/11` migrations `READY` trên `nexus_hrms_test`) | `0` | Console output |

### 2.2. Bằng chứng kế thừa hợp lệ (`VALID_REUSED_EVIDENCE` — `2026-10-24`)

- **`docs/remediation/evidence/r48-backend-full.log`** (`2026-10-24`): Bộ kiểm thử toàn diện Backend (`558/558 PASS` trên `nexus_hrms_test`), bao gồm kiểm thử đồng bộ khóa liên tiến trình `pg_try_advisory_xact_lock` qua 2 tiến trình + CLI (`R48`), đối soát lưu trữ tệp đính kèm (`R46–R47`), tính thuế TNCN lũy tiến & BHXH (`R01–R05`), và phân quyền RBAC trên toàn bộ 22 module.

---

## 3. Ảnh Chụp Màn Hình & Bằng Chứng Giao Diện (`docs/remediation/evidence/screenshots/`)

1. [final-uat-dashboard-1440.png](./evidence/screenshots/final-uat-dashboard-1440.png) — Giao diện Tổng quan Quản trị Nhân sự (`/dashboard` ở `1440x900`) đối chiếu số liệu nhân sự khớp CSDL.
2. [ai-v1-copilot-desktop-1440.png](./evidence/screenshots/ai-v1-copilot-desktop-1440.png) — Giao diện Trợ lý AI NEXUS V1 ở `1440x900` hiển thị câu trả lời có nguồn, khối `answerSections`, gợi ý hỏi tiếp và nút chọn `clarification`.
3. [ai-v1-copilot-mobile-390.png](./evidence/screenshots/ai-v1-copilot-mobile-390.png) — Giao diện Trợ lý AI NEXUS V1 trên thiết bị di động `390x844` vừa khít khung nhìn, không bị tràn ngang.
4. [r39-notice-attachment-verified-download.png](./evidence/screenshots/r39-notice-attachment-verified-download.png) — Chi tiết thông báo nội bộ có tệp đính kèm PDF thực được xác minh mã băm `SHA-256` từ phiên trình duyệt nhân viên phòng IT.
5. [r39-legacy-attachment-unavailable.png](./evidence/screenshots/r39-legacy-attachment-unavailable.png) — Hiển thị trung thực trạng thái `"Không khả dụng — cần tải lên lại"` đối với bản ghi thông báo cũ chứa `blob:` URL.
6. [phase-b-viewport-390.png](./evidence/screenshots/phase-b-viewport-390.png), [phase-b-viewport-768.png](./evidence/screenshots/phase-b-viewport-768.png), [phase-b-viewport-1440.png](./evidence/screenshots/phase-b-viewport-1440.png) — Kiểm chứng bố cục responsive tại 3 độ phân giải chuẩn (`390px`, `768px`, `1440px`).

---

## 4. Kiểm Tra Chỉ Đọc Trạng Thái Migration CSDL Chính (`nexus_hrms`)

Kết quả chạy lệnh chỉ đọc `$env:DB_NAME='nexus_hrms'; node Backend/scripts/check-schema-readiness.js --report-only`:
- **Database**: `nexus_hrms`
- **Trạng thái**: `DEPLOYMENT_PENDING` (`appliedMigrationsCount: 9 / 11`)
- **2 bản vá migration đang chờ người vận hành áp dụng**:
  1. `010_payroll_policy_snapshot_and_holidays.sql` (bổ sung bảng `public.public_holidays` và cột `public.payroll_periods.policy_snapshot`)
  2. `011_system_policy_versions.sql` (bổ sung bảng `public.system_policy_versions` lưu lịch sử chính sách theo kỳ `effective_from`)
- **Lưu ý tuân thủ**: Theo đúng chỉ thị của bạn, tôi **không tự ý chạy migration trên `nexus_hrms`**. Trên CSDL kiểm thử `nexus_hrms_test`, cả 11/11 migrations đều đã được áp dụng và xác minh `READY`.

---

## 5. Các Bước Chính Xác Để Bạn Chạy Và Sử Dụng Website

### Bước 1: Áp dụng 2 migration còn thiếu (`010` & `011`) lên CSDL chính `nexus_hrms` (Khuyến nghị thực hiện trước khi sử dụng tính năng tạo đơn nghỉ phép mới hoặc tính lương mới trên `nexus_hrms`)
Mở PowerShell tại thư mục gốc `C:\Users\tavin\Downloads\QLDACNTT`:
```powershell
# 1. Kiểm tra trạng thái hiện tại của nexus_hrms
$env:DB_NAME="nexus_hrms"
node Backend/scripts/check-schema-readiness.js --report-only

# 2. Chạy migration 010 và 011 lên nexus_hrms (an toàn, idempotent, không xóa dữ liệu hiện có)
node Backend/scripts/migrate.js

# 3. Xác nhận trạng thái đã chuyển sang READY (11/11 migrations)
node Backend/scripts/check-schema-readiness.js
```

### Bước 2: Khởi động Website ở môi trường Local (Hiện dịch vụ đã được bật sẵn cho bạn)
- Nếu dịch vụ đang chạy nền, bạn có thể truy cập ngay:
  - **Trang web (Frontend)**: `http://localhost:3000/`
  - **API Health Check**: `http://localhost:8000/api/health`
- Nếu cần khởi động lại từ đầu trong PowerShell:
  ```powershell
  npm run dev
  ```

### Bước 3: (Tùy chọn) Bật Trợ lý AI NEXUS V1 với Gemini Thật
1. Mở file `Backend/.env` và điền khóa API của bạn vào dòng:
   ```env
   AI_ENABLED=true
   GEMINI_API_KEY=<khóa-gemini-của-bạn>
   GEMINI_MODEL=gemini-2.5-flash
   ```
2. Để chạy bộ nghiệm thu tự động 18 kịch bản với Gemini thật trên DB test cô lập (`nexus_hrms_test`):
   ```powershell
   $env:NODE_ENV="test"
   $env:DB_NAME="nexus_hrms_test"
   $env:DB_NAME_TEST="nexus_hrms_test"
   node Backend/scripts/run-ai-v1-live-eval.js
   ```

---

## 6. Kết Luận Nghiệm Thu Cuối Cùng

1. **Mức độ sẵn sàng theo môi trường**:
   - **Môi trường Kiểm thử & Mã nguồn (`nexus_hrms_test` + Local Runtime)**: **SẴN SÀNG NGHIỆM THU (`PASS`)** — Toàn bộ 10 phân hệ nghiệp vụ và 6 vai trò (`CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE`, `ADMIN`, `KIOSK`) hoạt động ổn định trên trình duyệt thật ở cả Desktop (`1440px`) và Mobile (`390px`), số liệu hiển thị khớp với API/PostgreSQL, không còn lỗi làm sai dữ liệu, vượt quyền, mất tệp hay chặn luồng chính.
   - **Môi trường Sử dụng Local trên DB chính (`nexus_hrms` tại `http://localhost:3000`)**: **SẴN SÀNG SỬ DỤNG** cho các luồng tra cứu/đăng nhập ngay hiện tại; để sử dụng đầy đủ các thao tác ghi phụ thuộc bảng ngày lễ (`public_holidays`) và lịch sử phiên bản chính sách (`system_policy_versions`), bạn chỉ cần chạy lệnh `node Backend/scripts/migrate.js` ở **Bước 1** phía trên để áp dụng 2 migration `010` và `011`.
2. **Các điều kiện ngoài mã nguồn đang chờ Người vận hành (`BLOCKED` / `DEPLOYMENT_PENDING`)**:
   - **`LIVE_AI` (`BLOCKED`)**: Chờ cấu hình `GEMINI_API_KEY` trong `Backend/.env` để kích hoạt gọi Gemini thật.
   - **`DOCKER_RUNTIME` (`BLOCKED`)**: Chờ bật Docker Desktop daemon nếu muốn chạy stack container `docker-compose.test.yml` / `docker-compose.yml`.
   - **`PRIMARY_DB_MIGRATIONS` (`DEPLOYMENT_PENDING`)**: Chờ bạn chạy `node Backend/scripts/migrate.js` trên `nexus_hrms` theo Bước 1.
