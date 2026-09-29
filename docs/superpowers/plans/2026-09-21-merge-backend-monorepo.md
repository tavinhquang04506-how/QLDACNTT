# Kế hoạch Triển khai: Hợp nhất Backend vào NEXUS HRMS Monorepo

> **Dành cho Agent/Subagent:** QUY TẮC BẮT BUỘC: TUYỆT ĐỐI KHÔNG CHẠY `git push`. Không đẩy bất kỳ commit nào lên remote GitHub để người dùng tự nghiệm thu trên local trước.
> **Kỹ năng thực thi:** superpowers:subagent-driven-development (phân bổ từng subagent theo từng task và nghiệm thu giữa các task).

**Mục tiêu:** Di chuyển phân hệ Express.js `backend` vào thư mục `Backend/` của `QLDACNTT_THUC_HIEN_LAM_TEST`, thiết lập Monorepo với root `package.json` (chạy song song Backend :8000 & Frontend :3000 bằng 1 lệnh `npm run dev`), tạo các công cụ kiểm tra tự động Database / API và hoàn thiện tài liệu hướng dẫn README.md.

**Kiến trúc:** Cấu trúc Fullstack Monorepo tiêu chuẩn với `Backend/` (Express API), `FrontEnd/` (React + Vite), `database/` (PostgreSQL 20 bảng), điều phối qua `concurrently` tại root, bảo đảm frontend gọi API qua cấu hình môi trường và JWT authentication thông suốt.

**Tech Stack:** Node.js (v18+), Express 4, PostgreSQL (pg driver), React 18, Vite 5, TailwindCSS, Concurrently.

**Tài liệu Spec liên kết:** [docs/superpowers/specs/2026-09-21-merge-backend-monorepo-design.md](../specs/2026-09-21-merge-backend-monorepo-design.md)

## Ràng buộc Toàn cục (Global Constraints)
- **RÀNG BUỘC TỐI THƯỢNG:** TUYỆT ĐỐI KHÔNG ĐƯỢC CHẠY LỆNH `git push`. Không đẩy code lên GitHub dưới bất kỳ hình thức nào.
- Chỉ thực hiện sửa đổi trên máy local của người dùng tại `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST`.
- Đảm bảo Backend giữ nguyên các route và middleware sẵn có, chạy trên port 8000.
- Đảm bảo FrontEnd giữ nguyên giao diện người dùng, dev server chạy trên port 3000.
- Giữ bảo mật thông tin mật khẩu trong `.env`, chỉ đưa placeholder mẫu vào `.env.example`.

---

### Task 1: Subagent 1 — Workspace Migration & Monorepo Root Setup

**Thư mục & File tác động:**
- Di chuyển: `C:\TepD\HUTECH\QLDA\backend` → `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST\Backend`
- Tạo mới: `QLDACNTT_THUC_HIEN_LAM_TEST/package.json`
- Cập nhật: `QLDACNTT_THUC_HIEN_LAM_TEST/.gitignore`
- Tạo mới: `QLDACNTT_THUC_HIEN_LAM_TEST/Backend/.env.example`
- Tạo mới: `QLDACNTT_THUC_HIEN_LAM_TEST/FrontEnd/.env.example`

**Giao diện:**
- Đầu vào: Thư mục `backend` bên ngoài với đầy đủ `server.js`, `db.js`, `routes/`, `middleware/`, `package.json`.
- Đầu ra: Thư mục `Backend/` hoàn chỉnh bên trong `QLDACNTT_THUC_HIEN_LAM_TEST/`, root `package.json` có `concurrently` và các scripts `install:all`, `dev`, `dev:backend`, `dev:frontend`, `db:test`, `test:smoke`.

- [ ] **Bước 1.1: Di chuyển thư mục `backend` vào `QLDACNTT_THUC_HIEN_LAM_TEST/Backend`**
  - Thực hiện di chuyển toàn bộ thư mục (bao gồm cả `node_modules`, `routes`, `middleware`, `.env`, `package.json`, `server.js`, `db.js`).
  - Kiểm tra đảm bảo thư mục nguồn `C:\TepD\HUTECH\QLDA\backend` đã được di chuyển gọn gàng.

