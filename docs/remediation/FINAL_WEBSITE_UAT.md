# BÁO CÁO NGHIỆM THU CUỐI CÙNG TOÀN WEBSITE (`FINAL_WEBSITE_UAT.md`)

- **Dự án**: `C:\Users\tavin\Downloads\QLDACNTT` (**NEXUS HRMS — Enterprise Human Resource Management System**)
- **Ngày cập nhật**: `2026-10-25`
- **Nhánh Gitflow thực hiện**: `bugfix/runbook-restore-rehearsal` (hợp nhất `--no-ff` vào `develop`)
- **Phân tách phạm vi môi trường**:
  1. **Database kiểm thử cô lập (`nexus_hrms_test`)**: `34` bảng, `11/11` migrations, trạng thái `READY` (`PASS`).
  2. **Database chính (`nexus_hrms`)**: `32` bảng, `9/11` migrations, trạng thái `DEPLOYMENT_PENDING` (`BLOCKED` chờ xác nhận kết quả diễn tập sao lưu/phục hồi và chạy `010`/`011` với cờ bảo vệ `--target-db=nexus_hrms --confirm-production-db=nexus_hrms`). Hoàn toàn nguyên vẹn (`50` nhân viên, `50` tài khoản, `100` phiếu lương, `99` bản ghi công, `8` đơn phép, `4` dự án, `8` nhiệm vụ, `106` audit logs, `50` refresh tokens).
  3. **AI Copilot V1 (Mock Transport & Hậu kiểm Backend trên `nexus_hrms_test`)**: `PASS` (`48/48` API tests + Browser E2E `ASSERT 10`). **Không dùng kết quả mock để kết luận Gemini thật `PASS`.**
  4. **AI Copilot V1 (Gemini API thật — `run-ai-v1-live-eval.js`)**: `BLOCKED` (`preflight.passed = true` trên `nexus_hrms_test`, nhưng `AI_ENABLED=false` và `GEMINI_API_KEY` chưa được cấu hình trong `Backend/.env`).
  5. **Docker Runtime (`docker-compose.test.yml` / `docker-compose.yml`)**: `OPTIONAL` cho sử dụng local trực tiếp; chỉ là điều kiện bắt buộc nếu chọn triển khai bằng Docker (cấu hình cô lập đạt `VERIFIED_SAFE`, runtime container đang `BLOCKED` do Docker Desktop đang tắt).

---

## 1. Bảng Tổng Hợp Trạng Thái Theo Môi Trường & Điều Kiện Vận Hành (`PASS` / `FAIL` / `BLOCKED`)

