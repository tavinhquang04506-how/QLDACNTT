# MIGRATION RUNBOOK — NEXUS HRMS (`R16` & `R23`: Schema Readiness, Backup, Clone Rehearsal & Safe Forward Migration)

- **Ngày lập / Cập nhật**: 2026-10-21
- **Phạm vi**: Chuẩn bị, diễn tập (rehearsal) trên DB bản sao độc lập, kiểm chứng bảo toàn nội dung dữ liệu bằng SHA-256 checksum, và quy trình nâng cấp an toàn CSDL ứng dụng `nexus_hrms` lên migration `010` và `011`.
- **Trạng thái hiện tại của DB ứng dụng (`nexus_hrms`)**: **`DEPLOYMENT_PENDING`**
  - Đã áp dụng: `9 / 11` migrations (`001`..`009`).
  - Đang chờ triển khai:
    1. `010_payroll_policy_snapshot_and_holidays.sql` (`public_holidays`, `payroll_periods.policy_snapshot`, 4 khóa cấu hình lương trong `system_settings`).
    2. `011_system_policy_versions.sql` (`system_policy_versions` lưu lịch sử phiên bản chính sách theo kỳ `effective_from`).
  - **Cam kết an toàn**: Không reset, không seed đè, không drop và không tự động chạy migration trên `nexus_hrms` trong bước phát triển/kiểm thử.

---

## 1. Phân biệt Bằng chứng Diễn tập Bản sao (Clone Rehearsal) và Timeline Bảo toàn DB Gốc (`R23`)

Để đảm bảo tính minh bạch tuyệt đối trong hồ sơ nghiệm thu:

1. **Phạm vi của `docs/remediation/evidence/r16-migration-rehearsal.log`**:
   - Chứng minh trong phạm vi phiên chạy `rehearse-r16-migration.js` (từ `2026-10-21T07:17:45Z` đến `07:17:50Z`), 31/31 bảng của `nexus_hrms` được đọc qua kết nối `default_transaction_read_only=on`, sao lưu sang `nexus_hrms_rehearsal_test`, nâng cấp từ `9/11` lên `11/11` migrations trên bản sao, và SHA-256 content hash của `nexus_hrms` trước/sau bước rehearsal không đổi.
2. **Sự cố chạm `nexus_hrms` trước khi có guard (`2026-10-21T07:08:31Z` – `07:15:42Z`)**:
   - Lúc `2026-10-21T07:08:31Z` (`14:08:31+07:00`), lệnh `node --test Backend/tests/api/r16-r19-review-fixes.test.js` được gọi trực tiếp không kèm `NODE_ENV=test` trước khi `Backend/src/config/env.js` có cơ chế tự phát hiện `NODE_TEST_CONTEXT`. Lần chạy này đã tạo các bản ghi fixture `NV-T*` và cập nhật `system_settings` (`updated_at = 2026-10-21 14:08:31.59202+07`) trên `nexus_hrms`.
   - Lúc `2026-10-21T07:15:42Z` (`14:15:42+07:00`), script một lần `cleanup-orphan-nvt.js` đã được chạy để xóa các dòng nhân sự `NV-T*` mồ côi nhưng còn để lại `1` dòng `audit_logs` (`id = 23`, `action = 'LOCK_PAYROLL'`, `record_id = '999901'`) và dấu vết `system_settings.updated_at` / sequence.
   - **Biện pháp khắc phục (`R23`)**:
     - Giữ nguyên hiện trạng `nexus_hrms`, **tuyệt đối không tự ý chạy thêm bất kỳ lệnh xóa/sửa thủ công nào trên `nexus_hrms`**.
     - Đã bổ sung chốt chặn cứng `Backend/src/utils/testDbGuard.js` (`assertTestDatabaseName` và `assertSafeTestDatabase` kiểm tra trực tiếp `SELECT current_database()`) vào `env.js`, `db.js`, toàn bộ `Backend/tests/helpers/*` và các script `test-setup.js`, `seed-demo.js`, `truncate-all-data.js`, `reset-seed-50.js`. Kể cả khi `DB_NAME_TEST=nexus_hrms` bị cấu hình nhầm, hệ thống lập tức ném lỗi `TEST_DB_GUARD_FORBIDDEN` trước khi bất kỳ câu lệnh DML nào được thực thi.

