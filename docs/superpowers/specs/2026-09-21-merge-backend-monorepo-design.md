# THIẾT KẾ KIẾN TRÚC: HỢP NHẤT BACKEND VÀO DỰ ÁN NEXUS HRMS (MONOREPO)
**Mã tài liệu:** SPEC-2026-09-21-MERGE-BACKEND  
**Dự án:** NEXUS HR / FwB HRMS  
**Ngày lập:** 21/09/2026  
**Trạng thái:** Approved by User  
**Lưu ý quan trọng:** TUYỆT ĐỐI KHÔNG PUSH CODE LÊN GITHUB theo chỉ đạo trực tiếp của người dùng. Mọi thay đổi thực hiện hoàn toàn trên môi trường local để kiểm thử trước.

---

## 1. MỤC TIÊU VÀ BỐI CẢNH

### 1.1. Bối cảnh
Trước đây, thư mục mã nguồn Backend (Express.js API) nằm ở thư mục ngoài độc lập (`C:\TepD\HUTECH\QLDA\backend`), trong khi `C:\TepD\HUTECH\QLDA\QLDACNTT_THUC_HIEN_LAM_TEST` chứa phân hệ `FrontEnd` (React + Vite), `database` (PostgreSQL 20 bảng) và tài liệu đặc tả kiến trúc.

### 1.2. Mục tiêu
- Di chuyển toàn bộ thư mục `backend` vào bên trong `QLDACNTT_THUC_HIEN_LAM_TEST/Backend` để hoàn thiện cấu trúc Fullstack Monorepo duy nhất.
- Thiết lập kịch bản điều phối (orchestration) tại root `package.json` với công cụ `concurrently`, cho phép khởi chạy đồng thời Backend (Port 8000) và Frontend (Port 3000) chỉ bằng một câu lệnh `npm run dev`.
- Tự động hóa bộ công cụ kiểm thử kết nối cơ sở dữ liệu (`test-db.js`) và kiểm thử tự động API endpoints (`smoke-test.js`).
- Đảm bảo tính tương thích và liên kết mượt mà giữa `FrontEnd/src/services/` và `Backend/routes/`.
- Cập nhật toàn diện tài liệu [README.md](README.md) hướng dẫn cài đặt, cấu hình môi trường, khởi chạy và kiểm thử theo chuẩn chuyên nghiệp.
- **Ràng buộc:** Toàn bộ công việc chỉ diễn ra trên local, KHÔNG chạy lệnh `git push`.

---

## 2. KIẾN TRÚC DỰ ÁN SAU KHI HỢP NHẤT

```text
QLDACNTT_THUC_HIEN_LAM_TEST/
├── Backend/                                    # Di chuyển từ backend/ ngoài sang
│   ├── middleware/
│   │   └── auth.js                             # Xác thực JWT & phân quyền RBAC
│   ├── routes/
│   │   ├── attendance.js                       # Chấm công & ca làm
│   │   ├── auth.js                             # Đăng nhập, thông tin user
│   │   ├── dashboard.js                        # KPIs, thông báo
│   │   ├── departments.js                      # Quản lý phòng ban
│   │   ├── employees.js                        # Quản lý nhân viên
│   │   ├── leaves.js                           # Quản lý đơn nghỉ phép (2 cấp duyệt)
│   │   ├── payroll.js                          # Kỳ lương & phiếu lương
│   │   └── projects.js                         # Dự án & Kanban tasks
│   ├── scripts/
│   │   ├── test-db.js                          # Script kiểm tra kết nối PostgreSQL
│   │   └── smoke-test.js                       # Script kiểm tra tự động API endpoints
│   ├── .env                                    # Biến môi trường local (Port 8000, DB)
│   ├── .env.example                            # Mẫu biến môi trường
│   ├── db.js                                   # Pool kết nối PostgreSQL
│   ├── package.json                            # Dependencies backend
│   └── server.js                               # Express API server entrypoint
├── FrontEnd/                                   # Phân hệ giao diện người dùng
│   ├── src/
│   │   ├── components/                         # UI components dùng chung & theo phân hệ
│   │   ├── context/                            # AuthContext, NotificationContext
│   │   ├── modals/                             # Modal tương tác
│   │   ├── pages/                              # Các trang chức năng (Dashboard, Employee, Leave...)
│   │   ├── services/                           # API client (api.js, authService, etc.)
│   │   ├── utils/                              # Helpers & formatters
│   │   ├── App.jsx                             # Định tuyến React Router
│   │   └── main.jsx                            # Entry point React 18
│   ├── .env                                    # VITE_API_URL=http://localhost:8000/api
│   ├── .env.example                            # Mẫu biến môi trường frontend
│   ├── vite.config.js                          # Vite dev server (Port 3000)
│   └── package.json                            # Dependencies frontend
├── database/                                   # Phân hệ cơ sở dữ liệu
│   ├── schema.sql                              # 20 bảng PostgreSQL chuẩn hóa
│   ├── test_queries.sql                        # Kịch bản truy vấn kiểm thử
│   └── generate_erd.js                         # Sinh tài liệu ERD
├── package.json                                # (Mới) Root Monorepo Orchestrator
├── .gitignore                                  # Bỏ qua node_modules, .env, build files
├── README.md                                   # Hướng dẫn toàn diện dự án
├── BAO_CAO_TIEN_DO_VA_DAC_TA_DE_TAI_HRMS.docx
└── HUONG_DAN_KIEN_TRUC_VA_DAC_TA_HE_THONG_HRMS.md
```

