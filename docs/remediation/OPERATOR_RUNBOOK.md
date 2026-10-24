# OPERATOR DEPLOYMENT & MIGRATION RUNBOOK (`nexus_hrms`)

Hướng dẫn vận hành chuẩn dành cho Kỹ sư Triển khai (Operator / DevOps / DBA) khi nâng cấp cơ sở dữ liệu ứng dụng **`nexus_hrms`** từ trạng thái `DEPLOYMENT_PENDING` (`32` bảng, migration `001..009`) lên `READY` (`34` bảng, bổ sung migration `010` và `011`), đồng thời sao lưu/khôi phục đồng bộ **Cơ sở dữ liệu PostgreSQL + Kho lưu trữ tệp đính kèm thông báo (`notice_attachments`)** và kiểm chứng tính bền vững của Docker Volume qua thao tác **recreate container**.

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

## 2. Quy Trình Sao Lưu Đồng Bộ (PostgreSQL + File Storage) & Áp Dụng Migration (`R44`)

### Bước 1: Tạo bản sao lưu đầy đủ (`pg_dump` + `notice_attachments` `.bin`/`.meta.json`)
Cơ sở dữ liệu `company_notices.attachments` lưu tham chiếu tới các tệp vật lý `.bin` và `.meta.json` tại `NOTICE_ATTACHMENTS_DIR` (`Backend/storage/notice_attachments` trên host hoặc volume `nexus-storage-data` gắn vào `/app/storage` trong Docker). **Bắt buộc sao lưu cả hai nguồn cùng thời điểm**:

