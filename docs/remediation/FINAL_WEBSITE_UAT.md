# BÁO CÁO NGHIỆM THU CUỐI CÙNG TOÀN WEBSITE (`FINAL_WEBSITE_UAT.md`)

- **Dự án**: `C:\Users\tavin\Downloads\QLDACNTT` (**NEXUS HRMS — Enterprise Human Resource Management System**)
- **Ngày cập nhật**: `2026-10-25`
- **Nhánh Gitflow thực hiện**: `bugfix/final-uat-operational-runbook` (hợp nhất `--no-ff` vào `develop`)
- **Phân tách phạm vi môi trường**:
  1. **Database kiểm thử cô lập (`nexus_hrms_test`)**: `34` bảng, `11/11` migrations, trạng thái `READY` (`PASS`).
  2. **Database chính (`nexus_hrms`)**: `32` bảng, `9/11` migrations, trạng thái `DEPLOYMENT_PENDING` (`BLOCKED` chờ xác nhận bản sao lưu & chạy `010`/`011` với cờ bảo vệ `--target-db=nexus_hrms --confirm-production-db=nexus_hrms`). Hoàn toàn nguyên vẹn (`50` nhân viên, `50` tài khoản, `100` phiếu lương, `99` bản ghi công, `8` đơn phép, `4` dự án, `8` nhiệm vụ, `106` audit logs, `50` refresh tokens).
  3. **AI Copilot V1 (Mock Transport & Hậu kiểm Backend trên `nexus_hrms_test`)**: `PASS` (`48/48` API tests + Browser E2E `ASSERT 10`). **Không dùng kết quả mock để kết luận Gemini thật `PASS`.**
  4. **AI Copilot V1 (Gemini API thật — `run-ai-v1-live-eval.js`)**: `BLOCKED` (`preflight.passed = true` trên `nexus_hrms_test`, nhưng `AI_ENABLED=false` và `GEMINI_API_KEY` chưa được cấu hình trong `Backend/.env`).
  5. **Docker Runtime (`docker-compose.test.yml` / `docker-compose.yml`)**: `OPTIONAL` cho sử dụng local trực tiếp; chỉ là điều kiện bắt buộc nếu chọn triển khai bằng Docker (cấu hình cô lập đạt `VERIFIED_SAFE`, runtime container đang `BLOCKED` do Docker Desktop đang tắt).

---

## 1. Bảng Tổng Hợp Trạng Thái Theo Môi Trường & Điều Kiện Vận Hành (`PASS` / `FAIL` / `BLOCKED`)

