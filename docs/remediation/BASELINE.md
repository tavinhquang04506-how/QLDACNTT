# BASELINE REPORT — GIAI ĐOẠN G0 (ĐÃ ĐÍNH CHÍNH THEO RÀ SOÁT ĐỘC LẬP)

**Ngày cập nhật:** 2026-10-20  
**Mục đích:** Ghi nhận nguyên trạng môi trường Git, Database, Unit Test, API/Integration Test, Frontend Test, Build và Smoke Test trước khi thực hiện sửa đổi mã nguồn sản phẩm (G1–G5). Mọi trích dẫn dưới đây đối chiếu trực tiếp từ raw stdout/stderr lưu tại `docs/remediation/evidence/`.

---

## 1. Trạng thái Git & Worktree (`VERIFIED`)

### 1.1. Kiểm tra môi trường Git
- Trong phiên làm việc hiện tại tại `C:\Users\tavin\Downloads\QLDACNTT`, các lệnh Git (`git status`, `git branch -a`, `git log`, `git worktree list`) chạy bình thường với `EXIT_CODE=0`.
- Về ghi nhận lỗi `error:renaming ... Permission denied` ở môi trường rà soát trước đó: chỉ xác nhận được sự khác biệt về quyền truy cập giữa môi trường chạy ngoài sandbox và trong sandbox hạn chế quyền ghi `.git`; **chưa đủ bằng chứng** để kết luận nguyên nhân do tiến trình nền của hệ điều hành hay IDE watcher.
- Worktree hiện tại:
  ```text
  C:/Users/tavin/Downloads/QLDACNTT  (nhánh làm việc Gitflow hiện hành)
  ```
- Các thay đổi của thành viên khác trên `develop` được giữ nguyên hoàn toàn (không chạy `git reset`, `git clean`, `git checkout --`).

---

## 2. Trạng thái Database & Đối chiếu bản sao lưu G0 (`VERIFIED`)

### 2.1. Hai cơ sở dữ liệu tách biệt
- **DB chính (dev/demo hiện hữu):** `nexus_hrms` trên PostgreSQL 16.15 (`127.0.0.1:5432`).
- **DB kiểm thử độc lập:** `nexus_hrms_test` — được tạo lại tự động bởi `Backend/scripts/test-setup.js` (kiểm tra ràng buộc tên DB bắt buộc kết thúc bằng `_test` tại `Backend/scripts/test-setup.js:11-15` và `Backend/src/config/env.js:43-45`).

### 2.2. Đối chiếu thực tế giữa `nexus_hrms` hiện tại và bản backup G0 (`docs/remediation/evidence/07-backup-restore-diff.log`)
- File backup G0: `C:\Users\tavin\.gemini\antigravity\brain\a817b46a-9763-4f19-8af4-eae901680504\scratch\nexus_hrms_backup_g0.sql` (giữ nguyên trạng, chỉ đọc).
- Phương pháp kiểm chứng an toàn: Restore bản backup G0 vào database tạm cách ly hoàn toàn `nexus_hrms_verify_tmp`, chạy script đối chiếu toàn bộ **31 bảng** (row counts + MD5 checksum trên `row_to_json(t)::text`) và **21 sequences** (`last_value`, `is_called`), sau đó xóa `nexus_hrms_verify_tmp`. Không ghi đè lên `nexus_hrms` và không in PII/secret ra log.
- **Kết quả kiểm chứng thực tế (`VERIFIED`):**
  1. **Row counts:** Cả **31/31 bảng** trong `nexus_hrms` giữ nguyên số dòng khớp với bản backup (`employees`: 50, `users`: 50, `user_roles`: 50, `contracts`: 50, `departments`: 5, `positions`: 8, `roles`: 6, `attendance_logs`: 99, `attendance_appeals`: 0, `leave_balances`: 50, `leave_requests`: 8, `leave_types`: 6, `payroll_periods`: 2, `payslips`: 100, `projects`: 4, `tasks`: 8, `task_logs`: 0, `squads`: 0, `squad_members`: 0, `squad_messages`: 0, `company_notices`: 4, `notifications`: 54, `notification_reads`: 4, `audit_logs`: 112, `refresh_tokens`: 44, `ot_requests`: 0, `medical_claims`: 0, `performance_reviews`: 0, `pip_plans`: 0, `handbook_docs`: 0, `schema_migrations`: 1).
  2. **Giá trị dữ liệu (Row-hash checksum):** **30/31 bảng** khớp 100% checksum với bản backup G0.
  3. **Điểm khác biệt duy nhất (1 bảng / 1 dòng):** Bảng `users` có 1 dòng (`id = e7a9d5f6-ebeb-425e-968b-d35ec0743129`, `role_code = HR_DIRECTOR`) thay đổi giá trị ở 2 cột timestamp do lần chạy `npm run test:smoke` đầu tiên chạm vào `nexus_hrms` trước khi cô lập sang `nexus_hrms_test`:
     - `last_login_at`: `"2026-10-19T06:29:59.682Z"` (backup) $\rightarrow$ `"2026-10-20T15:09:36.236Z"` (hiện tại)
     - `updated_at`: `"2026-10-19T06:29:59.682Z"` (backup) $\rightarrow$ `"2026-10-20T15:09:36.236Z"` (hiện tại)
     - Các cột khác của dòng này (`failed_login_attempts`, `locked_until`, `password_hash`, `is_active`, `role_code`) giữ nguyên.
  4. **Trạng thái Sequences:** Cả **21/21 sequences** trong schema `public` giữ nguyên `last_value` và `is_called` khớp 100% với bản backup G0 (bảng `refresh_tokens` dùng khóa chính `UUID DEFAULT gen_random_uuid()`, không sử dụng sequence).