```powershell
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path "docs/remediation/backups" | Out-Null

# 1A. Sao lưu PostgreSQL
& "C:\Users\tavin\pgsql\bin\pg_dump.exe" -h 127.0.0.1 -p 5432 -U postgres -Fc -f "docs/remediation/backups/nexus_hrms-pre-cutover-$timestamp.dump" nexus_hrms
& "C:\Users\tavin\pgsql\bin\pg_restore.exe" --list "docs/remediation/backups/nexus_hrms-pre-cutover-$timestamp.dump" | Select-Object -First 25

# 1B. Sao lưu kho tệp đính kèm thông báo (.bin + .meta.json) trên Host
if (Test-Path "Backend/storage/notice_attachments") {
  Compress-Archive -Path "Backend/storage/notice_attachments\*" -DestinationPath "docs/remediation/backups/notice_attachments-pre-cutover-$timestamp.zip" -Force
}

# 1C. (Nếu chạy Docker) Sao lưu persistent volume `nexus-storage-data`
# docker run --rm -v nexus-storage-data:/source:ro -v "${PWD}/docs/remediation/backups:/backup" alpine tar czf "/backup/nexus-storage-data-$timestamp.tar.gz" -C /source .
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

## 3. Quy Trình Khôi Phục Khẩn Cấp (Rollback Procedure — DB + File Storage)

Nếu phát hiện bất kỳ sự cố nào trong khung giờ bảo trì:
1. Dừng dịch vụ Backend để ngắt các giao dịch ghi mới.
2. Khôi phục cơ sở dữ liệu từ file `.dump` vừa tạo ở Bước 1A:
   ```powershell
   & "C:\Users\tavin\pgsql\bin\pg_restore.exe" -h 127.0.0.1 -p 5432 -U postgres --clean --if-exists -d nexus_hrms "docs/remediation/backups/nexus_hrms-pre-cutover-$timestamp.dump"
   ```
3. Khôi phục kho lưu trữ tệp đính kèm thông báo từ bản nén ở Bước 1B/1C:
   ```powershell
   if (Test-Path "docs/remediation/backups/notice_attachments-pre-cutover-$timestamp.zip") {
     New-Item -ItemType Directory -Force -Path "Backend/storage/notice_attachments" | Out-Null
     Expand-Archive -Path "docs/remediation/backups/notice_attachments-pre-cutover-$timestamp.zip" -DestinationPath "Backend/storage/notice_attachments" -Force
   }
   # (Nếu chạy Docker):
   # docker run --rm -v nexus-storage-data:/target -v "${PWD}/docs/remediation/backups:/backup:ro" alpine sh -c "rm -rf /target/* && tar xzf /backup/nexus-storage-data-$timestamp.tar.gz -C /target"
   ```
4. Chạy đối soát đồng bộ trạng thái file (`reconcileAttachmentStorage`) và kiểm tra baseline:
   ```powershell
   $env:DB_NAME='nexus_hrms'; npm run attachments:reconcile --prefix Backend
   node Backend/scripts/check-phase-a-baseline.js
   ```

---

## 4. Quy Trình Đối Soát Tệp Đính Kèm Định Kỳ / Sau Sự Cố (`R47` & `R48`)

Cơ chế `reconcileAttachmentStorage` sử dụng PostgreSQL (`company_notices.attachments`) làm nguồn sự thật duy nhất (Single Source of Truth) và đồng bộ khóa liên tiến trình (`pg_try_advisory_xact_lock`):
- **Tự động khi khởi động & định kỳ**: Khi `Backend/server.js` khởi động, hệ thống tự động chạy `reconcileAttachmentStorage(db)` một lần và kích hoạt tiến trình nền định kỳ (`startAttachmentReconciliationJob`, mặc định mỗi 15 phút).
- **Chạy thủ công qua CLI**:
  ```powershell
  $env:DB_NAME='nexus_hrms'; npm run attachments:reconcile --prefix Backend
  ```
- **Nguyên tắc an toàn (Fail-Closed & Cross-Process Advisory Lock — `R47`, `R48`)**:
  - Mọi thao tác gắn (`create`/`update`), thu dọn TTL (`cleanupExpiredOrphanAttachments`), đối soát (`reconcileAttachmentStorage`) và xóa tạm (`deleteAttachment`) đều mở giao dịch trên dedicated PostgreSQL client và lấy cùng khóa tư vấn `pg_try_advisory_xact_lock(hashtext('nexus_notice_att:' || id))` trước khi đọc tham chiếu DB hoặc xóa tệp.
  - Nếu một tiến trình khác đang giữ khóa để gắn tệp vào thông báo (chưa `COMMIT`), tiến trình dọn dẹp/CLI sẽ tự động bỏ qua (`skippedInFlight`) và `deleteAttachment` trả về `409 ATTACHMENT_CONCURRENT_CONFLICT` mà không xóa tệp.
  - Tệp ở trạng thái `staged` hoặc `deletion-pending` nhưng **đã được tham chiếu trong DB** sẽ **không bao giờ bị xóa** mà được tự động nâng cấp/khôi phục sang `bound`.
  - Nếu truy vấn PostgreSQL gặp lỗi hoặc mất kết nối, tiến trình đối soát/dọn dẹp sẽ **Fail-Closed** (giữ nguyên toàn bộ tệp trên đĩa, trả về `status: "FAIL_CLOSED_DB_ERROR"` và exit code `1`).

---

## 5. Quy Trình Kiểm Chứng Docker + Nginx Persistence Bằng Recreate Container Test (`Gate G2`)

Khi Docker Desktop daemon sẵn sàng trên máy vận hành, thực hiện kiểm chứng trên **stack test cô lập** (`-p nexus-test`, không tác động container đang chạy của người dùng):
1. Khởi tạo stack test riêng:
   ```powershell
   docker compose -p nexus-test up -d --build
   ```
2. Đăng nhập tài khoản `HR_DIRECTOR` qua cổng Nginx của stack test, tải lên tệp đính kèm gần `5MB` (`201 Created`, ghi nhận mã `NATT-*` và `sha256`), thử tải lên tệp `> 5MB` (`413 Payload Too Large`), và phát hành thông báo công ty gắn tệp `NATT-*`.
3. **Bắt buộc xóa và tạo mới lại (recreate) container `backend`** (lưu ý: chỉ dùng `docker compose restart backend` là chưa đủ vì `restart` giữ nguyên lớp filesystem của container cũ):
   ```powershell
   docker compose -p nexus-test up -d --force-recreate backend
   ```
4. Sau khi container `backend` mới khởi động xong, tải lại tệp đính kèm qua `GET /api/notices/:id/attachments/:attachmentId/download` từ tài khoản nhân viên thuộc phạm vi nhận (`200 OK` và khớp `SHA-256`) và ngoài phạm vi nhận (`403 Forbidden`).
5. Dọn dẹp stack test sau khi nghiệm thu:
   ```powershell
   docker compose -p nexus-test down -v
   ```