| Mã cổng | Hạng mục / Môi trường | Phạm vi kiểm chứng | Kết quả thực tế | Trạng thái |
|---|---|---|---|---|
| **ENV-TEST-DB** | **Database Kiểm thử Cô lập (`nexus_hrms_test`)** | Đủ `11/11` migrations (`001`..`011`), `34` base tables + `2` views, `check-schema-readiness.js` trả về `READY`, vượt qua toàn bộ unit/API/browser E2E tests (`ASSERT 1..13`). | Đạt 100% trên môi trường test cô lập. | **`PASS`** |
| **ENV-PRIMARY-DB** | **Database Chính (`nexus_hrms` — Môi trường sử dụng thực tế)** | Kiểm tra chỉ đọc (`GET /api/health/ready` và `check-schema-readiness.js --target-db=nexus_hrms --report-only`): mới có `9/11` migrations, còn thiếu `010_payroll_policy_snapshot_and_holidays.sql` và `011_system_policy_versions.sql`. Bản sao lưu `pg_dump` (`docs/remediation/evidence/backups/nexus_hrms_pre_r16_20261025.sql`, SHA-256 `0170176bfb23983824b333b2c39531b837d3840663a3fbb6cd9e7f180f16f8ff`) đã được tạo sẵn; **chờ người dùng xác nhận bản sao lưu và kế hoạch cụ thể trước khi chạy lệnh nâng cấp và nghiệm thu sau nâng cấp**. | Chưa chạy migration trên `nexus_hrms` khi chưa có xác nhận của người dùng. | **`BLOCKED`** *(Chờ xác nhận chạy migration `010` & `011`)* |
| **AI-MOCK-GATE** | **AI NEXUS V1 — Mock Provider & Hậu kiểm Dữ kiện (`nexus_hrms_test`)** | Kiểm chứng định tuyến ý định, phân quyền RBAC/scope theo 6 vai trò, hậu kiểm số liệu với tool payload, từ chối câu khẳng định không gọi tool, làm rõ câu mơ hồ (`clarification`), so sánh 2 kỳ lương đã công bố gần nhất từ DB (`AI-V1-F02`), giữ trường `NULL` khác `0 ₫` (`AI-V1-F03`). | `150/150` Backend unit + `48/48` AI API tests + Browser E2E `ASSERT 10` đều `PASS`. | **`PASS`** *(Chỉ tính cho phạm vi Mock/DB test)* |
| **AI-LIVE-GATE** | **AI NEXUS V1 — Gemini API Thật (`run-ai-v1-live-eval.js`)** | Kiểm tra trạng thái cấu hình `Backend/src/config/env.js` (không in secret): `{"aiEnabled":false,"apiKeyConfigured":false,"model":"gemini-2.5-flash"}`. Bước `preflight` của `run-ai-v1-live-eval.js` trên `nexus_hrms_test` đạt `PASS`, nhưng chưa thể gọi Gemini API thật. | Chưa có `GEMINI_API_KEY` tại máy. | **`BLOCKED`** *(Chờ cấu hình `GEMINI_API_KEY` trong `Backend/.env`)* |
| **DOCKER-GATE** | **Triển khai bằng Docker (`docker-compose.test.yml`)** *(Chỉ bắt buộc nếu triển khai qua Docker)* | Guard tĩnh & `docker compose config` (`npm run docker:test:verify --prefix Backend`) đạt `VERIFIED_SAFE`. Chưa chạy container thực tế do Docker Desktop daemon đang tắt. | Không chặn việc sử dụng local trực tiếp (`npm run dev`); `BLOCKED` nếu chọn triển khai bằng Docker. | **`BLOCKED`** *(Tùy chọn nếu dùng Local; bắt buộc nếu dùng Docker)* |

---

## 2. Ma Trận Nghiệm Thu 11 Phân Hệ Trên Môi Trường Kiểm Thử Cô Lập (`nexus_hrms_test` — `:8005` / `:3005`)

> **Lưu ý minh bạch**: Bảng dưới đây ghi nhận kết quả kiểm thử trình duyệt thật (`node Backend/scripts/e2e-browser-verify.js`) và bộ test tự động trên **database kiểm thử cô lập `nexus_hrms_test`** (`11/11` migrations). Đối với **database chính `nexus_hrms`**, bước nghiệm thu trực tiếp sau nâng cấp (`readiness`, đăng nhập, tra cứu, tải dữ liệu) sẽ được thực hiện ngay sau khi bạn xác nhận chạy migration `010` & `011` tại Mục 5.

