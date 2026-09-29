# Kế Hoạch Đóng Gói Docker & Khởi Tạo Database Sạch Cho NEXUS HRMS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đóng gói toàn bộ hệ thống NEXUS HRMS (Frontend Vite/React, Backend Express, PostgreSQL 16) vào Docker với 2 cấu hình Production và Development (Hot-Reload), đồng thời dọn sạch dữ liệu demo và tạo 1 tài khoản Super Admin duy nhất.

**Architecture:** Sử dụng kiến trúc 3 containers kết nối qua mạng nội bộ bridge (`nexus-network`): Container Frontend (Nginx Alpine reverse proxy + static SPA), Container Backend (Node.js 20 Alpine non-root), và Container Database (PostgreSQL 16 Alpine với persistent volume). Khởi tạo DB sạch với script SQL tự động seed 1 tài khoản Super Admin có vai trò CEO tối cao.

**Tech Stack:** Docker, Docker Compose, Nginx Alpine, Node.js 20 Alpine, PostgreSQL 16 Alpine, Bcrypt, Vite.

**Spec:** `docs/superpowers/specs/2026-09-27-docker-packaging-and-clean-db-spec.md`

## Global Constraints
- Frontend Nginx phải hỗ trợ SPA routing (`try_files $uri $uri/ /index.html`) tránh 404 khi người dùng tải lại trang.
- Frontend reverse proxy phải chuyển tiếp `/api/` trong suốt sang container backend cổng 8000.
- Database volume phải được đặt tên (`nexus-db-data`) để dữ liệu không bị mất khi stop/recreate container.
- Không để sót bất kỳ nhân viên demo giả lập nào trong script khởi tạo database mới.
- Mật khẩu tài khoản Super Admin phải được mã hóa chuẩn bcrypt hash trong database.

## Review Focus
- Dockerfile bảo mật: Backend chạy dưới user non-root `nodejs` thay vì root.
- Cấu hình mạng: `docker-compose` phải có dependency `depends_on` với condition `service_healthy` cho database trước khi backend khởi động.
- Development profile: `docker-compose.dev.yml` phải mount volumes cho phép sửa code trực tiếp mà không cần build lại image.
- Xử lý PID 1: Backend Dockerfile sử dụng `dumb-init` để nhận tín hiệu SIGTERM/SIGINT thoát sạch (graceful shutdown).
- Port mapping: Production map Frontend ra `3000`, Backend ra `8000`, Postgres ra `5432`.

---

### Task 1: Script Khởi Tạo Database Sạch & Tài Khoản Super Admin

**Files:**
- Create: `database/docker-init/01-init-clean-db.sql`
- Create: `Backend/scripts/hash-password.js`
- Test: Kiểm tra cú pháp SQL và tính hợp lệ của hash bcrypt

- [x] **Step 1:** Tạo helper script `Backend/scripts/hash-password.js` sử dụng bcryptjs để tạo hash chuẩn cho mật khẩu `Admin@2026!`.
- [x] **Step 2:** Tạo thư mục `database/docker-init/` và tệp `01-init-clean-db.sql`.
- [x] **Step 3:** Trong `01-init-clean-db.sql`, nạp cấu trúc 20 bảng cơ sở dữ liệu từ `database/schema.sql` (bảng trống hoàn toàn, không có INSERT dữ liệu giả lập).
- [x] **Step 4:** Thêm câu lệnh khởi tạo 5 roles, 1 phòng ban mẫu (`DEPT-EXEC`), 1 chức danh (`POS-CEO`), 1 hồ sơ nhân viên (`NV-0001` - Quản Trị Viên Hệ Thống), và 1 tài khoản `users` (`admin@fwbnexus.vn`) với hash mật khẩu `Admin@2026!` gán quyền `CEO`.
- [x] **Step 5:** Commit: `git commit -m "feat(db): add clean database initialization script with super admin account"`.

---

### Task 2: Container Hóa Backend (`Dockerfile` & `Dockerfile.dev`)

**Files:**
- Create: `Backend/Dockerfile`
- Create: `Backend/Dockerfile.dev`
- Create: `Backend/.dockerignore`
- Test: Kiểm tra cấu trúc build file

- [x] **Step 1:** Tạo `Backend/.dockerignore` bỏ qua `node_modules`, `tests`, `.env`, npm logs.
- [x] **Step 2:** Tạo `Backend/Dockerfile` production:
  - Base `node:20-alpine`, cài đặt `dumb-init`.
  - Tạo group/user `nodejs:nodejs`.
  - Copy `package*.json` và cài `npm ci --omit=dev`.
  - Chạy `USER nodejs`. Expose 8000.
  - Tích hợp healthcheck `curl -f http://localhost:8000/api/health`.
- [x] **Step 3:** Tạo `Backend/Dockerfile.dev`:
  - Base `node:20-alpine`, copy source, chạy `npm run dev` (`node --watch server.js`).
- [x] **Step 4:** Commit: `git commit -m "feat(backend): add production and development Dockerfiles for backend api"`.

