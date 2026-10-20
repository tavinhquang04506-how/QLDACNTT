# NEXUS HRMS — Báo cáo Môi trường & Kết quả Baseline (`G0`)

> **Thời điểm thực hiện**: 2026-10-20 22:00 – 22:12 (UTC+7)
> **Workspace**: `C:\Users\tavin\Downloads\QLDACNTT`
> **Nhánh cơ sở**: `develop` (`0be5426b832d5cb2360cabd7a9916978126c6d72`)
> **Nhánh thực thi G0**: `feature/remediation-g0-baseline`

---

## 1. Kiểm tra Git, Worktree & Nguyên nhân Lỗi Trước đây

### 1.1. Kết quả kiểm tra tại `C:\Users\tavin\Downloads\QLDACNTT`
- `git rev-parse --is-inside-work-tree` -> `true`
- `git rev-parse --show-toplevel` -> `C:/Users/tavin/Downloads/QLDACNTT`
- `git status --short --branch` -> `## develop` (working tree hoàn toàn sạch, không có thay đổi dở dang bị bỏ sót).
- `git branch -a`:
  - `develop` (`0be5426 docs(team): add team roster roles and Gitflow protocol specification`)
  - `master` (`9881d18`)
  - `remotes/origin/develop` (`0be5426`)
  - `remotes/origin/master` (`9881d18`)
- `git worktree list` -> `C:/Users/tavin/Downloads/QLDACNTT  0be5426 [develop]`

### 1.2. Giải thích nguyên nhân lỗi `"fatal: this operation must be run in a work tree"` khi rà soát trước đây
- Trong phiên rà soát độc lập trước đó, câu lệnh được chạy từ thư mục cha `C:\Users\tavin\Downloads\DoAnChuyenNghanh` với tham số `git --git-dir=C:\Users\tavin\Downloads\QLDACNTT\.git status` mà **không truyền kèm `--work-tree=C:\Users\tavin\Downloads\QLDACNTT`** (hoặc không dùng `git -C C:\Users\tavin\Downloads\QLDACNTT status`).
- Khi chỉ định `--git-dir` đơn lẻ từ bên ngoài thư mục dự án, Git coi thao tác như đang chạy không có working tree trừ khi có `--work-tree`. Khi làm việc trực tiếp trong `C:\Users\tavin\Downloads\QLDACNTT` (hoặc dùng `git -C`), Git hoạt động bình thường 100%, không cần sửa đổi `.git/config`.

---

## 2. Môi trường Cơ sở Dữ liệu & Bảo toàn Dữ liệu Hiện hữu

### 2.1. Dịch vụ PostgreSQL cục bộ
- **Phiên bản**: `PostgreSQL 16.15, compiled by Visual C++ build 1944, 64-bit` (`C:\Users\tavin\pgsql\bin\postgres.exe -D C:\Users\tavin\pgsql\data`, cổng `5432`).
- **Danh sách Database**:
  1. `nexus_hrms`: Database phát triển/demo hiện hữu — **được bảo vệ nghiêm ngặt**.
  2. `nexus_hrms_test`: Database kiểm thử tự động độc lập — được dùng riêng bởi `Backend/tests/helpers/testDb.js` (`process.env.TEST_DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/nexus_hrms_test'`).

### 2.2. Sao lưu & Đối chiếu Toàn vẹn Dữ liệu `nexus_hrms`
- **File sao lưu tạo tại G0**:
  `C:\Users\tavin\.gemini\antigravity\brain\a817b46a-9763-4f19-8af4-eae901680504\scratch\nexus_hrms_backup_g0.sql` (`361,607` bytes, tạo bằng `pg_dump.exe --clean --if-exists`).
- **Số lượng bản ghi trên `nexus_hrms` trước và sau khi chạy toàn bộ lệnh kiểm tra G0 (khớp 100%)**:

| Bảng (`nexus_hrms`) | Số bản ghi trước G0 | Số bản ghi sau G0 | Trạng thái |
|---|---:|---:|---|
| `employees` | 50 | 50 | Nguyên vẹn 100% |
| `users` | 50 | 50 | Nguyên vẹn 100% |
| `user_roles` | 50 | 50 | Nguyên vẹn 100% |
| `roles` | 6 | 6 | Nguyên vẹn 100% |
| `departments` | 5 | 5 | Nguyên vẹn 100% |
| `positions` | 8 | 8 | Nguyên vẹn 100% |
| `contracts` | 50 | 50 | Nguyên vẹn 100% |
| `leave_types` | 6 | 6 | Nguyên vẹn 100% |
| `leave_balances` | 50 | 50 | Nguyên vẹn 100% |
| `leave_requests` | 8 | 8 | Nguyên vẹn 100% |
| `attendance_logs` | 99 | 99 | Nguyên vẹn 100% |
| `attendance_appeals` | 0 | 0 | Nguyên vẹn 100% |
| `payroll_periods` | 2 | 2 | Nguyên vẹn 100% |
| `payslips` | 100 | 100 | Nguyên vẹn 100% |
| `projects` | 4 | 4 | Nguyên vẹn 100% |
| `tasks` | 8 | 8 | Nguyên vẹn 100% |
| `company_notices` | 4 | 4 | Nguyên vẹn 100% |
| `notifications` | 54 | 54 | Nguyên vẹn 100% |
| `notification_reads` | 4 | 4 | Nguyên vẹn 100% |
| `audit_logs` | 112 | 112 | Nguyên vẹn 100% |
| `refresh_tokens` | 44 | 44 | Nguyên vẹn 100% |
| `schema_migrations` | 1 (`007_pip_workflow.sql`) | 1 (`007_pip_workflow.sql`) | Nguyên vẹn 100% |

