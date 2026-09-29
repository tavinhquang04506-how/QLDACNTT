# MIGRATION RUNBOOK — NEXUS HRMS (`R16`: Schema Readiness, Backup, Clone Rehearsal & Forward Migration)

- **Ngày lập**: 2026-10-21
- **Phạm vi**: Chuẩn bị, diễn tập (rehearsal), kiểm chứng bảo toàn nội dung dữ liệu bằng SHA-256 checksum và hướng dẫn nâng cấp CSDL ứng dụng `nexus_hrms` lên migration `010` và `011`.
- **Trạng thái hiện tại của DB ứng dụng (`nexus_hrms`)**: **`DEPLOYMENT_PENDING`**
  - Đã áp dụng: `9 / 11` migrations (`001`..`009`).
  - Đang chờ triển khai:
    1. `010_payroll_policy_snapshot_and_holidays.sql` (`public_holidays`, `payroll_periods.policy_snapshot`, 4 khóa cấu hình lương trong `system_settings`).
    2. `011_system_policy_versions.sql` (`system_policy_versions` lưu lịch sử phiên bản chính sách theo kỳ `effective_from`).
  - **Cam kết an toàn**: Tuyệt đối không reset, không seed đè, không drop và không tự động chạy migration làm thay đổi CSDL gốc `nexus_hrms` khi chưa có lệnh triển khai chính thức của người vận hành.

---

## 1. Kiểm tra Readiness / Preflight (Read-Only)

Hệ thống đã được bổ sung cơ chế kiểm tra schema readiness không ghi dữ liệu (read-only) tại:
- Module: `Backend/src/utils/schemaReadiness.js` (`checkSchemaReadiness`)
- HTTP Endpoint: `GET /api/health/ready` (trả về `200 OK` kèm `"status": "READY"` khi đủ 11 migrations và cấu trúc bảng/cột; trả về `503 Service Unavailable` kèm `"status": "DEPLOYMENT_PENDING"` khi thiếu migration hoặc bảng/cột bắt buộc).
- CLI Script: `Backend/scripts/check-schema-readiness.js`

### Lệnh kiểm tra nhanh:
```powershell
# Chế độ báo cáo (exit code 0, in JSON chi tiết):
node Backend/scripts/check-schema-readiness.js --report-only

# Chế độ CI/Preflight nghiêm ngặt (exit code 1 nếu chưa READY):
npm run db:preflight --prefix Backend
```

### Kết quả thực tế hiện tại trên `nexus_hrms` (`docs/remediation/evidence/r16-schema-preflight.log`):
```json
{
  "ready": false,
  "status": "DEPLOYMENT_PENDING",
  "database": "nexus_hrms",
  "expectedMigrationsCount": 11,
  "appliedMigrationsCount": 9,
  "pendingMigrations": [
    "010_payroll_policy_snapshot_and_holidays.sql",
    "011_system_policy_versions.sql"
  ],
  "missingStructures": [
    "table:public.public_holidays",
    "table:public.system_policy_versions",
    "column:public.payroll_periods.policy_snapshot",
    "column:public.public_holidays.holiday_date",
    "column:public.public_holidays.is_paid",
    "column:public.system_policy_versions.effective_from",
    "column:public.system_policy_versions.policy"
  ]
}
```

---

## 2. Diễn tập Migration trên Bản sao Độc lập (`nexus_hrms_rehearsal_test`)

Script tự động diễn tập toàn trình: `Backend/scripts/rehearse-r16-migration.js` (`npm run db:rehearse-r16 --prefix Backend`).

### Quy trình 8 bước được script thực thi tự động:
1. **Đọc trạng thái & tính SHA-256 content checksum cho toàn bộ 31 bảng nghiệp vụ hiện có** trên `nexus_hrms` qua kết nối `default_transaction_read_only=on`.
2. **Tạo bản sao lưu `pg_dump`** từ `nexus_hrms` và tính SHA-256 của file backup (`sizeBytes=359165`, `sha256=855a4bc8ba297bef92cbddd6256bb179fde4756b6c3b535e09b5858ffd7c0f58`).
3. **Khởi tạo DB bản sao độc lập `nexus_hrms_rehearsal_test`**, nạp bản backup và xác nhận 31/31 bảng có SHA-256 content hash khớp 100% với `nexus_hrms` trước khi migrate.
4. **Chạy forward migrations lần 1 (`runMigrations`) trên `nexus_hrms_rehearsal_test`**:
   - Áp dụng `010_payroll_policy_snapshot_and_holidays.sql` và `011_system_policy_versions.sql`.
   - Kiểm tra `checkSchemaReadiness` chuyển từ `DEPLOYMENT_PENDING` (`9/11`) sang `READY` (`11/11`, `missingStructures: []`).