| Mã kịch bản | Phân hệ | Vai trò kiểm tra | Nội dung kiểm tra trên `nexus_hrms_test` (UI + API + DB + Cross-cutting) | Kết quả trên `nexus_hrms_test` | Kết quả trên `nexus_hrms` (DB chính) |
|---|---|---|---|---|---|
| **UAT-M01** | **1. Xác thực, Phiên & Phân quyền (`Auth, Session & RBAC`)** | `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE`, `ADMIN`, `KIOSK` | Đăng nhập 6 vai trò; đăng xuất xóa token & về `/login`; hết phiên (`401` khi access & refresh token hết hạn) tự đưa về `/login`; chặn `ADMIN`/`KIOSK` vào `/payroll`; chặn `EMPLOYEE` gọi `PUT /api/settings` (`403`). | **`PASS`** (`ASSERT 1, 2, 3a, 8d, 12, 13a`) | **`BLOCKED`** *(Chờ nâng cấp `010`/`011` & kiểm tra sau nâng cấp)* |
| **UAT-M02** | **2. Bảng điều khiển (`Dashboard`)** | `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE` | Đối chiếu `total_active` trên `/dashboard` khớp `GET /api/dashboard/stats` và PostgreSQL; `LINE_MANAGER` phát sinh `0` request tới `/api/payroll/periods` (`BUG-UAT-02`); `/portal` cô lập dữ liệu từng nhân viên. | **`PASS`** (`ASSERT 2, 13b`) | **`BLOCKED`** *(Chờ nâng cấp `010`/`011` & kiểm tra sau nâng cấp)* |
| **UAT-M03** | **3. Hồ sơ Nhân sự (`Directory / Employees`)** | `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE`, `ADMIN` | Tìm kiếm theo họ tên, lọc, phân trang `> 50` bản ghi (`Sau`/`Trước` khớp 100% DB); cô lập phòng ban giữa 2 `LINE_MANAGER`; lỗi `500` hiển thị `0` dòng giả; ẩn `face_encoding`, hiển thị đúng `base_salary` cho `HR_DIRECTOR`. | **`PASS`** (`ASSERT 2, 3b, 4, 13c`) | **`BLOCKED`** *(Chờ nâng cấp `010`/`011` & kiểm tra sau nâng cấp)* |
| **UAT-M04** | **4. Chấm công, Kiosk QR & Giải trình (`Attendance & Appeals`)** | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `KIOSK` | Sinh mã QR (`200`), quét tại Kiosk lần đầu (`201/200`), quét lại cùng `qrToken` bị chặn `401` (anti-replay); gửi giải trình (`201`), trưởng phòng khác bộ phận bị chặn `403`, trưởng phòng cùng bộ phận duyệt `200 DA_DUYET`. | **`PASS`** (`ASSERT 12c, 13d`) | **`BLOCKED`** *(Chờ nâng cấp `010`/`011` & kiểm tra sau nâng cấp)* |
| **UAT-M05** | **5. Nghỉ phép & Chuỗi duyệt 2 cấp (`Leave Management`)** | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `CEO` | Tạo đơn qua lễ Quốc khánh `2026-09-01..2026-09-03` trừ ngày lễ `2026-09-02` còn `2` ngày làm việc; duyệt 2 cấp (`CHO_HR_PHE_CHUAN` -> `DA_PHE_DUYET`); reload `/portal` số dư phép giảm từ `9.5` xuống `7.5` ngày khớp DB. | **`PASS`** (`ASSERT 2, 13d`) | **`BLOCKED`** *(Cần bảng `public_holidays` từ migration `010`)* |
| **UAT-M06** | **6. Bảng lương, Đối soát xung đột, Khóa sổ & Xuất CSV (`Payroll & CSV`)** | Toàn bộ 6 vai trò | Chọn kỳ chưa tạo/đang tải/lỗi `500`; đối soát `409 ADJUSTMENT_SOURCE_CONFLICT`; cảnh báo `PAYROLL_STALE` & khóa sổ `DA_CHOT`; xuất CSV đa trang (`505+` phiếu) khớp 100% tổng `gross`, `net`, chặn hoán đổi lương/trùng dòng. | **`PASS`** (`ASSERT 5, 6, 7, 8`) | **`BLOCKED`** *(Cần cột `policy_snapshot` từ migration `010`)* |
| **UAT-M07** | **7. Dự án, Nhiệm vụ & Lịch sử hoạt động (`Projects & Tasks`)** | `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE` | Khi API lỗi `500` hiển thị banner lỗi + `Thử lại` và `0` dữ liệu mẫu giả; bảo toàn `kpi_weight = 0%`; tải lịch sử nhiệm vụ thật từ `GET /api/tasks/:id/logs` (`45%`). | **`PASS`** (`ASSERT 8b, 9`) | **`BLOCKED`** *(Chờ nâng cấp `010`/`011` & kiểm tra sau nâng cấp)* |
| **UAT-M08** | **8. Thông báo nội bộ & Tệp đính kèm (`Notices & Attachments`)** | `HR_DIRECTOR`, `EMPLOYEE` (`DEPT-IT` & `DEPT-SALES`) | Chặn tệp `> 5MB`; tải lên PDF `< 5MB`, sửa thông báo giữ nguyên tệp; `Context B` (`DEPT-IT`) tải tệp khớp 100% `SHA-256`; `Context C` (`DEPT-SALES`) bị ẩn trên chuông thông báo và bị chặn `403` khi tải trực tiếp; `blob:` cũ báo không khả dụng. | **`PASS`** (`ASSERT 11`) | **`BLOCKED`** *(Chờ nâng cấp `010`/`011` & kiểm tra sau nâng cấp)* |
| **UAT-M09** | **9. Cài đặt hệ thống & Phiên bản chính sách (`Settings & Policy Versions`)** | `HR_DIRECTOR`, `CEO`, `ADMIN`, `EMPLOYEE` | Khi `GET /api/settings` lỗi `500` khóa form & không ghi đè mặc định giả; lưu `max_ot_per_month` + `effective_from` và reload khớp `system_settings` & `system_policy_versions`. | **`PASS`** (`ASSERT 1, 3`) | **`BLOCKED`** *(Cần bảng `system_policy_versions` từ migration `011`)* |
| **UAT-M10** | **10. Trợ lý AI NEXUS V1 (`Grounded AI Copilot V1`)** | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `ADMIN`, `KIOSK` | Hỏi phép/lương/quy chế có nguồn, so sánh 2 kỳ đã công bố từ DB, giữ `NULL` khác `0 ₫`, nút `clarification`, chặn câu trả lời sai nguồn/bịa đặt, nút `Làm mới`. | **`PASS`** *(Mock & DB test: `ASSERT 10` + `48/48` API tests)* | **`BLOCKED`** *(Live Gemini chờ `GEMINI_API_KEY`)* |
| **UAT-M11** | **11. Đáp ứng đa thiết bị (`1440px` / `768px` / `390px`), Bàn phím & Console** | Toàn bộ 6 vai trò | Không tràn ngang ở `1440px`/`768px`/`390px`, modal cuộn được & đóng bằng `Escape`, điều hướng focus bàn phím hoạt động, `0` lỗi `Runtime.exceptionThrown`. | **`PASS`** (`ASSERT 12d, 13e`) | **`PASS`** *(Giao diện tĩnh/Bố cục)* |