---

### Task 3: Container Hóa Frontend & Cấu Hình Nginx Reverse Proxy

**Files:**
- Create: `FrontEnd/nginx.conf`
- Create: `FrontEnd/Dockerfile`
- Create: `FrontEnd/Dockerfile.dev`
- Create: `FrontEnd/.dockerignore`
- Test: Kiểm tra cú pháp nginx.conf và Dockerfile

- [x] **Step 1:** Tạo `FrontEnd/.dockerignore` bỏ qua `node_modules`, `dist`, logs.
- [x] **Step 2:** Tạo `FrontEnd/nginx.conf`:
  - Cấu hình server block lắng nghe port 80.
  - Xử lý SPA: `location / { try_files $uri $uri/ /index.html; }`.
  - Reverse proxy: `location /api/ { proxy_pass http://backend:8000/api/; ... }`.
  - Kích hoạt Gzip compression cho text/css/javascript/json/svg.
- [x] **Step 3:** Tạo `FrontEnd/Dockerfile` multi-stage:
  - Stage 1 `builder`: `node:20-alpine`, chạy `npm ci` và `npm run build`.
  - Stage 2 `runtime`: `nginx:1.27-alpine`, copy `dist/` vào `/usr/share/nginx/html`, copy `nginx.conf` vào `/etc/nginx/conf.d/default.conf`.
- [x] **Step 4:** Tạo `FrontEnd/Dockerfile.dev`:
  - Base `node:20-alpine`, chạy `npm run dev -- --host 0.0.0.0 --port 3000`.
- [x] **Step 5:** Commit: `git commit -m "feat(frontend): add Nginx reverse proxy config and multi-stage Dockerfiles"`.

---

### Task 4: Cấu Hình Docker Compose (Production & Development)

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.dev.yml`
- Create: `.env.docker.example`
- Test: Kiểm tra tính hợp lệ của YAML syntax

- [x] **Step 1:** Tạo `.env.docker.example` với các biến môi trường chuẩn cho container:
  - `POSTGRES_DB=nexus_hrms`, `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=nexus_secure_pass_2026`
  - `JWT_SECRET=super_secret_jwt_key_nexus_docker_2026`
  - `PORT=8000`, `DB_HOST=db`, `DB_PORT=5432`
- [x] **Step 2:** Tạo `docker-compose.yml` (Production):
  - Service `db`: image `postgres:16-alpine`, volumes `nexus-db-data:/var/lib/postgresql/data` và `./database/docker-init:/docker-entrypoint-initdb.d:ro`, healthcheck `pg_isready`.
  - Service `backend`: build context `./Backend`, depends_on `db` healthy, network `nexus-network`.
  - Service `frontend`: build context `./FrontEnd`, depends_on `backend`, port `3000:80`.
- [x] **Step 3:** Tạo `docker-compose.dev.yml` (Development):
  - Service `db` như production.
  - Service `backend`: build `Dockerfile.dev`, bind mount `./Backend:/app`, anonymous volume `/app/node_modules`.
  - Service `frontend`: build `Dockerfile.dev`, bind mount `./FrontEnd:/app`, anonymous volume `/app/node_modules`, port `3000:3000`.
- [x] **Step 4:** Commit: `git commit -m "feat(docker): add production and development docker compose configurations"`.

---

### Task 5: Tài Liệu Hướng Dẫn Vận Hành & Khởi Động

**Files:**
- Create: `docs/docker-deployment-guide.md`
- Modify: `README.md`
- Test: Rà soát hướng dẫn và đường dẫn file

- [x] **Step 1:** Tạo `docs/docker-deployment-guide.md` trình bày chi tiết:
  - Yêu cầu cài đặt (Docker Desktop / Docker Engine).
  - Lệnh khởi động Production (`docker compose up -d`).
  - Lệnh khởi động Development (`docker compose -f docker-compose.dev.yml up -d`).
  - Lệnh xem logs (`docker compose logs -f`).
  - Thông tin tài khoản đăng nhập Super Admin và cách đổi mật khẩu.
  - Lệnh sao lưu (`docker exec db pg_dump ...`) và phục hồi dữ liệu.
- [x] **Step 2:** Cập nhật `README.md` với mục Quickstart Docker.
- [x] **Step 3:** Commit: `git commit -m "docs: add comprehensive Docker deployment and operation guide"`.

---

### Task 6: Kiểm Thử Toàn Diện & Nghiệm Thu

**Files:**
- Test: Cú pháp YAML, các Dockerfile, script SQL, và tính tương thích build Frontend.

- [x] **Step 1:** Chạy `npm run build` trong `FrontEnd` để đảm bảo code không có lỗi build ảnh hưởng đến Docker build.
- [x] **Step 2:** Chạy `npm run test:unit` trong `Backend` để đảm bảo backend hoạt động hoàn hảo.
- [x] **Step 3:** Rà soát toàn bộ cây thư mục và cấu hình Docker.
- [x] **Step 4:** Báo cáo hoàn tất tới người dùng.
