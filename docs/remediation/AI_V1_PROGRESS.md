# AI_V1_PROGRESS — Bảng Theo Dõi Tiến Độ Nâng Cấp AI NEXUS HRMS V1

- **Dự án**: `C:\Users\tavin\Downloads\QLDACNTT`
- **Kế hoạch gốc**: `18-KE-HOACH-NANG-CAP-AI-NEXUS-V1.md` & `19-REVIEW-AI-V1-141a14f.md`
- **Nhánh triển khai**: `feature/ai-v1-grounded-vietnamese`, `bugfix/ai-v1-review-f01-f03` & `feature/ai-v1-live-gemini-verification`
- **Nguyên tắc cốt lõi**:
  - Giữ AI ở chế độ chỉ đọc (`Read-only`).
  - Mọi phân quyền, phép tính và dữ kiện phát hành đều do Backend quyết định và đối chiếu nguồn thực tế.
  - Mọi kiểm thử tự động chạy trên `nexus_hrms_test` và thư mục tạm cô lập; tuyệt đối không tác động `nexus_hrms` hay storage thật.
  - Đã kích hoạt và kiểm định trực tiếp với Google Gemini API thật (`gemini-3.5-flash-lite`) đạt `18/18 PASS` (`retriesUsed: 0`).

---

## 1. Tiến Độ Theo Từng Giai Đoạn (A – H), Khắc Phục Review `141a14f` & Kiểm Định Live Gemini (`gemini-3.5-flash-lite`)

| Giai đoạn | Hạng mục công việc | Trạng thái | Bằng chứng / File liên quan |
|---|---|---|---|
| **Giai đoạn A** | Chuẩn bị nhánh Gitflow `feature/ai-v1-grounded-vietnamese`, rà soát 6 công cụ chỉ đọc, chốt hợp đồng V1 & 30 tình huống nghiệm thu | **DONE** | `docs/remediation/AI_V1_PROGRESS.md`, `Backend/src/modules/ai/schema.js` |
| **Giai đoạn B** | Tách cấu trúc `schema.js`, `claimRenderer.js`, `intentSlots.js`; chuẩn hóa định dạng `vi-VN` (`dd/MM/yyyy`, `VND`, số ngày lẻ, phân biệt `null` vs `0`); tính toán tại server | **DONE** | `Backend/src/modules/ai/schema.js`, `Backend/src/modules/ai/claimRenderer.js` |
| **Giai đoạn C** | Xử lý tiếng Việt có/không dấu, giải mã thời gian tương đối theo `Asia/Ho_Chi_Minh`, hỏi tiếp kế thừa ngữ cảnh (`"Còn tháng trước?"`), xóa slot khi đổi chủ đề, hỏi lại làm rõ (`clarification`) và chống ghi đè sau khi làm mới/đổi quyền | **DONE** | `Backend/src/modules/ai/intentSlots.js`, `Backend/src/modules/ai/service.js`, `Backend/src/modules/ai/routes.js` |
| **Giai đoạn D** | Giải thích dữ liệu chuyên sâu 6 miền nghiệp vụ & so sánh phiếu lương giữa 2 kỳ đã công bố (`payslip_comparison` gọi đủ 2 kỳ, server tính chênh lệch, kỳ `DU_THAO` trả `empty`) | **DONE** | `Backend/src/modules/ai/tools.js`, `Backend/src/modules/ai/claimRenderer.js`, `Backend/src/modules/ai/service.js` |
| **Giai đoạn E** | Nâng cấp giao diện `AiCopilotDrawerModal.jsx` & `aiCopilotState.js`: gợi ý mở đầu động theo vai trò & thời gian thực, khối `answerSections`, nút chọn `clarification`, chip `followUpSuggestions`, nút điều hướng `navigationActions`, nút `Làm mới`, ô nhập nhiều dòng, đáp ứng `390px`/`1440px` | **DONE** | `FrontEnd/src/utils/aiCopilotState.js`, `FrontEnd/src/modals/analytics/AiCopilotDrawerModal.jsx`, `FrontEnd/tests/aiCopilotState.test.js` |
| **Giai đoạn F** | Tích hợp Gemini thật có kiểm soát chi phí (`maxRetries = 1` cho `429`/`5xx`, không retry `401`/`403`/`404`), bảo toàn `thoughtSignature` cho dòng model Gemini 3.x, thu thập `providerMeta` (`latencyMs`, `providerCalls`, `retriesUsed`, `tokenUsage`) | **DONE** | `Backend/src/modules/ai/geminiProvider.js`, `Backend/src/modules/ai/service.js`, `docker-compose.yml`, `docker-compose.test.yml` |
| **Giai đoạn G** | Thực thi bộ kiểm thử Unit (`150/150` Backend, `77/77` Frontend), API Integration (`34/34` pass trên `nexus_hrms_test`), Browser E2E (`390px`/`768px`/`1440px`, `10a..10i`), và kịch bản Live Gemini (`18/18 PASS` trên `nexus_hrms_test` với `gemini-3.5-flash-lite`) | **DONE** | `Backend/tests/unit/aiV1Modules.test.js`, `Backend/tests/api/ai-v1-evaluation-30.test.js`, `Backend/scripts/run-ai-v1-live-eval.js`, `docs/remediation/evidence/ai-v1-live-eval-report.json` |
| **Giai đoạn H** | Hoàn thiện bộ tài liệu bàn giao (`AI_V1_ARCHITECTURE.md`, `AI_V1_EVALUATION.md`, `AI_V1_OPERATOR_GUIDE.md`, `AI_V1_HANDOFF.md`), chạy toàn bộ cổng chất lượng, commit và merge `--no-ff` vào `develop` | **DONE** | `docs/remediation/AI_V1_*.md`, `docs/remediation/FINAL_WEBSITE_UAT.md` |
| **Khắc phục Review `141a14f` (`AI-V1-F01..F03`)** | Sửa `run-ai-v1-live-eval.js` theo API/schema thực + DB guard + synthetic fixtures + preflight + mock transport; resolve `"hai kỳ gần nhất"` từ DB (`resolveLatestPublishedPayslipPeriods`); bảo toàn `null`/`undefined` là `unavailable` trong `computePayslipComparison` | **DONE** | `Backend/scripts/run-ai-v1-live-eval.js`, `Backend/src/modules/ai/tools.js`, `Backend/src/modules/ai/intentSlots.js`, `Backend/src/modules/ai/claimRenderer.js`, `Backend/src/modules/ai/service.js` |
| **Kích hoạt & Nghiệm thu Live Gemini (`gemini-3.5-flash-lite`)** | Bảo toàn `thoughtSignature` trong vòng gọi công cụ Gemini 3.5; chuẩn hóa đối chiếu hậu kiểm tiếng Việt; chạy `run-ai-v1-live-eval.js --require-live` đạt `18/18 PASS` (`retriesUsed: 0`); kiểm thử trực tiếp trên giao diện `http://localhost:3000` (ngày phép, phiếu lương, quy chế, câu hỏi tiếp nối, làm mới hội thoại, chặn vượt quyền) | **DONE** | `docs/remediation/evidence/ai-v1-live-eval-report.json`, `docs/remediation/evidence/ui-ai-v1-live-gemini-verified.png` |

