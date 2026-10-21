# RELEASE READINESS CHECKLIST (Phase F — NEXUS HRMS)

Danh mục kiểm tra trước và sau khi phát hành phiên bản hoàn thiện (`R01–R30`) của hệ thống **NEXUS HRMS**, phân biệt minh bạch giữa trạng thái **Mã nguồn & Kiểm thử (`CODE_DONE` / `VERIFIED`)** và trạng thái **Triển khai vận hành thực tế (`READY_FOR_USE` / `DEPLOYMENT_PENDING` / `BLOCKED`)**.

---

## 1. Phân Định Trạng Thái Hiện Tại

| Hạng Mục Kiểm Soát | Trạng Thái Mã Nguồn & Test (`nexus_hrms_test` / Clone DB) | Trạng Thái Vận Hành Thực Tế (`nexus_hrms` / Prod) | Điều Kiện Để Chuyển Sang `READY_FOR_USE` |
|---|---|---|---|
| **Backend Unit & API Regression (`R01–R30`)** | ✅ `CODE_DONE` & `VERIFIED` (100% pass trên `nexus_hrms_test`) | ✅ Sẵn sàng chạy | Đã đạt |
| **Frontend Unit & Adapter Tests (`68/68` tests)** | ✅ `CODE_DONE` & `VERIFIED` | ✅ Sẵn sàng chạy | Đã đạt |
| **Headless Chrome UI E2E (`R14–R30` trên 6 vai trò)** | ✅ `CODE_DONE` & `VERIFIED` (`e2e-browser-verify.js`) | ✅ Sẵn sàng chạy | Đã đạt |
| **Bảo vệ an toàn DB Test (`assertSafeTestDatabase`)** | ✅ `VERIFIED` (`current_database()` guard chặn mọi thao tác ghi vào `nexus_hrms`) | ✅ Đang bảo vệ `nexus_hrms` | Đã đạt |
| **Migration `010` & `011` trên DB ứng dụng `nexus_hrms`** | ✅ `VERIFIED` trên bản sao diễn tập `nexus_hrms_rehearsal_test` (`32 -> 34` bảng, bảo toàn 100% dữ liệu) | ⏳ **`DEPLOYMENT_PENDING`** (`nexus_hrms` đang ở 32 bảng, migration `001..009`) | Operator chạy backup + `migrate.js` theo `docs/remediation/OPERATOR_RUNBOOK.md` trong khung giờ bảo trì |
| **Trợ lý AI Gemini (`POST /api/ai/chat`, `R08`, `R29`)** | ✅ `CODE_DONE` & `VERIFIED` với Mocked Provider & Real Test DB | 🔒 **`BLOCKED`** (khi chưa nạp `GEMINI_API_KEY` thật; hệ thống trả `503 AI_NOT_CONFIGURED` trung thực) | Operator cấu hình `GEMINI_API_KEY` thật vào `Backend/.env` và chạy 3 câu hỏi smoke test trong `AI_SETUP_AND_UAT.md` |
| **7 Quyết định chính sách nghiệp vụ (`DEC-01..DEC-07`)** | ✅ `CODE_DONE` (hành vi an toàn mặc định + kiểm thử đầy đủ) | ⚠️ **`PARTIAL`** (chờ PO / HRD ký xác nhận văn bản chính thức) | PO / HRD ký xác nhận các phương án trong `docs/remediation/POLICY_DECISIONS.md` |

---

## 2. Checklist Trước Khi Chuyển Đổi (Pre-Cutover Gate)

- [x] **Kiểm tra an toàn DB gốc (`nexus_hrms`)**: Xác nhận `nexus_hrms` giữ nguyên 32 bảng và toàn bộ số lượng bản ghi (`employees = 50`, `users = 50`, `payslips = 100`, `attendance_logs = 99`, `leave_requests = 8`, `projects = 4`, `tasks = 8`, `audit_logs = 106`).
- [x] **Chạy toàn bộ kiểm thử tự động trên `nexus_hrms_test`**:
  - `npm run test:unit --prefix Backend`
  - `npm test --prefix FrontEnd`
  - `node --test Backend/tests/api/r27-r30-review-fixes.test.js`
  - `node --test Backend/tests/api/r24-r26-review-fixes.test.js`
  - `node --test Backend/tests/api/r20-r23-review-fixes.test.js`
  - `node --test Backend/tests/api/r16-r19-review-fixes.test.js`
  - `node --test Backend/tests/api/r09-r15-review-fixes.test.js`
  - `node --test Backend/tests/api/ai-copilot-grounding.test.js`
- [x] **Chạy kiểm thử giao diện trình duyệt thực (`e2e-browser-verify.js`)**: Kiểm chứng đầy đủ `R14–R30` trên trình duyệt Chrome Headless.
- [x] **Diễn tập Migration trên bản sao (`rehearse-r16-migration.js`)**: Kiểm chứng backup/restore + chạy migration `010` và `011` + tính lặp lại (idempotency) + bảo toàn 100% dữ liệu trên `nexus_hrms_rehearsal_test`.

---

## 3. Checklist Trong Khung Giờ Bảo Trì (Cutover Execution)

- [ ] **Bước 1**: Tạm dừng nhận lưu lượng ghi trên ứng dụng Backend.
- [ ] **Bước 2**: Tạo bản sao lưu toàn bộ `nexus_hrms` bằng `pg_dump -Fc` và kiểm tra `pg_restore --list` (xem lệnh chi tiết trong `docs/remediation/OPERATOR_RUNBOOK.md`).
- [ ] **Bước 3**: Kiểm tra trạng thái preflight trước khi migrate:
  ```powershell
  $env:DB_NAME='nexus_hrms'; node Backend/scripts/check-schema-readiness.js --report-only
  ```
- [ ] **Bước 4**: Thực thi migration `010` và `011` bằng biến môi trường `DB_NAME`:
  ```powershell
  $env:DB_NAME='nexus_hrms'; node Backend/scripts/migrate.js
  ```
- [ ] **Bước 5**: Xác nhận trạng thái schema chuyển sang `READY` (exit code `0`):
  ```powershell
  $env:DB_NAME='nexus_hrms'; node Backend/scripts/check-schema-readiness.js
  ```
- [ ] **Bước 6**: Cấu hình `GEMINI_API_KEY` (nếu kích hoạt AI Copilot) và khởi động lại dịch vụ Backend/Frontend.
