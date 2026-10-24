# AI_V1_HANDOFF — Tài Liệu Bàn Giao Nâng Cấp Trợ Lý Nhân Sự AI NEXUS HRMS V1

- **Dự án**: `C:\Users\tavin\Downloads\QLDACNTT`
- **Kế hoạch thực thi**: `18-KE-HOACH-NANG-CAP-AI-NEXUS-V1.md`
- **Nhánh tính năng**: `feature/ai-v1-grounded-vietnamese` -> hợp nhất (`--no-ff`) vào `develop`
- **Cơ sở dữ liệu kiểm thử**: `nexus_hrms_test` (`nexus_hrms` chính giữ nguyên 100%: `32` bảng, `50` nhân viên, `50` người dùng, `100` phiếu lương, `50` số dư phép)

---

## 1. Danh Sách Tệp Đã Thêm Mới & Cập Nhật

### 1.1. Tệp mới khởi tạo
- `Backend/src/modules/ai/schema.js`: Hợp đồng Request/Response V1, danh sách tham số cho phép của 6 công cụ, phép lùi tháng qua ranh giới năm (`computePreviousMonthString`), gợi ý câu hỏi tiếp theo và danh sách nút điều hướng theo đúng vai trò RBAC.
- `Backend/src/modules/ai/intentSlots.js`: Bộ phân tích chủ đề (`intent`) và tham số (`slots`) hỗ trợ tiếng Việt có dấu / không dấu, giải mã thời gian tương đối theo múi giờ `Asia/Ho_Chi_Minh`, kế thừa ngữ cảnh khi hỏi tiếp (`"Còn tháng trước?"`), xóa slot khi đổi chủ đề, và tạo câu hỏi làm rõ (`clarification`) khi thiếu tham số hoặc mất ngữ cảnh.
- `Backend/src/modules/ai/claimRenderer.js`: Bộ định dạng chuẩn `vi-VN` (`dd/MM/yyyy`, `VND`, số ngày lẻ `7.5`, phân biệt `null` vs `0`), tính toán chênh lệch phiếu lương 2 kỳ tại máy chủ (`computePayslipComparison`), và dựng các khối `answerSections` có gắn `claimRefs` / `sourceRefs`.
- `Backend/tests/unit/aiV1Modules.test.js`: Bộ kiểm thử đơn vị (Unit tests) cho các mô-đun V1 (`schema`, `intentSlots`, `claimRenderer`, `geminiProvider` retry).
- `Backend/tests/api/ai-v1-evaluation-30.test.js`: Bộ kiểm thử tích hợp API cho đầy đủ **30 tình huống nghiệm thu (`V1-01` .. `V1-30`)** trên cơ sở dữ liệu `nexus_hrms_test`.
- `Backend/scripts/run-ai-v1-live-eval.js`: Kịch bản nghiệm thu Gemini thật có trần ngân sách (`<= 30` câu hỏi, `<= 5` lần retry, tự động báo `BLOCKED` trung thực khi chưa có `GEMINI_API_KEY`).
- Bộ tài liệu bàn giao V1 (`docs/remediation/` và thư mục gốc):
  - `AI_V1_PROGRESS.md`
  - `AI_V1_ARCHITECTURE.md`
  - `AI_V1_EVALUATION.md`
  - `AI_V1_OPERATOR_GUIDE.md`
  - `AI_V1_HANDOFF.md`

### 1.2. Tệp hiện có đã nâng cấp
- `Backend/src/modules/ai/tools.js`:
  - Cập nhật `getMyPayslip` để từ khóa `"gần nhất"` / bỏ trống kỳ luôn ưu tiên kỳ đã công bố mới nhất (`DA_CHOT` / `DA_CHUYEN_KHOAN`), bỏ qua kỳ `DU_THAO` mới hơn.
  - Sửa lỗi gọi hàm `dashboardService.get || dashboardService.getDashboard` trong `getScopedDashboard`.
  - Mở rộng `INJECTION_PATTERNS` trong `sanitizePolicyText` để lọc triệt để chuỗi prompt injection đa từ khóa (`Ignore all previous instructions...`) và bổ sung `period`, `version`, `effectiveFrom` vào `source` / `sources`.
