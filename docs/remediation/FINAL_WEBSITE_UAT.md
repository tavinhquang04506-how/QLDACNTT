# BÁO CÁO NGHIỆM THU CUỐI CÙNG TOÀN WEBSITE (`FINAL_WEBSITE_UAT.md`)

- **Dự án**: `C:\Users\tavin\Downloads\QLDACNTT` (**NEXUS HRMS — Enterprise Human Resource Management System**)
- **Ngày hoàn tất nghiệm thu**: `2026-10-25`
- **Nhánh Gitflow thực hiện**: `feature/primary-db-migration-and-smoke-uat` (hợp nhất `--no-ff` vào `develop`)
- **URL Truy Cập Môi Trường Thật (Đang hoạt động)**:
  - **Website (Frontend Vite)**: `http://localhost:3000/` (`200 OK`)
  - **Backend API Health**: `http://localhost:8000/api/health` (`200 OK`, `"database": "nexus_hrms"`, `"schemaStatus": "READY"`, `"schemaReady": true`, `"pendingMigrationsCount": 0`)
  - **Backend Schema Readiness**: `http://localhost:8000/api/health/ready` (`200 OK`, `"ready": true`, `"status": "READY"`, `"appliedMigrationsCount": 11`, `"expectedMigrationsCount": 11`)
- **Phân tách phạm vi môi trường**:
  1. **Database kiểm thử cô lập (`nexus_hrms_test`)**: `34` bảng, `11/11` migrations, trạng thái `READY` (`PASS` toàn bộ thao tác đọc/ghi, unit, API và E2E trình duyệt `ASSERT 1..13`).
  2. **Database chính (`nexus_hrms`)**: Đã nâng cấp thành công lên `11/11` migrations (`READY`, `34` base tables + `2` views) bằng lệnh `node Backend/scripts/migrate.js --target-db=nexus_hrms --confirm-production-db=nexus_hrms` (`EXIT_CODE=0`), bảo toàn 100% dữ liệu nghiệp vụ gốc (`employees=50`, `users=50`, `payslips=100`, `attendance_logs=99`, `leave_requests=8`, `projects=4`, `tasks=8`, `company_notices=4`, `handbook_docs=5`, `public_holidays=16`, `system_policy_versions=1`, `audit_logs=106`) và vượt qua toàn bộ bài kiểm thử Smoke Test chỉ đọc trên trình duyệt thật (`PASS`).
  3. **AI Copilot V1 — Mock Provider & Hậu kiểm Backend (`nexus_hrms_test`)**: `PASS` (`150/150` Backend unit + `48/48` AI API tests + Browser E2E `ASSERT 10`). **Không dùng kết quả mock để kết luận Gemini thật `PASS`.**
  4. **AI Copilot V1 — Gemini API Thật (`run-ai-v1-live-eval.js`)**: `BLOCKED` (`preflight.passed = true` trên `nexus_hrms_test`; chưa cấu hình `GEMINI_API_KEY` trong `Backend/.env`). Khi chưa có key, endpoint `POST /api/ai/copilot` trả về `503 AI_NOT_CONFIGURED` có kiểm soát và không gây ảnh hưởng đến bất kỳ chức năng nào khác của website.
  5. **Docker Runtime (`docker-compose.test.yml` / `docker-compose.yml`)**: `OPTIONAL` đối với sử dụng local trực tiếp; chỉ bắt buộc nếu triển khai bằng Docker (cấu hình cô lập đạt `VERIFIED_SAFE`, runtime container `BLOCKED` khi Docker Desktop tắt).

---

## 1. Bảng Tổng Hợp Trạng Thái Theo Môi Trường & Điều Kiện Vận Hành (`PASS` / `FAIL` / `BLOCKED`)