---

## 2. Trạng Thái 3 Cổng Nghiệm Thu Cuối Kỳ

| Cổng nghiệm thu | Trạng thái | Diễn giải |
|---|---|---|
| `IMPLEMENTATION_VERIFIED` | **PASS** | Toàn bộ mã nguồn Backend/Frontend, Unit tests (`150/150` Backend, `77/77` Frontend), API Integration (`34/34` AI V1 + `14/14` bảo mật trên `nexus_hrms_test`), và Headless Browser E2E (`390px`/`768px`/`1440px`, `10a..10i`) đều đạt 100% (`exit code = 0`). |
| `LIVE_GEMINI_VERIFIED` | **PASS** | Đã chạy `node Backend/scripts/run-ai-v1-live-eval.js --require-live` với `NODE_ENV=test`, `DB_NAME=nexus_hrms_test`, `DB_NAME_TEST=nexus_hrms_test` gọi trực tiếp Google Gemini API (`gemini-3.5-flash-lite`): đạt **`18/18 PASS`** (`queriesUsed: 18`, `retriesUsed: 0`, `EXIT_CODE=0`) và kiểm thử giao diện trực tiếp tại `http://localhost:3000` đạt 100%. |
| `READY_FOR_PRODUCTION_V1` | **PASS** *(Local Runtime `:3000` / `:8000`)* | Website và Trợ lý AI NEXUS V1 đã hoạt động đầy đủ trên môi trường thật (`http://localhost:3000` / `http://localhost:8000`) với database chính `nexus_hrms` (`READY 11/11`) và model `gemini-3.5-flash-lite`. |