5. **Kiểm chứng tính lặp lại (Idempotency — chạy `runMigrations` lần 2)**:
   - Trả về `appliedRun2: []` (no-op).
   - SHA-256 content hash của `public_holidays`, `system_policy_versions`, và `system_settings` trước và sau lần chạy thứ 2 khớp tuyệt đối 100%.
6. **Kiểm chứng bảo toàn nội dung dữ liệu (SHA-256 Content Checksum across 31 Pre-Existing Tables)**:
   - Toàn bộ 30 bảng nghiệp vụ không có thêm dữ liệu từ migration (`employees`, `users`, `user_roles`, `departments`, `positions`, `contracts`, `attendance_logs`, `attendance_appeals`, `leave_types`, `leave_balances`, `leave_requests`, `ot_requests`, `payroll_periods` [12 cột gốc], `payslips`, `projects`, `tasks`, `task_logs`, `squads`, `squad_members`, `squad_messages`, `audit_logs`, `notifications`, `notification_reads`, `company_notices`, `handbook_docs`, `medical_claims`, `performance_reviews`, `pip_plans`, `refresh_tokens`, `roles`) có **số dòng và SHA-256 content hash của toàn bộ bản ghi không đổi 100%** sau migration.
   - Bảng `system_settings`: 14 khóa cấu hình sẵn có giữ nguyên 100% giá trị và SHA-256 hash (`e70c052ea0318553`), bổ sung đúng 4 khóa mới của migration `010` (`14 -> 18` dòng).
   - Các kỳ lương lịch sử trong `payroll_periods` có `policy_snapshot IS NULL` (`non_null_snapshots = 0`), không bị tự ý gán chính sách giả.
7. **Kiểm thử chức năng (Functional Smoke) trên bản sao đã nâng cấp**:
   - `settingsService.getSettings()` & `listPolicyVersions()` hoạt động đúng (`policyVersionsCount = 1`).
   - `settingsService.getSettingsForPeriod('2019-05')` chặn đúng với mã lỗi `POLICY_VERSION_NOT_FOUND` (422).
   - `workingDays('2026-04-30', '2026-05-04', holidays)` trừ đúng ngày nghỉ lễ 30/4–1/5 và cuối tuần (`= 1` ngày làm việc).
   - `payrollService.calculate(..., '2029-11')` tính lương thành công trên bản sao và lưu `policy_snapshot` kèm `source_fingerprint`.
8. **Xác nhận `nexus_hrms` gốc hoàn toàn không bị tác động** (vẫn ở trạng thái `DEPLOYMENT_PENDING`, 31/31 SHA-256 content hashes giữ nguyên) và dọn dẹp DB tạm `nexus_hrms_rehearsal_test`.

### Lệnh chạy lại diễn tập bất kỳ lúc nào:
```powershell
npm run db:rehearse-r16 --prefix Backend
```
Bằng chứng log nguyên văn: `docs/remediation/evidence/r16-migration-rehearsal.log`.

---

## 3. Quy trình Triển khai Thật trên `nexus_hrms` (Dành cho Người vận hành khi nghiệm thu)

Khi được phép nâng cấp DB ứng dụng `nexus_hrms`:

### Bước 1: Tạo bản sao lưu vật lý trước khi nâng cấp
```powershell
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
& "C:\Users\tavin\pgsql\bin\pg_dump.exe" -h localhost -p 5432 -U postgres -d nexus_hrms --no-owner --no-acl -f "backups/nexus_hrms_pre_r16_$timestamp.sql"
Get-FileHash "backups/nexus_hrms_pre_r16_$timestamp.sql" -Algorithm SHA256
```

### Bước 2: Chạy Forward Migration (`010` & `011`)
```powershell
npm run db:migrate --prefix Backend
```

### Bước 3: Kiểm tra Preflight & Schema Validator sau nâng cấp
```powershell
npm run db:preflight --prefix Backend
npm run db:test --prefix Backend
```
Cả hai lệnh phải trả về exit code `0` và `"status": "READY"`, `"appliedMigrationsCount": 11`.

---

## 4. Quy trình Phục hồi (Rollback) nếu có sự cố

Trong trường hợp cần khôi phục `nexus_hrms` về đúng trạng thái trước khi chạy Bước 2:
```powershell
& "C:\Users\tavin\pgsql\bin\psql.exe" -h localhost -p 5432 -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'nexus_hrms' AND pid <> pg_backend_pid();"
& "C:\Users\tavin\pgsql\bin\psql.exe" -h localhost -p 5432 -U postgres -d postgres -c "DROP DATABASE nexus_hrms;"
& "C:\Users\tavin\pgsql\bin\psql.exe" -h localhost -p 5432 -U postgres -d postgres -c "CREATE DATABASE nexus_hrms;"
& "C:\Users\tavin\pgsql\bin\psql.exe" -h localhost -p 5432 -U postgres -d nexus_hrms -v ON_ERROR_STOP=1 -f "backups/nexus_hrms_pre_r16_<timestamp>.sql"
```