| Mã cổng | Hạng mục / Môi trường | Phạm vi kiểm chứng | Kết quả thực tế | Trạng thái |
|---|---|---|---|---|
| **ENV-TEST-DB** | **Database Kiểm thử Cô lập (`nexus_hrms_test`)** | Đủ `11/11` migrations (`001`..`011`), `34` base tables + `2` views, `check-schema-readiness.js` (với `DB_NAME=nexus_hrms_test`) trả về `READY`, vượt qua toàn bộ unit/API/browser E2E tests (`ASSERT 1..13`). | Đạt 100% trên môi trường test cô lập. | **`PASS`** |
| **ENV-RESTORE-REHEARSAL** | **Diễn tập Sao lưu Mới (Sau Khi Dừng Luồng Ghi) & Phục hồi vào DB Tạm Tên Riêng (`nexus_hrms_restore_staging_20261025_102100`)** | Dừng Backend (`PORT_8000_LISTENING=false`) -> Tạo backup mới `docs/remediation/evidence/backups/nexus_hrms_pre_r16_20261025_102100.sql` (`pg_dump` exit code `0`, `361,385 bytes`, SHA-256 `bf69320dacb294d909784204c3c859d332540cfefb94560e3f2a6af7b7bda389`) -> Tạo DB tạm tên riêng `nexus_hrms_restore_staging_20261025_102100` (không `DROP` DB có sẵn) -> Restore (`psql` exit code `0`) -> Kiểm tra `check-schema-readiness.js --report-only` với `DB_NAME=nexus_hrms_restore_staging_20261025_102100` khớp trạng thái dự kiến trước nâng cấp `9/11` (`DEPLOYMENT_PENDING`) và đối chiếu khớp 100% cả `32/32` bảng với `nexus_hrms`. | Diễn tập sao lưu & phục hồi đạt 100% (`docs/remediation/evidence/pre-migration-backup-restore-rehearsal.log`). | **`PASS`** |
| **ENV-PRIMARY-DB** | **Database Chính (`nexus_hrms` — Môi trường sử dụng thực tế tại `:8000` / `:3000`)** | Xác nhận `0` thay đổi dữ liệu so với bản backup -> Chạy `node Backend/scripts/migrate.js --target-db=nexus_hrms --confirm-production-db=nexus_hrms` (`EXIT_CODE=0`, áp dụng `010` & `011`) -> Xác minh `check-schema-readiness.js` (với `DB_NAME=nexus_hrms`, không dùng `--report-only`) trả về `READY` (`11/11` migrations, `EXIT_CODE=0`) -> Khởi động lại Backend `:8000` & Frontend `:3000` -> Thực thi Smoke Test chỉ đọc trên trình duyệt thật qua các vai trò (`CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE`) và xác nhận `22/22` bảng dữ liệu nghiệp vụ thật nguyên vẹn 100%. | Đạt 100% (`docs/remediation/evidence/primary-db-migration-execution.log` & `docs/remediation/evidence/live-primary-smoke-test.log`). | **`PASS`** |
| **AI-MOCK-GATE** | **AI NEXUS V1 — Mock Provider & Hậu kiểm Dữ kiện (`nexus_hrms_test`)** | Kiểm chứng định tuyến ý định, phân quyền RBAC/scope theo 6 vai trò, hậu kiểm số liệu với tool payload, từ chối câu khẳng định không gọi tool, làm rõ câu mơ hồ (`clarification`), so sánh 2 kỳ lương đã công bố gần nhất từ DB (`AI-V1-F02`), giữ trường `NULL` khác `0 ₫` (`AI-V1-F03`). | `150/150` Backend unit + `48/48` AI API tests + Browser E2E `ASSERT 10` đều `PASS`. | **`PASS`** *(Chỉ tính cho phạm vi Mock/DB test)* |
| **AI-LIVE-GATE** | **AI NEXUS V1 — Gemini API Thật (`run-ai-v1-live-eval.js`)** | Kiểm tra trạng thái cấu hình `Backend/src/config/env.js` (không in secret): `{"aiEnabled":false,"apiKeyConfigured":false,"model":"gemini-2.5-flash"}`. Bước `preflight` của `run-ai-v1-live-eval.js` trên `nexus_hrms_test` đạt `PASS`. Trên môi trường thật, khi chưa có key, `/api/ai/copilot` trả `503 AI_NOT_CONFIGURED` sạch sẽ và không làm lỗi website. | Chưa có `GEMINI_API_KEY` tại máy. | **`BLOCKED`** *(Chờ cấu hình `GEMINI_API_KEY` trong `Backend/.env`)* |
| **DOCKER-GATE** | **Triển khai bằng Docker (`docker-compose.test.yml`)** *(Chỉ bắt buộc nếu triển khai qua Docker)* | Guard tĩnh & `docker compose config` (`npm run docker:test:verify --prefix Backend`) đạt `VERIFIED_SAFE`. Chưa chạy container thực tế do Docker Desktop daemon đang tắt. | Không chặn việc sử dụng local trực tiếp (`npm run dev`); `BLOCKED` nếu chọn triển khai bằng Docker. | **`BLOCKED`** *(Tùy chọn nếu dùng Local; bắt buộc nếu dùng Docker)* |