### 2.3. Phát hiện lệch Schema/Migration giữa `nexus_hrms` và `nexus_hrms_test` (`F28`)
- Trên `nexus_hrms`, bảng `company_notices` có cột `attachments jsonb DEFAULT '[]'::jsonb`, và có bảng `attendance_appeals` (do `appealService.js` tự tạo bằng `ensureAppealsTable()`).
- Ngược lại, `database/schema.sql` và `Backend/migrations/001..007.sql` **không có** cột `company_notices.attachments` và không có bảng `attendance_appeals`. Khi `resetTestDb()` dựng lại `nexus_hrms_test` từ `schema.sql` + `migrations/`, việc thiếu cột `company_notices.attachments` làm gãy 9 test tích hợp của module `notices`.

---

## 3. Chi tiết Lệnh & Kết quả Baseline (`PASS` / `FAIL` / `BLOCKED`)

### 3.1. Kiểm tra kết nối và 20 bảng cốt lõi (`npm run db:test`)
- **Trạng thái**: **PASS** (Exit code `0`)
- **Lệnh**:
  ```powershell
  npm run db:test
  ```
- **Output chính**:
  ```text
  [1] Đang thử kết nối tới PostgreSQL Server...
  ✅ KẾT NỐI THÀNH CÔNG! (Thời gian phản hồi: 43ms)
     - Phiên bản Server : PostgreSQL 16.15, compiled by Visual C++ build 1944, 64-bit
     - Database hiện tại: nexus_hrms
     - User kết nối     : postgres
     - Host / Port      : 127.0.0.1:5432
  [2] Đang kiểm tra cấu trúc 20 bảng dữ liệu cốt lõi (Core Schema)...
     - Tổng số bảng tìm thấy trong schema 'public': 33 bảng (31 BASE TABLE, 2 VIEW)
  ✅ HOÀN HẢO: Đầy đủ 20/20 bảng cốt lõi khớp 100% với thiết kế!
  ```

### 3.2. Kiểm thử Unit Backend (`npm run test:unit --prefix Backend`)
- **Trạng thái**: **PASS** (Exit code `0`)
- **Lệnh**:
  ```powershell
  npm run test:unit --prefix Backend
  ```
- **Output chính**:
  ```text
  ℹ tests 116
  ℹ suites 33
  ℹ pass 116
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 30520.9949
  ```

### 3.3. Kiểm thử Unit Frontend (`npm test --prefix FrontEnd`)
- **Trạng thái**: **PASS** (Exit code `0`)
- **Lệnh**:
  ```powershell
  npm test --prefix FrontEnd
  ```
- **Output chính**:
  ```text
  RUN  v4.0.18 C:/Users/tavin/Downloads/QLDACNTT/FrontEnd
  Test Files  13 passed (13)
       Tests  49 passed (49)
    Duration  316ms
  ```

### 3.4. Kiểm tra Build Production Frontend (`npm run build --prefix FrontEnd`)
- **Trạng thái**: **PASS** (Exit code `0`)
- **Lệnh**:
  ```powershell
  npm run build --prefix FrontEnd
  ```
- **Output chính**:
  ```text
  vite v5.4.21 building for production...
  ✓ 2147 modules transformed.
  dist/index.html                     0.86 kB │ gzip:   0.49 kB
  dist/assets/index-CDn2c9hX.css     65.38 kB │ gzip:  10.50 kB
  dist/assets/index-BqIW6ZEb.js   1,141.05 kB │ gzip: 285.56 kB
  (!) Some chunks are larger than 500 kB after minification.
  ✓ built in 5.92s
  ```

### 3.5. Kiểm thử Tích hợp & API Backend trên `nexus_hrms_test` (`npm test --prefix Backend`)
- **Trạng thái**: **FAIL** (Exit code `1` — `435` PASS / **`15` FAIL** trên tổng số `450` tests)
- **Lệnh**:
  ```powershell
  npm test --prefix Backend
  ```
- **Output tổng hợp**:
  ```text
  ℹ tests 450
  ℹ suites 95
  ℹ pass 435
  ℹ fail 15
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 96527.6761
  ```
