# NEXUS HRMS — Báo Cáo Nghiệm Thu & Khắc Phục Sau Rà Soát (`FINAL_VERIFICATION.md`)

> **Ngày cập nhật**: 2026-10-21  
> **Phạm vi**: Khắc phục toàn diện 8 phát hiện rà soát độc lập **`R01–R08`** theo `06-REVIEW-G1-G5-VA-PROMPT-SUA-TIEP.md` trên nền `develop` (`b5f6aad`), bổ sung kiểm thử hồi quy và script E2E trình duyệt tái lập được.  
> **Trạng thái nghiệm thu trung thực**:  
> - **Các cổng chất lượng kỹ thuật (Unit, Integration, DB, Build, Reproducible Browser E2E)**: **100% PASS (`EXIT_CODE=0`)**.  
> - **8 điểm rà soát `R01–R08`**: Đã tái hiện lỗi trước khi sửa (`r00-reproduction-before-fix.log`) và xác minh PASS sau khi sửa (`r01..r03.log`).  
> - **32 mã vấn đề (`F01–F32`)**: **24 / 32 `VERIFIED`**, **6 / 32 `PARTIAL (CODE_FIXED_PENDING_POLICY_CONFIRMATION)`** (`F03`, `F06`, `F09`, `F13`, `F17`, `F26`), **2 / 32 `PARTIAL / BLOCKED (NO_LIVE_GEMINI_API_KEY_CONFIGURED)`** (`F22`, `F25`).

---

## 1. Lịch sử Nhánh & Commit theo Chuẩn Gitflow (`--no-ff`)

| Giai đoạn / Nhóm Commit | Nhánh Feature / Bugfix | Commit Hash | Merge Commit (`develop`) | Nội dung chính |
|---|---|---|---|---|
| **G0 (Baseline & Rà soát)** | `feature/remediation-g0-baseline`<br>`bugfix/remediation-g0-correction` | `a3a64ac`<br>`98be0fa`, `b307cc2` | `b6f0e5c` | Khảo sát source thực tế, lưu raw log baseline `01..07.log`, đính chính tài liệu theo `04` và `05`. |
| **G1 (Auth, Scope & Integrity)** | `feature/remediation-g1-auth-scope-integrity` | `752f879` | `8426f04` | Sửa `F01–F05`, `F08`, `F10`, `F11`, `F21`, `F28–F32`; thêm `Backend/migrations/008_reconcile_notices_and_appeals.sql` và `Backend/tests/api/g1-remediation.test.js`. |
| **G2 (Real Data & Settings UI)** | `feature/remediation-g2-real-data-ui` | `65e812e` | `54d3319` | Sửa `F11–F20`; thêm `Backend/migrations/009_system_settings_and_policies.sql`, module `/api/settings`, PII redaction, loại bỏ fallback số mẫu và false-success trên UI. |
| **G3 (Attendance, Leave & Payroll)** | `feature/remediation-g3-business-logic` | `09c1e98` | `e7edada` | Sửa `F06–F09`, `F12`, `F17`, `F18`; Haversine GPS thật từ `system_settings`, Kiosk TOTP/QR. |
| **G4 (Grounded Gemini Copilot)** | `feature/remediation-g4-gemini-grounded` | `a2e8828` | `326b0ea` | Sửa `F22–F26`; triển khai `geminiProvider.js`, 6 read-only tools có kiểm quyền RBAC/scope (`tools.js`), lọc prompt injection và bộ 32 test đánh giá (`g4-ai-copilot-eval.test.js`). |
| **G5 (Initial Verification)** | `feature/remediation-g5-final-verification` | `82b270b`, `183a00f` | `b5f6aad` | Kiểm thử đối chiếu liên tầng ban đầu và cập nhật tài liệu G5. |
| **R01–R08 Commit 1 (Attendance & Leave)** | `bugfix/remediation-r01-r08-review-fixes` | `ebe0be5` | *(Merge `--no-ff` cùng nhánh)* | **R01 & R04**: Thêm `Backend/migrations/010_payroll_policy_snapshot_and_holidays.sql`, bắt buộc method/GPS/TOTP khi `checkIn`/`checkOut`, và tính `totalDays` nghỉ phép trên server trừ cuối tuần + `public_holidays`. |
| **R01–R08 Commit 2 (Payroll, Settings & OT)** | `bugfix/remediation-r01-r08-review-fixes` | `a2fe0dd` | *(Merge `--no-ff` cùng nhánh)* | **R02, R03, R05, R06**: Xóa `fallbackWorkDays` khi `total_logs === 0`, chặn `lock()` với `NO_ATTENDANCE` (`409 ANOMALIES_PENDING`), đồng bộ `allowances = 0` khi `0` công trong `computePayslip`/`updatePayslip`, nối `system_settings` + `policy_snapshot` vào Payroll/OT, và bỏ `try/catch` nuốt lỗi DB trong `settings/service.js`. |
| **R01–R08 Commit 3 (Portal, E2E & Tests)** | `bugfix/remediation-r01-r08-review-fixes` | `f56410b` | *(Merge `--no-ff` cùng nhánh)* | **R07 & R08**: Chuẩn hóa `normalizeLeaveBalance`, `buildPortalSalaryView`, `formatPortalWorkHours` trong `dataAdapters.js`, bổ sung `Backend/scripts/e2e-browser-verify.js` (`npm run test:e2e --prefix Backend`) và `Backend/tests/api/r01-r08-review-fixes.test.js`. |