| Mã cổng | Hạng mục / Môi trường | Phạm vi kiểm chứng | Kết quả thực tế | Trạng thái |
|---|---|---|---|---|
| **ENV-TEST-DB** | **Database Kiểm thử Cô lập (`nexus_hrms_test`)** | Đủ `11/11` migrations (`001`..`011`), `34` base tables + `2` views, `check-schema-readiness.js` (với `DB_NAME=nexus_hrms_test`) trả về `READY`, vượt qua toàn bộ unit/API/browser E2E tests (`ASSERT 1..13`). | Đạt 100% trên môi trường test cô lập. | **`PASS`** |
| **ENV-RESTORE-REHEARSAL** | **Diễn tập Sao lưu Mới (Sau Khi Dừng Luồng Ghi) & Phục hồi vào DB Tạm Tên Riêng (`nexus_hrms_restore_staging_20261025_102100`)** | Dừng Backend (`PORT_8000_LISTENING=false`) -> Tạo backup mới `docs/remediation/evidence/backups/nexus_hrms_pre_r16_20261025_102100.sql` (`pg_dump` exit code `0`, `361,385 bytes`, SHA-256 `bf69320dacb294d909784204c3c859d332540cfefb94560e3f2a6af7b7bda389`) -> Tạo DB tạm tên riêng `nexus_hrms_restore_staging_20261025_102100` (không `DROP` DB có sẵn) -> Restore (`psql` exit code `0`) -> Kiểm tra `check-schema-readiness.js --report-only` với `DB_NAME=nexus_hrms_restore_staging_20261025_102100` khớp trạng thái dự kiến trước nâng cấp `9/11` (`DEPLOYMENT_PENDING`) và đối chiếu khớp 100% cả `32/32` bảng (cột, số dòng, SHA-256) với `nexus_hrms`. | Diễn tập sao lưu & phục hồi đạt 100% (`docs/remediation/evidence/pre-migration-backup-restore-rehearsal.log`). | **`PASS`** |
| **ENV-PRIMARY-DB** | **Database Chính (`nexus_hrms` — Môi trường sử dụng thực tế)** | Kiểm tra chỉ đọc (`DB_NAME=nexus_hrms` với `check-schema-readiness.js --report-only`): mới có `9/11` migrations (`DEPLOYMENT_PENDING`, thiếu `010` và `011`). Tiến trình ghi `:8000` đang được giữ dừng sau khi tạo backup `nexus_hrms_pre_r16_20261025_102100.sql`; **chờ người dùng xác nhận kết quả diễn tập phục hồi và kế hoạch cụ thể trước khi chạy lệnh migration và smoke test sau nâng cấp**. | Chưa chạy migration trên `nexus_hrms` khi chưa có xác nhận của người dùng. | **`BLOCKED`** *(Chờ xác nhận chạy migration `010` & `011`)* |
| **AI-MOCK-GATE** | **AI NEXUS V1 — Mock Provider & Hậu kiểm Dữ kiện (`nexus_hrms_test`)** | Kiểm chứng định tuyến ý định, phân quyền RBAC/scope theo 6 vai trò, hậu kiểm số liệu với tool payload, từ chối câu khẳng định không gọi tool, làm rõ câu mơ hồ (`clarification`), so sánh 2 kỳ lương đã công bố gần nhất từ DB (`AI-V1-F02`), giữ trường `NULL` khác `0 ₫` (`AI-V1-F03`). | `150/150` Backend unit + `48/48` AI API tests + Browser E2E `ASSERT 10` đều `PASS`. | **`PASS`** *(Chỉ tính cho phạm vi Mock/DB test)* |
| **AI-LIVE-GATE** | **AI NEXUS V1 — Gemini API Thật (`run-ai-v1-live-eval.js`)** | Kiểm tra trạng thái cấu hình `Backend/src/config/env.js` (không in secret): `{"aiEnabled":false,"apiKeyConfigured":false,"model":"gemini-2.5-flash"}`. Bước `preflight` của `run-ai-v1-live-eval.js` trên `nexus_hrms_test` đạt `PASS`, nhưng chưa thể gọi Gemini API thật. | Chưa có `GEMINI_API_KEY` tại máy. | **`BLOCKED`** *(Chờ cấu hình `GEMINI_API_KEY` trong `Backend/.env`)* |
| **DOCKER-GATE** | **Triển khai bằng Docker (`docker-compose.test.yml`)** *(Chỉ bắt buộc nếu triển khai qua Docker)* | Guard tĩnh & `docker compose config` (`npm run docker:test:verify --prefix Backend`) đạt `VERIFIED_SAFE`. Chưa chạy container thực tế do Docker Desktop daemon đang tắt. | Không chặn việc sử dụng local trực tiếp (`npm run dev`); `BLOCKED` nếu chọn triển khai bằng Docker. | **`BLOCKED`** *(Tùy chọn nếu dùng Local; bắt buộc nếu dùng Docker)* |

---

## 2. Ma Trận Nghiệm Thu 11 Phân Hệ (`nexus_hrms_test` vs `nexus_hrms`)

> **Lưu ý minh bạch**: Cột `Kết quả trên nexus_hrms_test` ghi nhận kết quả kiểm thử trình duyệt thật (`node Backend/scripts/e2e-browser-verify.js`) trên database kiểm thử cô lập (`11/11` migrations). Cột `Kết quả trên nexus_hrms` đang ở trạng thái `BLOCKED` cho đến khi bạn phê duyệt chạy migration `010` & `011` và hoàn tất kiểm tra `READY 11/11` + smoke test môi trường thật.