- **Danh sách đầy đủ 15 test bị FAIL và nguyên nhân gốc rễ**:
  1. `tests/api/dashboard.test.js:17` — `company view (CEO/HR): live counts that match the database`
     - Lỗi: `AssertionError [ERR_ASSERTION]: 1 !== 2` tại dòng 29 (`assert.equal(o.pending_leaves, 2)`).
     - Nguyên nhân (`F30`): `Backend/src/modules/dashboard/service.js:34-37` chỉ đếm đơn phép có `stage = 'CHO_HR_PHE_CHUAN'` khi người gọi là `HR_DIRECTOR`, bỏ sót đơn đang ở bước `CHO_TRUONG_PHONG_DUYET`.
  2. `tests/api/employees-lifecycle.test.js:38` — `offboard: terminates the employee and leaves no working session` (`400 !== 200`).
  3. `tests/api/employees-lifecycle.test.js:59` — `offboard: is audited with the actor, also by the DB trigger` (`0 !== 1`).
  4. `tests/api/employees-lifecycle.test.js:70` — `offboard: already terminated 409, unknown 404, self 400` (`400 !== 200`).
  5. `tests/api/review-fixes.test.js:27` — `offboarding cuts access immediately, not when the token expires` (`200 !== 401`).
     - Nguyên nhân của (2), (3), (4), (5) (`F32`): `createTestEmployee` (`Backend/tests/helpers/employees.js:10`) tạo nhân viên với `joined_date = CURRENT_DATE` (`2026-10-20`), trong khi các test gửi `terminationDate: '2026-09-30'`. Hàm `Backend/src/modules/employees/lifecycle.js:23` kiểm tra `terminationDate < joined_date` nên trả về `400 Bad Request`.
  6. `tests/api/notices.test.js:22` — `GET /api/notices returns seeded notices + unreadCount for authenticated user`
  7. `tests/api/notices.test.js:37` — `POST /api/notices: employee is forbidden, HR/CEO allowed`
  8. `tests/api/notices.test.js:46` — `POST /api/notices: creates notice, fans out notifications to active employees, writes audit`
  9. `tests/api/notices.test.js:64` — `POST /api/notices/:id/ack marks the matching notification read and returns read state`
  10. `tests/api/notices.test.js:79` — `POST /api/notices/:id/ack returns 404 for nonexistent notice`
  11. `tests/api/notices.test.js:98` — `DELETE /api/notices/:id removes the notice and writes audit (HR/CEO only)`
  12. `tests/api/notices.test.js:107` — `GET /api/notices supports search filter`
  13. `tests/api/notices.test.js:125` — `POST /api/notices validates title/content lengths`
  14. `tests/api/notices_upgrade.test.js:7` — `Upgrade: Notices support attachments, unpin, and comments`
      - Nguyên nhân của (6)–(14) (`F28`): `error: column "attachments" of relation "company_notices" does not exist` (`SQLSTATE 42703`) tại `Backend/src/modules/notices/service.js:64` do cột `attachments` chưa được đưa vào `database/schema.sql` hay `Backend/migrations/`.
  15. `tests/api/squads.test.js:129` — `chat: only members post; members, HR and CEO read; outsiders neither`
      - Lỗi: `AssertionError [ERR_ASSERTION]: 201 !== 403` tại dòng 143.
      - Nguyên nhân (`F31`): `Backend/src/modules/squads/service.js:31` gộp `HR_ROLES` vào hàm `isMember`, dẫn đến `HR_DIRECTOR` không phải thành viên squad vẫn gửi được tin nhắn (`201 Created` thay vì `403 Forbidden`).

### 3.6. Kiểm tra Smoke API (`npm run test:smoke`)
- **Trạng thái**: **PASS** (Exit code `0`)
- **Lệnh**: Khởi chạy tạm `node Backend/server.js` trên cổng `8000`, chạy `npm run test:smoke`, sau đó dừng tiến trình server và xóa bản ghi `refresh_tokens` phát sinh của lần login smoke.
- **Output chính**:
  ```text
  ==============================================================
    KIỂM TRA API SMOKE TEST — NEXUS HRMS BACKEND (PORT 8000)
  ==============================================================
  ✅ [1/5] GET /api/health: 200 OK — Status: ok
  ✅ [2/5] GET /api (Root Index): 200 OK — Đã cấu hình 20 nhóm Endpoints
  ✅ [3/5] POST /api/auth/login: Đăng nhập thành công với hrd@fwbnexus.vn (Role: HR_DIRECTOR)
  ✅ [4/5] GET /api/auth/me: Xác thực JWT Token hợp lệ — User ID: NV-1001
  ✅ [5/5] GET /api/employees: Truy vấn danh sách nhân viên thành công — Trả về 50 hồ sơ nhân sự
  🎉 KẾT QUẢ: TOÀN BỘ 5/5 BƯỚC SMOKE TEST API ĐỀU THÀNH CÔNG 100%!
  ```