---

## 3. Kết quả thực thi các lệnh Baseline (`VERIFIED`)

Toàn bộ raw stdout/stderr và mã thoát (`[EXIT_CODE=...]`) được lưu nguyên văn tại thư mục `docs/remediation/evidence/`:

| STT | Hạng mục | Lệnh thực thi | File raw log | Exit Code | Kết quả tóm tắt |
|---|---|---|---|---|---|
| 1 | DB Connectivity Test | `npm run db:test` | `docs/remediation/evidence/01-db-test.log` | `0` | **PASS** — Kết nối PostgreSQL 16.15, liệt kê 31 bảng |
| 2 | Backend Unit Tests | `npm run test:unit --prefix Backend` | `docs/remediation/evidence/02-backend-test-unit.log` | `0` | **PASS** — Node test runner: `tests 116, suites 0, pass 116, fail 0` |
| 3 | Frontend Unit Tests | `npm test --prefix FrontEnd` | `docs/remediation/evidence/03-frontend-test.log` | `0` | **PASS** — Node test runner (`node --test "tests/**/*.test.js"`): `tests 49, suites 13, pass 49, fail 0` |
| 4 | Frontend Production Build | `npm run build --prefix FrontEnd` | `docs/remediation/evidence/04-frontend-build.log` | `0` | **PASS** — Vite v5.4.21: `2008 modules transformed` |
| 5 | Backend Full Test Suite | `npm test --prefix Backend` | `docs/remediation/evidence/05-backend-test-full.log` | `1` | **FAIL (Baseline)** — `tests 450, suites 0, pass 435, fail 15` trên `nexus_hrms_test` |
| 6 | API Smoke Test (Isolated) | `npm run test:smoke` (`DB_NAME=nexus_hrms_test`, `PORT=8099`) | `docs/remediation/evidence/06-smoke-test-isolated.log` | `0` | **PASS** — `5/5 bước vượt qua thành công` trên `nexus_hrms_test` |
| 7 | Isolated Backup Diff | `node scratch/verify_backup_diff.js` | `docs/remediation/evidence/07-backup-restore-diff.log` | `0` | **PASS** — 30/31 bảng & 21/21 sequences khớp 100%; 1 dòng `users` lệch `last_login_at`, `updated_at` |

---

### 3.1. Trích dẫn nguyên văn 01-db-test.log (npm run db:test)
```text
> nexus-hrms-monorepo@1.0.0 db:test
> npm run db:test --prefix Backend


> nexus-hrms-backend@1.0.0 db:test
> node scripts/test-db.js

╔════════════════════════════════════════════════════════════╗
║   🐘 NEXUS HRMS — PostgreSQL Connection & Schema Test      ║
╚════════════════════════════════════════════════════════════╝
📡 Host:      127.0.0.1:5432
📦 Database:  nexus_hrms
👤 User:      postgres
────────────────────────────────────────────────────────────
✅ [OK] Kết nối PostgreSQL thành công (27ms)

ℹ️  DB Version:   PostgreSQL 16.15, compiled by Visual C++ build 1944, 64-bit
ℹ️  Server Time:  Tue Oct 20 2026 22:49:08 GMT+0700 (Giờ Đông Dương)

📊 Tìm thấy tổng cộng: 31 base tables và 2 views trong public schema.
📖 Đã load danh sách 20 bảng chuẩn từ: C:\Users\tavin\Downloads\QLDACNTT\database\schema.sql

📋 Chi tiết 20 bảng chuẩn trong database/schema.sql:
   1. [✓ OK]    roles
   2. [✓ OK]    departments
   3. [✓ OK]    positions
   4. [✓ OK]    employees
   5. [✓ OK]    users
   6. [✓ OK]    user_roles
   7. [✓ OK]    attendance_logs
   8. [✓ OK]    leave_types
   9. [✓ OK]    leave_requests
  10. [✓ OK]    leave_balances
  11. [✓ OK]    payroll_periods
  12. [✓ OK]    payslips
  13. [✓ OK]    projects
  14. [✓ OK]    tasks
  15. [✓ OK]    task_logs
  16. [✓ OK]    squads
  17. [✓ OK]    squad_members
  18. [✓ OK]    squad_messages
  19. [✓ OK]    audit_logs
  20. [✓ OK]    notifications

👁️  Views hỗ trợ: v_employee_public, v_today_attendance

────────────────────────────────────────────────────────────
📈 Kết quả: 20/20 bảng chuẩn đã sẵn sàng (100%)
🎉 TRẠNG THÁI: TẤT CẢ 20 BẢNG CHUẨN ĐỀU ĐÃ ĐỒNG BỘ VÀ KHỚP 100%!
────────────────────────────────────────────────────────────
[EXIT_CODE=0]
```

