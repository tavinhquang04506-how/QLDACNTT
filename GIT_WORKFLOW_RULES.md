# 📜 QUY CHUẨN PHÂN NHÁNH GITFLOW DÀNH CHO AI & DEVELOPER (AI GITFLOW RULES)

> **Dành cho:** AI Coding Assistants (Antigravity, Cursor, Copilot, ChatGPT), Tech Lead, và Các Lập Trình Viên tham gia dự án **NEXUS HRMS**.  
> **Hiệu lực:** Bắt buộc áp dụng 100% cho mọi tác vụ phát triển, sửa lỗi, và phát hành mã nguồn.  
> **Nguyên tắc cốt lõi:** Tuyệt đối không commit trực tiếp lên nhánh `master` hoặc `develop` mà không thông qua nhánh con và quy trình Merge kiểm thử.

---

## 🌲 1. SƠ ĐỒ CÂY PHÂN NHÁNH BẮT BUỘC (GITFLOW TOPOLOGY)

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
    commit id: "GPS checkin"
    commit id: "QR kiosk"
    checkout develop
    merge feature-attendance
    
    branch feature-payroll
    checkout feature-payroll
    commit id: "Tax progressive"
    commit id: "Payslip lock"
    checkout develop
    merge feature-payroll
    
    branch release-v1.0
    checkout release-v1.0
    commit id: "Release 1.0 docs"
    checkout master
    merge release-v1.0 tag: "v1.0"
    checkout develop
    merge release-v1.0