---

## 2. Ma Trận Nghiệm Thu 11 Phân Hệ (`nexus_hrms_test` Cô Lập vs `nexus_hrms` Môi Trường Thật)

| Mã kịch bản | Phân hệ | Vai trò kiểm tra | Kiểm thử Đọc/Ghi Toàn diện trên `nexus_hrms_test` (`:8005`/`:3005`) | Smoke Test Chỉ Đọc trên `nexus_hrms` Thật (`:8000`/`:3000`) |
|---|---|---|---|---|
| **UAT-M01** | **1. Xác thực, Phiên & Phân quyền (`Auth, Session & RBAC`)** | `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE`, `ADMIN`, `KIOSK` | **`PASS`** (`ASSERT 1, 2, 3a, 8d, 12, 13a` — đăng nhập 6 vai trò, đăng xuất, hết phiên `401`, chặn `/payroll` & `PUT /api/settings`) | **`PASS`** (`SMOKE 2..5` — đăng nhập UI thành công cho `ceo@fwbnexus.vn`, `hrd@fwbnexus.vn`, `lead@fwbnexus.vn`, `employee@fwbnexus.vn`) |
| **UAT-M02** | **2. Bảng điều khiển (`Dashboard`)** | `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE` | **`PASS`** (`ASSERT 2, 13b` — đối chiếu `total_active` khớp DB; `LINE_MANAGER` phát sinh `0` request `/api/payroll/periods`) | **`PASS`** (`SMOKE 2, 3, 4` — `total_active = 50` khớp `nexus_hrms`; `LINE_MANAGER` phát sinh `0` request `/api/payroll/periods`) |
| **UAT-M03** | **3. Hồ sơ Nhân sự (`Directory / Employees`)** | `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE`, `ADMIN` | **`PASS`** (`ASSERT 2, 3b, 4, 13c` — tìm kiếm, lọc, phân trang `> 50` bản ghi, ẩn `face_encoding`, cô lập phòng ban) | **`PASS`** (`SMOKE 2, 4` — `CEO` thấy đủ `50` nhân sự; `LINE_MANAGER` chỉ thấy `18` nhân sự thuộc phòng ban mình) |
| **UAT-M04** | **4. Chấm công, Kiosk QR & Giải trình (`Attendance & Appeals`)** | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `KIOSK` | **`PASS`** (`ASSERT 12c, 13d` — sinh QR, quét Kiosk `201/200`, chống gửi trùng `401`, duyệt giải trình theo phòng ban) | **`PASS`** (`SMOKE 2` — tải `99` bản ghi công, danh sách giải trình `200 OK` và mã Kiosk `200 OK`) |
| **UAT-M05** | **5. Nghỉ phép & Chuỗi duyệt 2 cấp (`Leave Management`)** | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `CEO` | **`PASS`** (`ASSERT 2, 13d` — trừ ngày lễ Quốc khánh `2/9`, duyệt 2 cấp, cập nhật số dư phép từ `9.5` xuống `7.5` sau reload) | **`PASS`** (`SMOKE 2` — tải `8` đơn nghỉ phép thật và `16` ngày lễ từ bảng `public_holidays` sau migration `010`) |
| **UAT-M06** | **6. Bảng lương, Đối soát xung đột, Khóa sổ & Xuất CSV (`Payroll & CSV`)** | Toàn bộ 6 vai trò | **`PASS`** (`ASSERT 5, 6, 7, 8` — đối soát xung đột `409`, khóa sổ `DA_CHOT`, xuất CSV `505+` phiếu khớp 100% tổng `gross`/`net`) | **`PASS`** (`SMOKE 2, 3` — tải `2` kỳ lương `2026-08`, `2026-09` và `50` phiếu lương kỳ `2026-09` có cột `policy_snapshot` từ migration `010`) |
| **UAT-M07** | **7. Dự án, Nhiệm vụ & Lịch sử hoạt động (`Projects & Tasks`)** | `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE` | **`PASS`** (`ASSERT 8b, 9` — không dữ liệu mẫu giả khi lỗi `500`, bảo toàn `kpi_weight=0%`, lịch sử nhiệm vụ thật) | **`PASS`** (`SMOKE 2` — tải `4` dự án và `8` nhiệm vụ thật trên `nexus_hrms`) |
| **UAT-M08** | **8. Thông báo nội bộ & Tệp đính kèm (`Notices & Attachments`)** | `HR_DIRECTOR`, `EMPLOYEE` | **`PASS`** (`ASSERT 11` — upload/download đa phiên khớp `SHA-256`, chặn ngoài phạm vi `403`, đánh dấu `blob:` cũ không khả dụng) | **`PASS`** (`SMOKE 2` — tải `4` thông báo nội bộ và `5` tài liệu sổ tay nhân sự `200 OK`) |
| **UAT-M09** | **9. Cài đặt hệ thống & Phiên bản chính sách (`Settings & Policy Versions`)** | `HR_DIRECTOR`, `CEO`, `ADMIN`, `EMPLOYEE` | **`PASS`** (`ASSERT 1, 3` — lỗi tải không ghi đè mặc định giả; lưu & reload khớp `system_settings` và `system_policy_versions`) | **`PASS`** (`SMOKE 2` — `GET /api/settings` trả `18` cấu hình và `GET /api/settings/versions` trả phiên bản chính sách từ bảng `system_policy_versions` của migration `011`) |
| **UAT-M10** | **10. Trợ lý AI NEXUS V1 (`Grounded AI Copilot V1`)** | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `ADMIN`, `KIOSK` | **`PASS`** *(Mock & DB test: `ASSERT 10` + `48/48` API tests)* | **`BLOCKED`** *(Chưa có `GEMINI_API_KEY`; trả `503 AI_NOT_CONFIGURED` an toàn, không ảnh hưởng website)* |
| **UAT-M11** | **11. Đáp ứng đa thiết bị (`1440px` / `768px` / `390px`), Bàn phím & Console** | Toàn bộ 6 vai trò | **`PASS`** (`ASSERT 12d, 13e` — `0` lỗi `Runtime.exceptionThrown`) | **`PASS`** (`SMOKE 1..5` — `0` lỗi `Runtime.exceptionThrown` trên toàn bộ phiên kiểm tra môi trường thật) |