### 3.2. Trích dẫn nguyên văn phần tổng kết `02-backend-test-unit.log` (`npm run test:unit --prefix Backend`)
```text
ℹ tests 116
ℹ suites 0
ℹ pass 116
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 978.9025

[EXIT_CODE=0]
```

### 3.3. Trích dẫn nguyên văn phần tổng kết `03-frontend-test.log` (`npm test --prefix FrontEnd`)
> **Đính chính:** `FrontEnd/package.json:10` sử dụng Node built-in test runner (`node --test "tests/**/*.test.js"`), **không phải Vitest**.
```text
> nexus-hrms-frontend@2.0.0 test
> node --test "tests/**/*.test.js"
...
ℹ tests 49
ℹ suites 13
ℹ pass 49
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 366.8548

[EXIT_CODE=0]
```

### 3.4. Trích dẫn nguyên văn `04-frontend-build.log` (`npm run build --prefix FrontEnd`)
```text
> nexus-hrms-frontend@2.0.0 build
> vite build

vite v5.4.21 building for production...
transforming...
✓ 2008 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.72 kB │ gzip:   0.45 kB
dist/assets/index-L2i9bKY3.css   91.99 kB │ gzip:  14.70 kB
dist/assets/index-BqIW6ZEb.js  1,141.05 kB │ gzip: 300.62 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 3.74s

[EXIT_CODE=0]
```

### 3.5. Trích dẫn nguyên văn phần tổng kết `05-backend-test-full.log` (`npm test --prefix Backend`)
Lệnh `npm test --prefix Backend` thực thi `node scripts/test-setup.js && node --require ./tests/helpers/env.js --test --test-concurrency=1 "tests/**/*.test.js"` trên DB `nexus_hrms_test`:
```text
ℹ tests 450
ℹ suites 0
ℹ pass 435
ℹ fail 15
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 106436.4797
```

**Danh sách 15 test cases đang FAIL trong baseline (`05-backend-test-full.log:661-883`):**
1. **Nhóm Notice Schema Mismatch (`F28` — 9 tests FAIL):**
   - `tests/api/notices.test.js` (8 tests: dòng 22, 37, 46, 64, 79, 98, 107, 125) và `tests/api/notices_upgrade.test.js` (1 test: dòng 7).
   - Nguyên nhân: `Backend/src/modules/notices/service.js:11,63` truy vấn cột `n.attachments` và bảng `notice_reads`, nhưng `database/schema.sql:332-343` và `Backend/database/migrations/001..007` chưa có migration tạo cột `attachments` trong `company_notices` (`error: column "attachments" of relation "company_notices" does not exist`, mã lỗi PostgreSQL `42703`).
2. **Nhóm Dashboard Pending Leaves (`F30` — 1 test FAIL):**
   - `tests/api/dashboard.test.js:17` (`company view (CEO/HR): live counts that match the database`: `AssertionError: 1 !== 2` tại dòng 29).
   - Nguyên nhân: Trong `Backend/src/modules/dashboard/service.js:34-37,65,89-93`, khi `user.roleCode === 'HR_DIRECTOR'`, biến `leaveWhere` chỉ lọc `WHERE lr.stage = 'CHO_HR_PHE_CHUAN' AND lr.employee_id <> $1 AND NOT (e.job_title LIKE '%Trưởng%' OR e.job_title LIKE '%Giám Đốc%')` và dùng chung `leaveWhere` cho cả chỉ số tổng quan `overview.pending_leaves` (dòng 65) lẫn danh sách hàng đợi `pendingLeaves` (dòng 92). Trong khi đó `tests/api/dashboard.test.js:29` kiểm tra `o.pending_leaves` phải bằng tổng số đơn đang chờ duyệt toàn công ty (`stage IN ('CHO_TRUONG_PHONG_DUYET', 'CHO_HR_PHE_CHUAN')` = 2).