| Mã kịch bản | Phân hệ | Vai trò kiểm tra | Nội dung kiểm tra trên `nexus_hrms_test` (UI + API + DB + Cross-cutting) | Kết quả trên `nexus_hrms_test` | Kết quả trên `nexus_hrms` (DB chính) |
|---|---|---|---|---|---|
| **UAT-M01** | **1. Xác thực, Phiên & Phân quyền (`Auth, Session & RBAC`)** | `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE`, `ADMIN`, `KIOSK` | Đăng nhập 6 vai trò; đăng xuất xóa token & về `/login`; hết phiên (`401` khi access & refresh token hết hạn) tự đưa về `/login`; chặn `ADMIN`/`KIOSK` vào `/payroll`; chặn `EMPLOYEE` gọi `PUT /api/settings` (`403`). | **`PASS`** (`ASSERT 1, 2, 3a, 8d, 12, 13a`) | **`BLOCKED`** *(Chờ nâng cấp `010`/`011` & smoke test)* |
| **UAT-M02** | **2. Bảng điều khiển (`Dashboard`)** | `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE` | Đối chiếu `total_active` trên `/dashboard` khớp `GET /api/dashboard/stats` và PostgreSQL; `LINE_MANAGER` phát sinh `0` request tới `/api/payroll/periods` (`BUG-UAT-02`); `/portal` cô lập dữ liệu từng nhân viên. | **`PASS`** (`ASSERT 2, 13b`) | **`BLOCKED`** *(Chờ nâng cấp `010`/`011` & smoke test)* |
| **UAT-M03** | **3. Hồ sơ Nhân sự (`Directory / Employees`)** | `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE`, `ADMIN` | Tìm kiếm theo họ tên, lọc, phân trang `> 50` bản ghi (`Sau`/`Trước` khớp 100% DB); cô lập phòng ban giữa 2 `LINE_MANAGER`; lỗi `500` hiển thị `0` dòng giả; ẩn `face_encoding`, hiển thị đúng `base_salary` cho `HR_DIRECTOR`. | **`PASS`** (`ASSERT 2, 3b, 4, 13c`) | **`BLOCKED`** *(Chờ nâng cấp `010`/`011` & smoke test)* |
| **UAT-M04** | **4. Chấm công, Kiosk QR & Giải trình (`Attendance & Appeals`)** | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `KIOSK` | Sinh mã QR (`200`), quét tại Kiosk lần đầu (`201/200`), quét lại cùng `qrToken` bị chặn `401` (anti-replay); gửi giải trình (`201`), trưởng phòng khác bộ phận bị chặn `403`, trưởng phòng cùng bộ phận duyệt `200 DA_DUYET`. | **`PASS`** (`ASSERT 12c, 13d`) | **`BLOCKED`** *(Chờ nâng cấp `010`/`011` & smoke test)* |
| **UAT-M05** | **5. Nghỉ phép & Chuỗi duyệt 2 cấp (`Leave Management`)** | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `CEO` | Tạo đơn qua lễ Quốc khánh `2026-09-01..2026-09-03` trừ ngày lễ `2026-09-02` còn `2` ngày làm việc; duyệt 2 cấp (`CHO_HR_PHE_CHUAN` -> `DA_PHE_DUYET`); reload `/portal` số dư phép giảm từ `9.5` xuống `7.5` ngày khớp DB. | **`PASS`** (`ASSERT 2, 13d`) | **`BLOCKED`** *(Cần bảng `public_holidays` từ migration `010`)* |
| **UAT-M06** | **6. Bảng lương, Đối soát xung đột, Khóa sổ & Xuất CSV (`Payroll & CSV`)** | Toàn bộ 6 vai trò | Chọn kỳ chưa tạo/đang tải/lỗi `500`; đối soát `409 ADJUSTMENT_SOURCE_CONFLICT`; cảnh báo `PAYROLL_STALE` & khóa sổ `DA_CHOT`; xuất CSV đa trang (`505+` phiếu) khớp 100% tổng `gross`, `net`, chặn hoán đổi lương/trùng dòng. | **`PASS`** (`ASSERT 5, 6, 7, 8`) | **`BLOCKED`** *(Cần cột `policy_snapshot` từ migration `010`)* |
| **UAT-M07** | **7. Dự án, Nhiệm vụ & Lịch sử hoạt động (`Projects & Tasks`)** | `CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE` | Khi API lỗi `500` hiển thị banner lỗi + `Thử lại` và `0` dữ liệu mẫu giả; bảo toàn `kpi_weight = 0%`; tải lịch sử nhiệm vụ thật từ `GET /api/tasks/:id/logs` (`45%`). | **`PASS`** (`ASSERT 8b, 9`) | **`BLOCKED`** *(Chờ nâng cấp `010`/`011` & smoke test)* |
| **UAT-M08** | **8. Thông báo nội bộ & Tệp đính kèm (`Notices & Attachments`)** | `HR_DIRECTOR`, `EMPLOYEE` (`DEPT-IT` & `DEPT-SALES`) | Chặn tệp `> 5MB`; tải lên PDF `< 5MB`, sửa thông báo giữ nguyên tệp; `Context B` (`DEPT-IT`) tải tệp khớp 100% `SHA-256`; `Context C` (`DEPT-SALES`) bị ẩn trên chuông thông báo và bị chặn `403` khi tải trực tiếp; `blob:` cũ báo không khả dụng. | **`PASS`** (`ASSERT 11`) | **`BLOCKED`** *(Chờ nâng cấp `010`/`011` & smoke test)* |
| **UAT-M09** | **9. Cài đặt hệ thống & Phiên bản chính sách (`Settings & Policy Versions`)** | `HR_DIRECTOR`, `CEO`, `ADMIN`, `EMPLOYEE` | Khi `GET /api/settings` lỗi `500` khóa form & không ghi đè mặc định giả; lưu `max_ot_per_month` + `effective_from` và reload khớp `system_settings` & `system_policy_versions`. | **`PASS`** (`ASSERT 1, 3`) | **`BLOCKED`** *(Cần bảng `system_policy_versions` từ migration `011`)* |
| **UAT-M10** | **10. Trợ lý AI NEXUS V1 (`Grounded AI Copilot V1`)** | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `ADMIN`, `KIOSK` | Hỏi phép/lương/quy chế có nguồn, so sánh 2 kỳ đã công bố từ DB, giữ `NULL` khác `0 ₫`, nút `clarification`, chặn câu trả lời sai nguồn/bịa đặt, nút `Làm mới`. | **`PASS`** *(Mock & DB test: `ASSERT 10` + `48/48` API tests)* | **`BLOCKED`** *(Live Gemini chờ `GEMINI_API_KEY`)* |
| **UAT-M11** | **11. Đáp ứng đa thiết bị (`1440px` / `768px` / `390px`), Bàn phím & Console** | Toàn bộ 6 vai trò | Không tràn ngang ở `1440px`/`768px`/`390px`, modal cuộn được & đóng bằng `Escape`, điều hướng focus bàn phím hoạt động, `0` lỗi `Runtime.exceptionThrown`. | **`PASS`** (`ASSERT 12d, 13e`) | **`PASS`** *(Giao diện tĩnh/Bố cục)* |

