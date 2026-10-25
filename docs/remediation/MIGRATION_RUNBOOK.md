# MIGRATION RUNBOOK — NEXUS HRMS (`R16` & `R23`: Schema Readiness, Pre-Migration Backup, Restore Rehearsal & Safe Forward Migration)

- **Ngày lập / Cập nhật**: `2026-10-25`
- **Phạm vi**: Chuẩn bị bản sao lưu mới sau khi dừng luồng ghi, diễn tập phục hồi vào database tạm có tên duy nhất (`nexus_hrms_restore_staging_<timestamp>`), đối chiếu `32/32` bảng bằng SHA-256 checksum, và quy trình nâng cấp / khôi phục tuần tự có kiểm soát lỗi cho CSDL chính `nexus_hrms` lên migration `010` và `011`.
- **Trạng thái hiện tại của DB chính (`nexus_hrms`)**: **`READY` (`11 / 11` migrations đã áp dụng thành công ngày `2026-10-25`, bằng chứng tại `docs/remediation/evidence/primary-db-migration-execution.log`)**
  - Đã áp dụng: `9 / 11` migrations (`001`..`009`).
  - Đang chờ triển khai:
    1. `010_payroll_policy_snapshot_and_holidays.sql` (`public_holidays`, `payroll_periods.policy_snapshot`, 4 khóa cấu hình lương trong `system_settings`).
    2. `011_system_policy_versions.sql` (`system_policy_versions` lưu lịch sử phiên bản chính sách theo kỳ `effective_from`).
  - **Cam kết an toàn**: Không reset, không seed đè, không `DROP` bất kỳ database nào có sẵn và không chạy migration hay đổi tên `nexus_hrms` khi chưa có xác nhận của người vận hành.

---

## 1. Phân biệt Bằng chứng Diễn tập và Timeline Bảo toàn DB Chính (`R23`)

1. **Diễn tập nâng cấp trên bản sao (`docs/remediation/evidence/r16-migration-rehearsal.log`)**:
   - Đã kiểm chứng nâng cấp từ `9/11` lên `11/11` migrations trên database bản sao độc lập `nexus_hrms_rehearsal_test` mà không làm thay đổi nội dung 31 bảng nghiệp vụ.
2. **Diễn tập sao lưu sau khi dừng luồng ghi & phục hồi vào database tạm tên riêng (`docs/remediation/evidence/pre-migration-backup-restore-rehearsal.log` — `2026-10-25`)**:
   - Đã dừng tiến trình Backend (`PORT_8000_LISTENING=false`), tạo bản sao lưu mới `docs/remediation/evidence/backups/nexus_hrms_pre_r16_20261025_102100.sql` (`pg_dump` exit code `0`, `361,385 bytes`, SHA-256 `bf69320dacb294d909784204c3c859d332540cfefb94560e3f2a6af7b7bda389`), phục hồi vào database tạm tên riêng `nexus_hrms_restore_staging_20261025_102100` (không chạy `DROP DATABASE`), xác nhận trạng thái dự kiến `9/11` migrations (`DEPLOYMENT_PENDING`) và đối chiếu khớp 100% cả `32/32` bảng với `nexus_hrms`.
3. **Chốt bảo vệ cứng (`Backend/src/utils/testDbGuard.js` & `Backend/scripts/migrate.js`)**:
   - Mọi script kiểm thử chỉ được phép chạy trên database có hậu tố `_test`.
   - `Backend/scripts/migrate.js` từ chối chạy trên `nexus_hrms` (`MIGRATION_PRODUCTION_GUARD`) nếu thiếu cờ tường minh `--target-db=nexus_hrms --confirm-production-db=nexus_hrms`.

---

## 2. Cơ Chế Kiểm Tra Readiness (`check-schema-readiness.js`) — Dùng `DB_NAME` & Khôi Phục Biến Môi Trường

