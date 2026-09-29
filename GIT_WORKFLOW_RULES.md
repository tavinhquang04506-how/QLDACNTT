# 📜 QUY CHUẨN PHÂN NHÁNH GITFLOW & PHÂN CÔNG VAI TRÒ DỰ ÁN (AI & TEAM RULES)

> **Dự án:** NEXUS HRMS (FwB HRMS) — Fullstack Monorepo  
> **Dành cho:** AI Coding Assistants (Antigravity, Cursor, Copilot, ChatGPT), Tech Lead, và Các Thành Viên trong Nhóm.  
> **Hiệu lực:** Bắt buộc áp dụng 100% cho mọi tác vụ phát triển, sửa lỗi, và nghiệm thu.

---

## 👥 1. MA TRẬN PHÂN CÔNG VAI TRÒ NHÓM DỰ ÁN

| Thành viên (GitHub Handle) | Email Commit GitHub | Vai trò chuyên môn chính | Nhiệm vụ cụ thể & Nhánh đảm nhiệm |
| :--- | :--- | :--- | :--- |
| **`quangphuong19042005-sketch`** | `quangphuong19042005-sketch@users.noreply.github.com` | **BA / PO (Business Analyst & Product Owner)** | • Khảo sát nghiệp vụ, phân tích stakeholder.<br>• Viết User Story, Use Case, Acceptance Criteria.<br>• Phụ trách biên soạn Cẩm nang quy chế (`handbook`), Thông báo nội bộ (`notices`).<br>• *Thực hiện Feature:* `feature/attendance-kiosk` (User flow cổng Kiosk và Cổng nhân viên). |
| **`tavinhquang04506-how`** | `tavinhquang04506@gmail.com` | **UI/UX Designer + Frontend Lead** | • Thiết kế User Flow, Wireframe / Prototype.<br>• Xây dựng Design System (Apple Glassmorphism, Tailwind tokens, Roboto).<br>• Lập trình 11 trang giao diện React 18 + Vite, hệ thống Modals tập trung.<br>• Điều phối phát hành, thẩm định Merge vào `master` và đóng gói `release/v1.0`. |
| **`giabuh`** | `baoluu674@gmail.com` | **Backend/API + DevOps Engineer** | • Kiến trúc hệ sinh thái Backend Express.js.<br>• Xây dựng 22 RESTful API Modules, kết nối WebSocket thuần.<br>• Xác thực JWT, Session Rotation, RBAC Policy Matrix (Scope: all / dept / self).<br>• Đóng gói Docker Compose (Production & Dev Hot-reload).<br>• *Thực hiện Hotfix:* `hotfix/auth-leak` (vá lỗi bảo mật khẩn cấp). |
| **`thanhheo7749-ui`** | `thanhheo7749@gmail.com` | **Database Architect + QA/Tester** | • Thiết kế lược đồ CSDL PostgreSQL 16 chuẩn 3NF (20 bảng cốt lõi).<br>• Viết 7 file Migrations, script seed dữ liệu sạch và dữ liệu demo 50 nhân viên.<br>• Tối ưu hóa câu truy vấn SQL, trigger tính công và audit log.<br>• Thiết lập bộ kiểm thử 116 bài Unit/Integration Tests (`node --test`), Smoke Test.<br>• *Thực hiện Feature:* `feature/payroll-leave` (Động cơ tính thuế TNCN 7 bậc, chuỗi duyệt nghỉ phép). |

---

## 🌲 2. SƠ ĐỒ CÂY PHÂN NHÁNH BẮT BUỘC (GITFLOW TOPOLOGY)

```mermaid
gitGraph
    commit id: "Initial v0.1" tag: "v0.1"
    branch develop
    checkout develop
    commit id: "Init develop"
    
    checkout master
    branch hotfix
    checkout hotfix
    commit id: "Hotfix security"
    checkout master
    merge hotfix tag: "v0.2"
    checkout develop
    merge hotfix
    
    branch feature-attendance
    checkout feature-attendance
    commit id: "User story & GPS"
    commit id: "Kiosk & Portal"
    checkout develop
    merge feature-attendance
    
    branch feature-payroll
    checkout feature-payroll
    commit id: "DB schema & seed"
    commit id: "Leave 2-level"
    commit id: "Tax progressive"
    commit id: "Payroll QA tests"
    checkout develop
    merge feature-payroll
    
    branch release-v1.0
    checkout release-v1.0
    commit id: "Release 1.0 docs"
    commit id: "QA pass 116 tests"
    checkout master
    merge release-v1.0 tag: "v1.0"
    checkout develop
    merge release-v1.0
```

---

## 🚦 3. NGUYÊN TẮC BẤT DI BẤT DỊCH DÀNH CHO AI & DEVELOPER

### 🔴 Điều 1: BẢO VỆ TUYỆT ĐỐI NHÁNH `master`
1. Nhánh `master` đại diện cho môi trường **Production**.
2. **NGHIÊM CẤM** commit code trực tiếp lên `master`. Hệ thống đã kích hoạt Git Pre-commit hook để tự động chặn đứng thao tác này.
3. Nhánh `master` CHỈ nhận mã nguồn từ:
   - Nhánh `release/vX.Y` khi đóng gói phát hành (kèm Git Tag `vX.Y`).
   - Nhánh `hotfix/<name>` khi khắc phục sự cố khẩn cấp (kèm Git Tag tăng số phiên bản).

### 🟠 Điều 2: NHÁNH `develop` LÀ TRUNG TÂM TÍCH HỢP
1. Mọi tính năng mới đều bắt nguồn từ `develop`.
2. Không commit tính năng lớn trực tiếp lên `develop`. Phải chia nhỏ thành các nhánh `feature/*`.

### 🔵 Điều 3: QUY TRÌNH THỰC HIỆN TÍNH NĂNG MỚI (NEW FEATURE)
```bash
# 1. Tách nhánh feature từ develop
git checkout develop
git pull origin develop
git checkout -b feature/<module>-<ten-tinh-nang> develop

# 2. Lập trình và commit theo chuẩn Conventional Commits
git add .
git commit -m "feat(<module>): mo ta chuc nang"

# 3. Chạy Quality Gate kiểm thử nghiêm ngặt
npm run test:unit --prefix Backend
npm run db:test

# 4. Merge có lưu vết (--no-ff) vào develop
git checkout develop
git merge --no-ff feature/<module>-<ten-tinh-nang> -m "Merge branch 'feature/...' into develop"

# 5. Đẩy lên GitHub
git push origin develop feature/<module>-<ten-tinh-nang>
```

### 🟣 Điều 4: QUY TRÌNH VÁ LỖI KHẨN CẤP PRODUCTION (HOTFIX)
```bash
# 1. Tách nhánh trực tiếp từ master
git checkout -b hotfix/<ten-loi> master

# 2. Sửa lỗi, test và merge vào master (kèm tag mới)
git checkout master
git merge --no-ff hotfix/<ten-loi> -m "Merge branch 'hotfix/...' into master"
git tag -a v<new-tag> -m "Release: hotfix patch"

# 3. BẮT BUỘC merge ngược về develop để đồng bộ
git checkout develop
git merge --no-ff hotfix/<ten-loi> -m "Merge branch 'hotfix/...' into develop"
```

### 🟡 Điều 5: LUÔN DÙNG `--no-ff` KHI MERGE
Tuyệt đối không dùng fast-forward merge để giữ nguyên hình dạng đồ thị phục vụ giảng viên và hội đồng kiểm tra.