- [ ] **Bước 1.2: Tạo file `QLDACNTT_THUC_HIEN_LAM_TEST/package.json`**
  - Khai báo root package.json:
  ```json
  {
    "name": "nexus-hrms-monorepo",
    "version": "1.0.0",
    "description": "NEXUS HRMS — Fullstack Enterprise HR Management System",
    "private": true,
    "scripts": {
      "install:all": "npm install && npm install --prefix Backend && npm install --prefix FrontEnd",
      "dev": "concurrently -n \"BACKEND,FRONTEND\" -c \"blue,green\" \"npm run dev:backend\" \"npm run dev:frontend\"",
      "dev:backend": "npm run dev --prefix Backend",
      "dev:frontend": "npm run dev --prefix FrontEnd",
      "build:frontend": "npm run build --prefix FrontEnd",
      "db:test": "npm run db:test --prefix Backend",
      "test:smoke": "npm run test:smoke --prefix Backend"
    },
    "devDependencies": {
      "concurrently": "^8.2.2"
    }
  }
  ```

- [ ] **Bước 1.3: Cài đặt `concurrently` tại root**
  - Chạy `npm install` tại thư mục root `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST`.

- [ ] **Bước 1.4: Cập nhật `.gitignore` tại root**
  - Đảm bảo ignore `node_modules/`, `**/node_modules/`, `.env`, `**/.env`, `dist/`, `*.log`.

- [ ] **Bước 1.5: Tạo file mẫu môi trường**
  - Tạo `Backend/.env.example` với các biến `PORT=8000`, `DB_HOST=127.0.0.1`, `DB_PORT=5432`, `DB_NAME=nexus_hrms`, `DB_USER=postgres`, `DB_PASSWORD=your_password`, `JWT_SECRET=nexus_hrms_jwt_secret_key_2026_fwb`, `FRONTEND_URL=http://localhost:3000`.
  - Tạo `FrontEnd/.env.example` với `VITE_API_URL=http://localhost:8000/api`.

- [ ] **Bước 1.6: Kiểm chứng Task 1**
  - Kiểm tra sự tồn tại của `QLDACNTT_THUC_HIEN_LAM_TEST/Backend/server.js`.
  - Kiểm tra chạy `npm --version` và file `package.json` tại root hợp lệ.

---

### Task 2: Subagent 2 — Backend & Database Alignment & Automated Test Scripts

**Thư mục & File tác động:**
- Tạo mới: `QLDACNTT_THUC_HIEN_LAM_TEST/Backend/scripts/test-db.js`
- Tạo mới: `QLDACNTT_THUC_HIEN_LAM_TEST/Backend/scripts/smoke-test.js`
- Cập nhật: `QLDACNTT_THUC_HIEN_LAM_TEST/Backend/package.json`
- Kiểm tra: `QLDACNTT_THUC_HIEN_LAM_TEST/Backend/db.js`

**Giao diện:**
- Đầu vào: Cấu trúc cơ sở dữ liệu `database/schema.sql` (20 bảng) và cấu hình `Backend/.env`.
- Đầu ra: Bộ scripts kiểm tra kết nối DB và tự động test API endpoints mà không cần mở Postman hay thao tác tay.

- [ ] **Bước 2.1: Tạo `Backend/scripts/test-db.js`**
  - Kết nối PostgreSQL qua `db.js`.
  - Đếm và liệt kê các bảng trong schema `public`.
  - So sánh với danh sách 20 bảng cốt lõi (`employees`, `departments`, `attendance_logs`, `leave_requests`, `payroll_runs`, `projects`, `tasks`, ...).
  - Xuất ra màn hình terminal báo cáo trạng thái trực quan: Bảng nào đã sẵn sàng, tổng số bảng và thông tin phiên bản PostgreSQL.

- [ ] **Bước 2.2: Tạo `Backend/scripts/smoke-test.js`**
  - Kiểm tra trạng thái HTTP của Backend:
    1. Kiểm tra health check: `GET http://localhost:8000/api/health`.
    2. Kiểm tra danh mục routes: `GET http://localhost:8000/api`.
    3. Kiểm tra đăng nhập tài khoản test: `POST http://localhost:8000/api/auth/login` với `{ email: "admin@nexus.vn", password: "password123" }` hoặc password mẫu trong schema.
    4. Kiểm tra lấy thông tin profile cá nhân bằng JWT token vừa nhận: `GET http://localhost:8000/api/auth/me`.
    5. Kiểm tra lấy danh sách nhân viên: `GET http://localhost:8000/api/employees`.
  - In kết quả PASS / FAIL chi tiết kèm thời gian phản hồi (ms).