---

## 2. Kiểm tra Readiness / Preflight (Read-Only)

Hệ thống cung cấp cơ chế kiểm tra schema readiness không ghi dữ liệu (read-only) tại:
- Module: `Backend/src/utils/schemaReadiness.js` (`checkSchemaReadiness`)
- HTTP Endpoint: `GET /api/health/ready` (trả về `200 OK` kèm `"status": "READY"` khi đủ 11 migrations và cấu trúc bảng/cột; trả về `503 Service Unavailable` kèm `"status": "DEPLOYMENT_PENDING"` khi thiếu migration hoặc bảng/cột bắt buộc).
- CLI Script: `Backend/scripts/check-schema-readiness.js` (hỗ trợ `--target-db=<name>` và `--report-only`).

### Lệnh kiểm tra nhanh:
```powershell
# Chế độ báo cáo (exit code 0, in JSON chi tiết):
node Backend/scripts/check-schema-readiness.js --target-db=nexus_hrms --report-only

# Chế độ CI/Preflight nghiêm ngặt (exit code 1 nếu chưa READY):
npm run db:preflight --prefix Backend
```

---

## 3. Cơ chế CLI của `Backend/scripts/migrate.js` (`R16` & `R23`)

`Backend/scripts/migrate.js` đã được chuẩn hóa để hỗ trợ đầy đủ tham số CLI và kiểm tra an toàn kết nối:
- Hỗ trợ `--target-db=<db_name>` (hoặc biến môi trường `DB_NAME`).
- Trước khi áp dụng bất kỳ migration nào, `runMigrations()` truy vấn `SELECT current_database() AS current_db` và đối chiếu khớp chính xác với `targetDb`.
- **Bảo vệ DB gốc `nexus_hrms`**: Nếu `current_database() === 'nexus_hrms'` (hoặc không có hậu tố `_test`), CLI sẽ **từ chối thực thi** (`MIGRATION_PRODUCTION_GUARD`) trừ khi người vận hành chủ động truyền cờ xác nhận tường minh:
  ```powershell
  node Backend/scripts/migrate.js --target-db=nexus_hrms --confirm-production-db=nexus_hrms
  ```

---

## 4. Diễn tập Migration trên Bản sao Độc lập (`nexus_hrms_rehearsal_test`)

Script tự động diễn tập toàn trình: `Backend/scripts/rehearse-r16-migration.js` (`npm run db:rehearse-r16 --prefix Backend`).

### Lệnh chạy lại diễn tập bất kỳ lúc nào:
```powershell
npm run db:rehearse-r16 --prefix Backend
```
Bằng chứng log nguyên văn: `docs/remediation/evidence/r16-migration-rehearsal.log`.

---

## 5. Quy trình Triển khai Thật trên `nexus_hrms` (Dành cho Người vận hành khi nghiệm thu)

> **LƯU Ý QUAN TRỌNG**: Không dùng lại file backup cũ từ bước rehearsal nếu sau thời điểm đó ứng dụng có phát sinh ghi dữ liệu. Bắt buộc thực hiện backup mới trong cửa sổ bảo trì (maintenance window) sau khi đã ngắt luồng ghi của ứng dụng.

### Bước 1: Mở cửa sổ bảo trì (Maintenance Window) & Tạm dừng kết nối ghi từ ứng dụng
Dừng tiến trình Backend API đang kết nối vào `nexus_hrms` để đảm bảo không có giao dịch ghi mới trong lúc sao lưu và nâng cấp.