---

## 2. Đối Chiếu Expected vs Actual Từng Điểm Rà Soát (`R01–R08`)

Bằng chứng tái hiện lỗi trước khi sửa được lưu nguyên văn tại `docs/remediation/evidence/r00-reproduction-before-fix.log` (chạy trên commit `b5f6aad`). Bằng chứng sau khi sửa được lưu tại `docs/remediation/evidence/r01-reproduction-after-fix.log`, `r02-backend-full.log`, `r02-frontend-unit.log`, và `r03-browser-e2e.log`.

| Mã | Mô tả Kịch bản Kiểm chứng | Kết quả Thực tế Trước khi Sửa (`b5f6aad` — `r00-reproduction-before-fix.log`) | Kết quả Kỳ vọng & Thực tế Sau khi Sửa (`ebe0be5`, `a2fe0dd`, `f56410b` — `r01..r03.log`) |
|---|---|---|---|
| **R01 (`F06`)** | 1. `POST /api/attendance/check-in` với body `{}` hoặc `{ method: 'manual' }`.<br>2. `{ method: 'gps' }` không có `gpsLat`/`gpsLng`.<br>3. `{ method: 'code', code: '123456' }` (sai TOTP).<br>4. `{ method: 'code_gps' }` với tọa độ văn phòng + mã TOTP thật từ `getCurrentKioskCode().code`. | - `{}` trả **`201 Created`** (`method` mặc định `'manual'`, bỏ qua hoàn toàn GPS và TOTP). | - `{}` hoặc `{ method: 'manual' }` hoặc `{ method: 'qr' }` $\rightarrow$ **`400 BAD_REQUEST`**.<br>- `{ method: 'gps' }` thiếu tọa độ $\rightarrow$ **`400 BAD_REQUEST`**.<br>- `{ method: 'code', code: '123456' }` sai TOTP $\rightarrow$ **`400 BAD_REQUEST`**.<br>- `{ method: 'code_gps' }` đủ tọa độ trong bán kính + đúng TOTP 6 số hiện hành $\rightarrow$ **`201 Created`** (check-in) & **`200 OK`** (check-out). |
| **R02 (`F09`)** | Nhân viên `DANG_LAM_VIEC` có `0` bản ghi `attendance_logs` và `0` ngày nghỉ phép có lương trong kỳ lương `2031-05`; chạy `POST /api/payroll/calculate` và `POST /api/payroll/periods/:id/lock` với `{}`. | - `calculate()` rơi vào `fallbackWorkDays` gán **`actual_work_days = 22`**, **`net_salary = 20.665.000đ`**.<br>- `NO_ATTENDANCE` có `severity: 'Trung bình', category: 'data'` nên `lock()` trả **`200 OK`**. | - `calculate()` giữ nguyên **`actual_work_days = 0`**, **`allowances = 0`**, **`gross_income = 0`**, **`net_salary = 0`**.<br>- `getAnomalies()` trả về `code: 'NO_ATTENDANCE'`, `severity: 'Cao'`, `category: 'violation'`.<br>- `lock()` không truyền `acknowledgeAnomalies: true` bị chặn **`409 ANOMALIES_PENDING`**; chỉ khóa sổ (`200 OK`) khi truyền `{ acknowledgeAnomalies: true }`. |
| **R03 (`F09`, `F18`)** | Nhân viên có `actual_work_days = 0` (toàn bộ ngày là `VANG_KHONG_PHEP`), sau đó gọi `PUT /api/payroll/payslips/:id` chỉ cập nhật `{ note: 'Ghi chú kiểm tra' }`. Đồng thời kiểm tra chạy song song `updatePayslip` và `lock`. | - `calculate()` lưu `allowances = 1.500.000` dù `gross_income = 0, net_salary = 0`.<br>- Sau `updatePayslip({ note })`, `gross_income` nhảy từ **`0` lên `1.500.000`** và `bhxh` nhảy từ **`0` lên `2.310.000`**! | - `calculate()` lưu **`allowances = 0, gross_income = 0, bhxh = 0, net_salary = 0`**.<br>- Sau `updatePayslip({ note })`, mọi chỉ số tiền tệ giữ nguyên **`0`** (`allowances = 0, gross_income = 0, bhxh = 0, net_salary = 0`).<br>- `updatePayslip` khóa `payroll_periods FOR UPDATE` trước `payslips FOR UPDATE`, đảm bảo tuần tự hóa an toàn khi chạy đồng thời với `lock()`. |
| **R04 (`F17`)** | 1. `POST /api/leaves` xin nghỉ từ Thứ Sáu `2026-11-06` đến Thứ Hai `2026-11-09` kèm `totalDays: 4` giả mạo.<br>2. Xin nghỉ cùng khoảng ngày không truyền `totalDays`.<br>3. Xin nghỉ qua kỳ lễ Quốc khánh `2026-09-01 .. 2026-09-03` (02/09 nằm trong `public_holidays`). | - Server tin `totalDays: 4` từ client (vì `4 <= calendarSpan`), lưu **`total_days = 4`** (tính cả Thứ Bảy, Chủ Nhật) và không trừ ngày lễ trong DB. | - Gửi `totalDays: 4` lệch với số ngày làm việc thực tế $\rightarrow$ bị chặn **`400 TOTAL_DAYS_MISMATCH`**.<br>- Không gửi `totalDays` qua cuối tuần (`06/11 .. 09/11`) $\rightarrow$ server tự tính **`total_days = 2`**.<br>- Nghỉ từ `01/09/2026` đến `03/09/2026` $\rightarrow$ server tự trừ lễ `02/09/2026`, lưu **`total_days = 2`**. |
| **R05 (`F12`, `F13`, `F26`)** | 1. Đổi `personal_income_tax_deduction` từ `11.000.000` lên `15.500.000` qua `PUT /api/settings`, chạy `POST /api/payroll/calculate`.<br>2. Chốt kỳ lương, đổi tiếp `personal_income_tax_deduction` sang `20.000.000`, kiểm tra `policy_snapshot` của kỳ đã chốt.<br>3. Đổi `max_ot_per_month` xuống `2` giờ và gửi đơn OT `4` giờ qua `POST /api/ot-requests`. | - `payroll/tax.js` dùng hằng số cứng `SELF_DEDUCTION = 11_000_000` nên thuế TNCN **không đổi** (`632.500đ` ở cả 2 lần).<br>- `ot/service.js` dùng cứng `MONTHLY_CAP = 40`. | - Khi đổi mức giảm trừ bản thân lên `15.500.000đ`, thuế TNCN trên phiếu lương giảm tương ứng và kỳ lương lưu `policy_snapshot.personal_income_tax_deduction = 15500000`.<br>- Sau khi kỳ lương `DA_CHOT`, mọi thay đổi cấu hình mới không làm ảnh hưởng kỳ cũ.<br>- Khi `max_ot_per_month = 2`, đơn OT `4` giờ bị chặn **`400 OT_MONTHLY_CAP`** (`maxHours: 2`). |
| **R06 (`F11`, `F13`)** | Giả lập lỗi kết nối/truy vấn PostgreSQL khi gọi `settingsService.getSettings()`. | - Khối `try/catch` nuốt lỗi DB và trả về `DEFAULT_SETTINGS` như thể đọc DB thành công (`200 OK`). | - `settingsService.getSettings()` ném nguyên vẹn lỗi DB (`DB_CONNECTION_LOST`) để tầng HTTP trả đúng **`500 Internal Server Error`**, tuyệt đối không trả cấu hình mặc định giả. |
| **R07 (`F14`, `F16`, `F18`)** | Kiểm tra các hàm adapter dùng cho `EmployeePortalPage.jsx` và `PayslipPdfModal.jsx` với:<br>- `leaveBalances = []` hoặc lỗi API vs `remaining_days = 0` vs `'8.5'`<br>- `allowances = '1500000.00'`, `ot_pay = '500000.00'`<br>- `bhxh = '1760000.00'`, `bhyt = '330000.00'`, `bhtn = '220000.00'`<br>- Đã `check_in_time` nhưng chưa `check_out_time`. | - `leaveBalances = []` hiển thị **`12` ngày** (`?? 12`).<br>- Cộng chuỗi `'1500000.00500000.00'`.<br>- Dòng `BHXH (10.5%)` chỉ hiển thị `1.760.000đ` (8%).<br>- Chưa check-out hiển thị cứng `'8.0 giờ'`. | - `normalizeLeaveBalance([], { hasError: true })` trả **`null`** (`--`); `remaining_days: 0` trả **`0`**.<br>- `buildPortalSalaryView` trả `allowancesAndOt = 2000000` (`Number`), `totalInsurance = 2310000` (đủ `10.5%` = `8% + 1.5% + 1%`).<br>- `formatPortalWorkHours` trả `'Đang làm việc'` khi chưa check-out (`FrontEnd/tests/dataAdapters.test.js` `57/57 PASS`). |
| **R08 (`F27`)** | Chạy lệnh tái lập `npm run test:e2e --prefix Backend` (`Backend/scripts/e2e-browser-verify.js`) trên `nexus_hrms_test` với Headless Chrome. | - Chưa có script E2E trong repo; log cũ chưa kiểm tra đủ 5 nhóm assertion nghiệp vụ. | - **`5 / 5 PASS` (`EXIT_CODE=0`)** trong `docs/remediation/evidence/r03-browser-e2e.log`:<br>  1. **Save + F5 Reload**: Lưu `gps_radius_meters = 345` trên UI, reload trình duyệt, xác nhận UI và DB đều giữ `345`.<br>  2. **Scope Isolation**: 2 `EMPLOYEE` cùng role (`NV-0842` `8.5` ngày phép vs `NV-1003` `9.5` ngày phép) và 2 `LINE_MANAGER` khác phòng (`DEPT-IT` `40` NV vs `DEPT-ACC` `2` NV).<br>  3. **API Error `403` & `500`**: Chặn false-success khi `/api/settings` trả `500` và khi `EMPLOYEE` gọi `PUT /api/settings` (`403`).<br>  4. **Pagination `>50` Records**: Seed `55` nhân viên, kiểm tra `Tổng 55 nhân sự (Trang 1/3)` và lật sang Trang 3.<br>  5. **Export CSV Reconciliation**: Đối chiếu tổng Net (`54.051.000đ`), nhân sự `0` công (`NV-1005` `net_salary = 0`) và nội dung CSV lệnh chi ngân hàng. |

