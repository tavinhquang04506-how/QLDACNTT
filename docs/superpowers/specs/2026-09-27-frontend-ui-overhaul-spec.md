# Đặc Tả Kỹ Thuật (Spec) — Hoàn Thiện & Chuẩn Hóa Toàn Diện Giao Diện NEXUS HRMS (FrontEnd Overhaul)

- **Ngày lập:** 2026-09-27
- **Tác giả:** Antigravity AI Pair Programmer
- **Phạm vi:** Toàn bộ thư mục [`FrontEnd/`](file:///C:/Users/tavin/Downloads/QLDACNTT/FrontEnd) (11 Pages, 25 Modals, Layout Shell, Services & State Management)
- **Mục tiêu:** Nâng cấp toàn diện giao diện Frontend đạt chuẩn Enterprise UX/UI, xử lý triệt để 100% các lỗi runtime crashes, đồng bộ contract API với Backend, xóa sạch dữ liệu hardcode còn sót lại, và tối ưu hóa trải nghiệm người dùng theo 4 phân quyền (CEO, HR_DIRECTOR, LINE_MANAGER, EMPLOYEE).

---

## 1. Bối Cảnh & Vấn Đề Cần Giải Quyết

Qua đợt kiểm toán hệ thống (Audit Report) và thử nghiệm thực tế:
1. **Lỗi Runtime & Crash tiềm ẩn:** Một số trang thao tác chuỗi trên trường chưa khởi tạo (`.split()`, `.slice()`, `.toLowerCase()`), gọi hàm sai tên scope hoặc thiếu giá trị mặc định khi dữ liệu rỗng.
2. **Lệch Contract API giữa Frontend và Backend:**
   - Chấm công gửi `method: 'face_id'` thay vì `['gps', 'manual', 'qr', 'kiosk']`.
   - Nghiệm thu task gửi `{ approved: boolean }` thay vì `{ decision: 'accept'|'reject' }`.
   - Gửi tin nhắn Squad gửi `{ message }` thay vì `{ content }`.
   - Chốt kỳ lương thiếu body `{ acknowledgeAnomalies: true }`.
3. **Dữ liệu Mock & Chưa kết nối API:**
   - Trang `DashboardPage.jsx` đã gọi `getStats()` nhưng chưa gắn biến `stats` vào các thẻ KPI vĩ mô, bảng phòng ban và danh sách đơn chờ duyệt.
   - Trang `EmployeePortalPage.jsx` cần đồng bộ với các API cá nhân (`/attendance/me/today`, `/leaves/balances/me`, `/payroll/me`, `/notices`).
   - Modal `OnboardingModal.jsx` còn hardcode số điện thoại và ngày sinh.
4. **Phân quyền & Bảo mật hiển thị:**
   - `PayrollPage.jsx` cần giới hạn hiển thị theo phân quyền (Trưởng phòng chỉ xem bộ phận mình, Nhân viên chỉ xem phiếu lương cá nhân).
   - `Topbar.jsx` cần hiển thị thông tin thực của tài khoản đang đăng nhập, nút Đăng xuất gọi API server thu hồi token.
5. **Cơ chế chuyển đổi dữ liệu tập trung (Data Adapter):**
   - Backend PostgreSQL trả về `snake_case` (`full_name`, `work_email`, `base_salary`, `joined_date`).
   - Cần một tầng `dataAdapters.js` chuẩn hóa dữ liệu đầu vào để mọi component hiển thị an toàn mà không phải lặp lại logic mapping ở từng file.

---

## 2. Kiến Trúc Giải Pháp & Quy Ước Thiết Kế

```
[ Backend REST API (PostgreSQL snake_case) ]
                    │
                    ▼
       [ FrontEnd Services Layer ]
                    │
                    ▼
     [ Data Adapters (src/utils/dataAdapters.js) ]
     - normalizeEmployee(emp)
     - normalizeDepartment(dept)
     - normalizeLeaveRequest(leave)
     - normalizePayslip(slip)
     - normalizeTask(task)
     - normalizeProject(prj)
                    │
                    ▼
[ React State / Context (AuthContext, ModalContext) ]
                    │
                    ▼
[ Presentation Pages (Dashboard, Directory, Leave, Payroll, Tasks, Portal, Analytics) ]
```

### Quy ước thiết kế giao diện (UI/UX Standards):
- **Bảng màu chủ đạo:**
  - CEO / Lãnh đạo: Purple (`#7C3AED`, `#9333EA`)
  - HR Director / Nhân sự: Blue (`#2563EB`, `#1D4ED8`)
  - Line Manager / Kỹ thuật: Emerald (`#059669`, `#10B981`)
  - Employee / Tự phục vụ: Amber / Indigo (`#D97706`, `#4F46E5`)
- **Trạng thái rỗng (Empty States):** Mọi danh sách, bảng dữ liệu khi không có bản ghi phải hiển thị icon minh họa nhẹ nhàng, tiêu đề "Chưa có dữ liệu" và nút hành động thích hợp (thay vì để trống trơn).
- **Trạng thái đang tải (Loading States):** Sử dụng Skeleton shimmer hoặc Spinner tròn thanh lịch khi đang gọi API.
- **Xử lý số tiền tệ & Ngày tháng:**
  - Tiền tệ: `new Intl.NumberFormat('vi-VN').format(amount) + ' VNĐ'`
  - Ngày tháng: Chuỗi `YYYY-MM-DD` hiển thị sang `DD/MM/YYYY`.

---

## 3. Phân Rã Các Module Thay Đổi

### Module 1: Tầng Chuyển Đổi Dữ Liệu Tập Trung & Nền Tảng Core
- Tạo `FrontEnd/src/utils/dataAdapters.js` chứa các hàm chuẩn hóa an toàn (safe property access, nullish coalescing `??`).
- Cập nhật `FrontEnd/src/services/api.js`:
  - Hỗ trợ `FormData` upload file an toàn (tự động bỏ qua `JSON.stringify` và không đè `Content-Type: multipart/form-data`).
  - Hỗ trợ lưu và tự động refresh token bằng `nexus_refresh_token` khi nhận HTTP 401.

### Module 2: Trang Tổng Quan Điều Hành (`DashboardPage.jsx`)
- Gắn dữ liệu thật từ `stats` (`total_active`, `present_today`, `late_today`, `pending_leaves`, `active_projects`, `open_tasks`).
- Kết nối danh sách phòng ban `stats.departmentStats` và đơn chờ duyệt `stats.pendingLeaves`.
- Kết nối nút "Phê duyệt" trực tiếp vào `leaveService.approve(id)`.

### Module 3: Trang Danh Bạ & Quản Lý Nhân Sự (`DirectoryPage.jsx` & Modals)
- Sử dụng `normalizeEmployee` cho toàn bộ danh bạ.
- Cập nhật `OnboardingModal.jsx`: Thêm trường nhập Số điện thoại, Ngày sinh, Số CCCD, Địa chỉ, Mức lương hợp đồng thật.
- Cập nhật `Profile360Modal.jsx`: Chuẩn hóa dữ liệu 5 tabs, hiển thị hợp đồng và quá trình công tác.
- Sửa gửi tin nhắn chat Squad sang `{ content }`.

### Module 4: Trang Chấm Công & Kiosk (`AttendancePage.jsx`, `KioskFullscreenPage.jsx`)
- Kết nối API `attendanceService.getMyToday()` để hiển thị đúng ca làm việc và trạng thái check-in thực tế.
- Cho phép check-in/out với phương thức chuẩn `gps` hoặc `manual`.
- Cập nhật bảng công tháng và lịch sử chấm công từ `attendanceService.getLogs()`.
- Kiosk fullscreen: Quét QR và gọi `attendanceService.kioskPunch({ qrToken })`.

### Module 5: Trang Nghỉ Phép & Tiền Lương (`LeaveManagementPage.jsx`, `PayrollPage.jsx`)
- Sửa công thức đếm đơn chờ duyệt (loại bỏ phép trừ 2 lần).
- Hoàn thiện phê duyệt đơn phép 2 cấp theo Role: Line Manager duyệt cấp 1, HR Director / CEO duyệt cấp 2.
- Giới hạn dữ liệu bảng lương theo quyền hạn tài khoản (tránh rò rỉ dữ liệu tài chính cho Line Manager).
- Modal chốt lương truyền cờ `{ acknowledgeAnomalies: true }` khi có cảnh báo.

### Module 6: Dự Án, Phân Tích AI, Cổng Nhân Viên & Cài Đặt Hệ Thống
- `ProjectsTasksPage.jsx`: Reload tasks khi chuyển đổi dự án; phòng thủ an toàn chuỗi; nghiệm thu task gửi `{ decision: 'accept'|'reject' }`.
- `AiAnalyticsPage.jsx`: Đồng bộ ma trận 9-Box Grid và gắn số liệu thống kê rủi ro nghỉ việc.
- `EmployeePortalPage.jsx`: Hiển thị số dư phép năm, chấm công hôm nay, phiếu lương cá nhân và thông báo nội bộ từ API thực tế.
- `SettingsPage.jsx`: Kết nối đổi mật khẩu tài khoản và hiển thị thông tin bảo mật.
- `Topbar.jsx` & `Sidebar.jsx`: Hiển thị đúng Avatar và Tên tài khoản đang đăng nhập, nút Đăng xuất gọi API server.

---

## 4. Tiêu Chí Nghiệm Thu (Acceptance Criteria)
1. `npm run build --prefix FrontEnd` biên dịch 100% không có cảnh báo/lỗi nghiêm trọng.
2. Không còn bất kỳ màn hình trắng (crash) nào khi người dùng điều hướng qua 11 trang và mở 25 modals.
3. Không còn bất kỳ request API nào bị Backend trả về HTTP 400 Validation Error do lệch schema.
4. Giao diện thể hiện rõ ràng sắc thái thương hiệu chuyên nghiệp theo từng vai trò đăng nhập.