- [ ] **Bước 2.3: Cập nhật `Backend/package.json` scripts**
  - Thêm scripts:
    ```json
    "db:test": "node scripts/test-db.js",
    "test:smoke": "node scripts/smoke-test.js"
    ```

- [ ] **Bước 2.4: Kiểm chứng Task 2**
  - Chạy `npm run db:test --prefix Backend` (kiểm tra script chạy được, xử lý tốt kể cả khi PostgreSQL chưa bật hoặc đã bật).
  - Verify không có lỗi cú pháp JS trong thư mục `Backend/scripts/`.

---

### Task 3: Subagent 3 — Frontend API Alignment & Fullstack Documentation

**Thư mục & File tác động:**
- Kiểm tra & đồng bộ: `QLDACNTT_THUC_HIEN_LAM_TEST/FrontEnd/.env`
- Kiểm tra: `QLDACNTT_THUC_HIEN_LAM_TEST/FrontEnd/src/services/api.js`
- Viết lại toàn diện: `QLDACNTT_THUC_HIEN_LAM_TEST/README.md`

**Giao diện:**
- Đầu vào: Toàn bộ hệ sinh thái Fullstack đã được gộp.
- Đầu ra: File `README.md` toàn diện và chuẩn mực cho giảng viên/thành viên dự án, FrontEnd trỏ chính xác vào Backend Port 8000.

- [ ] **Bước 3.1: Kiểm tra cấu hình kết nối API ở FrontEnd**
  - Đảm bảo file `FrontEnd/.env` chứa `VITE_API_URL=http://localhost:8000/api`.
  - Kiểm tra các hàm trong `FrontEnd/src/services/` (authService, employeeService, attendanceService, leaveService, payrollService, projectService, dashboardService) tương ứng 1-1 với các route của Backend.

- [ ] **Bước 3.2: Soạn thảo toàn diện `QLDACNTT_THUC_HIEN_LAM_TEST/README.md`**
  - Nội dung gồm:
    1. Giới thiệu dự án NEXUS HRMS (Fullstack Solution).
    2. Cây thư mục dự án Monorepo rõ ràng.
    3. Yêu cầu môi trường (Node.js v18+, PostgreSQL 16).
    4. Hướng dẫn cài đặt nhanh chỉ với 1 câu lệnh: `npm run install:all`.
    5. Hướng dẫn thiết lập Database từ file `database/schema.sql`.
    6. Hướng dẫn khởi chạy đồng thời Fullstack bằng 1 lệnh: `npm run dev`.
    7. Danh mục tài khoản test phân quyền mẫu:
       - CEO: `admin@nexus.vn` / mật khẩu mặc định
       - Trưởng phòng: `manager@nexus.vn`
       - Nhân viên: `employee@nexus.vn`
    8. Hướng dẫn chạy các công cụ kiểm tra tự động (`npm run db:test`, `npm run test:smoke`).

- [ ] **Bước 3.3: Kiểm chứng Task 3**
  - Xem lại cấu trúc và nội dung [README.md](README.md), bảo đảm không có đường dẫn hỏng hoặc thông tin sai lệch.

---

### Task 4: Parent Agent — Tích hợp Tổng thể & Smoke Test Local (KHÔNG PUSH GIT)

**Thư mục tác động:** Toàn bộ thư mục `QLDACNTT_THUC_HIEN_LAM_TEST`
- [ ] **Bước 4.1: Chạy `npm run install:all` để kiểm tra độ tương thích dependencies**
- [ ] **Bước 4.2: Kiểm tra trạng thái Git local bằng `git status`**
  - Xác nhận toàn bộ file mới nằm trong Git working tree.
  - **LƯU Ý NGHIÊM NGẶT:** Tuyệt đối KHÔNG chạy `git push origin ...`.
- [ ] **Bước 4.3: Bàn giao và hướng dẫn người dùng tự kiểm thử trên máy local**