---

## 3. Bằng Chứng Kiểm Thử & Diễn Tập Vận Hành (`2026-10-25`)

| STT | Lệnh thực thi | Phạm vi kiểm chứng | Kết quả | Exit Code | Bằng chứng |
|---|---|---|---|---|---|
| 1 | `node Backend/scripts/e2e-browser-verify.js` | Kiểm thử trình duyệt Chrome thật (`ASSERT 1..13`) trên `nexus_hrms_test` (`:8005`/`:3005`) | **`13/13 ASSERT GROUPS PASS`** | `0` | `docs/remediation/evidence/final-website-uat-browser.log` |
| 2 | `$env:DB_PORT="59999"; npm run test:unit --prefix Backend` | Bộ kiểm thử đơn vị Backend độc lập CSDL | **`150/150 PASS`** | `0` | `docs/remediation/evidence/final-website-uat-unit-build.log` |
| 3 | `npm test --prefix FrontEnd` | Bộ kiểm thử đơn vị Frontend | **`77/77 PASS`** | `0` | `docs/remediation/evidence/final-website-uat-unit-build.log` |
| 4 | `npm run build --prefix FrontEnd` | Bản dựng Production của Frontend Vite (`dist/`) | **`PASS` (`2013 modules`)** | `0` | `docs/remediation/evidence/final-website-uat-unit-build.log` |
| 5 | `npm run db:test` | Kiểm tra kết nối PostgreSQL 16.15 và 20 bảng chuẩn + 2 views trên `nexus_hrms_test` | **`20/20 PASS` (`100%`)** | `0` | Console output |
| 6 | `node --require ./Backend/tests/helpers/env.js --test "Backend/tests/api/ai-*.test.js"` | Kiểm thử tích hợp API cho AI Copilot (`14/14` bảo mật + `34/34` tình huống V1 & mock runner) trên `nexus_hrms_test` | **`48/48 PASS`** | `0` | Console output |
| 7 | `node Backend/scripts/run-ai-v1-live-eval.js` | Preflight + kiểm tra cổng Gemini thật trên `nexus_hrms_test` | **`PREFLIGHT PASS / LIVE BLOCKED`** | `0` | `docs/remediation/evidence/logs/ai-v1-live-eval-report.json` |
| 8 | Diễn tập dừng luồng ghi (`:8000`), tạo backup mới `nexus_hrms_pre_r16_20261025_102100.sql` và phục hồi vào `nexus_hrms_restore_staging_20261025_102100` | Kiểm tra `pg_dump` exit code `0`, dung lượng `361,385 bytes`, SHA-256 `bf69320dacb294d909784204c3c859d332540cfefb94560e3f2a6af7b7bda389`, `psql` restore exit code `0`, `check-schema-readiness.js` với `DB_NAME=nexus_hrms_restore_staging_20261025_102100` (`9/11 DEPLOYMENT_PENDING`) và đối chiếu `32/32` bảng với `nexus_hrms` | **`32/32 TABLES MATCHED 100%`** | `0` | `docs/remediation/evidence/pre-migration-backup-restore-rehearsal.log` |