- Module: `Backend/src/utils/schemaReadiness.js` (`checkSchemaReadiness`)
- HTTP Endpoint: `GET /api/health/ready` (trả về `200 OK` kèm `"status": "READY"` khi đủ `11/11` migrations; trả về `503 Service Unavailable` kèm `"status": "DEPLOYMENT_PENDING"` khi mới có `9/11` migrations).
- CLI Script: `Backend/scripts/check-schema-readiness.js`
  - **Lưu ý quan trọng**: `Backend/scripts/check-schema-readiness.js` **không hỗ trợ tham số `--target-db`**. Script đọc tên database từ biến môi trường `process.env.DB_NAME` (khi `NODE_ENV` không phải `test`) và hỗ trợ cờ `--report-only` (trả về exit code `0` khi báo cáo `DEPLOYMENT_PENDING`; nếu không có `--report-only` sẽ trả về exit code `2` khi chưa `READY`).
  - Sau mỗi lần kiểm tra, bắt buộc kiểm tra trường `"database"` trong JSON kết quả khớp đúng DB mục tiêu và khôi phục lại biến môi trường `DB_NAME` / `NODE_ENV`.

### Hàm PowerShell chuẩn để kiểm tra Readiness cho một Database bất kỳ:
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

---

## 3. Cơ Chế CLI của `Backend/scripts/migrate.js` (`R16` & `R23`)

Khác với `check-schema-readiness.js`, script `Backend/scripts/migrate.js` hỗ trợ tham số CLI `--target-db=<db_name>` và `--confirm-production-db=<db_name>`:
- Trước khi áp dụng bất kỳ migration nào, `runMigrations()` truy vấn `SELECT current_database() AS db_name` và đối chiếu khớp với `expectedDatabase`.
- Để chạy trên database chính `nexus_hrms`, bắt buộc truyền đủ hai tham số:
  ```powershell
  node Backend/scripts/migrate.js --target-db=nexus_hrms --confirm-production-db=nexus_hrms
  ```

---

## 4. Quy Trình Triển Khai Chuẩn Trên `nexus_hrms` (Dừng Luồng Ghi -> Backup Mới -> Diễn Tập Restore -> Nâng Cấp)

### Bước 1: Dừng toàn bộ luồng ghi từ ứng dụng (`PORT 8000`)
Trước khi tạo bản sao lưu để nâng cấp, bắt buộc dừng tiến trình Backend đang kết nối vào `nexus_hrms` và xác nhận cổng `8000` không còn lắng nghe:
```powershell
$conns = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($conns) {
  foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Milliseconds 500
if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
  throw "Cổng 8000 vẫn đang hoạt động. Bắt buộc dừng Backend trước khi tạo backup."
}
```

### Bước 2: Tạo bản sao lưu vật lý mới (`pg_dump`) và kiểm tra Exit Code, Dung lượng, SHA-256
```powershell
$timestamp = "20261025_102100" # Hoặc: Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "docs/remediation/evidence/backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backupFile = "$backupDir/nexus_hrms_pre_r16_$timestamp.sql"

& "C:\Users\tavin\pgsql\bin\pg_dump.exe" -h 127.0.0.1 -p 5432 -U postgres -d nexus_hrms --no-owner --no-acl -f $backupFile
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump thất bại với exit code $LASTEXITCODE"
}

$fileInfo = Get-Item $backupFile
if ($fileInfo.Length -le 100000) {
  throw "Dung lượng file backup bất thường: $($fileInfo.Length) bytes"
}
$backupHash = (Get-FileHash $backupFile -Algorithm SHA256).Hash
Write-Host "BACKUP_OK: file=$backupFile size=$($fileInfo.Length) sha256=$backupHash"
```