---

## 3. Bằng Chứng Kiểm Thử Đã Thực Thi (`2026-10-25`)

| STT | Lệnh thực thi | Phạm vi kiểm chứng | Kết quả | Exit Code | Bằng chứng |
|---|---|---|---|---|---|
| 1 | `node Backend/scripts/e2e-browser-verify.js` | Kiểm thử trình duyệt Chrome thật (`ASSERT 1..13`) trên `nexus_hrms_test` (`:8005`/`:3005`) | **`13/13 ASSERT GROUPS PASS`** | `0` | `docs/remediation/evidence/final-website-uat-browser.log` |
| 2 | `$env:DB_PORT="59999"; npm run test:unit --prefix Backend` | Bộ kiểm thử đơn vị Backend độc lập CSDL | **`150/150 PASS`** | `0` | `docs/remediation/evidence/final-website-uat-unit-build.log` |
| 3 | `npm test --prefix FrontEnd` | Bộ kiểm thử đơn vị Frontend | **`77/77 PASS`** | `0` | `docs/remediation/evidence/final-website-uat-unit-build.log` |
| 4 | `npm run build --prefix FrontEnd` | Bản dựng Production của Frontend Vite (`dist/`) | **`PASS` (`2013 modules`)** | `0` | `docs/remediation/evidence/final-website-uat-unit-build.log` |
| 5 | `npm run db:test` | Kiểm tra kết nối PostgreSQL 16.15 và 20 bảng chuẩn + 2 views trên `nexus_hrms_test` | **`20/20 PASS` (`100%`)** | `0` | Console output |
| 6 | `node --require ./Backend/tests/helpers/env.js --test "Backend/tests/api/ai-*.test.js"` | Kiểm thử tích hợp API cho AI Copilot (`14/14` bảo mật + `34/34` tình huống V1 & mock runner) trên `nexus_hrms_test` | **`48/48 PASS`** | `0` | Console output |
| 7 | `node Backend/scripts/run-ai-v1-live-eval.js` | Preflight + kiểm tra cổng Gemini thật trên `nexus_hrms_test` | **`PREFLIGHT PASS / LIVE BLOCKED`** | `0` | `docs/remediation/evidence/logs/ai-v1-live-eval-report.json` |
| 8 | `node Backend/scripts/check-schema-readiness.js --target-db=nexus_hrms --report-only` | Kiểm tra chỉ đọc trạng thái migration của database chính `nexus_hrms` | **`DEPLOYMENT_PENDING` (`9/11`)** | `0` | Console output |