- `Backend/src/modules/ai/geminiProvider.js`:
  - Bổ sung retry có trần (`maxRetries = 1`) chỉ cho lỗi tạm thời `429` và `502/503/504` khi còn đủ ngân sách thời gian; tuyệt đối không retry `401/403/404`.
  - Trả về `_providerStats` (`providerCalls`, `retriesUsed`, `tokenUsage`) để ghi nhận vào `providerMeta` và audit log.
- `Backend/src/modules/ai/service.js`:
  - Tích hợp `resolveIntentAndSlots`, `buildAnswerSectionsAndClaims`, `computePayslipComparison`, tự động gọi kỳ lương thứ 2 khi so sánh 2 kỳ, hỗ trợ `resetConversationForActor` và `clientGenerationId`, giữ nguyên 100% cơ chế xác minh ngữ nghĩa và lọc mệnh đề bịa đặt (`R35`–`R41`).
- `Backend/src/modules/ai/routes.js`:
  - Mở rộng schema nhận `clientGenerationId`, `resetConversation` và thêm route `POST /api/ai/copilot/reset`.
- `FrontEnd/src/utils/aiCopilotState.js` & `FrontEnd/tests/aiCopilotState.test.js`:
  - Bổ sung `buildRoleAwareWelcomeMessage`, `getRoleScopedWelcomeChips`, `createNextSessionGeneration`, `isStaleGenerationResponse`, và mở rộng `normalizeCopilotBotMessage` cho các trường V1.
- `FrontEnd/src/modals/analytics/AiCopilotDrawerModal.jsx`:
  - Hiển thị khối `answerSections`, nút chọn `clarification`, chip `followUpSuggestions`, nút điều hướng `navigationActions`, nút `Làm mới` hội thoại, ô nhập `textarea` nhiều dòng (`Enter` gửi, `Shift+Enter` xuống dòng), `aria-live="polite"`, đáp ứng `390px` mobile và `1440px` desktop.
- `Backend/scripts/e2e-browser-verify.js`:
  - Bổ sung kiểm thử E2E trình duyệt cho toàn bộ thành phần giao diện AI Copilot V1 và chụp ảnh màn hình tại `390px` và `1440px`.