### Bước 2: Tạo bản sao lưu vật lý mới (Fresh Backup) và kiểm tra tính toàn vẹn
```powershell
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
New-Item -ItemType Directory -Force -Path "backups" | Out-Null

# Tạo bản sao lưu SQL plain-text (kèm kiểm tra SHA-256)
& "C:\Users\tavin\pgsql\bin\pg_dump.exe" -h localhost -p 5432 -U postgres -d nexus_hrms --no-owner --no-acl -f "backups/nexus_hrms_pre_r16_$timestamp.sql"
Get-FileHash "backups/nexus_hrms_pre_r16_$timestamp.sql" -Algorithm SHA256
```

### Bước 3: Chạy Forward Migration (`010` & `011`) với cờ xác nhận tường minh
```powershell
node Backend/scripts/migrate.js --target-db=nexus_hrms --confirm-production-db=nexus_hrms
```

### Bước 4: Kiểm tra Preflight trên `nexus_hrms` & Chạy Suite Kiểm thử trên `nexus_hrms_test`
```powershell
# 1. Xác minh nexus_hrms đã đạt trạng thái READY (11/11 migrations):
node Backend/scripts/check-schema-readiness.js --target-db=nexus_hrms

# 2. Chạy bộ kiểm thử schema/ràng buộc trên DB kiểm thử độc lập (nexus_hrms_test):
npm run db:test --prefix Backend
```
Lệnh (1) phải trả về exit code `0` với `"status": "READY"`, `"appliedMigrationsCount": 11`, `"missingStructures": []`.

---

## 6. Quy trình Phục hồi An toàn (Non-Destructive Rollback) nếu có sự cố

> **NGUYÊN TẮC AN TOÀN**: Tuyệt đối **KHÔNG** chạy `DROP DATABASE nexus_hrms` trực tiếp trước khi bản sao phục hồi được nạp xong và kiểm tra toàn vẹn 100%.

Nếu quá trình nâng cấp tại Bước 3 gặp sự cố cần quay lui:

### Bước 1: Khởi tạo DB phục hồi tạm `nexus_hrms_restore_staging` và nạp từ file backup vừa tạo ở Bước 2
```powershell
& "C:\Users\tavin\pgsql\bin\psql.exe" -h localhost -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS nexus_hrms_restore_staging;"
& "C:\Users\tavin\pgsql\bin\psql.exe" -h localhost -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE nexus_hrms_restore_staging;"
& "C:\Users\tavin\pgsql\bin\psql.exe" -h localhost -p 5432 -U postgres -d nexus_hrms_restore_staging -v ON_ERROR_STOP=1 -f "backups/nexus_hrms_pre_r16_<timestamp>.sql"
```

### Bước 2: Kiểm tra số bảng và dữ liệu trên `nexus_hrms_restore_staging` trước khi hoán đổi
```powershell
node Backend/scripts/check-schema-readiness.js --target-db=nexus_hrms_restore_staging --report-only
```

### Bước 3: Hoán đổi tên DB nguyên tử (Atomic Swap) — Giữ lại DB lỗi dưới tên `_failed_upgrade` để điều tra
```powershell
& "C:\Users\tavin\pgsql\bin\psql.exe" -h localhost -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('nexus_hrms', 'nexus_hrms_restore_staging') AND pid <> pg_backend_pid();"
& "C:\Users\tavin\pgsql\bin\psql.exe" -h localhost -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE nexus_hrms RENAME TO nexus_hrms_failed_upgrade;"
& "C:\Users\tavin\pgsql\bin\psql.exe" -h localhost -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE nexus_hrms_restore_staging RENAME TO nexus_hrms;"
```
Nhờ quy trình hoán đổi này, tại mọi thời điểm dữ liệu gốc đều có ít nhất 2 bản lưu (file dump + DB đổi tên) và không bao giờ bị mất trắng nếu lệnh restore gặp lỗi giữa chừng.