---

## 3. Bằng Chứng Kiểm Thử & Vận Hành Đầy Đủ (`2026-10-25`)

| STT | Lệnh thực thi | Phạm vi kiểm chứng | Kết quả | Exit Code | Bằng chứng |
|---|---|---|---|---|---|
| 1 | Diễn tập dừng luồng ghi (`:8000`), tạo backup mới `nexus_hrms_pre_r16_20261025_102100.sql` và phục hồi vào `nexus_hrms_restore_staging_20261025_102100` | Kiểm tra `pg_dump` exit code `0`, dung lượng `361,385 bytes`, SHA-256 `bf69320dacb294d909784204c3c859d332540cfefb94560e3f2a6af7b7bda389`, `psql` restore exit code `0`, `check-schema-readiness.js` với `DB_NAME=nexus_hrms_restore_staging_20261025_102100` (`9/11 DEPLOYMENT_PENDING`) và đối chiếu `32/32` bảng với `nexus_hrms` | **`32/32 TABLES MATCHED 100%`** | `0` | `docs/remediation/evidence/pre-migration-backup-restore-rehearsal.log` |
| 2 | `node Backend/scripts/migrate.js --target-db=nexus_hrms --confirm-production-db=nexus_hrms` & `check-schema-readiness.js` (`DB_NAME=nexus_hrms`) | Thực thi migration `010` và `011` trên database chính `nexus_hrms`, xác minh `READY` (`11/11` migrations) và bảo toàn 100% dữ liệu 31 bảng nghiệp vụ gốc | **`READY 11/11` (`34` base tables)** | `0` | `docs/remediation/evidence/primary-db-migration-execution.log` |
| 3 | Smoke Test chỉ đọc trên môi trường thật (`http://localhost:8000` / `http://localhost:3000` gắn `nexus_hrms`) | Kiểm tra `/api/health`, `/api/health/ready`, đăng nhập UI 4 vai trò (`CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE`), tra cứu toàn bộ 10 phân hệ và xác nhận `22/22` bảng dữ liệu nghiệp vụ thật không đổi | **`SMOKE 1..6 PASS 100%`** (`0` uncaught exceptions) | `0` | `docs/remediation/evidence/live-primary-smoke-test.log` |
| 4 | `node Backend/scripts/e2e-browser-verify.js` | Kiểm thử trình duyệt Chrome thật (`ASSERT 1..13`) cho toàn bộ thao tác đọc/ghi trên `nexus_hrms_test` (`:8005`/`:3005`) | **`13/13 ASSERT GROUPS PASS`** | `0` | `docs/remediation/evidence/final-website-uat-browser.log` |
| 5 | `$env:DB_PORT="59999"; npm run test:unit --prefix Backend` | Bộ kiểm thử đơn vị Backend độc lập CSDL | **`150/150 PASS`** | `0` | `docs/remediation/evidence/final-website-uat-unit-build.log` |
| 6 | `npm test --prefix FrontEnd` & `npm run build --prefix FrontEnd` | Bộ kiểm thử đơn vị (`77/77`) & bản dựng Production Frontend Vite (`2013 modules`) | **`PASS`** | `0` | `docs/remediation/evidence/final-website-uat-unit-build.log` |
| 7 | `npm run db:test` | Kiểm tra kết nối PostgreSQL 16.15 và 20 bảng chuẩn + 2 views trên `nexus_hrms_test` | **`20/20 PASS` (`100%`)** | `0` | Console output |
| 8 | `node --require ./Backend/tests/helpers/env.js --test "Backend/tests/api/ai-*.test.js"` | Kiểm thử tích hợp API cho AI Copilot (`14/14` bảo mật + `34/34` tình huống V1 & mock runner) trên `nexus_hrms_test` | **`48/48 PASS`** | `0` | Console output |
| 9 | `node Backend/scripts/run-ai-v1-live-eval.js` | Preflight + kiểm tra cổng Gemini thật trên `nexus_hrms_test` | **`PREFLIGHT PASS / LIVE BLOCKED`** | `0` | `docs/remediation/evidence/logs/ai-v1-live-eval-report.json` |

