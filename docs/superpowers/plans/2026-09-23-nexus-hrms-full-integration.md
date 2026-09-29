# Kế hoạch Hoàn thiện và Tích hợp Toàn diện Hệ thống NEXUS HRMS (Local Execution)

> **Dành cho kỹ sư & agent thực thi:** BẮT BUỘC TUÂN THỦ: Giữ toàn bộ mã nguồn trên máy cục bộ, **TUYỆT ĐỐI KHÔNG PUSH LÊN GITHUB**. Kiểm thử toàn diện tại local trước khi bàn giao.
> **Mục tiêu:** Hoàn thiện 5 Phase tích hợp: Bổ sung Seed Data vào PostgreSQL, nâng cấp logic Backend (tính lương theo chấm công thật, tạo task mới, trả leave_balance), nối API cho 4 màn hình Frontend trọng yếu (Nghỉ phép, Lương, Dự án/Kanban, Dashboard), và lưu phiên làm việc Auth khi F5.
> **Kiến trúc:** React 18 + Vite + TailwindCSS (Frontend) <---> Express.js REST API (Backend) <---> PostgreSQL 14/16 (Database).
> **Spec tham chiếu:** `HUONG_DAN_KIEN_TRUC_VA_DAC_TA_HE_THONG_HRMS.md`

## Ràng buộc Toàn cục (Global Constraints)
1. **KHÔNG PUSH CODE LÊN REMOTE GITHUB**: Không thực hiện bất kỳ lệnh `git push` nào. Toàn bộ thay đổi lưu trữ trên ổ đĩa máy tính cục bộ của người dùng (`C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST`).
2. **Khả năng tương thích ngược (Graceful Fallback)**: Mọi màn hình Frontend khi kết nối API nếu Backend chưa bật hoặc có lỗi mạng đều phải tự động fallback về Mock Data để không bao giờ bị crash trắng trang khi demo.
3. **Cơ chế xác thực**: Sử dụng `Authorization: Bearer <token>` thông qua `src/services/api.js`.
4. **Chuẩn mã hóa**: Backend dùng `bcryptjs` salt 10, CSDL dùng extension `pgcrypto`.

---

### Task 1: Bổ sung Seed Data vào Database PostgreSQL (Phase 1)
**Files:**
- Modify: `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST\database\schema.sql:900-933`
- Create: `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST\Backend\scripts\seed-missing-data.js`

**Interfaces:**
- Input: Bảng `leave_requests`, `payroll_periods`, `payslips`, `notifications` đang có 0 bản ghi.
- Output: Nạp dữ liệu mẫu cho các bảng trên, đảm bảo tính liên kết khóa ngoại với 14 nhân viên và 4 tài khoản demo.

- [ ] **Step 1: Tạo script nạp Seed Data cho 4 bảng còn thiếu**
Tạo file `Backend/scripts/seed-missing-data.js` kết nối `pg` pool và chèn dữ liệu mẫu cho:
1. `leave_requests`: 3 đơn xin nghỉ phép (1 đơn chờ Trưởng phòng duyệt, 1 đơn chờ HR duyệt, 1 đơn đã duyệt).
2. `payroll_periods`: 2 kỳ lương (Tháng 2026-08 trạng thái `DA_CHOT`, Tháng 2026-09 trạng thái `DU_THAO`).
3. `payslips`: 14 phiếu lương chi tiết cho tháng 2026-08.
4. `notifications`: 5 thông báo mẫu theo role.

- [ ] **Step 2: Chạy script nạp dữ liệu và kiểm tra kết quả**
Run: `node C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST\Backend\scripts\seed-missing-data.js`
Expected: In ra kết quả chèn thành công các bản ghi, không gặp lỗi foreign key.

- [ ] **Step 3: Cập nhật seed data vào cuối file `database/schema.sql`**
Thêm các câu lệnh SQL INSERT tương ứng vào cuối file `schema.sql` trước câu lệnh `REFRESH MATERIALIZED VIEW` để khi dựng lại database từ đầu luôn có sẵn dữ liệu.

---

### Task 2: Nâng cấp Backend API (Phase 2)
**Files:**
- Modify: `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST\Backend\routes\employees.js:70-93`
- Modify: `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST\Backend\routes\payroll.js:145-185`
- Modify: `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST\Backend\routes\projects.js:90-133`

