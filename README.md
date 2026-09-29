# NEXUS HRMS — Website Quản Lý Tổng Thể Phòng Nhân Sự (Fullstack Monorepo)

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%20%2F%2016-blue.svg)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646cff.svg)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Express-4.19-black.svg)](https://expressjs.com/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38b2ac.svg)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)

**NEXUS HRMS** (FwB HRMS) là giải pháp quản trị nhân sự toàn diện dành cho doanh nghiệp, được cấu trúc theo mô hình **Monorepo** tích hợp chặt chẽ giữa **Frontend (React 18 + Vite)**, **Backend (Node.js + Express RESTful API)** và cơ sở dữ liệu quan hệ **PostgreSQL**.

---

## 📑 Mục lục
1. [Triển khai Nhanh với Docker (Khuyến nghị)](#1-triển-khai-nhanh-với-docker-khuyến-nghị)
2. [Kiến trúc Monorepo](#2-kiến-trúc-monorepo)
3. [Yêu cầu môi trường Local](#3-yêu-cầu-môi-trường-local)
4. [Cài đặt nhanh Local (1 Lệnh)](#4-cài-đặt-nhanh-local-1-lệnh)
5. [Khởi tạo Cơ sở Dữ liệu & Biến Môi trường Local](#5-khởi-tạo-cơ-sở-dữ-liệu--biến-môi-trường-local)
6. [Khởi chạy Hệ thống Local](#6-khởi-chạy-hệ-thống-local)
7. [Bộ công cụ Kiểm thử Tự động (Automation Scripts)](#7-bộ-công-cụ-kiểm-thử-tự-động-automation-scripts)
8. [Danh mục Tài khoản Quản trị & Demo](#8-danh-mục-tài-khoản-quản-trị--demo)
9. [Danh mục API Endpoints](#9-danh-mục-api-endpoints)
10. [Tài liệu Tham khảo Liên quan](#10-tài-liệu-tham-khảo-liên-quan)

---

## 1. Triển khai Nhanh với Docker (Khuyến nghị)

Toàn bộ hệ thống (Frontend, Backend API, PostgreSQL 16) đã được đóng gói container hóa hoàn chỉnh. Bạn chỉ cần 1 câu lệnh để đưa toàn bộ hệ thống vào hoạt động:

### Khởi chạy Production
```bash
docker compose up -d --build
```
- 💻 **Frontend Web UI**: [http://localhost:3000](http://localhost:3000) (Nginx multi-stage proxy `/api/`)
- 📡 **Backend API**: [http://localhost:8000/api](http://localhost:8000/api) (Health check: `http://localhost:8000/api/health`)
- 🗄️ **PostgreSQL**: `localhost:5432`

### Khởi chạy Development (Hỗ trợ Hot-Reload)
```bash
docker compose -f docker-compose.dev.yml up -d --build
```

### Tài khoản Quản trị Tối cao Khởi tạo (Clean DB)
Cơ sở dữ liệu Docker được khởi tạo sạch sẽ (Clean DB) với duy nhất 1 tài khoản Super Admin nắm toàn quyền hệ thống:
- **Email**: `admin@fwbnexus.vn`
- **Mật khẩu**: `Admin@2026!`
- **Mã nhân viên**: `NV-0001` (Chức vụ: CEO / Tổng Giám Đốc kiêm Quản trị viên)

📖 **Xem hướng dẫn chi tiết về vận hành, sao lưu và xử lý sự cố tại: [`docs/docker-deployment-guide.md`](docs/docker-deployment-guide.md)**

---

## 2. Kiến trúc Monorepo

Dự án quy tụ toàn bộ mã nguồn Frontend, Backend và Database Schema trong một repository duy nhất:

```
QLDACNTT/
├── package.json                         # Monorepo root config & orchestration scripts
├── docker-compose.yml                   # Docker Compose cấu hình Production
├── docker-compose.dev.yml               # Docker Compose cấu hình Development (Hot-reload)
├── docker-compose.test.yml              # Docker Compose môi trường kiểm thử cô lập
├── .env.docker.example                  # Mẫu biến môi trường Docker
├── README.md                            # Tài liệu hướng dẫn fullstack tổng quan
├── HUONG_DAN_KIEN_TRUC_VA_DAC_TA_HE_THONG_HRMS.md # Đặc tả hệ thống chi tiết
├── database/
│   ├── schema.sql                       # 20 bảng PostgreSQL gốc, triggers & dữ liệu mẫu seed
│   └── docker-init/
│       └── 01-init-clean-db.sql         # Script khởi tạo Clean DB và Super Admin cho Docker
├── Backend/                             # RESTful API Service (Express.js)
│   ├── Dockerfile                       # Dockerfile Production (Node 20 Alpine, dumb-init)
│   ├── Dockerfile.dev                   # Dockerfile Development
│   ├── package.json                     # Backend dependencies & scripts
│   ├── server.js                        # Điểm khởi chạy API server (Port 8000)
│   ├── db.js                            # PostgreSQL connection pool (pg)
│   ├── .env.example                     # Mẫu cấu hình môi trường Backend
│   ├── .env                             # Cấu hình môi trường thực tế (không commit lên Git)
│   ├── migrations/                      # Các bản nâng cấp CSDL tuần tự (001 -> 011)
│   ├── src/
│   │   ├── app.js                       # Khởi tạo ứng dụng Express & định tuyến tổng
│   │   ├── middleware/                  # Xác thực JWT, phân quyền RBAC, xử lý lỗi chuẩn hóa
│   │   └── modules/                     # 22 modules nghiệp vụ (auth, employees, attendance,
│   │                                    # leaves, payroll, projects, analytics, ai, settings...)
│   └── scripts/                         # Automation, Migration & Evaluation Scripts
│       ├── migrate.js                   # Thực thi và kiểm tra trạng thái migrations
│       ├── test-db.js                   # Kiểm tra kết nối và đối chiếu 20 bảng DB
│       ├── smoke-test.js                # Kiểm thử toàn diện chuỗi API endpoints
│       └── run-ai-v1-live-eval.js       # Bộ đánh giá thực nghiệm Grounded AI Copilot V1
└── FrontEnd/                            # Giao diện người dùng (React 18 + Vite)
    ├── Dockerfile                       # Dockerfile Production (Multi-stage -> Nginx)
    ├── Dockerfile.dev                   # Dockerfile Development
    ├── nginx.conf                       # Cấu hình Nginx reverse proxy và SPA routing
    ├── package.json                     # Frontend dependencies & scripts
    ├── vite.config.js                   # Cấu hình Vite (Port 3000, alias @)
    ├── .env                             # VITE_API_URL=http://localhost:8000/api
    └── src/
        ├── App.jsx                      # Root Router & Shell layout (Admin / Portal)
        ├── context/                     # Context quản lý Auth, Modals, Notifications...
        ├── services/                    # Tầng giao tiếp Backend API
        ├── pages/                       # Các trang tính năng chuẩn hóa
        └── modals/                      # Hệ thống modals theo module nghiệp vụ (bao gồm AI Copilot)
```

---

## 3. Yêu cầu môi trường Local

Để chạy trơn tru toàn bộ hệ thống, máy trạm cần cài đặt:
- **Node.js**: Phiên bản `18.x` trở lên (Khuyến nghị `v20.x LTS`).
- **npm**: Phiên bản `9.x` hoặc `10.x`.
- **PostgreSQL**: Phiên bản `14.x` hoặc `16.x` (đang lắng nghe tại cổng `5432`).
- **Hệ điều hành**: Windows 10/11, macOS, hoặc Linux.

---

## 4. Cài đặt nhanh Local (1 Lệnh)

Tại thư mục gốc `QLDACNTT`, cài đặt toàn bộ dependencies cho cả root, Backend và Frontend chỉ với một câu lệnh:

```bash
npm run install:all
```

*Lệnh trên tương đương với: `npm install && npm install --prefix Backend && npm install --prefix FrontEnd`.*

---

## 5. Khởi tạo Cơ sở Dữ liệu & Biến Môi trường Local

### Bước 5.1: Tạo Database PostgreSQL, nạp Schema và chạy Migrations
Mở PostgreSQL CLI (`psql`) hoặc pgAdmin:

```sql
-- 1. Tạo cơ sở dữ liệu
CREATE DATABASE nexus_hrms;
```

Sau đó import file schema gốc (`database/schema.sql`) và áp dụng toàn bộ 11 bản migrations (`001` -> `011`):
- **Trên Windows (cmd/powershell):**
  ```bash
  psql -U postgres -d nexus_hrms -f database/schema.sql
  node Backend/scripts/migrate.js --target-db=nexus_hrms --confirm-production-db=nexus_hrms
  ```
- **Kiểm tra trạng thái sẵn sàng của CSDL (`READY 11/11`):**
  ```bash
  node Backend/scripts/migrate.js --status --target-db=nexus_hrms
  ```

*File `database/schema.sql` khởi tạo 20 bảng chuẩn ban đầu, sau đó bộ migrations `Backend/migrations/001..011` nâng cấp thêm các bảng/ràng buộc bảo mật, thông báo nội bộ, cẩm nang nhân sự, cài đặt hệ thống và đánh giá năng lực.*

### Bước 5.2: Cấu hình biến môi trường Backend (`Backend/.env`)
Tạo file `Backend/.env` dựa trên `Backend/.env.example`:

```env
# Server
PORT=8000
NODE_ENV=development

# PostgreSQL Database
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=nexus_hrms
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# JWT Authentication
JWT_SECRET=nexus_hrms_jwt_secret_key_2026_fwb
JWT_EXPIRES_IN=24h

# CORS
FRONTEND_URL=http://localhost:3000

# Grounded AI Copilot V1 (Google Gemini - Tùy chọn)
AI_ENABLED=true
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

### Bước 5.3: Cấu hình biến môi trường Frontend (`FrontEnd/.env`)
File `FrontEnd/.env` đã được thiết lập mặc định để kết nối đến Backend:

```env
VITE_API_URL=http://localhost:8000/api
```

---

## 6. Khởi chạy Hệ thống Local

### Cách 1: Khởi chạy Fullstack 1 lệnh duy nhất (Khuyến nghị)
Sử dụng công cụ `concurrently` để chạy song song Backend API và Frontend Dev Server:

```bash
npm run dev
```

Hệ thống sẽ đồng thời kích hoạt:
- 📡 **Backend API**: `http://localhost:8000` (Health Check: `http://localhost:8000/api/health`)
- 💻 **Frontend Web App**: `http://localhost:3000`

### Cách 2: Khởi chạy độc lập từng dịch vụ
Nếu cần debug hoặc kiểm thử độc lập:
- **Chỉ chạy Backend**:
  ```bash
  npm run dev:backend
  ```
- **Chỉ chạy Frontend**:
  ```bash
  npm run dev:frontend
  ```
- **Build Frontend cho Production**:
  ```bash
  npm run build:frontend
  ```

---

## 7. Bộ công cụ Kiểm thử Tự động (Automation Scripts)

Dự án cung cấp bộ công cụ kiểm thử tự động toàn diện từ Unit Test, Database Test, API Smoke Test cho đến đánh giá thực nghiệm AI Copilot:

### 1. Kiểm tra kết nối & đối chiếu Schema Database (`npm run db:test`)
```bash
npm run db:test
```
- **Mục đích**: Kiểm tra tức thời kết nối PostgreSQL, đo độ trễ kết nối, đọc trực tiếp file `database/schema.sql` và xác thực sự hiện diện của toàn bộ **20 bảng chuẩn** cùng các views nghiệp vụ.
- **Tiêu chí đạt**: 20/20 bảng đã sẵn sàng (100%).

### 2. Kiểm thử luồng API Smoke Test (`npm run test:smoke`)
*Lưu ý: Cần khởi chạy backend (`npm run dev` hoặc `npm run dev:backend`) trước khi chạy test.*

```bash
npm run test:smoke
```
- **Chuỗi kiểm thử tự động gồm 5 bước**:
  1. `GET /api/health`: Kiểm tra sức khỏe hệ thống và kết nối DB thời gian thực.
  2. `GET /api`: Kiểm tra danh mục định tuyến API.
  3. `POST /api/auth/login`: Xác thực tài khoản kiểm thử và lấy JWT token.
  4. `GET /api/auth/me`: Kiểm tra xác thực Bearer token và lấy hồ sơ người dùng đăng nhập.
  5. `GET /api/employees`: Kiểm tra quyền truy cập và dữ liệu danh bạ nhân sự.

### 3. Kiểm thử Unit, Integration, Migrations & AI Copilot V1
```bash
npm run test:unit --prefix Backend   # Chạy bộ Unit Tests (không cần kết nối DB)
npm test --prefix Backend            # Tái tạo DB kiểm thử cô lập (nexus_hrms_test) từ schema + 11 migrations và chạy toàn bộ Integration Tests
node Backend/scripts/run-ai-v1-live-eval.js --require-live  # Kiểm thử 18 kịch bản thực tế Grounded AI Copilot V1 với Google Gemini trên DB test
```
- Mọi thay đổi cấu trúc CSDL mới đều được quản lý tuần tự tại `Backend/migrations/NNN_description.sql` (tuyệt đối không sửa đè lịch sử các migration đã chạy).
- Để nạp thêm dữ liệu mẫu cho các phân hệ thông báo nội bộ, cẩm nang nhân sự và đánh giá năng lực: `npm run seed:demo --prefix Backend` (hỗ trợ chạy lặp an toàn - idempotent).
- Phiên đăng nhập sử dụng cặp `accessToken` ngắn hạn kết hợp `refreshToken` xoay vòng một lần (`POST /api/auth/refresh`), đồng thời vẫn duy trì trường `token` tương thích ngược cho `POST /api/auth/login`.

---

## 8. Danh mục Tài khoản Quản trị & Demo

Hệ thống được thiết kế sẵn các nhóm tài khoản theo phân quyền đa cấp (RBAC):

| Vai trò | Chức danh | Email | Mật khẩu (Database Seed) | Mật khẩu (Brief/Alt) |
| :--- | :--- | :--- | :--- | :--- |
| **CEO** | Tổng Giám Đốc | `ceo@fwbnexus.vn` | `Ceo@123456` | `password123` |
| **HR Director** | Giám Đốc Nhân Sự | `hrd@fwbnexus.vn` | `Hrd@123456` | `password123` |
| **Line Manager** | Trưởng Phòng KT | `lead@fwbnexus.vn` | `Lead@12345` | `password123` |
| **Employee** | Kỹ Sư Phần Mềm | `employee@fwbnexus.vn` | `Emp@123456` | `password123` |

> 💡 **Tính năng Đăng nhập 1-Chạm (Quick Login):**  
> Trên giao diện màn hình đăng nhập (`http://localhost:3000`), hệ thống hỗ trợ các nút chuyển đổi tài khoản mẫu nhanh. Người dùng chỉ cần nhấp chọn vai trò tương ứng để trải nghiệm hệ thống ngay lập tức mà không cần nhập thông tin thủ công.

---

## 9. Danh mục API Endpoints

Base URL: `http://localhost:8000/api`. Tài liệu đầy đủ (request, response, mã lỗi, quyền) nằm ở **[`Backend/docs/openapi.yaml`](Backend/docs/openapi.yaml)** (OpenAPI 3); bảng thay đổi ảnh hưởng frontend nằm ở **[`docs/API_CHANGES.md`](docs/API_CHANGES.md)**. `GET /api` trả danh mục endpoint dạng JSON.

| Nhóm | Đường dẫn | Nội dung chính |
| :--- | :--- | :--- |
| Xác thực | `/api/auth` | login, refresh token xoay vòng, logout, me, đổi mật khẩu |
| Tài khoản | `/api/users` | tạo tài khoản, đổi vai trò, khóa/mở khóa, cấp mật khẩu tạm |
| Nhân sự | `/api/employees`, `/api/contracts` | hồ sơ, onboarding, nghỉ việc, nhập hàng loạt, hợp đồng |
| Cơ cấu | `/api/departments`, `/api/positions` | phòng ban, chức danh |
| Chấm công | `/api/attendance` | check-in/out, **QR kiosk**, bảng công tháng, đi muộn/vắng, điều chỉnh |
| Phép, OT, y tế | `/api/leaves`, `/api/ot-requests`, `/api/medical-claims` | chuỗi duyệt NV → Trưởng phòng → HRD (QL/HRD → CEO) |
| Lương | `/api/payroll` | tính lương, chốt, chuyển khoản, bất thường, phiếu lương |
| Dự án | `/api/projects`, `/api/tasks`, `/api/squads` | Kanban có nghiệm thu, nhóm và chat nhóm |
| Thông báo | `/api/notifications`, `/api/notices`, `/api/handbook` | thông báo cá nhân/vai trò, thông báo nội bộ, cẩm nang |
| Phân tích | `/api/analytics` | đánh giá năng lực, 9-box, rủi ro nghỉ việc, PIP |
| Trợ lý AI | `/api/ai/copilot` | Grounded AI HR Copilot V1 (tra cứu phép, lương, công, quy chế kiểm chứng theo RBAC) |
| Hệ thống | `/api/dashboard`, `/api/settings`, `/api/audit-logs`, `/api/health` | KPI theo phạm vi, cấu hình hệ thống, nhật ký kiểm toán |

**Quy ước chung:** thành công `{ success: true, data, pagination? }`; lỗi `{ success: false, code, message, details? }`. Gửi `Authorization: Bearer <accessToken>`. Danh sách có `?page&limit` (giới hạn được kẹp về mức tối đa). Trường ngày (`DATE`) trả về chuỗi `YYYY-MM-DD`.

---

## 10. Tài liệu Tham khảo Liên quan

- 🐳 **Hướng Dẫn Triển Khai & Vận Hành Docker Toàn Diện**:  
  [docs/docker-deployment-guide.md](docs/docker-deployment-guide.md)
- 📘 **Tài liệu Kiến trúc & Đặc tả Nghiệp vụ Toàn diện**:  
  [HUONG_DAN_KIEN_TRUC_VA_DAC_TA_HE_THONG_HRMS.md](HUONG_DAN_KIEN_TRUC_VA_DAC_TA_HE_THONG_HRMS.md)
- 🤖 **Kiến trúc Grounded AI Copilot V1 & Kiểm soát RBAC**:  
  [docs/remediation/AI_V1_ARCHITECTURE.md](docs/remediation/AI_V1_ARCHITECTURE.md)
- 🛠️ **Runbook Vận hành Migration CSDL (`001` -> `011`)**:  
  [docs/remediation/MIGRATION_RUNBOOK.md](docs/remediation/MIGRATION_RUNBOOK.md)
- ✅ **Báo cáo Kiểm thử Nghiệm thu Toàn hệ thống (UAT)**:  
  [docs/remediation/FINAL_WEBSITE_UAT.md](docs/remediation/FINAL_WEBSITE_UAT.md)
- 🗄️ **Cơ sở Dữ liệu Schema & Seed Script (PostgreSQL)**:  
  [database/schema.sql](database/schema.sql)

---
*© 2026 NEXUS HRMS Project — QLDACNTT Enterprise Software Implementation.*