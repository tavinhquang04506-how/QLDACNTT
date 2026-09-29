# AI_V1_PROGRESS — Bảng Theo Dõi Tiến Độ Nâng Cấp AI NEXUS HRMS V1

- **Dự án**: `C:\Users\tavin\Downloads\QLDACNTT`
- **Kế hoạch gốc**: `18-KE-HOACH-NANG-CAP-AI-NEXUS-V1.md` & `19-REVIEW-AI-V1-141a14f.md`
- **Nhánh triển khai**: `feature/ai-v1-grounded-vietnamese` (tách từ `develop` tại `f44ae70`) & `bugfix/ai-v1-review-f01-f03` (tách từ `develop` tại `141a14f`)
- **Nguyên tắc cốt lõi**:
  - Giữ AI ở chế độ chỉ đọc (`Read-only`).
  - Mọi phân quyền, phép tính và dữ kiện phát hành đều do Backend quyết định và đối chiếu nguồn thực tế.
  - Mọi kiểm thử tự động chạy trên `nexus_hrms_test` và thư mục tạm cô lập; tuyệt đối không tác động `nexus_hrms` hay storage thật.
  - Giữ trạng thái `BLOCKED` trung thực cho cổng Gemini thật khi chưa cấu hình `GEMINI_API_KEY`.

---

## 1. Tiến Độ Theo Từng Giai Đoạn (A – H) & Khắc Phục Review `141a14f`

| Giai đoạn | Hạng mục công việc | Trạng thái | Bằng chứng / File liên quan |
|---|---|---|---|
| **Giai đoạn A** | Chuẩn bị nhánh Gitflow `feature/ai-v1-grounded-vietnamese`, rà soát 6 công cụ chỉ đọc, chốt hợp đồng V1 & 30 tình huống nghiệm thu | **DONE** | `docs/remediation/AI_V1_PROGRESS.md`, `Backend/src/modules/ai/schema.js` |
| **Giai đoạn B** | Tách cấu trúc `schema.js`, `claimRenderer.js`, `intentSlots.js`; chuẩn hóa định dạng `vi-VN` (`dd/MM/yyyy`, `VND`, số ngày lẻ, phân biệt `null` vs `0`); tính toán tại server | **DONE** | `Backend/src/modules/ai/schema.js`, `Backend/src/modules/ai/claimRenderer.js` |
| **Giai đoạn C** | Xử lý tiếng Việt có/không dấu, giải mã thời gian tương đối theo `Asia/Ho_Chi_Minh`, hỏi tiếp kế thừa ngữ cảnh (`"Còn tháng trước?"`), xóa slot khi đổi chủ đề, hỏi lại làm rõ (`clarification`) và chống ghi đè sau khi làm mới/đổi quyền | **DONE** | `Backend/src/modules/ai/intentSlots.js`, `Backend/src/modules/ai/service.js`, `Backend/src/modules/ai/routes.js` |
| **Giai đoạn D** | Giải thích dữ liệu chuyên sâu 6 miền nghiệp vụ & so sánh phiếu lương giữa 2 kỳ đã công bố (`payslip_comparison` gọi đủ 2 kỳ, server tính chênh lệch, kỳ `DU_THAO` trả `empty`) | **DONE** | `Backend/src/modules/ai/tools.js`, `Backend/src/modules/ai/claimRenderer.js`, `Backend/src/modules/ai/service.js` |
| **Giai đoạn E** | Nâng cấp giao diện `AiCopilotDrawerModal.jsx` & `aiCopilotState.js`: gợi ý mở đầu động theo vai trò & thời gian thực, khối `answerSections`, nút chọn `clarification`, chip `followUpSuggestions`, nút điều hướng `navigationActions`, nút `Làm mới`, ô nhập nhiều dòng, đáp ứng `390px`/`1440px` | **DONE** | `FrontEnd/src/utils/aiCopilotState.js`, `FrontEnd/src/modals/analytics/AiCopilotDrawerModal.jsx`, `FrontEnd/tests/aiCopilotState.test.js` |
| **Giai đoạn F** | Tích hợp Gemini thật có kiểm soát chi phí (`maxRetries = 1` cho `429`/`5xx`, không retry `401`/`403`/`404`), thu thập `providerMeta` (`latencyMs`, `providerCalls`, `retriesUsed`, `tokenUsage`), cập nhật biến môi trường `docker-compose.yml` & `docker-compose.test.yml` | **DONE** | `Backend/src/modules/ai/geminiProvider.js`, `docker-compose.yml`, `docker-compose.test.yml` |
| **Giai đoạn G** | Thực thi bộ kiểm thử Unit (`150/150` Backend, `76/76` Frontend), API Integration (`34/34` pass trên `nexus_hrms_test`), Browser E2E (`390px`/`768px`/`1440px`, `10a..10i`), và kịch bản Live Gemini (`BLOCKED` do thiếu `GEMINI_API_KEY`, preflight `PASS`) | **DONE** | `Backend/tests/unit/aiV1Modules.test.js`, `Backend/tests/api/ai-v1-evaluation-30.test.js`, `Backend/scripts/e2e-browser-verify.js`, `Backend/scripts/run-ai-v1-live-eval.js` |
| **Giai đoạn H** | Hoàn thiện bộ tài liệu bàn giao (`AI_V1_ARCHITECTURE.md`, `AI_V1_EVALUATION.md`, `AI_V1_HANDOFF.md`), chạy toàn bộ cổng chất lượng, commit và merge `--no-ff` vào `develop` | **DONE** | `docs/remediation/AI_V1_*.md` |
| **Khắc phục Review `141a14f` (`AI-V1-F01..F03`)** | Sửa `run-ai-v1-live-eval.js` theo API/schema thực + DB guard + synthetic fixtures + preflight + mock transport; resolve `"hai kỳ gần nhất"` từ DB (`resolveLatestPublishedPayslipPeriods`); bảo toàn `null`/`undefined` là `unavailable` trong `computePayslipComparison` | **DONE** | `Backend/scripts/run-ai-v1-live-eval.js`, `Backend/src/modules/ai/tools.js`, `Backend/src/modules/ai/intentSlots.js`, `Backend/src/modules/ai/claimRenderer.js`, `Backend/src/modules/ai/service.js` |

---

## 2. Trạng Thái 3 Cổng Nghiệm Thu Cuối Kỳ

| Cổng nghiệm thu | Trạng thái | Diễn giải |
|---|---|---|
| `IMPLEMENTATION_VERIFIED` | **PASS** | Toàn bộ mã nguồn Backend/Frontend, Unit tests (`150/150` Backend, `76/76` Frontend), API Integration (`34/34` trên `nexus_hrms_test`), và Headless Browser E2E (`390px`/`768px`/`1440px`, `10a..10i`) đều đạt 100% (`exit code = 0`). |
| `LIVE_GEMINI_VERIFIED` | **BLOCKED** | Môi trường hiện chưa cấu hình `GEMINI_API_KEY`. Kịch bản `Backend/scripts/run-ai-v1-live-eval.js` đã vượt qua `preflight.passed = true` và `18/18` kịch bản mock transport trên `nexus_hrms_test`, sẵn sàng chạy ngay khi người vận hành nạp khóa vào `Backend/.env`. |
| `READY_FOR_PRODUCTION_V1` | **BLOCKED** (Chờ `GEMINI_API_KEY` & cổng vận hành Docker) | Sẵn sàng về mặt mã nguồn và kiểm thử tự động; chờ người vận hành nạp `GEMINI_API_KEY` tại `Backend/.env` và chạy nghiệm thu live Gemini. |
