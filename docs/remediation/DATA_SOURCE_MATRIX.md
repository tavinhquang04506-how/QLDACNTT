# NEXUS HRMS — BẢNG ÁNH XẠ NGUỒN DỮ LIỆU (`DATA_SOURCE_MATRIX.md`)

> **Cập nhật lần cuối**: 2026-10-21 (Cập nhật sau đợt sửa lỗi `R01–R08` theo `06-REVIEW-G1-G5-VA-PROMPT-SUA-TIEP.md`, commits `ebe0be5`, `a2fe0dd`, `f56410b`)  
> **Quy ước bắt buộc**:  
> - **AS-IS (Hiện trạng ban đầu tại G0 & phát hiện bổ sung `R01–R08`)**: Chỉ mô tả đúng đường dẫn file, route API, trường response, hàm service/SQL và hành vi thực tế trong `FrontEnd/src/` và `Backend/src/`.  
> - **TO-BE & Hiện trạng Sau Khắc phục**: Mô tả nguồn dữ liệu chuẩn hóa, phạm vi phân quyền (`Scope`), xử lý dữ liệu trống (`Empty`), xử lý lỗi (`Error`), cơ chế làm mới (`Invalidation`), bài kiểm thử (`Test`) và phân tách rõ **`VERIFIED`** vs **`PARTIAL (CODE_FIXED_PENDING_POLICY_CONFIRMATION)`** vs **`PARTIAL / BLOCKED (NO_LIVE_GEMINI_API_KEY_CONFIGURED)`**.

---

## 1. Xác thực, Danh tính & Phiên làm việc (`AuthContext` & `/api/auth`)

| Màn hình / Thành phần | Trường / Action | Component (Verified Path) | Hiện trạng AS-IS tại G0 | Giải pháp Đã Triển khai & Kiểm chứng (`G1–G5` + `R01–R08`) |
|---|---|---|---|---|
| **Global Auth & Header** | Đăng nhập, lấy hồ sơ phiên hiện tại | `FrontEnd/src/context/AuthContext.jsx`<br>`FrontEnd/src/pages/LoginPage.jsx` | - `AuthContext.jsx` định nghĩa cứng 5 persona mẫu (`CEO: 'NV-0001'`, `HR_DIRECTOR: 'NV-0002'`, `LINE_MANAGER: 'NV-1000'`, `EMPLOYEE: 'NV-0842'`, `KIOSK: 'KIOSK-01'`), thiếu `ROLES.ADMIN` (`F10`, `F29`). | - **Đã triển khai (`752f879`)**: Hydrate `user` từ `GET /api/auth/me` (`users` JOIN `employees`, `departments`, `positions`); `ROLE_META` đủ 6 vai trò chỉ giữ metadata hiển thị.<br>- **Kiểm chứng (`VERIFIED`)**: E2E trình duyệt `Backend/scripts/e2e-browser-verify.js` (`r03-browser-e2e.log`) kiểm tra 2 `EMPLOYEE` cùng role và 2 `LINE_MANAGER` khác phòng ban nhận đúng định danh và dữ liệu riêng. |
| **HTTP Client Interceptor** | Làm mới Access Token khi gặp `401` | `FrontEnd/src/services/api.js` | - Khi `isRefreshing === true` và `/api/auth/refresh` thất bại, hàng đợi `refreshSubscribers` không được reject làm treo vĩnh viễn các request song song (`F21`). | - **Đã triển khai (`752f879`)**: Hàng đợi `refreshSubscribers` lưu `{ resolve, reject }` và gọi `notifyRefreshSubscribers(err, null)` trong khối `catch`.<br>- **Kiểm chứng (`VERIFIED`)**: `Backend/tests/api/g1-remediation.test.js`. |

---

## 2. Bảng điều khiển & Báo cáo tổng hợp (`DashboardPage` & `PdfReportModal`)