```

---

## 🚦 2. NGUYÊN TẮC BẤT DI BẤT DỊCH (CARDINAL RULES)

### 🔴 Điều 1: BẢO VỆ TUYỆT ĐỐI NHÁNH `master`
1. Nhánh `master` đại diện cho môi trường **Production (vận hành thực tế)**.
2. **NGHIÊM CẤM** commit code trực tiếp lên `master`.
3. Nhánh `master` CHỈ nhận mã nguồn từ 2 nguồn duy nhất:
   - Nhánh `release/vX.Y` khi đóng gói phát hành phiên bản mới (kèm Git Tag `vX.Y`).
   - Nhánh `hotfix/<name>` khi khắc phục sự cố khẩn cấp trên Production (kèm Git Tag tăng số phiên bản nhỏ, ví dụ `v0.2`, `v1.0.1`).

### 🟠 Điều 2: NHÁNH `develop` LÀ TRUNG TÂM TÍCH HỢP
1. Mọi tính năng mới, tái cấu trúc hoặc sửa lỗi thông thường đều bắt nguồn từ `develop`.
2. Không commit tính năng lớn trực tiếp lên `develop`. Phải chia nhỏ thành các nhánh `feature/*`.
3. Chỉ merge vào `develop` khi mã nguồn đã vượt qua toàn bộ các bài kiểm thử tự động (Unit Tests, Database Check).

### 🔵 Điều 3: QUY TRÌNH KHI AI THỰC HIỆN TÍNH NĂNG MỚI (NEW FEATURE)
Khi AI nhận yêu cầu: *"Hãy làm chức năng X / Thêm module Y..."*, AI **BẮT BUỘC** thực hiện tuần tự 5 bước:

```bash
# Bước 3.1: Chuyển về develop và cập nhật mã mới nhất
git checkout develop
git pull origin develop

# Bước 3.2: Tạo nhánh feature mới
git checkout -b feature/<ten-tinh-nang> develop

# Bước 3.3: Lập trình và commit theo chuẩn Conventional Commits
git add .
git commit -m "feat(<module>): mo ta ngan gon ve tinh nang"

# Bước 3.4: Chạy kiểm thử nghiêm ngặt (Quality Gate)
npm run test:unit --prefix Backend
npm run db:test

# Bước 3.5: Merge có lưu vết (--no-ff) vào develop
git checkout develop
git merge --no-ff feature/<ten-tinh-nang> -m "Merge branch 'feature/<ten-tinh-nang>' into develop"

# Bước 3.6: Đẩy lên remote
git push origin develop feature/<ten-tinh-nang>
```

### 🟣 Điều 4: QUY TRÌNH KHI AI VÁ LỖI KHẨN CẤP PRODUCTION (HOTFIX)
Khi AI nhận yêu cầu: *"Bị lỗi nghiêm trọng trên master / Sửa gấp lỗi bảo mật..."*, AI **BẮT BUỘC** thực hiện:

```bash
# Bước 4.1: Tách nhánh hotfix trực tiếp từ master
git checkout master
git pull origin master
git checkout -b hotfix/<ten-loi-can-sua> master

# Bước 4.2: Sửa lỗi và commit
git add .
git commit -m "fix(security): sua loi nghiem trong ..."

# Bước 4.3: Chạy test kiểm chứng
npm run test:unit --prefix Backend

# Bước 4.4: Merge vào master VÀ gắn thẻ phiên bản mới (Tag)
git checkout master
git merge --no-ff hotfix/<ten-loi-can-sua> -m "Merge branch 'hotfix/<ten-loi-can-sua>' into master"
git tag -a v<phien-ban-moi> -m "Release v<phien-ban-moi>: Hotfix patch"

# Bước 4.5: BẮT BUỘC merge ngược lại vào develop để không bị mất bản sửa lỗi!
git checkout develop
git merge --no-ff hotfix/<ten-loi-can-sua> -m "Merge branch 'hotfix/<ten-loi-can-sua>' into develop"

# Bước 4.6: Đẩy cả master, develop, hotfix và tags lên remote
git push origin master develop hotfix/<ten-loi-can-sua> --tags
```

### 🟡 Điều 5: QUY TRÌNH ĐÓNG GÓI PHÁT HÀNH (RELEASE)
Khi các tính năng trong Sprint đã sẵn sàng đóng gói để nghiệm thu / báo cáo cấp trên:

```bash
# Bước 5.1: Tách nhánh release từ develop
git checkout develop
git checkout -b release/vX.Y develop

# Bước 5.2: Cập nhật tài liệu, kiểm thử toàn diện
git add .
git commit -m "chore(release): bump version to vX.Y and finalize documentation"

# Bước 5.3: Merge vào master và gắn Tag chính thức
git checkout master
git merge --no-ff release/vX.Y -m "Merge branch 'release/vX.Y' into master"
git tag -a vX.Y -m "Release version X.Y: Production ready"

# Bước 5.4: Merge ngược về develop
git checkout develop
git merge --no-ff release/vX.Y -m "Merge branch 'release/vX.Y' into develop"

# Bước 5.5: Đẩy lên remote
git push origin master develop release/vX.Y --tags
```

---

## 🏷️ 3. QUY CHUẨN ĐẶT TÊN NHÁNH (BRANCH NAMING)

| Mục đích | Tiền tố chuẩn | Ví dụ mẫu |
| :--- | :--- | :--- |
| **Tính năng mới** | `feature/` | `feature/attendance-gps`<br>`feature/payroll-tax`<br>`feature/ai-chat-rag` |
| **Sửa lỗi khẩn cấp (từ master)** | `hotfix/` | `hotfix/auth-leak`<br>`hotfix/token-expiry` |
| **Sửa lỗi sprint (từ develop)** | `bugfix/` | `bugfix/modal-close`<br>`bugfix/table-paging` |
| **Đóng gói phiên bản** | `release/` | `release/v1.0`<br>`release/v1.1`<br>`release/v2.0` |

---

## ✍️ 4. QUY CHUẨN COMMIT (CONVENTIONAL COMMITS)

Mọi commit của AI hoặc Developer phải tuân theo định dạng:
`type(scope): description`

* `feat`: Tính năng mới (`feat(attendance): add QR scanner modal`)
* `fix`: Sửa lỗi (`fix(auth): prevent replay attack on refresh token`)
* `test`: Bổ sung hoặc sửa bài test (`test(payroll): add 100% tax bracket coverage`)
* `docs`: Cập nhật tài liệu / hướng dẫn (`docs: update API endpoints specification`)
* `chore`: Công việc bảo trì, cấu hình (`chore(release): bump version to 1.1.0`)
* `refactor`: Tối ưu hóa code mà không đổi logic (`refactor(services): clean up api handlers`)

---

## 🛡️ 5. TIÊU CHUẨN CHẤT LƯỢNG TRƯỚC KHI MERGE (QUALITY GATE)

Trước khi thực hiện lệnh merge bất kỳ nhánh nào vào `develop` hoặc `master`, AI **BẮT BUỘC** phải chạy và kiểm tra kết quả 3 lệnh sau:

1. **Kiểm tra Unit Test Backend**:
   ```bash
   npm run test:unit --prefix Backend
   ```
   *Tiêu chí đạt: 100% bài test PASS, không có bài nào fail hoặc timeout.*

2. **Kiểm tra Đối chiếu Database 20 Bảng**:
   ```bash
   npm run db:test
   ```
   *Tiêu chí đạt: 20/20 bảng chuẩn PostgreSQL đồng bộ 100%.*

3. **Kiểm tra Build Frontend**:
   ```bash
   npm run build --prefix FrontEnd
   ```
   *Tiêu chí đạt: Biên dịch thành công, không có lỗi linter/syntax.*

---

## 🤖 6. LƯU Ý ĐẶC BIỆT DÀNH CHO AI CODING AGENTS

* **KHÔNG BAO GIỜ** dùng `git merge` dạng Fast-Forward mặc định khi kết thúc nhánh Feature/Hotfix/Release. **Luôn luôn sử dụng cờ `--no-ff`** để Git tạo commit hợp nhất, giữ nguyên hình dạng đồ thị rẽ nhánh cho cấp trên và giảng viên kiểm tra.
* Khi thực hiện tác vụ được yêu cầu bởi người dùng, AI phải thông báo rõ:
  > *"Em đang tách nhánh `feature/<tên>` từ `develop` để thực hiện yêu cầu..."*  
  > *"Sau khi kiểm thử đạt 100%, em đã merge `--no-ff` vào `develop`."*