**Interfaces:**
- `GET /api/employees`: Trả về thêm trường `leave_balance` cho từng nhân viên.
- `POST /api/payroll/calculate`: Truy vấn bảng `attendance_logs` để đếm số ngày công thực tế `actual_work_days` và `ot_hours` thay vì fix cứng số 22.
- `POST /api/projects/:id/tasks`: Tạo task mới cho dự án.

- [ ] **Step 1: Cập nhật `GET /api/employees` trả về `leave_balance`**
Thêm `LEFT JOIN leave_balances lb ON lb.employee_id = e.id AND lb.year = EXTRACT(YEAR FROM CURRENT_DATE) AND lb.leave_type_id = 'LT-AL'` và `COALESCE(lb.remaining_days, 12) AS leave_balance`.

- [ ] **Step 2: Cập nhật `POST /api/payroll/calculate` tính công từ `attendance_logs`**
Trong vòng lặp nhân viên tại `Backend/routes/payroll.js`, truy vấn:
```javascript
const { rows: attRows } = await client.query(`
  SELECT 
    COUNT(*) FILTER (WHERE status != 'VANG_KHONG_PHEP') AS work_days,
    COALESCE(SUM(ot_hours), 0) AS total_ot
  FROM attendance_logs
  WHERE employee_id = $1 AND TO_CHAR(work_date, 'YYYY-MM') = $2
`, [emp.id, period]);
const actualWorkDays = parseInt(attRows[0]?.work_days) > 0 ? parseInt(attRows[0]?.work_days) : 22;
const otHours = parseFloat(attRows[0]?.total_ot) || 0;
```
Tính `gross` dựa trên `actualWorkDays` và phụ cấp `otHours * (base / 22 / 8 * 1.5)`.

- [ ] **Step 3: Thêm endpoint `POST /api/projects/:id/tasks` trong `Backend/routes/projects.js`**
Hỗ trợ tạo task mới với `title`, `description`, `assignee_id`, `deadline`, `priority`, `kpi_weight`, `estimated_hours`. Tự sinh mã `TSK-XXX` kế tiếp.

- [ ] **Step 4: Kiểm thử các endpoint backend bằng script kiểm tra**
Viết script test nhỏ hoặc chạy gọi API để verify các endpoint phản hồi HTTP 200/201.

---

### Task 3: Đấu nối Frontend - Luồng Quản lý Nghỉ phép (Phase 3.1)
**Files:**
- Modify: `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST\FrontEnd\src\pages\Page6_LeaveManagement.jsx`
- Modify: `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST\FrontEnd\src\modals\page6\Modal6D_CreateLeaveRequest.jsx`

**Interfaces:**
- Consumes: `leaveService.getAll()`, `leaveService.approve(id)`, `leaveService.reject(id, note)`, `leaveService.submit(data)` từ `src/services/leaveService.js`.
- Produces: Màn hình hiển thị danh sách đơn nghỉ phép thật từ PostgreSQL, thao tác duyệt/từ chối gọi API cập nhật trạng thái và trừ quỹ phép tức thì, nộp đơn lưu vào database.

- [ ] **Step 1: Tích hợp `leaveService.getAll()` vào `Page6_LeaveManagement.jsx`**
Import `leaveService`. Trong `useEffect`, gọi `leaveService.getAll()`. Nếu thành công, set danh sách vào state `requests`. Nếu lỗi (backend chưa bật), tự động fallback sang `mockLeaveRequests`.

- [ ] **Step 2: Tích hợp duyệt/từ chối gọi `leaveService.approve` và `leaveService.reject`**
Thay thế logic cập nhật state thuần túy bằng hàm bất đồng bộ gọi API backend. Bắn pháo hoa confetti khi duyệt thành công và refresh lại danh sách.

- [ ] **Step 3: Tích hợp `Modal6D_CreateLeaveRequest.jsx` với `leaveService.submit`**
Khi người dùng bấm "Nộp đơn xin nghỉ", đóng gói payload (`leave_type_id`, `start_date`, `end_date`, `total_days`, `reason`) và gọi `leaveService.submit(payload)`.

---

### Task 4: Đấu nối Frontend - Luồng Bảng Lương (Phase 3.2)
**Files:**
- Modify: `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST\FrontEnd\src\pages\Page7_Payroll.jsx`

**Interfaces:**
- Consumes: `payrollService.getPeriods()`, `payrollService.getPayslips({ period_id })`, `payrollService.calculate(period)` từ `src/services/payrollService.js`.
- Produces: Bảng lương hiển thị số liệu thực tế từ PostgreSQL; nút "Duyệt chi & Chốt lương" / "Tính lại lương" gọi API thật.

