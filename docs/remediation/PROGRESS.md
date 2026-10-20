# NEXUS HRMS — Tiến độ Khắc phục Toàn diện (Remediation Progress)

> **Cập nhật lần cuối**: 2026-10-20 22:12 (UTC+7)
> **Nhánh thực thi G0**: `feature/remediation-g0-baseline` (tách từ `develop` @ `0be5426`)
> **Tài liệu tham chiếu**:
> - `01-KE-HOACH-VA-KET-QUA-RA-SOAT.md`
> - `02-THIET-KE-GEMINI.md`
> - `03-PROMPT-AGY-VA-NGHIEM-THU.md`
> - `AGENTS.md` & `GIT_WORKFLOW_RULES.md`

---

## 1. Bảng trạng thái các Giai đoạn (Stage Gate Tracker)

| Giai đoạn | Tên giai đoạn | Trạng thái | Nhánh Gitflow | Tiến độ chính | Quality Gate / Ghi chú |
|---|---|---|---|---|---|
| **G0** | Môi trường, kiểm kê nguồn dữ liệu & Baseline | **DONE (Chờ duyệt Checkpoint G0)** | `feature/remediation-g0-baseline` | Đã kiểm tra Git/worktree, sao lưu `nexus_hrms`, kiểm tra tách biệt `nexus_hrms_test`, đối chiếu toàn bộ `F01–F27` + phát hiện thêm `F28–F32`, lập `DATA_SOURCE_MATRIX.md`, `ISSUES.md`, `BASELINE.md`. | `db:test`: **PASS** \| `Backend test:unit`: **PASS** (116/116) \| `FrontEnd test`: **PASS** (49/49) \| `FrontEnd build`: **PASS** \| `Backend test` (trên `nexus_hrms_test`): **FAIL** (435 pass / 15 fail) \| `test:smoke`: **PASS** (5/5). |
| **G1** | Bảo mật, phân quyền, toàn vẹn giao dịch & chống báo thành công giả | **PENDING** | `feature/remediation-g1-auth-scope` (dự kiến) | Xử lý `F01`, `F02`, `F03`, `F04`, `F05`, `F08`, `F10`, `F11` (luồng ghi trọng yếu), `F21`, `F28`, `F29`, `F31`. | Chờ phê duyệt kết quả G0 và chốt các quyết định nghiệp vụ trước khi thực hiện. |
| **G2** | Loại bỏ dữ liệu giả, đồng bộ UI – API – DB | **PENDING** | `feature/remediation-g2-data-truth` (dự kiến) | Xử lý `F11` (các modal còn lại), `F12`, `F13`, `F14`, `F15`, `F16`, `F17`, `F18`, `F19`, `F20`, `F30`. | Chờ hoàn thành G1. |
| **G3** | Sửa logic nghiệp vụ cốt lõi (Chấm công, Nghỉ phép, Lương) | **PENDING** | `feature/remediation-g3-business-logic` (dự kiến) | Xử lý `F06`, `F07`, `F09`, `F12`, `F17`, `F18` (phần engine lương/công/phép). | Chờ hoàn thành G2 và xác nhận quy tắc nghiệp vụ. |
| **G4** | Thiết kế lại và tích hợp Gemini đúng kiến trúc | **PENDING** | `feature/remediation-g4-gemini-copilot` (dự kiến) | Xử lý `F22`, `F23`, `F24`, `F25`, `F26`, `F27` theo `02-THIET-KE-GEMINI.md`. | Chờ hoàn thành G3. Không lộ API key ở frontend/log/git. |
| **G5** | Kiểm thử toàn diện, đối chiếu chéo & nghiệm thu | **PENDING** | `feature/remediation-g5-verification` (dự kiến) | Xử lý `F27`, `F32`, chạy full gate trên `nexus_hrms_test`, kiểm thử trình duyệt theo ma trận vai trò và lập `FINAL_VERIFICATION.md`. | Chờ hoàn thành G4. |

---

## 2. Tổng hợp Kết quả Baseline tại G0