---

## 4. Kế Hoạch Cụ Thể Sao Lưu, Nâng Cấp Migration (`010` & `011`) Và Phục Hồi Cho Database Chính `nexus_hrms`

> **TUÂN THỦ `Backend/scripts/migrate.js` & `docs/remediation/MIGRATION_RUNBOOK.md`**:
> - `Backend/scripts/migrate.js` có chốt bảo vệ `MIGRATION_PRODUCTION_GUARD`: mọi lệnh chạy vào `nexus_hrms` **bắt buộc** phải truyền đủ hai tham số `--target-db=nexus_hrms --confirm-production-db=nexus_hrms`.
> - Tôi **chưa thực thi** lệnh migration lên `nexus_hrms` và chờ bạn xác nhận bản sao lưu cùng kế hoạch dưới đây.

### 4.1. Bản sao lưu vật lý đã chuẩn bị sẵn (Read-Only `pg_dump` + SHA-256)
Tôi đã tạo sẵn bản sao lưu chỉ đọc từ `nexus_hrms` (không tác động dữ liệu gốc):
- **Đường dẫn file backup**: `C:\Users\tavin\Downloads\QLDACNTT\docs\remediation\evidence\backups\nexus_hrms_pre_r16_20261025.sql`
- **Dung lượng**: `361,385 bytes`
- **Mã băm `SHA-256`**: `0170176bfb23983824b333b2c39531b837d3840663a3fbb6cd9e7f180f16f8ff`

Nếu muốn tạo thêm bản sao lưu mới ngay tại thời điểm mở cửa sổ bảo trì (sau khi tạm dừng Backend `:8000`), chạy lệnh:
```powershell
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
New-Item -ItemType Directory -Force -Path "docs/remediation/evidence/backups" | Out-Null
& "C:\Users\tavin\pgsql\bin\pg_dump.exe" -h 127.0.0.1 -p 5432 -U postgres -d nexus_hrms --no-owner --no-acl -f "docs/remediation/evidence/backups/nexus_hrms_pre_r16_$timestamp.sql"
Get-FileHash "docs/remediation/evidence/backups/nexus_hrms_pre_r16_$timestamp.sql" -Algorithm SHA256
```

### 4.2. Lệnh kiểm tra trước nâng cấp và thực thi Migration (`010` & `011`) trên `nexus_hrms`
Sau khi bạn xác nhận bản sao lưu và cho phép thực thi:
```powershell
# Bước 1: Kiểm tra trạng thái hiện tại của nexus_hrms (Read-Only, trả về DEPLOYMENT_PENDING 9/11)
node Backend/scripts/check-schema-readiness.js --target-db=nexus_hrms --report-only

# Bước 2: Chạy Forward Migration 010 & 011 lên nexus_hrms với đầy đủ cờ bảo vệ bắt buộc của migrate.js
node Backend/scripts/migrate.js --target-db=nexus_hrms --confirm-production-db=nexus_hrms

# Bước 3: Xác minh nexus_hrms đã đạt trạng thái READY (11/11 migrations, exit code 0)
node Backend/scripts/check-schema-readiness.js --target-db=nexus_hrms
```