| Màn hình / Thành phần | Trường / Action | Component (Verified Path) | Hiện trạng AS-IS tại G0 | Giải pháp Đã Triển khai & Kiểm chứng (`G1–G5` + `R01–R08`) |
|---|---|---|---|---|
| **Dashboard — KPI Cards & Overview** | Tổng nhân sự, Đi làm hôm nay, Đi muộn, Đơn chờ duyệt, Dự án/Task, Thâm niên TB | `FrontEnd/src/pages/DashboardPage.jsx`<br>`Backend/src/middleware/dashboardCache.js`<br>`Backend/src/modules/dashboard/service.js` | - `dashboardCache.js` dùng `req.user.id` (`undefined`) khiến 2 `LINE_MANAGER` khác phòng dùng chung cache key (`F01`).<br>- `dashboard/service.js` gộp tổng đơn chờ duyệt trong scope với queue được phép duyệt và fallback `\|\| 1.8` (`F30`).<br>- `DashboardPage.jsx` fallback số mẫu `348`, `50`, `98.2%` (`F14`). | - **Đã triển khai (`752f879`, `65e812e`)**: Key cache gồm `userId:employeeId:roleCode:scope:originalUrl`; tách `overview.pending_leaves` và `overview.actionable_pending_leaves`; xóa toàn bộ fallback số mẫu trên `DashboardPage.jsx`.<br>- **Kiểm chứng (`VERIFIED`)**: `Backend/tests/api/g1-remediation.test.js` (bật cache thật) và `Backend/tests/api/dashboard.test.js`. |
| **Dashboard — Modal Xuất Báo cáo PDF** | Tải báo cáo tổng hợp nhân sự / chấm công / quỹ lương | `FrontEnd/src/modals/dashboard/PdfReportModal.jsx` | - Gọi `/api/attendance/summary` không tồn tại và nhân cứng `totalEmp * 25000000` (`F14`). | - **Đã triển khai (`65e812e`)**: Lấy dữ liệu thật từ `/api/dashboard/stats` và `/api/payroll/periods`, giữ `0` khi chưa có kỳ lương.<br>- **Kiểm chứng (`VERIFIED`)**: `Backend/tests/api/g5-cross-layer-reconciliation.test.js`. |

---

## 3. Danh bạ Nhân sự, Hồ sơ 360, Phòng ban & Chức danh (`DirectoryPage` & Modals)

| Màn hình / Thành phần | Trường / Action | Component (Verified Path) | Hiện trạng AS-IS tại G0 | Giải pháp Đã Triển khai & Kiểm chứng (`G1–G5` + `R01–R08`) |
|---|---|---|---|---|
| **DirectoryPage** | Danh sách nhân sự, Tìm kiếm, Bộ lọc trạng thái & phòng ban, Phân trang | `FrontEnd/src/pages/DirectoryPage.jsx`<br>`FrontEnd/src/utils/dataAdapters.js` | - Chỉ lấy trang đầu 20 dòng và dùng `employees.length` làm tổng; lọc lệch enum `'active'` vs `'DANG_LAM_VIEC'`; điền CCCD/SĐT/STK mẫu (`F15`, `F20`). | - **Đã triển khai (`65e812e`)**: Đồng bộ enum tiếng Việt, truyền `page/limit/search/departmentId/status`, dùng `pagination.total` từ server.<br>- **Kiểm chứng (`VERIFIED`)**: E2E trình duyệt (`r03-browser-e2e.log`) seed `55` nhân viên (`>50` records), xác nhận hiển thị `Tổng 55 nhân sự (Trang 1/3)` và chuyển sang Trang 3 khớp dữ liệu DB. |
| **Profile360Modal** | Xem & Cập nhật hồ sơ chi tiết 360° | `FrontEnd/src/modals/directory/Profile360Modal.jsx`<br>`Backend/src/utils/redact.js` | - Điền lương, phép, CCCD, MST, BHXH mẫu khi thiếu trường (`F20`). | - **Đã triển khai (`65e812e`)**: Xóa toàn bộ dữ liệu mẫu (trả `null` / `'Chưa cập nhật'`), che CCCD/STK trong `redact.js` cho các role ngoài `CEO`/`HR_DIRECTOR`.<br>- **Kiểm chứng (`VERIFIED`)**: `FrontEnd/tests/dataAdapters.test.js`, `Backend/tests/api/g2-settings-profile.test.js`. |
| **Onboarding, Offboarding, Department & JobTitle Modals** | Thêm/thôi việc nhân sự, thêm/xóa phòng ban & chức danh | `OnboardingModal.jsx`, `OffboardingModal.jsx`, `DepartmentManageModal.jsx`, `JobTitleManageModal.jsx` | - Khối `catch` khi API lỗi vẫn bắn confetti, đóng modal và thêm bản ghi giả vào state (`F11`). | - **Đã triển khai (`752f879`, `65e812e`)**: Chỉ đóng modal và cập nhật danh sách khi API trả `2xx`; hiển thị lỗi thật khi thất bại.<br>- **Kiểm chứng (`VERIFIED`)**: `Backend/tests/api/employees-lifecycle.test.js`, `r03-browser-e2e.log`. |