---

## 3. Tổng Hợp Kết Quả Cổng Chất Lượng & Đường Dẫn Raw Logs

Toàn bộ raw logs cũ (`01..07.log`, `g1..g5*.log`) được giữ nguyên vẹn. Các raw logs mới của đợt khắc phục `R01–R08` được ghi nhận kèm thời điểm và exit code tại `docs/remediation/evidence/`:

| Cổng Chất lượng | Lệnh Thực thi | Kết quả | Đường dẫn Raw Log |
|---|---|---|---|
| **1. Tái hiện lỗi trước khi sửa (`b5f6aad`)** | Script tái hiện `R01–R06` trên code trước sửa | Xác nhận tái hiện đúng lỗi `R01–R06` (`EXIT_CODE=0`) | `docs/remediation/evidence/r00-reproduction-before-fix.log` |
| **2. Kiểm thử hồi quy `R01–R08` sau sửa** | `node --require ./tests/helpers/env.js --test tests/api/r01-r08-review-fixes.test.js` | **`6 / 6 PASS`** (`EXIT_CODE=0`) | `docs/remediation/evidence/r01-reproduction-after-fix.log` |
| **3. Backend Unit Tests** | `npm run test:unit --prefix Backend` | **`130 / 130 PASS`** (`EXIT_CODE=0`) | `docs/remediation/evidence/r02-backend-unit.log` |
| **4. Backend Full Suite (API + DB + AI Eval + R01–R08)** | `npm test --prefix Backend` | **`512 / 512 PASS`** (`EXIT_CODE=0`) | `docs/remediation/evidence/r02-backend-full.log` |
| **5. Database Schema & Trigger Suite** | `npm run db:test` | **`20 / 20 PASS`** (`EXIT_CODE=0`) | `docs/remediation/evidence/r02-db-test.log` |
| **6. Frontend Unit Tests (Adapters & Portal)** | `npm test --prefix FrontEnd` | **`57 / 57 PASS`** (`EXIT_CODE=0`) | `docs/remediation/evidence/r02-frontend-unit.log` |
| **7. Frontend Production Build** | `npm run build --prefix FrontEnd` | **`PASS` (`2009 modules`)** (`EXIT_CODE=0`) | `docs/remediation/evidence/r02-frontend-build.log` |
| **8. Reproducible Headless Chrome E2E** | `npm run test:e2e --prefix Backend` | **`5 / 5 PASS`** (`EXIT_CODE=0`) | `docs/remediation/evidence/r03-browser-e2e.log` |
| **9. Primary DB Preservation (`nexus_hrms`)** | Đối chiếu số dòng toàn bộ 32 bảng trên `nexus_hrms` | **`PASS`** (`EXIT_CODE=0`, bảo toàn 100%) | `docs/remediation/evidence/r04-db-preservation.log` |