---

## 4. Kết Quả Diễn Tập Khôi Phục & Kế Hoạch Đã Sửa Cho Database Chính `nexus_hrms` (Chờ Phê Duyệt)

### 4.1. Kết quả tạo Backup mới sau khi dừng luồng ghi & Diễn tập Phục hồi (`2026-10-25`)
1. **Dừng luồng ghi**: Đã dừng tiến trình Backend trên cổng `8000` (`PORT_8000_LISTENING=false`) trước khi chụp backup.
2. **Bản sao lưu mới (`pg_dump`)**:
   - **Tệp sao lưu**: `C:\Users\tavin\Downloads\QLDACNTT\docs\remediation\evidence\backups\nexus_hrms_pre_r16_20261025_102100.sql`
   - **Exit code `pg_dump`**: `0`
   - **Dung lượng**: `361,385 bytes`
   - **Mã băm `SHA-256`**: `bf69320dacb294d909784204c3c859d332540cfefb94560e3f2a6af7b7bda389`
3. **Diễn tập phục hồi vào Database tạm có tên riêng (không `DROP` database có sẵn)**:
   - **Tên database tạm**: `nexus_hrms_restore_staging_20261025_102100` (đã kiểm tra `SELECT COUNT(*) FROM pg_database WHERE datname = 'nexus_hrms_restore_staging_20261025_102100'` bằng `0` trước khi `CREATE DATABASE`, không thực thi `DROP DATABASE`).
   - **Exit code `psql` restore**: `0`
   - **Kiểm tra `check-schema-readiness.js` bằng `DB_NAME`**:
     - `database`: `"nexus_hrms_restore_staging_20261025_102100"`
     - `status`: `"DEPLOYMENT_PENDING"` (`appliedMigrationsCount: 9`, `expectedMigrationsCount: 11` — khớp đúng trạng thái dự kiến của bản backup trước nâng cấp).
   - **Đối chiếu cấu trúc và dữ liệu với baseline `nexus_hrms`**: Khớp 100% cả `32/32` bảng (cột, kiểu dữ liệu, số dòng và mã băm nội dung `SHA-256`: `employees=50`, `users=50`, `payslips=100`, `attendance_logs=99`, `leave_requests=8`, `projects=4`, `tasks=8`, `audit_logs=106`, `refresh_tokens=50`, `schema_migrations=9`).

