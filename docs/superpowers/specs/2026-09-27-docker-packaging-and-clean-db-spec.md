# Thiết Kế Đóng Gói Docker & Khởi Tạo Database Sạch (Super Admin)

**Ngày lập:** 27/09/2026  
**Trạng thái:** Chờ phê duyệt (Spec Review)  
**Phạm vi:** Container hóa toàn bộ hệ thống (Frontend, Backend, PostgreSQL), cung cấp cả profile Production và Development, đồng thời dọn sạch dữ liệu demo và tạo duy nhất 1 tài khoản Admin tổng.

---

## 1. Mục Tiêu & Yêu Cầu

### Mục tiêu chính (Goals):
1. **Đóng gói Docker chuẩn Production (`docker-compose.yml`):**
   - **Frontend:** Multi-stage build (Node.js 20 Alpine build bundle -> Nginx Alpine phục vụ static asset + Reverse Proxy API).
   - **Backend:** Node.js 20 Alpine tối ưu, chạy non-root user, bảo mật và nhẹ.
   - **Database:** PostgreSQL 16 Alpine với volume lưu trữ dữ liệu bền vững (`persistent volume`).
   - Khởi động 1 lệnh duy nhất: `docker compose up -d`.
2. **Đóng gói Docker chuẩn Development (`docker-compose.dev.yml`):**
   - Hỗ trợ bind-mount source code trực tiếp từ máy chủ vào container.
   - Hot-reload tức thì cho cả Frontend (Vite HMR) và Backend (`node --watch`).
3. **Cơ sở dữ liệu sạch (Clean Database) & Tài khoản Admin Tổng:**
   - Xóa bỏ toàn bộ dữ liệu mock/demo cũ (không còn các nhân viên mẫu NV-0842, hồ sơ mẫu, dữ liệu giả lập).
   - Khởi tạo đầy đủ 20 bảng cơ sở dữ liệu và 5 vai trò hệ thống (`CEO`, `HR_DIRECTOR`, `LINE_MANAGER`, `EMPLOYEE`, `KIOSK`).
   - Tạo duy nhất 1 tài khoản **Super Admin (Admin Tổng)** có toàn quyền tối cao trên toàn hệ thống:
     - **Email:** `admin@fwbnexus.vn` (hoặc cấu hình qua biến môi trường)
     - **Mật khẩu:** `Admin@2026!` (mã hóa bcrypt bảo mật)
     - **Vai trò:** `CEO` (vai trò cao nhất trong ma trận quyền NEXUS HRMS, xem và quản trị toàn bộ phân hệ: nhân sự, chấm công, bảng lương, dự án, phân tích rủi ro, phân quyền tài khoản).

---

## 2. Kiến Trúc Chi Tiết Các Containers

```
                         [ TRÌNH DUYỆT NGƯỜI DÙNG ]
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────────┐
        │  CỔNG TRUY CẬP: http://localhost:3000                  │
        │                                                        │
        │  [ FRONTEND CONTAINER - Nginx Alpine ]                 │
        │  • Phục vụ Static Files (HTML/JS/CSS từ Vite Build)   │
        │  • SPA Routing Fallback (try_files $uri /index.html)   │
        │  • Reverse Proxy: location /api/ ──┐                   │
        └────────────────────────────────────┼───────────────────┘
                                             │ (Internal Network: nexus-net)
                                             ▼
        ┌────────────────────────────────────────────────────────┐
        │  [ BACKEND CONTAINER - Node.js Express ]               │
        │  • Port nội bộ: 8000 (Exposed ra máy chủ: 8000)        │
        │  • Healthcheck: GET /api/health                        │
        │  • Kết nối Database: postgres:5432                    │
        └────────────────────────────────────┼───────────────────┘
                                             │
                                             ▼
        ┌────────────────────────────────────────────────────────┐
        │  [ DATABASE CONTAINER - PostgreSQL 16 Alpine ]         │
        │  • Port: 5432                                          │
        │  • Volume: nexus-db-data (Lưu trữ vĩnh viễn)           │
        │  • Auto-init: init-clean-db.sql (Schema + Super Admin) │
        └────────────────────────────────────────────────────────┘
```

---

## 3. Quy Cách Từng Tệp Tin (File Specifications)

### 3.1. `FrontEnd/Dockerfile` (Production)
- **Stage 1 (Builder):**
  - Base: `node:20-alpine`
  - Copy `package.json`, `package-lock.json` -> `npm ci`
  - Copy mã nguồn Frontend -> `npm run build` -> tạo thư mục `dist/`.
- **Stage 2 (Runtime):**
  - Base: `nginx:1.27-alpine`
  - Copy `dist/` vào `/usr/share/nginx/html`
  - Copy file cấu hình `FrontEnd/nginx.conf` vào `/etc/nginx/conf.d/default.conf`
  - Chạy `nginx -g 'daemon off;'` trên port 80 (được map ra port 3000 ở host).