---

## 4. Bằng Chứng Bảo Toàn Cơ Sở Dữ Liệu Gốc (`nexus_hrms`)

Theo `docs/remediation/evidence/r04-db-preservation.log` (`2026-10-21T03:48:00.688Z`, `EXIT_CODE=0`), toàn bộ 32 bảng trên DB `nexus_hrms` giữ nguyên 100% số lượng bản ghi như sau:
- `employees`: `50`, `users`: `50`, `user_roles`: `50`, `contracts`: `50`, `leave_balances`: `50`
- `departments`: `5`, `positions`: `8`, `roles`: `6`, `leave_types`: `6`
- `attendance_logs`: `99`, `attendance_appeals`: `0`, `leave_requests`: `8`, `ot_requests`: `0`, `medical_claims`: `0`
- `payroll_periods`: `2`, `payslips`: `100`
- `projects`: `4`, `tasks`: `8`, `task_logs`: `0`, `squads`: `0`, `squad_members`: `0`, `squad_messages`: `0`
- `company_notices`: `4`, `handbook_docs`: `5`, `notifications`: `54`, `notification_reads`: `4`
- `performance_reviews`: `0`, `pip_plans`: `0`
- `audit_logs`: `106`, `refresh_tokens`: `44`, `system_settings`: `14`, `schema_migrations`: `9`