### 4.2. Lệnh kiểm tra Readiness chuẩn (Dùng `DB_NAME`, xác minh trường `database` và khôi phục biến môi trường)
`Backend/scripts/check-schema-readiness.js` **không hỗ trợ tham số `--target-db`** mà đọc biến môi trường `DB_NAME` (khi `NODE_ENV` không phải `test`). Mọi bước kiểm tra readiness đều dùng hàm chuẩn sau để đảm bảo kiểm tra đúng trường `database` trong JSON trả về và khôi phục nguyên trạng biến môi trường:
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

### 4.3. Kế hoạch thực thi Migration (`010` & `011`) trên `nexus_hrms` (Sau khi bạn xác nhận)
Ngay khi bạn phê duyệt:
```powershell
# Bước 1: Kiểm tra trạng thái hiện tại của nexus_hrms (dự kiến DEPLOYMENT_PENDING 9/11)
$pre = Invoke-SchemaReadinessCheck -TargetDb "nexus_hrms" -ReportOnly

# Bước 2: Chạy Forward Migration 010 & 011 lên nexus_hrms với cờ bảo vệ bắt buộc của migrate.js
node Backend/scripts/migrate.js --target-db=nexus_hrms --confirm-production-db=nexus_hrms
if ($LASTEXITCODE -ne 0) { throw "Migration trên nexus_hrms thất bại ($LASTEXITCODE)" }

# Bước 3: Kiểm tra sau nâng cấp (bắt buộc đạt READY, appliedMigrationsCount = 11, exit code 0)
$post = Invoke-SchemaReadinessCheck -TargetDb "nexus_hrms"
if (-not $post.ready -or $post.appliedMigrationsCount -ne 11) {
  throw "nexus_hrms chưa đạt READY 11/11 sau migration"
}
```

### 4.4. Phương án Khôi phục Bằng Đổi Tên Tuần Tự 2 Bước Có Kiểm Soát Lỗi (`Controlled Two-Step Sequential Rename`)
> **Lưu ý kỹ thuật**: Hai lệnh `ALTER DATABASE ... RENAME TO ...` trong PostgreSQL thực thi **tuần tự (`Sequential`)**, không nằm trong một transaction nguyên tử. Do đó:
> - **Giữ Backend dừng hoàn toàn** (`PORT 8000` tắt) trong suốt quá trình khôi phục.
> - Sử dụng đúng bản backup mới `docs/remediation/evidence/backups/nexus_hrms_pre_r16_20261025_102100.sql` và database tạm đã kiểm chứng `nexus_hrms_restore_staging_20261025_102100` (trạng thái dự kiến `9/11 DEPLOYMENT_PENDING`).
> - Nếu Bước 1 (`nexus_hrms` -> `$failedDb`) thành công nhưng Bước 2 (`$stagingDb` -> `nexus_hrms`) thất bại, kịch bản lập tức chạy lệnh hoàn trả (`$failedDb` -> `nexus_hrms`) để database chính không bao giờ bị mất tên.
> - **Không tự động thực hiện đổi tên database chính** nếu không có yêu cầu khôi phục.

