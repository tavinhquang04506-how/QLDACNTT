# OPERATOR DEPLOYMENT & MIGRATION RUNBOOK (`nexus_hrms`)

Hướng dẫn vận hành chuẩn dành cho Kỹ sư Triển khai (Operator / DevOps / DBA) khi nâng cấp cơ sở dữ liệu ứng dụng **`nexus_hrms`** từ trạng thái `DEPLOYMENT_PENDING` (`32` bảng, migration `001..009`) lên `READY` (`34` bảng, bổ sung migration `010` và `011`).

> **LƯU Ý QUAN TRỌNG VỀ CLI (`R23`)**:
> Script `Backend/scripts/migrate.js` hiện **chỉ nhận tên cơ sở dữ liệu qua biến môi trường `DB_NAME`** (hoặc giá trị mặc định trong `Backend/.env`). Script này chỉ xử lý cờ `--down` và **không xử lý tham số `--target-db`**. Luôn truyền `$env:DB_NAME='...'` (trên PowerShell) hoặc `DB_NAME=...` (trên Bash) khi chạy `migrate.js` và `check-schema-readiness.js`.

---

## 1. Kiểm Tra Trước Triển Khai (Read-Only Preflight)

1. Kiểm tra trạng thái hiện tại của `nexus_hrms` (không thay đổi dữ liệu):
   ```powershell
   $env:DB_NAME='nexus_hrms'; node Backend/scripts/check-schema-readiness.js --report-only
   ```
   - Kết quả hiện tại trước khi chạy migration:
     - `status`: `"DEPLOYMENT_PENDING"`
     - `pendingMigrations`: `["010_payroll_policy_snapshot_and_holidays.sql", "011_system_policy_versions.sql"]`
     - `missingTables`: `["public_holidays", "system_policy_versions"]`
     - `missingColumns`: `["payroll_periods.policy_snapshot"]`

2. Diễn tập tự động trên bản sao tạm (`nexus_hrms_rehearsal_test`) trước khi chạm vào DB thật:
   ```powershell
   node Backend/scripts/rehearse-r16-migration.js
   ```
   - Script này tự động `pg_dump` từ `nexus_hrms`, khôi phục sang `nexus_hrms_rehearsal_test`, chạy `migrate.js` 2 lần liên tiếp để kiểm tra tính lặp lại (idempotency), và đối chiếu 100% số dòng/tổng lương giữa bản gốc và bản sao.

---

## 2. Quy Trình Sao Lưu & Áp Dụng Migration Trên `nexus_hrms` (Maintenance Window)

### Bước 1: Tạo bản sao lưu đầy đủ (`pg_dump`)
```powershell
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
& "C:\Users\tavin\pgsql\bin\pg_dump.exe" -h 127.0.0.1 -p 5432 -U postgres -Fc -f "docs/remediation/backups/nexus_hrms-pre-cutover-$timestamp.dump" nexus_hrms
& "C:\Users\tavin\pgsql\bin\pg_restore.exe" --list "docs/remediation/backups/nexus_hrms-pre-cutover-$timestamp.dump" | Select-Object -First 25
```

### Bước 2: Chạy Migration `010` và `011`
```powershell
$env:DB_NAME='nexus_hrms'; node Backend/scripts/migrate.js
```

### Bước 3: Kiểm tra tính lặp lại (Idempotency) & Xác nhận `READY`
```powershell
$env:DB_NAME='nexus_hrms'; node Backend/scripts/migrate.js
$env:DB_NAME='nexus_hrms'; node Backend/scripts/check-schema-readiness.js
```
- Kỳ vọng:
  - Lần chạy thứ 2 của `migrate.js` báo `0` migration mới cần áp dụng (`already applied`).
  - `check-schema-readiness.js` trả về `"ready": true, "status": "READY"` với exit code `0`.

---

## 3. Quy Trình Khôi Phục Khẩn Cấp (Rollback Procedure)

Nếu phát hiện bất kỳ sự cố nào trong khung giờ bảo trì:
1. Dừng dịch vụ Backend.
2. Khôi phục từ file `.dump` vừa tạo ở Bước 1:
   ```powershell
   & "C:\Users\tavin\pgsql\bin\pg_restore.exe" -h 127.0.0.1 -p 5432 -U postgres --clean --if-exists -d nexus_hrms "docs/remediation/backups/nexus_hrms-pre-cutover-$timestamp.dump"
   ```
3. Chạy `node Backend/scripts/check-phase-a-baseline.js` để xác minh toàn bộ bảng và số dòng đã trở về trạng thái ban đầu.
