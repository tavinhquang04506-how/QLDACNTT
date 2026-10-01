# Kế Hoạch Triển Khai (Plan) — Hoàn Thiện & Chuẩn Hóa Toàn Diện Giao Diện NEXUS HRMS (FrontEnd Overhaul)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện và nâng cấp toàn diện giao diện Frontend (11 Pages, 25 Modals, Layout và Services) của hệ thống NEXUS HRMS, loại bỏ 100% rủi ro crash runtime, chuẩn hóa dữ liệu qua Data Adapter Layer, đồng bộ chính xác contract API với Backend, và tối ưu trải nghiệm người dùng theo 4 phân quyền (CEO, HR_DIRECTOR, LINE_MANAGER, EMPLOYEE).

**Architecture:** Thiết lập tầng Data Adapter tập trung (`FrontEnd/src/utils/dataAdapters.js`) chuyển đổi dữ liệu từ PostgreSQL snake_case sang chuẩn hiển thị của component; nâng cấp `api.js` hỗ trợ tự động refresh token và multipart FormData; sau đó lần lượt chuẩn hóa và gắn API thực tế cho Dashboard điều hành, Danh bạ nhân sự, Chấm công Kiosk, Đơn từ & Tiền lương, Dự án & Phân tích AI, Cổng cá nhân và Layout Shell.