```powershell
$backupFile = "docs/remediation/evidence/backups/nexus_hrms_pre_r16_20261025_102100.sql"
$stagingDb  = "nexus_hrms_restore_staging_20261025_102100"
$failedDb   = "nexus_hrms_failed_upgrade_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

# 1. Đảm bảo Backend trên cổng 8000 đang dừng hoàn toàn
if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
  throw "Bắt buộc dừng Backend trên cổng 8000 trước khi thực hiện đổi tên khôi phục."
}

# 2. Xác nhận $stagingDb tồn tại và khớp baseline 9/11 trước nâng cấp
$stagingCheck = Invoke-SchemaReadinessCheck -TargetDb $stagingDb -ReportOnly
if ($stagingCheck.database -ne $stagingDb -or $stagingCheck.appliedMigrationsCount -ne 9 -or $stagingCheck.status -ne "DEPLOYMENT_PENDING") {
  throw "Database phục hồi $stagingDb không khớp baseline 9/11 trước nâng cấp."
}

# 3. Ngắt kết nối hiện có tới nexus_hrms và $stagingDb
& "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('nexus_hrms', '$stagingDb') AND pid <> pg_backend_pid();"
if ($LASTEXITCODE -ne 0) { throw "Không thể ngắt kết nối tới nexus_hrms / $stagingDb" }

# 4. Bước đổi tên 1 (Tuần tự): nexus_hrms -> $failedDb
& "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE nexus_hrms RENAME TO `"$failedDb`";"
if ($LASTEXITCODE -ne 0) {
  throw "Bước 1 (đổi tên nexus_hrms -> $failedDb) thất bại. Database nexus_hrms vẫn giữ nguyên tên gốc."
}

# 5. Bước đổi tên 2 (Tuần tự): $stagingDb -> nexus_hrms (kèm hoàn trả tự động nếu thất bại)
& "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$stagingDb' AND pid <> pg_backend_pid(); ALTER DATABASE `"$stagingDb`" RENAME TO nexus_hrms;"
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Bước 2 ($stagingDb -> nexus_hrms) thất bại! Đang hoàn trả $failedDb -> nexus_hrms..."
  & "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$failedDb' AND pid <> pg_backend_pid(); ALTER DATABASE `"$failedDb`" RENAME TO nexus_hrms;"
  if ($LASTEXITCODE -ne 0) {
    throw "CRITICAL: Hoàn trả $failedDb -> nexus_hrms thất bại. Cần kiểm tra trực tiếp trên postgres."
  }
  throw "Đã hoàn trả $failedDb về lại nexus_hrms an toàn do Bước 2 gặp lỗi."
}

# 6. Xác minh nexus_hrms sau khôi phục (9/11 baseline)
$restoredCheck = Invoke-SchemaReadinessCheck -TargetDb "nexus_hrms" -ReportOnly
if ($restoredCheck.database -ne "nexus_hrms" -or $restoredCheck.appliedMigrationsCount -ne 9) {
  throw "Xác minh nexus_hrms sau khôi phục không khớp trạng thái dự kiến 9/11."
}
```

---

## 5. Trạng Thái Gemini API Thật & Hướng Dẫn Cấu Hình Tại Máy

1. **Kết quả kiểm tra hiện tại (không in secret)**:
   - `{"aiEnabled":false,"apiKeyConfigured":false,"model":"gemini-2.5-flash"}`
   - Trạng thái Live AI: **`BLOCKED`** (giữ `BLOCKED` cho đến khi có `GEMINI_API_KEY` và bộ kiểm thử live đạt).
2. **Hướng dẫn cấu hình tại máy của bạn (không gửi API key vào khung chat)**:
   - Mở tệp `C:\Users\tavin\Downloads\QLDACNTT\Backend\.env` và cập nhật:
     ```env
     AI_ENABLED=true
     AI_PROVIDER=gemini
     GEMINI_API_KEY=<nhập-khóa-gemini-api-của-bạn-tại-máy>
     GEMINI_MODEL=gemini-2.5-flash
     ```
3. **Lệnh chạy Live Evaluation trên Database Test Cô Lập (`nexus_hrms_test`)**:
   ```powershell
   $env:NODE_ENV="test"
   $env:DB_NAME="nexus_hrms_test"
   $env:DB_NAME_TEST="nexus_hrms_test"
   node Backend/scripts/run-ai-v1-live-eval.js
   ```