### Bước 3: Thử phục hồi (`Restore Rehearsal`) vào Database tạm có tên riêng (Không `DROP` database có sẵn)
> **LƯU Ý QUAN TRỌNG**:
> - Tuyệt đối **không dùng `DROP DATABASE IF EXISTS`** lên bất kỳ database staging nào có sẵn. Luôn tạo database tạm có hậu tố thời gian riêng `$stagingDb = "nexus_hrms_restore_staging_$timestamp"` sau khi kiểm tra tên đó chưa tồn tại.
> - Bản sao lưu được chụp **trước khi nâng cấp** nên trạng thái dự kiến của `$stagingDb` sau khi restore phải là **`DEPLOYMENT_PENDING` (`9/11` migrations, thiếu `010` và `011`)** — tuyệt đối không yêu cầu bản backup trước nâng cấp đạt `11/11`.

```powershell
$stagingDb = "nexus_hrms_restore_staging_$timestamp"

# 1. Xác nhận tên DB tạm chưa tồn tại (không DROP DB nào có sẵn)
$existsCount = (& "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -t -A -c "SELECT COUNT(*) FROM pg_database WHERE datname = '$stagingDb';").Trim()
if ($existsCount -ne "0") {
  throw "Database tạm $stagingDb đã tồn tại. Dừng lại để không ghi đè hoặc xóa DB hiện có."
}

# 2. Tạo DB tạm mới và nạp bản backup vừa tạo
& "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE `"$stagingDb`";"
if ($LASTEXITCODE -ne 0) { throw "CREATE DATABASE $stagingDb thất bại ($LASTEXITCODE)" }

& "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d $stagingDb -v ON_ERROR_STOP=1 -f $backupFile
if ($LASTEXITCODE -ne 0) { throw "Restore vào $stagingDb thất bại ($LASTEXITCODE)" }

# 3. Kiểm tra readiness trên $stagingDb bằng DB_NAME (trạng thái dự kiến của backup trước nâng cấp là 9/11 DEPLOYMENT_PENDING)
$stagingReadiness = Invoke-SchemaReadinessCheck -TargetDb $stagingDb -ReportOnly
if ($stagingReadiness.database -ne $stagingDb -or $stagingReadiness.appliedMigrationsCount -ne 9 -or $stagingReadiness.status -ne "DEPLOYMENT_PENDING") {
  throw "Trạng thái schema của $stagingDb không khớp baseline 9/11 trước nâng cấp"
}
```

### Bước 4: Thực thi Forward Migration (`010` & `011`) trên `nexus_hrms` (Chỉ chạy sau khi Người vận hành xác nhận)
```powershell
node Backend/scripts/migrate.js --target-db=nexus_hrms --confirm-production-db=nexus_hrms
if ($LASTEXITCODE -ne 0) {
  throw "Migration trên nexus_hrms thất bại với exit code $LASTEXITCODE"
}

# Kiểm tra sau nâng cấp: phải đạt READY (11/11 migrations, exit code 0 không cần --report-only)
$postReadiness = Invoke-SchemaReadinessCheck -TargetDb "nexus_hrms"
if (-not $postReadiness.ready -or $postReadiness.appliedMigrationsCount -ne 11) {
  throw "nexus_hrms chưa đạt READY 11/11 sau migration"
}
```

---

## 5. Quy Trình Khôi Phục Bằng Đổi Tên Tuần Tự Có Kiểm Soát Lỗi (`Controlled Two-Step Sequential Rename`)

> **NGUYÊN TẮC KỸ THUẬT & AN TOÀN**:
> 1. Trong PostgreSQL, lệnh `ALTER DATABASE ... RENAME TO ...` không chạy được bên trong một transaction (`BEGIN ... COMMIT`). Do đó, việc đổi tên `nexus_hrms` sang tên lưu trữ lỗi (`$failedDb`) rồi đổi tên `$stagingDb` sang `nexus_hrms` là **hai bước tuần tự (`Two-Step Sequential Rename`)**, **không phải một thao tác nguyên tử (`Atomic Swap`)**.
> 2. **Giữ Backend dừng hoàn toàn** (`PORT 8000` tắt) trong suốt quá trình khôi phục để không phát sinh kết nối mới làm cản trở bước đổi tên thứ hai.
> 3. **Xử lý lỗi khi Bước 1 thành công nhưng Bước 2 thất bại**: Nếu lệnh đổi tên thứ nhất (`nexus_hrms` -> `$failedDb`) đã thành công mà lệnh đổi tên thứ hai (`$stagingDb` -> `nexus_hrms`) gặp lỗi, script phải lập tức ngắt kết nối trên `$stagingDb` để thử lại; nếu vẫn lỗi thì phải chạy ngay lệnh hoàn trả (`ALTER DATABASE "$failedDb" RENAME TO nexus_hrms`) để `nexus_hrms` không bao giờ bị mất tên.
> 4. **Chỉ thực hiện khi Người vận hành yêu cầu khôi phục** — không tự động đổi tên database chính.

### Kịch bản PowerShell khôi phục tuần tự có bù trừ lỗi (`Compensating Recovery`):
```powershell
# Sử dụng đúng bản backup mới và database staging đã kiểm chứng ở Bước 2 & Bước 3:
$backupFile = "docs/remediation/evidence/backups/nexus_hrms_pre_r16_20261025_102100.sql"
$stagingDb  = "nexus_hrms_restore_staging_20261025_102100"
$failedDb   = "nexus_hrms_failed_upgrade_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