---

## 5. Tổng Hợp Các Điểm Giới Hạn & Chờ Xác Nhận Nghiệp Vụ (`PARTIAL` / `BLOCKED`)

1. **Chờ xác nhận chính sách nghiệp vụ từ Stakeholder (`6 / 32` mã `PARTIAL — CODE_FIXED_PENDING_POLICY_CONFIRMATION`)**:
   - **`F03` (Duyệt giải trình chấm công)**: Đã khóa RBAC/scope và chặn tự duyệt (`403`); chờ BA/PO xác nhận giữ quy trình duyệt 1 cấp hay cần nâng lên 2 cấp (`LINE_MANAGER -> HR_DIRECTOR`).
   - **`F06` / `R01` (Phương thức tự chấm công văn phòng)**: Đã chặn `manual`/`qr`/`kiosk`/`face_id` trên endpoint tự chấm công và bắt buộc GPS/TOTP theo `method`; chờ xác nhận có giữ phương thức `code` (chỉ mã TOTP 6 số không kèm GPS cho máy tính để bàn) hay bắt buộc `code_gps`.
   - **`F09` / `R02` (Nhân viên `0` log chấm công trong kỳ lương)**: Đã xóa `fallbackWorkDays` (trả `0` công, `0` lương) và chặn `lock()` bằng cảnh báo `NO_ATTENDANCE` mức `Cao` (`409 ANOMALIES_PENDING` trừ khi `acknowledgeAnomalies: true`); chờ HR/Payroll xác nhận quy trình vận hành chuẩn đối với nhân sự thiếu hoàn toàn dữ liệu chấm công.
   - **`F13` / `R05` (Ngày hiệu lực cấu hình Thuế TNCN mới)**: Đã kết nối `system_settings` và lưu `policy_snapshot` đóng băng theo từng kỳ lương; chờ Tài chính/Pháp chế xác nhận thời điểm chính thức chuyển mức giảm trừ gia cảnh từ `11.000.000đ / 4.400.000đ` sang `15.500.000đ / 6.200.000đ`.
   - **`F17` / `R04` (Lịch nghỉ lễ công ty)**: Đã tính `totalDays` trên server trừ T7, CN và bảng `public_holidays` (seed lịch lễ luật định Việt Nam `2025–2028`); chờ HR bổ sung lịch nghỉ riêng/nghỉ bù đặc thù của doanh nghiệp nếu có.
   - **`F26` (Trọng số dự báo rủi ro nghỉ việc)**: Đã che `PAY_GAP` với `LINE_MANAGER` và gắn `disclaimer`; chờ xác nhận quản trị nội bộ về bộ trọng số đánh giá.
2. **Chờ cấu hình khóa `GEMINI_API_KEY` thật (`2 / 32` mã `PARTIAL / BLOCKED — NO_LIVE_GEMINI_API_KEY_CONFIGURED`: `F22`, `F25`)**:
   - Môi trường kiểm thử không cấu hình `GEMINI_API_KEY` thật trong `Backend/.env` để tuân thủ quy định bảo mật và không tự phát sinh chi phí. Khi chưa có key, `/api/ai/copilot` trả `503 AI_NOT_CONFIGURED` và UI hiển thị thông báo lỗi trung thực, không sinh câu trả lời giả.