- `docker-compose.yml` & `docker-compose.test.yml`:
  - Bổ sung đầy đủ các biến môi trường `AI_ENABLED`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_TOOL_ROUNDS`, `AI_MAX_MESSAGE_CHARS`, `AI_REQUESTS_PER_MINUTE`.

---

## 2. Kết Quả Từng Lệnh Kiểm Tra & Mã Thoát (Exit Code)

| STT | Lệnh kiểm tra | Kết quả | Mã thoát | File log bằng chứng |
|---|---|---|---|---|
| 1 | `npm run test:unit --prefix Backend` | **PASS** (`147/147` tests) | `0` | `docs/remediation/evidence/ai-v1-backend-unit.log` |
| 2 | `npm test --prefix FrontEnd` | **PASS** (`74/74` tests) | `0` | `docs/remediation/evidence/ai-v1-frontend-unit.log` |
| 3 | `npm run build --prefix FrontEnd` | **PASS** (Vite bundle thành công) | `0` | `docs/remediation/evidence/ai-v1-frontend-build.log` |
| 4 | `npm run db:test` | **PASS** (`116/116` DB tests trên `nexus_hrms_test`) | `0` | `docs/remediation/evidence/ai-v1-db-test.log` |
| 5 | `node --test Backend/tests/api/ai-v1-evaluation-30.test.js` | **PASS** (`30/30` tình huống V1) | `0` | `docs/remediation/evidence/ai-v1-backend-full.log` |
| 6 | `npm test --prefix Backend` | **PASS** (`598/598` unit + integration + API tests, `0` fail, `0` skipped) | `0` | `docs/remediation/evidence/ai-v1-backend-full.log` |
| 7 | `node Backend/scripts/e2e-browser-verify.js` | **PASS** (`ASSERT 1..12`, gồm `AI_V1` desktop `1440px` & mobile `390px`) | `0` | `docs/remediation/evidence/ai-v1-e2e-browser.log` |
| 8 | `node Backend/scripts/check-phase-a-baseline.js` | **PASS** (`nexus_hrms` nguyên vẹn, `nexus_hrms_test` `READY`) | `0` | `docs/remediation/evidence/ai-v1-phase-a-baseline.log` |
| 9 | `node Backend/scripts/run-ai-v1-live-eval.js` | **BLOCKED** (Chưa cấu hình `GEMINI_API_KEY`) | `0` | `docs/remediation/evidence/ai-v1-live-eval.log` |

### Bằng chứng ảnh chụp màn hình giao diện (Browser E2E)
- `docs/remediation/evidence/screenshots/ai-v1-copilot-desktop-1440.png`
- `docs/remediation/evidence/screenshots/ai-v1-copilot-mobile-390.png`
- `docs/remediation/evidence/screenshots/r37-r38-ai-copilot-drawer.png`

---

## 3. Bảng Trạng Thái Cổng Nghiệm Thu Cuối Kỳ

| Cổng nghiệm thu | Trạng thái | Ghi chú chi tiết |
|---|---|---|
| **`IMPLEMENTATION_VERIFIED`** | **PASS** | Hoàn tất 100% các giai đoạn A–H trong mã nguồn, đạt toàn bộ kiểm thử Unit (`147` Backend + `74` Frontend), Database (`116`), API Integration (`30/30` kịch bản V1) và Headless Browser E2E (`390px`/`768px`/`1440px`). |
| **`LIVE_GEMINI_VERIFIED`** | **BLOCKED** | Môi trường hiện không có `GEMINI_API_KEY` (`GEMINI_API_KEY_CONFIGURED: false`). Tuân thủ nghiêm ngặt quy tắc không giả lập kết quả live và không hỏi khóa API trong khung chat. |
| **`READY_FOR_PRODUCTION_V1`** | **BLOCKED** | Chờ người vận hành cấu hình `GEMINI_API_KEY` vào `Backend/.env`, chạy `node Backend/scripts/run-ai-v1-live-eval.js --require-live` và thực hiện các cổng vận hành hạ tầng (Docker daemon / migration DB chính khi bảo trì). |

---

## 4. Danh Sách Việc Người Vận Hành (Operator) Cần Thực Hiện Để Mở Cổng Sản Xuất

1. **Cấu hình khóa Gemini API thật tại Backend**:
   - Mở tệp `Backend/.env` (trên máy chủ hoặc môi trường chạy container) và điền:
     ```env
     AI_ENABLED=true
     GEMINI_API_KEY=<khoa_api_gemini_that_cua_ban>
     GEMINI_MODEL=gemini-2.5-flash
     ```
2. **Chạy nghiệm thu Gemini thật có kiểm soát ngân sách**:
   ```powershell
   $env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/nexus_hrms_test"
   node Backend/scripts/run-ai-v1-live-eval.js --require-live
   ```
3. **Các cổng hạ tầng chung (khi triển khai môi trường thật)**:
   - Bật Docker Desktop daemon nếu cần chạy kiểm thử container hóa cô lập (`docker compose -f docker-compose.test.yml -p nexus-test up -d --build`).
   - Áp dụng 2 migration còn chờ (`010_payroll_policy_snapshot_and_holidays.sql`, `011_system_policy_versions.sql`) lên DB `nexus_hrms` trong khung giờ bảo trì theo quy trình vận hành.

---

## 5. Backlog Đề Xuất Cho Phiên Bản V1.1 (Ngoài Phạm Vi V1)

Các cải tiến tùy chọn dưới đây đã được tách sang backlog V1.1 để giữ V1 gọn, an toàn và ổn định:
1. **Lưu trữ lịch sử hội thoại AI bền vững trong PostgreSQL (có TTL tự động dọn dẹp)**: Giúp giữ ngữ cảnh `"Còn tháng trước?"` ngay cả khi tiến trình Node.js khởi động lại (hiện tại V1 xử lý an toàn bằng cách trả về `clarification` với các nút chọn nhanh).
2. **Streaming phản hồi từng phần (Server-Sent Events) sau khi hoàn tất bước xác minh**: Cải thiện cảm giác phản hồi tức thời cho các giải thích dài sau khi tầng `validateSemanticFieldBindings` đã duyệt xong.
3. **Tìm kiếm ngữ nghĩa kết hợp từ khóa (Hybrid Search) cho Sổ tay Nhân sự (`handbook_docs`)**: Nâng cao độ chính xác khi người dùng hỏi bằng từ đồng nghĩa phức tạp mà không cần mở rộng công cụ ghi dữ liệu.