- [ ] **Step 1: Tích hợp `payrollService` vào `Page7_Payroll.jsx`**
Tải danh sách kỳ lương (`getPeriods`) và phiếu lương chi tiết (`getPayslips`) trong `useEffect`. Map dữ liệu vào state bảng biểu; fallback sang `mockPayrollSummary` nếu API thất bại.

- [ ] **Step 2: Nối nút tính toán / duyệt lương gọi `payrollService.calculate`**
Thực hiện gọi API tính lương tháng mới và cập nhật lại bảng số liệu.

---

### Task 5: Đấu nối Frontend - Luồng Quản lý Dự án & Kanban (Phase 3.3)
**Files:**
- Modify: `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST\FrontEnd\src\pages\Page9_ProjectsTasks.jsx`
- Modify: `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST\FrontEnd\src\services\projectService.js`

**Interfaces:**
- Consumes: `projectService.getAll()`, `projectService.getTasks(projectId)`, `projectService.updateTaskStage(taskId, stage)`, `projectService.createTask(projectId, taskData)`.
- Produces: Danh sách dự án và các cột Kanban hiển thị task thật từ PostgreSQL; khi kéo thả task hoặc đổi stage, gọi PATCH lưu vào database.

- [ ] **Step 1: Bổ sung `createTask` vào `FrontEnd/src/services/projectService.js`**
Thêm hàm `createTask: (projectId, data) => api.post(`/projects/${projectId}/tasks`, data)`.

- [ ] **Step 2: Tích hợp `projectService` vào `Page9_ProjectsTasks.jsx`**
Fetch danh sách dự án và tasks của dự án hiện tại từ API; khi di chuyển task giữa các cột Kanban (`todo` -> `in_progress` -> `review` -> `done`), gọi `projectService.updateTaskStage(taskId, newStage)`.

---

### Task 6: Đấu nối Frontend - Luồng Dashboard (Phase 3.4) & Auth Persistence (Phase 4)
**Files:**
- Modify: `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST\FrontEnd\src\pages\Page2_Dashboard.jsx`
- Modify: `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST\FrontEnd\src\context\AuthContext.jsx`
- Modify: `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST\FrontEnd\src\modals\ModalContainer.jsx`

**Interfaces:**
- `Page2_Dashboard`: Tải KPIs tổng hợp từ `dashboardService.getStats()`.
- `AuthContext`: Khởi tạo role từ `localStorage.getItem('nexus_role_key')` và lưu lại khi `switchRole`, giúp F5 không bị mất phiên.
- `ModalContainer`: Đăng ký bổ sung `Modal4G_ContractPdfPreview`.

- [ ] **Step 1: Cập nhật `AuthContext.jsx` lưu session vào `localStorage`**
Đọc role từ storage khi mount; ghi role vào storage khi chuyển đổi.

- [ ] **Step 2: Đăng ký `Modal4G_ContractPdfPreview` vào `ModalContainer.jsx`**
Import và thêm nhánh hiển thị `activeModal === 'modal4G'` trong `ModalContainer`.

- [ ] **Step 3: Nối `dashboardService.getStats()` vào `Page2_Dashboard.jsx`**
Lấy dữ liệu thống kê từ Materialized View `mv_dashboard_stats` khi màn hình khởi tạo.

---

### Task 7: Kiểm thử Tổng hợp Hệ thống Cục bộ (Verification)
**Files:**
- Test command: Frontend Build & Backend Smoke Test

- [ ] **Step 1: Kiểm thử Backend với Database**
Khởi động Backend server và chạy smoke test: `npm run test:smoke` trong `Backend/`.
Verify: 100% endpoint `/api/health`, `/api/employees`, `/api/leaves`, `/api/payroll/periods`, `/api/projects` trả về status 200 OK.

- [ ] **Step 2: Kiểm thử Frontend Build**
Chạy `npm run build` trong `FrontEnd/`.
Verify: Không có lỗi TypeScript/JSX cú pháp, bundle thành công không cảnh báo lỗi nghiêm trọng.

- [ ] **Step 3: Xác nhận không có thao tác đẩy Git lên Remote**
Kiểm tra `git status` đảm bảo không chạy `git push`. Toàn bộ code giữ nguyên vẹn trên máy cục bộ để người dùng kiểm tra trước.