---

## 4. Chấm công, Kiosk, Giải trình & Cổng Nhân viên (`AttendancePage`, `EmployeePortalPage` & Appeals)

| Màn hình / Thành phần | Trường / Action | Component (Verified Path) | Hiện trạng AS-IS tại G0 & Rà soát `R01`, `R07` | Giải pháp Đã Triển khai & Kiểm chứng (`G1–G5` + `R01–R08`) |
|---|---|---|---|---|
| **Chấm công Cá nhân & Kiosk** | Check-in / Check-out, lấy mã Kiosk, quét QR Kiosk | `Backend/src/modules/attendance/{schema,service,gpsValidator,kioskCode}.js`<br>`FrontEnd/src/pages/AttendancePage.jsx` | - G0: `gpsValidator.js` luôn trả `valid: true` (`F06`, `F07`).<br>- Rà soát `R01`: `checkInSchema` / `checkOutSchema` mặc định `method = 'manual'` và chỉ gọi `validateGpsLocation` khi có gửi tọa độ, khiến `POST /api/attendance/check-in` với `{}` hoặc `{ method: 'manual' }` vẫn thành công `201`. | - **Đã triển khai (`09c1e98`, `ebe0be5`)**:<br>  1. `SELF_PUNCH_METHODS = ['gps', 'code_gps', 'code']` (loại bỏ `manual`, `qr`, `kiosk`, `face_id` khỏi tự chấm công).<br>  2. Khi `method` là `'gps'` hoặc `'code_gps'`, bắt buộc có `gpsLat` + `gpsLng` hữu hạn và nằm trong bán kính Haversine của `system_settings`.<br>  3. Khi `method` là `'code'` hoặc `'code_gps'`, bắt buộc có `code` 6 chữ số khớp mã TOTP hiện hành (`getCurrentKioskCode().code`).<br>- **Trạng thái (`PARTIAL — CODE_FIXED_PENDING_POLICY_CONFIRMATION`)**: Code và test `r01-r08-review-fixes.test.js` PASS 100%; chờ xác nhận chính sách có giữ phương thức `code` không kèm GPS cho máy tính bàn hay không. |
| **Giải trình Chấm công (`AttendanceAppealModal`)** | Tạo, Xem danh sách, Duyệt / Từ chối giải trình | `Backend/src/modules/attendance/{routes,controller,appealService}.js`<br>`Backend/migrations/008_reconcile_notices_and_appeals.sql` | - Đọc sai `req.user.id`/`req.user.role`, cho phép giả `employee_id`, `LINE_MANAGER` duyệt ngoài phòng ban hoặc tự duyệt, chạy DDL khi import, fallback RAM, thiếu transaction (`F02–F05`). | - **Đã triển khai (`752f879`)**: Migration `008`, `requirePermission`, lọc/duyệt theo `req.scope`, chặn tự duyệt (`403`), bọc `db.withTransaction` (`attendance_appeals` + `attendance_logs` + `audit_logs`).<br>- **Trạng thái**: `F02`, `F04`, `F05` **`VERIFIED`**; `F03` **`PARTIAL (CODE_FIXED_PENDING_POLICY_CONFIRMATION)`** chờ BA/PO xác nhận giữ duyệt 1 cấp hay 2 cấp. |
| **EmployeePortalPage** | Số dư phép, Phiếu lương tóm tắt, Giờ làm việc hôm nay | `FrontEnd/src/pages/EmployeePortalPage.jsx`<br>`FrontEnd/src/utils/dataAdapters.js` | - Rà soát `R07`: Dùng `leaveBalances?.[0]?.remaining_days ?? 12` (biến lỗi API/mảng rỗng thành `12`), cộng chuỗi `allowances + ot_pay`, chỉ lấy `bhxh` (8%) cho nhãn `BHXH (10.5%)`, hiển thị cứng `'8.0 giờ'` khi mới check-in. | - **Đã triển khai (`f56410b`)**: Bổ sung `normalizeLeaveBalance` (trả `null` khi thiếu dữ liệu/lỗi, giữ `0` khi bằng `0`), `buildPortalSalaryView` (cộng số học `Number(allowances) + Number(ot_pay)`, cộng đủ `bhxh + bhyt + bhtn` = 10.5%), và `formatPortalWorkHours` (trả `'Đang làm việc'` khi chưa check-out).<br>- **Kiểm chứng (`VERIFIED`)**: `FrontEnd/tests/dataAdapters.test.js` (`57/57 PASS`). |