---

## 4. Quy Trình Kiểm Tra Readiness Bằng `DB_NAME` & Khôi Phục Tuần Tự Có Kiểm Soát Lỗi (Dự Phòng)

### 4.1. Hàm kiểm tra Readiness chuẩn (Dùng `DB_NAME`, xác minh trường `database` và khôi phục biến môi trường)
`Backend/scripts/check-schema-readiness.js` đọc biến môi trường `DB_NAME` (không hỗ trợ `--target-db`):
```powershell
function Invoke-SchemaReadinessCheck {
  param(
    [Parameter(Mandatory = $true)][string]$TargetDb,
    [switch]$ReportOnly
  )
  $prevNodeEnv = $env:NODE_ENV
  $prevDbName  = $env:DB_NAME
  try {
    Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue
    $env:DB_NAME = $TargetDb
    $argsList = @("Backend/scripts/check-schema-readiness.js")
    if ($ReportOnly) { $argsList += "--report-only" }

    $rawJson = & node @argsList
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
      throw "check-schema-readiness.js exited with code $exitCode for $TargetDb"
    }
    $parsed = $rawJson | ConvertFrom-Json
    if ($parsed.database -ne $TargetDb) {
      throw "Readiness target mismatch: expected '$TargetDb', got '$($parsed.database)'"
    }
    return $parsed
  } finally {
    if ($null -eq $prevNodeEnv) { Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue } else { $env:NODE_ENV = $prevNodeEnv }
    if ($null -eq $prevDbName)  { Remove-Item Env:\DB_NAME  -ErrorAction SilentlyContinue } else { $env:DB_NAME  = $prevDbName  }
  }
}
```