### 3.2. `FrontEnd/nginx.conf`
- Xử lý Single Page Application (SPA): `try_files $uri $uri/ /index.html;` để khi reload trang không bị lỗi 404.
- Reverse proxy chuyển tiếp toàn bộ request `/api/` tới container backend:
  ```nginx
  location /api/ {
      proxy_pass http://backend:8000/api/;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
  }
  ```
- Nén Gzip các file tĩnh (js, css, json, svg).

### 3.3. `FrontEnd/Dockerfile.dev` (Development)
- Base: `node:20-alpine`
- Chạy Vite server với cờ `--host 0.0.0.0 --port 3000`
- Cho phép mount thư mục mã nguồn từ máy chủ để Hot-Module-Replacement (HMR).

### 3.4. `Backend/Dockerfile` (Production)
- Base: `node:20-alpine`
- Cài đặt `dumb-init` xử lý tín hiệu tiến trình PID 1 chuẩn container.
- Tạo user non-root `nodejs` tăng cường bảo mật.
- Copy mã nguồn Backend, cài đặt dependencies sạch với `npm ci --omit=dev`.
- Healthcheck endpoint kiểm tra định kỳ `curl -f http://localhost:8000/api/health`.

### 3.5. `Backend/Dockerfile.dev` (Development)
- Base: `node:20-alpine`
- Mount source code Backend và chạy lệnh `npm run dev` (`node --watch server.js`).

### 3.6. Script Khởi Tạo DB Sạch (`database/docker-init/01-init-clean-db.sql`)
- Tự động chạy khi PostgreSQL container khởi tạo lần đầu thông qua thư mục `/docker-entrypoint-initdb.d/`:
  1. Tạo toàn bộ 20 bảng cơ sở dữ liệu chuẩn theo `database/schema.sql` (bảng trống hoàn toàn, không có dữ liệu nhân viên/bảng lương/nghỉ phép demo).
  2. Nạp 5 vai trò hệ thống (`roles`).
  3. Tạo 1 phòng ban gốc: `Ban Giám Đốc & Điều Hành` (`id: DEPT-EXEC`).
  4. Tạo 1 chức danh gốc: `Tổng Giám Đốc / Super Admin` (`id: POS-CEO`).
  5. Tạo 1 hồ sơ nhân viên gốc:
     - `id: NV-0001`
     - `full_name: Quản Trị Viên Hệ Thống`
     - `work_email: admin@fwbnexus.vn`
     - `role: CEO`
  6. Tạo 1 tài khoản đăng nhập `users`:
     - `email: admin@fwbnexus.vn`
     - `password_hash`: bcrypt hash của mật khẩu `Admin@2026!`
     - Gán role `CEO` trong bảng `user_roles`.

### 3.7. `docker-compose.yml` (Production Profile)
- Định nghĩa 3 dịch vụ: `db`, `backend`, `frontend`.
- Tự động thiết lập thứ tự khởi động: `db` healthy -> `backend` khởi động -> `frontend` khởi động.
- Biến môi trường kết nối nội bộ đồng bộ (`DB_HOST=db`, `DB_PORT=5432`, `DB_NAME=nexus_hrms`, `DB_USER=postgres`, `DB_PASSWORD=nexus_secure_pass_2026`).

### 3.8. `docker-compose.dev.yml` (Development Profile)
- Hỗ trợ mount volumes:
  - `./Backend:/app`
  - `./FrontEnd:/app` (bỏ qua `node_modules` bằng anonymous volume)
- Hot reload cả client lẫn server.

---

## 4. Kế Hoạch Kiểm Thử & Nghiệm Thu (Verification Plan)

1. **Kiểm tra cú pháp & tính tương thích Docker:**
   - Kiểm tra `docker-compose.yml` và `docker-compose.dev.yml` bằng `docker compose config` (khi Docker daemon khả dụng).
2. **Kiểm tra tính sạch của Database:**
   - Đảm bảo script SQL không còn bất kỳ dòng `INSERT` nào chứa nhân viên giả lập từ demo cũ.
   - Tài khoản `admin@fwbnexus.vn` được khởi tạo thành công với mật khẩu hash hợp lệ.
3. **Kiểm tra Reverse Proxy & SPA Routing:**
   - Xác nhận file cấu hình Nginx chuyển tiếp đúng `/api/` tới Backend và fallback về `index.html` cho các route như `/directory`, `/attendance`, `/tasks`.
4. **Tài liệu hướng dẫn triển khai:**
   - Cung cấp tài liệu `docs/docker-deployment-guide.md` chi tiết các lệnh chạy, kiểm tra log, backup dữ liệu, và đăng nhập quản trị.