---

## 5. Nghỉ phép & Tăng ca (`LeaveManagementPage`, `CreateLeaveRequestModal` & `/api/ot-requests`)

| Màn hình / Thành phần | Trường / Action | Component (Verified Path) | Hiện trạng AS-IS tại G0 & Rà soát `R04`, `R05` | Giải pháp Đã Triển khai & Kiểm chứng (`G1–G5` + `R01–R08`) |
|---|---|---|---|---|
| **Quản lý Nghỉ phép & Tạo đơn phép** | Gửi đơn phép, Tính số ngày nghỉ làm việc, Duyệt / Từ chối / Hủy đơn | `Backend/src/modules/leaves/{schema,service,controller,routes}.js`<br>`Backend/migrations/010_payroll_policy_snapshot_and_holidays.sql`<br>`FrontEnd/src/modals/leave/CreateLeaveRequestModal.jsx` | - Rà soát `R04`: `POST /api/leaves` bắt buộc client gửi `totalDays` và chỉ kiểm tra `totalDays <= calendarSpan`, nên gửi Thứ Sáu đến Thứ Hai với `totalDays: 4` vẫn lưu `4` ngày và chưa trừ ngày lễ trong DB (`F17`). | - **Đã triển khai (`ebe0be5`)**:<br>  1. Migration `010` tạo bảng `public_holidays` và seed lịch nghỉ lễ Việt Nam `2025–2028`.<br>  2. `leaves/service.js` tự tính `computedDays = workingDays(startDate, endDate, holidays)` trên server (loại trừ T7, CN và `public_holidays`), hỗ trợ `shiftType` nửa ngày (`0.5` cho 1 ngày làm việc) và trả `400 TOTAL_DAYS_MISMATCH` nếu client gửi `totalDays` lệch.<br>  3. Thêm `GET /api/leaves/holidays` để `CreateLeaveRequestModal.jsx` đồng bộ preview.<br>- **Trạng thái (`PARTIAL — CODE_FIXED_PENDING_POLICY_CONFIRMATION`)**: Code và test `r01-r08-review-fixes.test.js` PASS 100%; chờ HR xác nhận lịch nghỉ lễ riêng của công ty ngoài lịch lễ luật định. |
| **Đăng ký Tăng ca (`/api/ot-requests`)** | Kiểm tra trần giờ OT tháng | `Backend/src/modules/ot/service.js` | - Rà soát `R05`: Dùng hằng số cứng `MONTHLY_CAP = 40` thay vì đọc `max_ot_per_month` từ `system_settings`. | - **Đã triển khai (`a2fe0dd`)**: Đọc `max_ot_per_month` động từ `system_settings` qua `settingsService.getSettingValue('max_ot_per_month', 40)`.<br>- **Kiểm chứng (`VERIFIED`)**: `Backend/tests/api/r01-r08-review-fixes.test.js`. |

---

## 6. Bảng lương, Phiếu lương & Lệnh chi Ngân hàng (`PayrollPage` & Modals)