### 4.3. Phương án Khôi phục Không Phá hủy (`Non-Destructive Rollback` theo `MIGRATION_RUNBOOK.md`)
Trong trường hợp cần khôi phục `nexus_hrms` về đúng trạng thái trước khi chạy migration, **tuyệt đối không chạy `DROP DATABASE nexus_hrms` trực tiếp** mà nạp vào DB tạm `nexus_hrms_restore_staging`, kiểm tra toàn vẹn rồi mới hoán đổi tên nguyên tử (`Atomic Swap`):
```powershell
$backupFile = "docs/remediation/evidence/backups/nexus_hrms_pre_r16_20261025.sql"

# Bước 1: Tạo DB tạm nexus_hrms_restore_staging và nạp từ file backup đã kiểm tra SHA-256
& "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS nexus_hrms_restore_staging;"
& "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE nexus_hrms_restore_staging;"
& "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d nexus_hrms_restore_staging -v ON_ERROR_STOP=1 -f $backupFile

# Bước 2: Kiểm tra cấu trúc và số bảng trên nexus_hrms_restore_staging trước khi hoán đổi
node Backend/scripts/check-schema-readiness.js --target-db=nexus_hrms_restore_staging --report-only

# Bước 3: Hoán đổi nguyên tử (giữ lại DB lỗi dưới tên nexus_hrms_failed_upgrade)
& "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('nexus_hrms', 'nexus_hrms_restore_staging') AND pid <> pg_backend_pid();"
& "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE nexus_hrms RENAME TO nexus_hrms_failed_upgrade;"
& "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE nexus_hrms_restore_staging RENAME TO nexus_hrms;"
```

### 4.4. Kế hoạch kiểm tra môi trường thực tế ngay sau khi `nexus_hrms` được cập nhật
Ngay khi bạn xác nhận thực thi Bước 4.2:
1. Khởi động lại Backend (`:8000`) kết nối vào `nexus_hrms`.
2. Kiểm tra `GET http://127.0.0.1:8000/api/health/ready` trả về `200 OK` (`"status": "READY"`, `"appliedMigrationsCount": 11`).
3. Kiểm tra chỉ đọc trên môi trường thực tế (`http://localhost:3000` / `http://localhost:8000`): đăng nhập, tra cứu danh bạ nhân sự, xem bảng điều khiển, xem bảng lương, tải chính sách và ngày lễ mà **không làm thay đổi bất kỳ hồ sơ, chấm công hay bảng lương thật nào** (mọi thao tác ghi vẫn chỉ kiểm thử trên `nexus_hrms_test` cô lập).

---

## 5. Trạng Thái Gemini API Thật & Hướng Dẫn Cấu Hình Tại Máy

1. **Kết quả kiểm tra hiện tại (không in secret)**:
   - Lệnh kiểm tra: `node -e "const cfg = require('./Backend/src/config/env'); console.log(JSON.stringify({ aiEnabled: cfg.ai?.enabled, apiKeyConfigured: Boolean(cfg.ai?.apiKey && String(cfg.ai.apiKey).trim()), model: cfg.ai?.model }));"`
   - Kết quả: `{"aiEnabled":false,"apiKeyConfigured":false,"model":"gemini-2.5-flash"}`
   - Trạng thái Live AI: **`BLOCKED`** (chỉ có kết quả Mock AI trên `nexus_hrms_test` là `PASS`).

2. **Hướng dẫn cấu hình tại máy của bạn (không gửi API key vào khung chat)**:
   - Mở tệp `C:\Users\tavin\Downloads\QLDACNTT\Backend\.env` bằng trình soạn thảo tại máy của bạn và cập nhật/thêm các dòng sau:
     ```env
     AI_ENABLED=true
     AI_PROVIDER=gemini
     GEMINI_API_KEY=<nhập-khóa-gemini-api-của-bạn-tại-máy>
     GEMINI_MODEL=gemini-2.5-flash
     ```
   - Lưu tệp `Backend/.env`.

3. **Lệnh chạy Live Evaluation trên Database Test Cô Lập (`nexus_hrms_test`) sau khi bạn đã lưu key**:
   ```powershell
   $env:NODE_ENV="test"
   $env:DB_NAME="nexus_hrms_test"
   $env:DB_NAME_TEST="nexus_hrms_test"
   node Backend/scripts/run-ai-v1-live-eval.js
   ```
   *(Hoặc báo cho tôi biết bạn đã lưu key vào `Backend/.env` để tôi tự động chạy `run-ai-v1-live-eval.js` trên `nexus_hrms_test` và cập nhật kết quả Live AI thực tế).*