| Hạng mục kiểm tra | Lệnh thực thi | Kết quả | Chi tiết tóm tắt |
|---|---|---|---|
| **Git & Worktree** | `git status --short --branch` / `git rev-parse --is-inside-work-tree` | **PASS** | Working tree sạch tại `C:\Users\tavin\Downloads\QLDACNTT`, nhánh gốc `develop` (`0be5426`). Nguyên nhân lỗi `"must be run in a work tree"` khi rà soát trước đây là do chạy `git --git-dir=...\QLDACNTT\.git status` từ thư mục cha `DoAnChuyenNghanh` mà thiếu `--work-tree` hoặc `git -C`. |
| **DB Connectivity & Core Schema** | `npm run db:test` | **PASS** | Kết nối PostgreSQL 16.15 (`127.0.0.1:5432`, DB `nexus_hrms`) trong `43ms`; khớp `20/20` bảng cốt lõi (`100%`), tổng cộng `31` base tables + `2` views. |
| **Backend Unit Tests** | `npm run test:unit --prefix Backend` | **PASS** | `116/116` tests pass (`0` fail) trong `30,520.99ms`. Lưu ý: unit test `aiCopilot.test.js` đang khóa cứng hành vi lỗi (`11.000.000` giảm trừ cũ và tin `leaveBalance` từ client — `F27`). |
| **Frontend Unit Tests** | `npm test --prefix FrontEnd` | **PASS** | `13/13` test files, `49/49` tests pass (`0` fail) trong `316.05ms`. Lưu ý: `attendanceCalculations.test.js` chỉ test hàm viết lại trong file test (`F27`). |
| **Frontend Production Build** | `npm run build --prefix FrontEnd` | **PASS** | Vite `v5.4.21` build thành công `2,147` modules trong `5.92s`. Cảnh báo bundle `dist/assets/index-BqIW6ZEb.js` đạt `1,141.05 kB` (gzip `285.56 kB` > `500 kB`). |
| **Backend Integration / API Suite (Isolated Test DB)** | `npm test --prefix Backend` | **FAIL** | Chạy trên DB độc lập `nexus_hrms_test`: tổng `450` tests, `435` pass, **`15` fail** (`96.5s`). Nguyên nhân 15 test lỗi: (1) `F28`: thiếu cột `company_notices.attachments` trong `database/schema.sql` & `Backend/migrations/` làm gãy 9 test notices; (2) `F30`: `dashboard/service.js` chỉ đếm đơn phép `CHO_HR_PHE_CHUAN` cho `HR_DIRECTOR` làm gãy 1 test dashboard; (3) `F31`: `squads/service.js` cho phép `HR_DIRECTOR` gửi tin nhắn vào squad không phải thành viên làm gãy 1 test squads; (4) `F32`: `createTestEmployee` dùng `joined_date = CURRENT_DATE` (`2026-10-20`) trong khi 4 test offboard truyền cứng `terminationDate: '2026-09-30'`. |
| **API Smoke Test** | `npm run test:smoke` | **PASS** | `5/5` bước pass trên cổng `8000` (`/api/health`, `/api`, `/api/auth/login`, `/api/auth/me`, `/api/employees` trả đủ 50 nhân sự). |
| **Bảo toàn dữ liệu `nexus_hrms`** | Đối chiếu count toàn bộ 31 bảng trước & sau G0 + tạo bản sao lưu SQL | **PASS** | Bản sao lưu đầy đủ tại `C:\Users\tavin\.gemini\antigravity\brain\a817b46a-9763-4f19-8af4-eae901680504\scratch\nexus_hrms_backup_g0.sql` (`361,607` bytes). Số dòng trên `nexus_hrms` trước và sau khi chạy seluruh test suite giữ nguyên 100% (`employees: 50`, `users: 50`, `leave_requests: 8`, `attendance_logs: 99`, `payslips: 100`, `audit_logs: 112`, `refresh_tokens: 44`). |

---

## 3. Quy tắc Bắt buộc Xuyên suốt Dự án

1. **Không sửa trực tiếp trên `master` hoặc `develop`**: Mọi thay đổi bắt buộc tạo nhánh `feature/*` hoặc `bugfix/*` từ `develop` và merge lại bằng `git merge --no-ff`.
2. **Bảo toàn dữ liệu hiện hữu**: Tuyệt đối không chạy `node database/reset-seed-50.js` hoặc `npm test --prefix Backend` trỏ vào `nexus_hrms`. Mọi integration test có `resetTestDb()` chỉ được phép chạy trên `nexus_hrms_test`.
3. **Không dùng dữ liệu giả hay nuốt lỗi**: Không trả về `{ status: 'APPROVED' }` giả khi không tìm thấy bản ghi, không cập nhật UI thành công trong `catch`, không dùng `|| 12`, `|| 22`, `|| 25000000`, `|| base_salary` làm sai lệch giá trị `0` hoặc `null`.
4. **Dừng tại mỗi Checkpoint**: Hoàn thành từng giai đoạn G0 -> G1 -> G2 -> G3 -> G4 -> G5 phải dừng để bàn giao kết quả kiểm tra độc lập.