| Màn hình / Thành phần | Trường / Action | Component (Verified Path) | Hiện trạng AS-IS tại G0 & Rà soát `R02`, `R03`, `R05` | Giải pháp Đã Triển khai & Kiểm chứng (`G1–G5` + `R01–R08`) |
|---|---|---|---|---|
| **Payroll Engine & Lock Workflow** | Tính lương kỳ, Chốt kỳ lương, Chỉnh sửa phiếu lương | `Backend/src/modules/payroll/{tax,service}.js`<br>`Backend/migrations/010_payroll_policy_snapshot_and_holidays.sql` | - Rà soát `R02`: Khi `total_logs === 0` và `paidLeave === 0`, `payroll/service.js` vẫn gọi `fallbackWorkDays` trả `22` công hưởng nguyên lương; `NO_ATTENDANCE` có mức `Trung bình` nên không chặn `lock()`.<br>- Rà soát `R03`: Khi `workDays = 0`, `payslips.allowances` vẫn lưu `1.500.000đ` khiến `updatePayslip` (chỉ sửa `note`) làm `gross_income` nhảy từ `0` lên `1.500.000đ`.<br>- Rà soát `R05`: `tax.js` dùng hằng số cứng, không đọc `system_settings` và không lưu snapshot chính sách theo kỳ. | - **Đã triển khai (`a2fe0dd`)**:<br>  1. Xóa hoàn toàn `fallbackWorkDays`: `total_logs === 0` và `paidLeave === 0` cho ra `workDays = 0, allowances = 0, gross_income = 0, net_salary = 0`.<br>  2. Nâng `NO_ATTENDANCE` (`att_days === 0`) lên `severity: 'Cao', category: 'violation'` chặn `lock()` với `409 ANOMALIES_PENDING` trừ khi `acknowledgeAnomalies: true`.<br>  3. Đồng bộ `computePayslip` trả `allowances = 0` khi `workDays = 0 && otHours = 0 && bonus = 0`; lưu đúng `p.allowances` vào DB; khóa `payroll_periods FOR UPDATE` trước `payslips FOR UPDATE` trong `updatePayslip`.<br>  4. Kết nối `system_settings` vào `computePayslip` và lưu `policy_snapshot` (JSONB) trên `payroll_periods` (đóng băng khi kỳ `DA_CHOT`).<br>- **Trạng thái**: `R03` **`VERIFIED`**; `F09` (`R02`) và `F13`/`F26` (`R05`) **`PARTIAL (CODE_FIXED_PENDING_POLICY_CONFIRMATION)`** chờ xác nhận quy trình xử lý thiếu chấm công và ngày hiệu lực chính sách thuế. |
| **PayslipPdfModal & BankTransferModal** | Xem Phiếu lương & Xuất CSV lệnh chi ngân hàng | `FrontEnd/src/modals/portal/PayslipPdfModal.jsx`<br>`FrontEnd/src/modals/payroll/BankTransferModal.jsx` | - `PayslipPdfModal.jsx` dùng `Number(payslip.bhxh ?? 0)` cho dòng `BHXH (8%) + BHYT (1.5%) + BHTN (1%)` (`R07`).<br>- `BankTransferModal.jsx` thay `net_salary = 0` bằng `base_salary` (`F12`). | - **Đã triển khai (`65e812e`, `f56410b`)**: Dùng `buildPortalSalaryView` cộng đủ `bhxh + bhyt + bhtn` trên `PayslipPdfModal.jsx`; `BankTransferModal.jsx` giữ nguyên `0` và khớp tổng Net với DB/API.<br>- **Kiểm chứng (`VERIFIED`)**: `FrontEnd/tests/dataAdapters.test.js`, E2E `r03-browser-e2e.log`. |

---

## 7. Dự án, Công việc & Squad Chat (`ProjectsTasksPage` & `SquadChatDrawer`)

| Màn hình / Thành phần | Trường / Action | Component (Verified Path) | Hiện trạng AS-IS tại G0 | Giải pháp Đã Triển khai & Kiểm chứng (`G1–G5`) |
|---|---|---|---|---|
| **ProjectsTasksPage & SquadChatDrawer** | Quản lý Dự án / Task / Squad & Chat nhóm thời gian thực | `FrontEnd/src/pages/ProjectsTasksPage.jsx`<br>`FrontEnd/src/components/chat/SquadChatDrawer.jsx`<br>`Backend/src/socket.js`<br>`Backend/src/modules/squads/service.js` | - WebSocket không xác thực JWT (`F08`), `postMessage` cho phép HR/CEO không thuộc squad gửi tin (`F31`), UI tự thêm tin nhắn giả khi socket đóng (`F19`). | - **Đã triển khai (`752f879`, `65e812e`)**: Xác thực JWT trên WebSocket, tách `assertMemberOnly` (gửi tin) khỏi `assertMemberOrHr` (đọc giám sát), lưu bảng `squad_messages`, bỏ tin nhắn giả trên UI.<br>- **Kiểm chứng (`VERIFIED`)**: `Backend/tests/api/g1-remediation.test.js`, `Backend/tests/api/squads.test.js`. |

---

## 8. Phân tích Nhân sự (`AiAnalyticsPage` & `/api/analytics/*`)