---

## 3. THIẾT KẾ ĐIỀU PHỐI (ROOT PACKAGE.JSON)

Root `package.json` đóng vai trò điều phối tập trung (Monorepo orchestrator) bằng `concurrently`:

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

---

## 4. BỘ CÔNG CỤ TỰ ĐỘNG HÓA KIỂM THỬ (SCRIPTS)

### 4.1. `Backend/scripts/test-db.js`
- Đọc cấu hình từ `Backend/.env`.
- Thực hiện kết nối tới cơ sở dữ liệu PostgreSQL qua pool.
- Thực hiện truy vấn kiểm tra danh mục các bảng trong schema `public`.
- Kiểm tra sự hiện diện của 20 bảng chuẩn (bao gồm: `employees`, `departments`, `attendance_logs`, `leave_requests`, `payroll_runs`, `projects`, `tasks`, ...).
- Trả về mã thoát (exit code) 0 nếu thành công, 1 nếu thất bại kèm thông điệp hướng dẫn rõ ràng.

### 4.2. `Backend/scripts/smoke-test.js`
- Gửi HTTP request đến server Backend (mặc định: `http://localhost:8000`):
  1. `GET /api/health` -> Kỳ vọng `200 OK`, status: "OK".
  2. `GET /api` -> Kỳ vọng `200 OK`, có danh sách endpoints.
  3. `POST /api/auth/login` với tài khoản test (`admin@nexus.vn` / `123456`) -> Kỳ vọng `200 OK`, trả về `token` hợp lệ.
  4. `GET /api/auth/me` với Bearer token vừa nhận -> Kỳ vọng `200 OK`, thông tin user chính xác.
  5. `GET /api/employees` với Bearer token -> Kỳ vọng `200 OK`, danh sách nhân viên.
- In ra báo cáo kiểm thử trực quan với màu sắc trên terminal.

---

## 5. PHÂN BỔ NHIỆM VỤ 3 SUBAGENTS

### 🤖 Subagent 1: Workspace & Migration Specialist
- **Mục tiêu:** Di chuyển an toàn mã nguồn Backend vào repository, cấu hình Monorepo orchestrator.
- **Phạm vi tác vụ:**
  1. Di chuyển toàn bộ thư mục `backend` vào `QLDACNTT_THUC_HIEN_LAM_TEST/Backend` và dọn dẹp thư mục `backend` ngoài.
  2. Tạo root `package.json` với script điều phối `concurrently`.
  3. Chuẩn hóa `.gitignore` để tránh commit nhầm `node_modules` và `.env`.
  4. Tạo các file mẫu `Backend/.env.example` và `FrontEnd/.env.example`.
  5. Cài đặt dependencies cho root (`npm install`).
- **Nghiệm thu:** Thư mục `Backend/` nằm đúng vị trí trong `QLDACNTT_THUC_HIEN_LAM_TEST/`, root `package.json` hoạt động hợp lệ.

### 🤖 Subagent 2: Backend & Database Alignment Specialist
- **Mục tiêu:** Cấu hình Backend hoàn chỉnh, viết scripts kiểm tra DB và smoke test.
- **Phạm vi tác vụ:**
  1. Kiểm tra `Backend/db.js` và tính tương thích với `database/schema.sql`.
  2. Tạo thư mục `Backend/scripts/` chứa `test-db.js` và `smoke-test.js`.
  3. Cập nhật `Backend/package.json` để thêm scripts `db:test` và `test:smoke`.
  4. Chạy thử kiểm tra `test-db.js` và verify Backend server khởi động bình thường.
- **Nghiệm thu:** Các file script chạy thành công, không phát sinh lỗi cú pháp hay thiếu thư viện.

### 🤖 Subagent 3: Frontend Integration & Documentation Specialist
- **Mục tiêu:** Kiểm tra kết nối Frontend API và viết tài liệu hướng dẫn toàn diện.
- **Phạm vi tác vụ:**
  1. Kiểm tra cấu hình `FrontEnd/.env` và các services trong `FrontEnd/src/services/` đảm bảo sẵn sàng gọi API `http://localhost:8000/api`.
  2. Viết lại tài liệu `README.md` tại root đầy đủ các phần:
     - Giới thiệu tổng quan hệ thống NEXUS HR.
     - Cấu trúc thư mục Monorepo.
     - Hướng dẫn cài đặt (`npm run install:all`).
     - Hướng dẫn cấu hình môi trường `.env`.
     - Hướng dẫn chạy 1 lệnh (`npm run dev`).
     - Danh mục tài khoản kiểm thử mặc định (CEO, HR Director, Line Manager, Employee).
     - Hướng dẫn kiểm thử tự động (`npm run db:test`, `npm run test:smoke`).
- **Nghiệm thu:** `README.md` hoàn chỉnh, mạch lạc, chính xác; Frontend sẵn sàng gọi API Backend.

---

## 6. QUY TẮC AN TOÀN VÀ BẢO MẬT
- **TUYỆT ĐỐI KHÔNG PUSH LÊN GITHUB:** Không chạy lệnh `git push` ở bất kỳ bước nào.
- Giữ nguyên dữ liệu bí mật trong `.env`, chỉ đưa biến mẫu không chứa mật khẩu thực tế vào `.env.example`.