# 1. Đảm bảo Backend trên cổng 8000 đang dừng hoàn toàn
if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
  throw "Bắt buộc dừng Backend trên cổng 8000 trước khi thực hiện đổi tên khôi phục."
}

# 2. Xác nhận $stagingDb tồn tại và khớp baseline 9/11 trước khi đổi tên
$stagingCheck = Invoke-SchemaReadinessCheck -TargetDb $stagingDb -ReportOnly
if ($stagingCheck.database -ne $stagingDb -or $stagingCheck.appliedMigrationsCount -ne 9) {
  throw "Database phục hồi $stagingDb chưa sẵn sàng hoặc không khớp baseline 9/11."
}

# 3. Ngắt các kết nối hiện có tới nexus_hrms và $stagingDb
& "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('nexus_hrms', '$stagingDb') AND pid <> pg_backend_pid();"
if ($LASTEXITCODE -ne 0) { throw "Không thể ngắt kết nối tới nexus_hrms / $stagingDb" }

# 4. Bước đổi tên 1: nexus_hrms -> $failedDb
& "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE nexus_hrms RENAME TO `"$failedDb`";"
if ($LASTEXITCODE -ne 0) {
  throw "Bước 1 (đổi tên nexus_hrms -> $failedDb) thất bại. Database nexus_hrms vẫn giữ nguyên tên gốc."
}

# 5. Bước đổi tên 2: $stagingDb -> nexus_hrms (kèm cơ chế thử lại & hoàn trả nếu thất bại)
& "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$stagingDb' AND pid <> pg_backend_pid(); ALTER DATABASE `"$stagingDb`" RENAME TO nexus_hrms;"
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Bước 2 ($stagingDb -> nexus_hrms) thất bại! Đang thực hiện hoàn trả $failedDb -> nexus_hrms..."
  & "C:\Users\tavin\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$failedDb' AND pid <> pg_backend_pid(); ALTER DATABASE `"$failedDb`" RENAME TO nexus_hrms;"
  if ($LASTEXITCODE -ne 0) {
    throw "CRITICAL: Hoàn trả $failedDb -> nexus_hrms thất bại. Cần kiểm tra trực tiếp trên postgres."
  }
  throw "Đã hoàn trả $failedDb về lại nexus_hrms an toàn do Bước 2 gặp lỗi."
}

# 6. Xác minh nexus_hrms sau khôi phục
$restoredCheck = Invoke-SchemaReadinessCheck -TargetDb "nexus_hrms" -ReportOnly
if ($restoredCheck.database -ne "nexus_hrms" -or $restoredCheck.appliedMigrationsCount -ne 9) {
  throw "Xác minh nexus_hrms sau khôi phục không khớp trạng thái dự kiến."
}
Write-Host "RESTORE_SWAP_OK: nexus_hrms đã được khôi phục từ $stagingDb (bản lỗi lưu tại $failedDb)"
```