| Màn hình / Thành phần | Trường / Action | Component (Verified Path) | Hiện trạng AS-IS tại G0 | Giải pháp Đã Triển khai & Kiểm chứng (`G2–G4`) |
|---|---|---|---|---|
| **AiAnalyticsPage & Analytics Modals** | Ma trận 9-Box, Dự báo Rủi ro Nghỉ việc, Kế hoạch PIP | `FrontEnd/src/pages/AiAnalyticsPage.jsx`<br>`Backend/src/modules/analytics/*` | - Có một số fallback số cứng trên modal (`NineBoxDetailModal.jsx`, `PipPlanModal.jsx`) và cần che `PAY_GAP` với `LINE_MANAGER` (`F26`). | - **Đã triển khai (`65e812e`, `a2e8828`)**: Xóa fallback số cứng trên modal, giữ công thức định lượng rule-based minh bạch, che `PAY_GAP` với `LINE_MANAGER`.<br>- **Trạng thái (`PARTIAL — CODE_FIXED_PENDING_POLICY_CONFIRMATION`)**: Chờ xác nhận quản trị nội bộ về trọng số chỉ báo rủi ro nghỉ việc. |

---

## 9. Trợ lý AI Copilot & Kho Tri thức (`AiCopilotDrawerModal` & `/api/ai/*`)

| Màn hình / Thành phần | Trường / Action | Component (Verified Path) | Hiện trạng AS-IS tại G0 | Giải pháp Đã Triển khai & Kiểm chứng (`G4`) |
|---|---|---|---|---|
| **AiCopilotDrawerModal** | Hỏi đáp chính sách HR & tra cứu dữ liệu cá nhân/quản lý | `FrontEnd/src/modals/analytics/AiCopilotDrawerModal.jsx`<br>`Backend/src/modules/ai/{routes,service,geminiProvider,tools}.js` | - Gọi cứng `gemini-1.5-flash` qua `?key=` (`F22`), thiếu `requirePermission` (`F23`), tin `req.body.context` từ client (`F24`), hardcode chính sách cũ và sinh câu trả lời giả khi thiếu key (`F25`). | - **Đã triển khai (`a2e8828`)**: `geminiProvider.js` (`gemini-2.5-flash`, header `x-goog-api-key`, chặn model cũ `503 AI_MODEL_RETIRED`), `requirePermission('ai.copilot')`, bỏ qua `req.body.context`, 6 read-only tools chạy theo `req.user`, lọc chống prompt injection và trả `503 AI_NOT_CONFIGURED` trung thực khi thiếu key.<br>- **Trạng thái**: `F23`, `F24` **`VERIFIED`** (`32/32` eval tests PASS); `F22`, `F25` **`PARTIAL / BLOCKED (NO_LIVE_GEMINI_API_KEY_CONFIGURED)`** cho bước gọi thật Google Cloud Gemini API. |

---

## 10. Cấu hình Hệ thống (`SettingsPage` & `/api/settings`)

| Màn hình / Thành phần | Trường / Action | Component (Verified Path) | Hiện trạng AS-IS tại G0 & Rà soát `R05`, `R06` | Giải pháp Đã Triển khai & Kiểm chứng (`G2` + `R05`, `R06`, `R08`) |
|---|---|---|---|---|
| **SettingsPage** | Xem & Lưu cấu hình chấm công, GPS, OT, BHXH, Thuế TNCN | `FrontEnd/src/pages/SettingsPage.jsx`<br>`Backend/src/modules/settings/{routes,controller,service}.js` | - G0: Không có bảng/API lưu cấu hình (`F13`).<br>- Rà soát `R05` & `R06`: `settingsService.getSettings()` nuốt lỗi DB trả `DEFAULT_SETTINGS` (`200 OK`) và các tham số lưu trong `system_settings` chưa nối vào `payroll/tax.js` và `ot/service.js`. | - **Đã triển khai (`65e812e`, `a2fe0dd`)**:<br>  1. Bảng `system_settings` (migrations `009`, `010`) + API `/api/settings`.<br>  2. Xóa `try/catch` nuốt lỗi DB trong `settings/service.js` (`R06` $\rightarrow$ trả đúng `500` khi DB lỗi).<br>  3. Nối `system_settings` vào `payroll/tax.js`, `payroll/service.js` (`policy_snapshot`) và `ot/service.js` (`R05`).<br>- **Kiểm chứng**: `R06` **`VERIFIED`**; `F13` (`R05`) **`PARTIAL (CODE_FIXED_PENDING_POLICY_CONFIRMATION)`** (đã kiểm chứng E2E lưu + reload và chặn false-success khi API trả `500` trong `r03-browser-e2e.log`). |
