# NEXUS HRMS — Hướng Dẫn Triển Khai & Vận Hành Docker

Tài liệu này cung cấp hướng dẫn toàn diện về cách đóng gói, khởi chạy và vận hành hệ thống **NEXUS HRMS** bằng Docker và Docker Compose.

---

## 📑 Mục Lục
1. [Tổng Quan Kiến Trúc Docker](#1-tổng-quan-kiến-trúc-docker)
2. [Yêu Cầu Môi Trường](#2-yêu-cầu-môi-trường)
3. [Tài Khoản Quản Trị Tối Cao (Super Admin)](#3-tài-khoản-quản-trị-tối-cao-super-admin)
4. [Khởi Chạy Môi Trường Production](#4-khởi-chạy-môi-trường-production)
5. [Khởi Chạy Môi Trường Development (Hot-Reload)](#5-khởi-chạy-môi-trường-development-hot-reload)
6. [Quản Lý & Giám Sát Container](#6-quản-lý--giám-sát-container)
7. [Sao Lưu & Phục Hồi Dữ Liệu (Backup & Restore)](#7-sao-lưu--phục-hồi-dữ-liệu-backup--restore)
8. [Khởi Tạo Lại Toàn Bộ Cơ Sở Dữ Liệu (Reset Clean DB)](#8-khởi-tạo-lại-toàn-bộ-cơ-sở-dữ-liệu-reset-clean-db)
9. [Xử Lý Sự Cố Thường Gặp (Troubleshooting)](#9-xử-lý-sự-cố-thường-gặp-troubleshooting)

---

## 1. Tổng Quan Kiến Trúc Docker

Hệ thống được đóng gói thành 3 container độc lập kết nối qua mạng nội bộ Docker (`nexus-network`):

```
                        [ Trình Duyệt / Client ]
                                   │
                                   ▼
                       ┌────────────────────────┐
                       │ Port 3000 (Host)       │
                       │                        │
                       │    FRONTEND (Nginx)    │
                       │  - SPA Static Files    │
                       │  - Gzip & Caching      │
                       │  - Reverse Proxy /api/ ──┐
                       └────────────────────────┘  │
                                                   │
                       ┌────────────────────────┐  │ (Nội bộ mạng docker)
                       │ Port 8000 (Host/Direct)│  │
                       │                        │  │
                       │    BACKEND (Express)   │◄─┘
                       │  - RESTful API         │
                       │  - Dumb-init process   │
                       │  - Non-root user       │
                       └───────────┬────────────┘
                                   │
                                   ▼ (Port 5432)
                       ┌────────────────────────┐
                       │    DATABASE (Postgres) │
                       │  - PostgreSQL 16 Alpine│
                       │  - Clean DB Init Seed  │
                       │  - Volume Persistent   │
                       └────────────────────────┘
```

### Các file cấu hình chính:
- `docker-compose.yml`: Cấu hình triển khai chuẩn Production (Nginx Frontend + Production Backend + Postgres).
- `docker-compose.dev.yml`: Cấu hình dành cho Lập trình viên (Mount mã nguồn trực tiếp, hỗ trợ Hot-Module Replacement cho Vite & Nodemon Backend).
- `Backend/Dockerfile`: Multi-stage / Production Dockerfile với người dùng bảo mật không đặc quyền (`nodejs`) và `dumb-init`.
- `FrontEnd/Dockerfile`: Multi-stage build (Node 20 Alpine builder -> Nginx 1.27 Alpine runner).
- `FrontEnd/nginx.conf`: Nginx reverse proxy định tuyến `/api/` thẳng sang service `backend:8000`, loại bỏ hoàn toàn lỗi CORS.
- `database/docker-init/01-init-clean-db.sql`: Kịch bản khởi tạo tự động toàn bộ 20+ bảng schema và nạp tài khoản Super Admin ban đầu.

---

## 2. Yêu Cầu Môi Trường

Trước khi bắt đầu, hãy đảm bảo máy tính của bạn đã cài đặt:
- **Docker Desktop** (trên Windows/macOS) hoặc **Docker Engine & Docker Compose v2+** (trên Linux).
- Đảm bảo Docker daemon đang chạy (`docker info` trả về thông tin thành công).
- Các cổng mạng sau trên máy host không bị chiếm dụng bởi ứng dụng khác:
  - `3000`: Dành cho Frontend Web UI.
  - `8000`: Dành cho Backend API.
  - `5432`: Dành cho PostgreSQL.

---

## 3. Tài Khoản Quản Trị Tối Cao (Super Admin)

Khi hệ thống khởi chạy lần đầu tiên với Clean Database, cơ sở dữ liệu hoàn toàn sạch sẽ (không chứa nhân viên ảo, dữ liệu chấm công mock hay yêu cầu nghỉ phép giả lập).

Chỉ tồn tại duy nhất **1 tài khoản Quản trị Tối cao (Super Admin)**:

| Thông tin | Giá trị |
| :--- | :--- |
| **Email đăng nhập** | `admin@fwbnexus.vn` |
| **Mật khẩu khởi tạo** | `Admin@2026!` |
| **Họ và tên** | **Super Administrator** |
| **Mã nhân viên** | `NV-0001` |
| **Chức vụ / Vai trò** | `CEO` (Giám đốc Điều hành) kiêm `ADMIN` (Quản trị viên) |
| **Phòng ban** | Ban Giám Đốc (BGD) |
| **Quyền hạn** | Toàn quyền kiểm soát hệ thống (Full RBAC bypass) |

> [!IMPORTANT]
> Ngay sau khi đăng nhập lần đầu tiên vào môi trường Production thực tế, vui lòng đổi mật khẩu tài khoản quản trị viên này để đảm bảo an toàn thông tin!

---

## 4. Khởi Chạy Môi Trường Production

Môi trường Production sử dụng Frontend đã được biên dịch tối ưu (minified bundle) phục vụ qua Nginx siêu nhẹ, kết hợp Backend chạy ở chế độ `NODE_ENV=production`.

### Bước 1: Chuẩn bị biến môi trường (Tùy chọn)
Mặc định `docker-compose.yml` đã được nạp sẵn các giá trị cấu hình mặc định an toàn. Nếu muốn tùy biến, bạn có thể sao chép file mẫu:
```bash
cp .env.docker.example .env
```

### Bước 2: Build và khởi động toàn bộ hệ thống
Tại thư mục gốc dự án, thực hiện:
```bash
docker compose up -d --build
```

### Bước 3: Kiểm tra trạng thái
```bash
docker compose ps
```
Cả 3 service `nexus-db`, `nexus-backend`, và `nexus-frontend` phải hiển thị trạng thái `healthy` hoặc `Up`.

### Bước 4: Truy cập ứng dụng
- **Giao diện Web**: [http://localhost:3000](http://localhost:3000)
- **API Health Check**: [http://localhost:8000/api/health](http://localhost:8000/api/health)
- **Database**: `localhost:5432` (User: `postgres`, Password: `nexus_secure_pass_2026`, DB: `nexus_hrms`)

---

## 5. Khởi Chạy Môi Trường Development (Hot-Reload)

Dành cho lập trình viên cần chỉnh sửa mã nguồn Backend hoặc Frontend và thấy ngay kết quả tức thì mà không cần rebuild container.

### Bước 1: Khởi động với compose file phát triển
```bash
docker compose -f docker-compose.dev.yml up -d --build
```

### Bước 2: Kiểm tra Hot-Reload
- Chỉnh sửa bất kỳ file nào trong thư mục `FrontEnd/src/`: Trình duyệt sẽ cập nhật tức thì qua Vite HMR.
- Chỉnh sửa bất kỳ file nào trong thư mục `Backend/src/`: Nodemon sẽ tự động restart API server.

---

## 6. Quản Lý & Giám Sát Container

### Xem nhật ký hoạt động (Logs)
Xem log toàn bộ các service (chế độ theo dõi liên tục):
```bash
docker compose logs -f
```

Xem log riêng lẻ từng dịch vụ:
```bash
# Xem log Backend API
docker compose logs -f backend

# Xem log Frontend Nginx
docker compose logs -f frontend

# Xem log PostgreSQL Database
docker compose logs -f db
```

### Dừng hệ thống
Dừng các container mà vẫn giữ nguyên dữ liệu cơ sở dữ liệu:
```bash
docker compose down
```
*(Đối với môi trường dev, thêm cờ `-f docker-compose.dev.yml`)*

---

## 7. Sao Lưu & Phục Hồi Dữ Liệu (Backup & Restore)

Dữ liệu của cơ sở dữ liệu PostgreSQL được lưu trữ an toàn trong Docker Named Volume `nexus-db-data`.

### Sao lưu dữ liệu (Backup)
Để tạo bản sao lưu dữ liệu SQL từ container đang chạy ra máy host:

**Trên Linux / macOS / Git Bash:**
```bash
docker exec -t nexus-db pg_dump -U postgres -d nexus_hrms > backup_$(date +%Y%m%d_%H%M%S).sql
```

**Trên Windows PowerShell:**
```powershell
docker exec -t nexus-db pg_dump -U postgres -d nexus_hrms | Out-File -Encoding utf8 "backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
```

### Phục hồi dữ liệu (Restore)
Để khôi phục dữ liệu từ một file sao lưu `.sql`:

**Trên Linux / macOS / Git Bash:**
```bash
docker exec -i nexus-db psql -U postgres -d nexus_hrms < backup.sql
```

**Trên Windows PowerShell:**
```powershell
Get-Content backup.sql | docker exec -i nexus-db psql -U postgres -d nexus_hrms
```

---

## 8. Khởi Tạo Lại Toàn Bộ Cơ Sở Dữ Liệu (Reset Clean DB)

Trong trường hợp bạn muốn xóa sạch mọi dữ liệu kiểm thử và tái tạo lại một cơ sở dữ liệu hoàn toàn tinh khôi chỉ có tài khoản Super Admin:

```bash
# 1. Dừng container và xóa bỏ volume dữ liệu cũ
docker compose down -v

# 2. Khởi chạy lại hệ thống (Postgres sẽ tự động thực thi lại script 01-init-clean-db.sql)
docker compose up -d
```

> [!WARNING]
> Thao tác `docker compose down -v` sẽ **xóa vĩnh viễn** toàn bộ dữ liệu trong volume `nexus-db-data`. Hãy chắc chắn bạn đã sao lưu dữ liệu quan trọng trước khi chạy lệnh này!

---

## 9. Xử Lý Sự Cố Thường Gặp (Troubleshooting)

### 1. Lỗi cổng bị xung đột (`port is already allocated`)
- **Triệu chứng**: `Error response from daemon: driver failed programming external connectivity on endpoint ... bind: address already in use`.
- **Nguyên nhân**: Cổng 3000, 8000 hoặc 5432 trên máy của bạn đang bị chiếm dụng bởi phiên làm việc local khác (Vite dev, Node local, hoặc PostgreSQL cài trực tiếp).
- **Khắc phục**:
  - Tắt các tiến trình Node/Postgres đang chạy local:
    - *Windows PowerShell*: `Get-Process node, postgres -ErrorAction SilentlyContinue | Stop-Process -Force`
  - Hoặc chỉnh sửa ánh xạ cổng trong `docker-compose.yml` (ví dụ `3001:80`, `8001:8000`).

### 2. Frontend không gọi được Backend API
- **Triệu chứng**: Giao diện báo lỗi mạng (`Network Error` hoặc `502 Bad Gateway`).
- **Khắc phục**:
  - Đảm bảo container Backend đang chạy và đã vượt qua Healthcheck: `docker compose ps`
  - Kiểm tra log của backend: `docker compose logs backend`
  - Nginx đã cấu hình proxy `/api/` nội bộ sang `http://backend:8000/api/`. Hãy kiểm tra xem container `nexus-backend` và `nexus-frontend` có cùng nằm trên mạng `nexus-network` không.

### 3. Đổi mật khẩu Super Admin thủ công bằng mã hash
Nếu quên mật khẩu quản trị và muốn đặt lại mật khẩu trực tiếp trong database:
```bash
# Đổi mật khẩu thành Admin@2026!
docker exec -it nexus-db psql -U postgres -d nexus_hrms -c "UPDATE employees SET password_hash = '\$2a\$10\$pY8IqE4IkJ7W/Ckh93c4k.JfMmygtZ81s6w1dB0IKC4W3WuzsgaAS' WHERE email = 'admin@fwbnexus.vn';"
```