3. **Nhóm Squad Chat Non-Member Posting (`F31` — 1 test FAIL):**
   - `tests/api/squads.test.js:129` (`chat: only members post; members, HR and CEO read; outsiders neither`: `AssertionError: 201 !== 403` tại dòng 143).
   - Nguyên nhân: `Backend/src/modules/projects/squads.js:158` gọi `await assertMemberOrHr(id, user)` cho `postMessage`, mà `Backend/src/modules/projects/access.js:1,24-27` định nghĩa `HR_ROLES = ['CEO', 'HR_DIRECTOR']` và cho phép `HR_ROLES` đi qua `assertMemberOrHr` ngay cả khi không phải thành viên squad.
4. **Nhóm Employee Lifecycle Offboard Date & Fixture (`F32` — 4 tests FAIL):**
   - `tests/api/employees-lifecycle.test.js` (3 tests: dòng 38, 59, 70) và `tests/api/review-fixes.test.js` (1 test: dòng 27 `offboarding cuts access immediately, not when the token expires`).
   - Nguyên nhân: `Backend/tests/helpers/employees.js:15` mặc định `joinedDate = new Date().toISOString().slice(0, 10)` (`2026-10-20`), nhưng `employees-lifecycle.test.js:41,61,72` và `review-fixes.test.js:31` gọi `POST /api/employees/:id/offboard` với `terminationDate: '2026-09-30'`. Do `Backend/src/modules/employees/lifecycle.js:23` kiểm tra `if (terminationDate < joined) throw badRequest('Termination date cannot precede joined_date')`, lệnh offboard trả về HTTP `400` (trong `review-fixes.test.js:31` không assert status của lệnh offboard nên nhân viên chưa bị offboard và `GET /api/auth/me` ở dòng 32 vẫn trả `200` thay vì `401`).

### 3.6. Trích dẫn nguyên văn `06-smoke-test-isolated.log` (`npm run test:smoke` trên `nexus_hrms_test`, `PORT=8099`)
```text
> nexus-hrms-monorepo@1.0.0 test:smoke
> npm run test:smoke --prefix Backend


> nexus-hrms-backend@1.0.0 test:smoke
> node scripts/smoke-test.js

╔════════════════════════════════════════════════════════════╗
║   🧪 NEXUS HRMS — Backend API Endpoint Smoke Test          ║
╚════════════════════════════════════════════════════════════╝
🎯 API Base URL: http://localhost:8099
────────────────────────────────────────────────────────────

[PASS] Bước 1: GET /api/health → HTTP 200 OK
       Trạng thái: OK | Database: nexus_hrms_test | Server: NEXUS HR Backend API | Uptime: 2s
[PASS] Bước 2: GET /api → HTTP 200 OK
       API Catalog: NEXUS HR Management System API (v1.4.0)
       Nhóm endpoints (20): auth, users, employees, contracts, departments, positions, attendance, leaves, otRequests, medicalClaims, payroll, projects, tasks, squads, notifications, notices, handbook, analytics, dashboard, auditLogs
[PASS] Bước 3: POST /api/auth/login → HTTP 200 OK
       Tài khoản: hrd@fwbnexus.vn (Tài khoản HR Director (hrd@fwbnexus.vn))
       Đăng nhập thành công: Trần Mai Hương (Vai trò: HR_DIRECTOR)
       JWT Token: <REDACTED_JWT>... (Đã nhận token xác thực)
[PASS] Bước 4: GET /api/auth/me → HTTP 200 OK
       Thông tin cá nhân: Trần Mai Hương (Email: hrd@fwbnexus.vn)
       Phòng ban: Nhân sự và Vận hành | Vị trí: Giám Đốc Khối
[PASS] Bước 5: GET /api/employees → HTTP 200 OK
       Danh sách nhân viên: 14 nhân sự trong cơ sở dữ liệu

────────────────────────────────────────────────────────────
📊 TỔNG KẾT SMOKE TEST: 5/5 bước vượt qua thành công!
🎉 TẤT CẢ ENDPOINTS SMOKE TEST ĐỀU HOẠT ĐỘNG HOÀN HẢO!
────────────────────────────────────────────────────────────

[EXIT_CODE=0]
```