**Tech Stack:** React 18, Vite, Tailwind CSS, Lucide React, Framer Motion, Context API, Node.js Test Runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-09-27-frontend-ui-overhaul-spec.md`

## Global Constraints

- Biên dịch production `npm run build --prefix FrontEnd` phải thành công 100% sau mỗi task, không có lỗi linter hay cú pháp.
- Giữ nguyên cấu trúc route hiện hành (`/`, `/dashboard`, `/directory`, `/attendance`, `/leaves`, `/payroll`, `/tasks`, `/ai-analytics`, `/portal`, `/settings`, `/kiosk`, `/login`).
- Giữ nguyên cơ chế tương thích ngược 2 khóa modal (cả mã cũ `modal2A` lẫn tên mới `lateAbsence`) trong `ModalContainer.jsx`.
- Mọi truy cập thuộc tính mảng/chuỗi có nguy cơ undefined phải sử dụng optional chaining (`?.`) và toán tử nullish coalescing (`??`).
- Số tiền tệ hiển thị định dạng `vi-VN` kèm hậu tố `VNĐ`, ngày tháng hiển thị dạng `DD/MM/YYYY`.
- Không sử dụng thư viện bên ngoài mới ngoài các dependency đã khai báo trong `FrontEnd/package.json`.

## Review Focus

1. **Upload File / FormData bị ghi đè Header:** Khi gửi file Excel hoặc ảnh qua `api.js`, nếu `Content-Type: application/json` bị set cứng hoặc chạy qua `JSON.stringify` thì upload sẽ thất bại (400 Bad Request). Kiểm tra: `api.js` tự động bỏ Content-Type khi body là `FormData`.
2. **Crash Runtime khi chuỗi hoặc mảng null/undefined:** Các hàm `.split()`, `.toLowerCase()`, `.filter()`, `.map()` trên dữ liệu chưa nạp từ Backend gây màn hình trắng. Kiểm tra: `dataAdapters.js` trả về mảng/chuỗi mặc định an toàn.
3. **Lệch Payload Nghiệm Thu Task:** Backend nhận `{ decision: 'accept' | 'reject' }` nhưng Frontend từng gửi `{ approved: boolean }` gây lỗi 400 Zod validation. Kiểm tra: `ProjectsTasksPage.jsx` gửi đúng `decision`.
4. **Lộ Dữ Liệu Bảng Lương Toàn Công Ty:** Tài khoản `LINE_MANAGER` không được xem bảng lương công ty mà chỉ xem danh sách nhân viên phòng mình hoặc phiếu lương cá nhân. Kiểm tra: `PayrollPage.jsx` giới hạn scope truy vấn theo role.
5. **Đơn Phép Bị Trừ 2 Lần Trên Badge:** Badge số lượng đơn chờ duyệt ở `LeaveManagementPage.jsx` từng tính `deptPendingRequests.length - approvedList.length` gây số âm hoặc hiển thị sai. Kiểm tra: Badge hiển thị đúng `deptPendingRequests.length`.

---

### Task 1: Tầng Chuyển Đổi Dữ Liệu Tập Trung (Data Adapters) & Nâng Cấp API Client

**Files:**
- Create: `FrontEnd/src/utils/dataAdapters.js`
- Create: `FrontEnd/tests/dataAdapters.test.js`
- Modify: `FrontEnd/src/services/api.js`
- Modify: `FrontEnd/src/services/index.js`

**Interfaces:**
- Consumes: Raw API JSON objects from Backend (`snake_case`).
- Produces:
  - `normalizeEmployee(emp: object): object`
  - `normalizeLeaveRequest(leave: object): object`
  - `normalizePayslip(slip: object): object`
  - `normalizeTask(task: object): object`
  - `normalizeDepartment(dept: object): object`
  - `formatVND(amount: number): string`
  - `formatDateVN(dateStr: string): string`
  - `api(endpoint, options)` with automatic FormData bypass and 401 refresh token handler.

- [ ] **Step 1: Viết test cho Data Adapters (`FrontEnd/tests/dataAdapters.test.js`)**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmployee,
  normalizeLeaveRequest,
  normalizePayslip,
  normalizeTask,
  normalizeDepartment,
  formatVND,
  formatDateVN
} from '../src/utils/dataAdapters.js';

describe('Data Adapters Unit Tests', () => {
  it('normalizeEmployee should return safe defaults for null or empty input', () => {
    const res = normalizeEmployee(null);
    assert.equal(res.id, '');
    assert.equal(res.name, 'Chưa rõ');
    assert.equal(res.email, '');
    assert.equal(res.department, 'Chưa phân bổ');
    assert.equal(res.role, 'Nhân viên');
    assert.equal(res.status, 'active');
    assert.equal(res.avatar, '');
  });

  it('normalizeEmployee should correctly map PostgreSQL snake_case fields', () => {
    const raw = {
      id: 10,
      full_name: 'Nguyen Van A',
      work_email: 'a@nexus.com',
      department_name: 'Ky Thuat',
      job_title: 'Developer',
      status: 'active',
      phone_number: '0901234567',
      base_salary: 20000000
    };
    const res = normalizeEmployee(raw);
    assert.equal(res.id, 10);
    assert.equal(res.name, 'Nguyen Van A');
    assert.equal(res.email, 'a@nexus.com');
    assert.equal(res.department, 'Ky Thuat');
    assert.equal(res.role, 'Developer');
    assert.equal(res.phone, '0901234567');
    assert.equal(res.baseSalary, 20000000);
  });

  it('normalizeLeaveRequest should handle missing fields safely', () => {
    const res = normalizeLeaveRequest(null);
    assert.equal(res.id, '');
    assert.equal(res.employeeName, 'Nhân viên');
    assert.equal(res.daysCount, 0);
    assert.equal(res.status, 'pending');
  });

  it('formatVND formats currency correctly', () => {
    assert.equal(formatVND(15000000), '15.000.000 VNĐ');
    assert.equal(formatVND(0), '0 VNĐ');
    assert.equal(formatVND(null), '0 VNĐ');
  });

  it('formatDateVN formats YYYY-MM-DD correctly', () => {
    assert.equal(formatDateVN('2026-09-27'), '27/09/2026');
    assert.equal(formatDateVN(null), '--/--/----');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `node --test FrontEnd/tests/dataAdapters.test.js`
Expected: FAIL ("Cannot find module '../src/utils/dataAdapters.js'")

- [ ] **Step 3: Cài đặt `FrontEnd/src/utils/dataAdapters.js` và cập nhật `api.js`**

Cài đặt đầy đủ các hàm normalize với safe property access và fallback defaults. Cập nhật `api.js` xử lý bỏ qua `JSON.stringify` nếu `body instanceof FormData`, và gắn interceptor thử refresh token khi gặp HTTP 401. Xuất barrel từ `FrontEnd/src/services/index.js`.

- [ ] **Step 4: Chạy lại test và kiểm tra build**

Run: `node --test FrontEnd/tests/dataAdapters.test.js`
Expected: ALL PASS (5 tests passed).
Run: `npm run build --prefix FrontEnd`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit Task 1**

```bash
git add FrontEnd/src/utils/dataAdapters.js FrontEnd/tests/dataAdapters.test.js FrontEnd/src/services/api.js FrontEnd/src/services/index.js
git commit -m "feat(frontend): add centralized data adapters and enhance api client"
```

---

### Task 2: Trang Tổng Quan Điều Hành (DashboardPage) & Dữ Liệu KPI Trực Quan

**Files:**
- Modify: `FrontEnd/src/pages/DashboardPage.jsx`
- Modify: `FrontEnd/src/modals/dashboard/LateAbsenceModal.jsx`
- Modify: `FrontEnd/src/modals/dashboard/LiveLogsModal.jsx`

**Interfaces:**
- Consumes:
  - `dashboardService.getStats()`
  - `leaveService.approve(id)`
  - `leaveService.reject(id, reason)`
  - `normalizeLeaveRequest`, `formatVND` from `../utils/dataAdapters`
- Produces: Live KPI card statistics, real Department headcounts, reactive approval list with instant optimistic update.

- [ ] **Step 1: Viết test cho logic tính toán và tổng hợp số liệu Dashboard**

Create: `FrontEnd/tests/dashboardData.test.js`
Assert: Khi stats trả về `{ overview: { total_active: 45, present_today: 42, late_today: 2, pending_leaves: 3 }, departmentStats: [...], pendingLeaves: [...] }`, mapper trích xuất đúng các chỉ số KPI, tỷ lệ có mặt (present_today / total_active * 100), và danh sách đơn chờ duyệt.

- [ ] **Step 2: Chạy test để xác nhận kiểm tra**

Run: `node --test FrontEnd/tests/dashboardData.test.js`

- [ ] **Step 3: Cập nhật `DashboardPage.jsx`, `LateAbsenceModal.jsx`, `LiveLogsModal.jsx`**

- Gắn `stats.overview` vào các KPI Cards: Nhân sự hiện diện, Đi muộn/Về sớm, Đơn chờ duyệt, Dự án đang chạy.
- Gắn `stats.departmentStats` vào phần Thống kê nhân sự theo phòng ban.
- Gắn `stats.pendingLeaves` vào danh sách Phê duyệt nhanh khẩn cấp.
- Gắn sự kiện nút "Phê duyệt" gọi trực tiếp `leaveService.approve(id)`, hiển thị toast/thông báo thành công và cập nhật lại state cục bộ (loại bỏ đơn đã duyệt khỏi danh sách chờ).
- Bổ sung UI Loading skeleton khi đang fetch dữ liệu và Empty state thanh lịch khi không có đơn chờ duyệt.
- Cập nhật `LateAbsenceModal.jsx` và `LiveLogsModal.jsx` đọc trực tiếp danh sách nhân viên đi muộn từ prop `payload` hoặc service `attendanceService.getLogs()`.

- [ ] **Step 4: Kiểm tra build và chạy test**

Run: `node --test FrontEnd/tests/dashboardData.test.js`
Run: `npm run build --prefix FrontEnd`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit Task 2**

```bash
git add FrontEnd/src/pages/DashboardPage.jsx FrontEnd/src/modals/dashboard/ FrontEnd/tests/dashboardData.test.js
git commit -m "feat(dashboard): wire real stats, department breakdown and instant leave approval"
```

---

### Task 3: Trang Danh Bạ Nhân Sự, Hồ Sơ 360 & Quy Trình Onboarding

**Files:**
- Modify: `FrontEnd/src/pages/DirectoryPage.jsx`
- Modify: `FrontEnd/src/modals/directory/OnboardingModal.jsx`
- Modify: `FrontEnd/src/modals/directory/Profile360Modal.jsx`
- Modify: `FrontEnd/src/modals/directory/ImportExcelModal.jsx`

**Interfaces:**
- Consumes:
  - `employeeService.getAll()`, `employeeService.create()`, `employeeService.update()`
  - `normalizeEmployee` from `../utils/dataAdapters`
- Produces: Resilient directory search/filter, full-featured Onboarding form, 5-tab Profile 360 viewer, fixed squad chat with `{ content }`.

- [ ] **Step 1: Viết test cho logic lọc danh bạ và tìm kiếm nhân viên**

Create: `FrontEnd/tests/directoryFilter.test.js`
Assert: Hàm lọc danh bạ tìm kiếm không phân biệt chữ hoa/thường, không bị crash khi `work_email` hoặc `department_name` là null/undefined, và lọc chính xác theo phòng ban/trạng thái.

- [ ] **Step 2: Chạy test để xác nhận kiểm tra**

Run: `node --test FrontEnd/tests/directoryFilter.test.js`

- [ ] **Step 3: Nâng cấp `DirectoryPage.jsx` và các Modals nhân sự**

- Trong `DirectoryPage.jsx`:
  - Dùng `normalizeEmployee` cho toàn bộ danh sách tải về từ `employeeService.getAll()`.
  - Bộ lọc tìm kiếm thông minh: Tên, Email, Chức vụ, Phòng ban, Trạng thái (Active / Inactive / Onboarding).
  - Tab Squad Chat: Sửa payload gửi tin nhắn từ `{ message: text }` thành `{ content: text }`.
- Trong `OnboardingModal.jsx`:
  - Xóa bỏ dữ liệu hardcode (0912 888 999, 1998-04-12).
  - Bổ sung trường nhập: Họ và tên, Email, Số điện thoại, Ngày sinh, Số CCCD, Địa chỉ, Phòng ban, Chức danh, Ngày bắt đầu, Mức lương cơ bản.
  - Kết nối nút gửi vào `employeeService.create(formData)`. Khi thành công, đóng modal và kích hoạt callback làm mới danh sách.
- Trong `Profile360Modal.jsx`:
  - Nhận đối tượng `employee` đã chuẩn hóa, an toàn hiển thị cả 5 tabs: Tổng quan, Hợp đồng & Bảo hiểm, Lịch sử chấm công, Phiếu lương, Đánh giá năng lực.
- Trong `ImportExcelModal.jsx`:
  - Kết nối form tải lên file `.xlsx` / `.csv` qua `FormData` gọi `employeeService.importExcel(file)`.

- [ ] **Step 4: Kiểm tra build và chạy test**

Run: `node --test FrontEnd/tests/directoryFilter.test.js`
Run: `npm run build --prefix FrontEnd`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit Task 3**

```bash
git add FrontEnd/src/pages/DirectoryPage.jsx FrontEnd/src/modals/directory/ FrontEnd/tests/directoryFilter.test.js
git commit -m "feat(directory): enhance 360 profile, full onboarding form and fix squad chat"
```

---

### Task 4: Chấm Công Thông Minh, Bảng Chấm Công & Trạm Kiosk

**Files:**
- Modify: `FrontEnd/src/pages/AttendancePage.jsx`
- Modify: `FrontEnd/src/pages/KioskFullscreenPage.jsx`
- Modify: `FrontEnd/src/modals/attendance/TimesheetMatrixModal.jsx`
- Modify: `FrontEnd/src/modals/attendance/SnapshotLogsModal.jsx`

**Interfaces:**
- Consumes:
  - `attendanceService.getMyToday()`, `attendanceService.punch()`, `attendanceService.getLogs()`, `attendanceService.kioskPunch()`
  - `formatDateVN` from `../utils/dataAdapters`
- Produces: Live attendance widget, correct punch payloads (`method: 'gps' | 'manual'`), dynamic monthly log table, functional kiosk scanner.

- [ ] **Step 1: Viết test cho logic xử lý ca chấm công và định dạng giờ**

Create: `FrontEnd/tests/attendanceCalculations.test.js`
Assert: Kiểm tra tính toán số giờ làm việc (work_hours), trạng thái đi muộn (late), và kiểm tra hợp lệ của phương thức chấm công (`gps`, `manual`, `qr`, `kiosk`).

- [ ] **Step 2: Chạy test để xác nhận kiểm tra**

Run: `node --test FrontEnd/tests/attendanceCalculations.test.js`

- [ ] **Step 3: Nâng cấp `AttendancePage.jsx`, `KioskFullscreenPage.jsx` và Modals**

- Trong `AttendancePage.jsx`:
  - Gọi `attendanceService.getMyToday()` khi mount: hiển thị giờ Check-in, giờ Check-out, trạng thái ca làm việc thực tế của user đăng nhập.
  - Nút "Chấm công vào" / "Chấm công ra" kích hoạt `attendanceService.punch({ type, method: 'gps' })` kèm tọa độ địa lý hoặc fallback `'manual'`.
  - Tải danh sách lịch sử chấm công từ `attendanceService.getLogs()`, định dạng giờ phút `HH:mm` và ngày `DD/MM/YYYY`.
  - Thêm Empty State khi chưa có lịch sử công trong kỳ.
- Trong `KioskFullscreenPage.jsx`:
  - Sửa gọi API thành `attendanceService.kioskPunch({ qrToken: code })`.
  - Hiển thị phản hồi UI rõ ràng: Thẻ nhân viên nhận diện thành công, chuông thông báo âm thanh/visual, và tự động reset sau 3 giây để sẵn sàng cho người kế tiếp.
- Trong `TimesheetMatrixModal.jsx` & `SnapshotLogsModal.jsx`:
  - Hiển thị ma trận công dạng lưới ngày trong tháng (1 đến 31) với các ký hiệu chuẩn: `P` (Present), `A` (Absent), `L` (Late), `H` (Holiday).

- [ ] **Step 4: Kiểm tra build và chạy test**

Run: `node --test FrontEnd/tests/attendanceCalculations.test.js`
Run: `npm run build --prefix FrontEnd`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit Task 4**

```bash
git add FrontEnd/src/pages/AttendancePage.jsx FrontEnd/src/pages/KioskFullscreenPage.jsx FrontEnd/src/modals/attendance/ FrontEnd/tests/attendanceCalculations.test.js
git commit -m "feat(attendance): live punch flow, kiosk qr recognition and timesheet matrix"
```

---

### Task 5: Quản Lý Đơn Nghỉ Phép Đa Cấp & Bảng Lương Phân Quyền Bảo Mật

**Files:**
- Modify: `FrontEnd/src/pages/LeaveManagementPage.jsx`
- Modify: `FrontEnd/src/modals/leave/CreateLeaveRequestModal.jsx`
- Modify: `FrontEnd/src/modals/leave/LeaveDetailViewModal.jsx`
- Modify: `FrontEnd/src/pages/PayrollPage.jsx`
- Modify: `FrontEnd/src/modals/payroll/PayrollLockModal.jsx`
- Modify: `FrontEnd/src/modals/payroll/PayrollAnomalyModal.jsx`

**Interfaces:**
- Consumes:
  - `leaveService.getAll()`, `leaveService.create()`, `leaveService.approve()`, `leaveService.reject()`
  - `payrollService.getAll()`, `payrollService.getMyPayslips()`, `payrollService.lockPayroll()`
  - `normalizeLeaveRequest`, `normalizePayslip`, `formatVND` from `../utils/dataAdapters`
- Produces: Corrected badge counts, multi-role approval workflow, scoped payroll visibility (preventing data leaks for line managers), anomaly acknowledgment on lock.

- [ ] **Step 1: Viết test cho logic đếm đơn phép và phân quyền bảng lương**

Create: `FrontEnd/tests/leaveAndPayroll.test.js`
Assert:
- Đếm đơn pending chính xác không bị trừ 2 lần.
- Bộ lọc quyền: Nếu role là `LINE_MANAGER`, chỉ trả về danh sách thuộc phòng ban quản lý. Nếu role là `EMPLOYEE`, chỉ xem phiếu lương của chính mình.
- Dữ liệu chốt sổ lương sinh đúng cờ `acknowledgeAnomalies: true`.

- [ ] **Step 2: Chạy test để xác nhận kiểm tra**

Run: `node --test FrontEnd/tests/leaveAndPayroll.test.js`

- [ ] **Step 3: Cập nhật `LeaveManagementPage.jsx`, `PayrollPage.jsx` và các Modals**

- Trong `LeaveManagementPage.jsx`:
  - Sửa công thức badge số lượng đơn chờ duyệt: `const pendingCount = requests.filter(r => r.status === 'pending').length;`.
  - Phân quyền phê duyệt: Hiển thị nút "Duyệt cấp 1" cho `LINE_MANAGER` (khi `stage === 'PENDING_LM'`), nút "Duyệt cuối (HR)" cho `HR_DIRECTOR` hoặc `CEO`.
  - Kết nối `CreateLeaveRequestModal.jsx` gửi form vào `leaveService.create(payload)`.
- Trong `PayrollPage.jsx`:
  - Phân quyền dữ liệu theo `user.role`:
    - `CEO` / `HR_DIRECTOR`: Gọi `payrollService.getAll()` hiển thị toàn công ty, xem tổng quỹ lương, tỷ lệ chi trả.
    - `LINE_MANAGER`: Chỉ lọc hiển thị nhân sự thuộc `user.department_id` hoặc phòng ban của mình.
    - `EMPLOYEE`: Tự động chuyển hướng hoặc chỉ hiển thị danh sách phiếu lương cá nhân qua `payrollService.getMyPayslips()`.
  - Format toàn bộ các cột Lương cơ bản, Phụ cấp, Tăng ca, Khấu trừ, Lương thực lĩnh bằng `formatVND()`.
- Trong `PayrollLockModal.jsx`:
  - Khi người dùng bấm xác nhận chốt sổ kỳ lương, gửi kèm `{ acknowledgeAnomalies: true }` để tránh lỗi 409 Conflict từ Backend.
- Trong `PayrollAnomalyModal.jsx`:
  - Hiển thị danh sách cảnh báo bất thường (lương âm, giờ làm lệch chuẩn, thiếu thông tin thuế) kèm nút giải trình.

- [ ] **Step 4: Kiểm tra build và chạy test**

Run: `node --test FrontEnd/tests/leaveAndPayroll.test.js`
Run: `npm run build --prefix FrontEnd`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit Task 5**

```bash
git add FrontEnd/src/pages/LeaveManagementPage.jsx FrontEnd/src/modals/leave/ FrontEnd/src/pages/PayrollPage.jsx FrontEnd/src/modals/payroll/ FrontEnd/tests/leaveAndPayroll.test.js
git commit -m "feat(payroll-leave): multi-level leave approvals, scoped payroll view and anomaly lock"
```

---

### Task 6: Dự Án/Công Việc, Phân Tích AI, Cổng Nhân Viên & Hoàn Thiện Layout Shell

**Files:**
- Modify: `FrontEnd/src/pages/ProjectsTasksPage.jsx`
- Modify: `FrontEnd/src/pages/AiAnalyticsPage.jsx`
- Modify: `FrontEnd/src/pages/EmployeePortalPage.jsx`
- Modify: `FrontEnd/src/pages/SettingsPage.jsx`
- Modify: `FrontEnd/src/components/layout/Topbar.jsx`
- Modify: `FrontEnd/src/components/layout/Sidebar.jsx`

**Interfaces:**
- Consumes:
  - `projectService.getAll()`, `projectService.getTasks()`, `projectService.reviewTask()`
  - `analyticsService.getOverview()`, `analyticsService.getNineBox()`
  - `authService.changePassword()`, `authService.logout()`
  - `normalizeTask` from `../utils/dataAdapters`
- Produces: Project-switch task reloader, proper task review schema `{ decision: 'accept'|'reject' }`, 9-Box grid rendering, live personal portal, synchronized Topbar/Sidebar with actual user profile and secure logout.

- [ ] **Step 1: Viết test cho logic chuyển đổi dự án và ánh xạ 9-box matrix**

Create: `FrontEnd/tests/projectAndAnalytics.test.js`
Assert:
- Chuyển đổi ID dự án kích hoạt đúng hàm lấy danh sách task tương ứng.
- Đánh giá task xuất payload đúng định dạng `{ decision: 'accept' }` hoặc `{ decision: 'reject', rejection_reason: '...' }`.
- Ma trận 9-Box xếp nhân viên vào đúng ô dựa theo Performance và Potential.

- [ ] **Step 2: Chạy test để xác nhận kiểm tra**

Run: `node --test FrontEnd/tests/projectAndAnalytics.test.js`

- [ ] **Step 3: Cập nhật các trang và Layout Shell**

- Trong `ProjectsTasksPage.jsx`:
  - Khi chọn dự án từ dropdown, gọi ngay `projectService.getTasks(selectedProjectId)` để tải danh sách công việc của dự án đó.
  - Xử lý nghiệm thu task: Gửi body chuẩn Backend `{ decision: isAccepted ? 'accept' : 'reject', comment }`.
  - An toàn chuỗi: Bổ sung optional chaining `task.due_date?.split('T')[0]`, `(task.priority_color || '').split(' ')`.
- Trong `AiAnalyticsPage.jsx`:
  - Kết nối dữ liệu 9-Box Grid và danh sách nhân sự có nguy cơ nghỉ việc cao từ `analyticsService`.
  - Phân tích đề xuất kế hoạch phát triển (PIP) dựa trên dữ liệu thực tế.
- Trong `EmployeePortalPage.jsx`:
  - Gắn dữ liệu thực tế: Thẻ chấm công hôm nay, số dư phép năm, phiếu lương tháng gần nhất và thông báo nội bộ.
- Trong `SettingsPage.jsx`:
  - Kết nối form đổi mật khẩu với `authService.changePassword({ currentPassword, newPassword })`.
- Trong `Topbar.jsx` & `Sidebar.jsx`:
  - Hiển thị đúng Avatar (`avatar_url`), Tên hiển thị (`user.full_name` hoặc `user.name`), và Badge phân quyền từ `AuthContext`.
  - Nút "Đăng xuất" kích hoạt `authService.logout()`, thu hồi token và điều hướng về trang `/login`.

- [ ] **Step 4: Kiểm tra build và chạy toàn bộ test suite**

Run: `node --test FrontEnd/tests/*.test.js`
Expected: ALL PASS.
Run: `npm run build --prefix FrontEnd`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit Task 6**

```bash
git add FrontEnd/src/pages/ProjectsTasksPage.jsx FrontEnd/src/pages/AiAnalyticsPage.jsx FrontEnd/src/pages/EmployeePortalPage.jsx FrontEnd/src/pages/SettingsPage.jsx FrontEnd/src/components/layout/ FrontEnd/tests/projectAndAnalytics.test.js
git commit -m "feat(portal-analytics): dynamic task reload, 9-box ai matrix, real profile topbar and secure logout"
```

---

## Tự Đánh Giá (Self-Review)

1. **Spec Coverage:**
   - Tầng Data Adapter tập trung & API client -> Task 1
   - Dashboard điều hành & Phê duyệt nhanh -> Task 2
   - Danh bạ nhân sự, Profile 360 & Onboarding -> Task 3
   - Chấm công thông minh, Kiosk & Timesheet -> Task 4
   - Nghỉ phép đa cấp & Bảng lương bảo mật -> Task 5
   - Dự án/công việc, AI Analytics, Cổng nhân viên & Shell -> Task 6
   => Đã bao phủ 100% các mục trong spec.

2. **Step Granularity & Types:**
   - Mỗi task đều có 5 bước rõ ràng: Viết test failing -> Chạy test fail -> Triển khai code -> Chạy test & build pass -> Commit git.
   - Các hàm normalize và interface xuất ra ở Task 1 được sử dụng nhất quán trong các Task 2, 3, 4, 5, 6.

3. **Review Focus Verification:**
   - Cả 5 trường hợp lỗi tiềm tàng đã được giải quyết trực tiếp trong các Task 1, 2, 5, 6 và có test case tương ứng.