### 4.2. Phương án Khôi phục Bằng Đổi Tên Tuần Tự 2 Bước Có Kiểm Soát Lỗi (`Controlled Two-Step Sequential Rename`)
Bản sao lưu `docs/remediation/evidence/backups/nexus_hrms_pre_r16_20261025_102100.sql` (`SHA-256: bf69320dacb294d909784204c3c859d332540cfefb94560e3f2a6af7b7bda389`) và database tạm `nexus_hrms_restore_staging_20261025_102100` (`9/11` baseline trước nâng cấp) vẫn được giữ nguyên. Nếu cần quay lui về trạng thái `9/11`, xem quy trình tuần tự 2 bước kèm cơ chế hoàn trả tự động tại Mục 5 của [MIGRATION_RUNBOOK.md](./MIGRATION_RUNBOOK.md).

---

## 5. Trạng Thái Gemini API Thật & Hướng Dẫn Cấu Hình Khi Bạn Muốn Kích Hoạt AI

1. **Trạng thái hiện tại**:
   - Cấu hình tại `Backend/.env` (không in secret): `{"aiEnabled":false,"apiKeyConfigured":false,"model":"gemini-2.5-flash"}`.
   - Cổng `AI-LIVE-GATE`: **`BLOCKED`** (khi chưa cấu hình key, trợ lý AI trả về thông báo `503 AI_NOT_CONFIGURED` rõ ràng và không làm ảnh hưởng đến bất kỳ chức năng nào khác của website).
2. **Cách kích hoạt tại máy của bạn (không gửi API key vào khung chat)**:
   - Mở tệp `C:\Users\tavin\Downloads\QLDACNTT\Backend\.env` và cập nhật:
     ```env
     AI_ENABLED=true
     AI_PROVIDER=gemini
     GEMINI_API_KEY=<nhập-khóa-gemini-api-của-bạn-tại-máy>
     GEMINI_MODEL=gemini-2.5-flash
     ```
   - Khởi động lại Backend (`npm run dev`) để sử dụng trợ lý AI trực tiếp trên giao diện, và chạy bộ kiểm định live trên database test cô lập:
     ```powershell
     $env:NODE_ENV="test"
     $env:DB_NAME="nexus_hrms_test"
     $env:DB_NAME_TEST="nexus_hrms_test"
     node Backend/scripts/run-ai-v1-live-eval.js
     ```
