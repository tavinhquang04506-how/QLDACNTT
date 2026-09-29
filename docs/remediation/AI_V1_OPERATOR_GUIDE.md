# AI_V1_OPERATOR_GUIDE — Hướng Dẫn Vận Hành Trợ Lý Nhân Sự AI NEXUS HRMS V1

- **Dự án**: `C:\Users\tavin\Downloads\QLDACNTT`
- **Phiên bản**: AI NEXUS HRMS V1 (`bugfix/ai-v1-review-f01-f03` -> `develop`)

---

## 1. Cấu Hình Biến Môi Trường (`Backend/.env` & Docker Compose)

> **Nguyên tắc bảo mật bắt buộc**:
> - `GEMINI_API_KEY` **chỉ** được đặt tại tầng Backend (`Backend/.env` hoặc biến môi trường của container `backend`).
> - Tuyệt đối **không** đặt `GEMINI_API_KEY` vào `FrontEnd/.env`, `VITE_*`, mã nguồn hoặc commit lên Git.
> - Không hardcode mật khẩu cơ sở dữ liệu trong tài liệu hướng dẫn hoặc câu lệnh CLI.

### 1.1. Danh sách biến môi trường AI V1

```env
# Bật/tắt tính năng Trợ lý AI (true | false)
AI_ENABLED=true

# Khóa API Google Gemini (chỉ cấu hình tại Backend, không commit lên Git)
GEMINI_API_KEY=your_real_gemini_api_key_here

# Model Gemini mặc định cho V1 (nhanh, tiết kiệm chi phí, hỗ trợ gọi hàm tốt)
GEMINI_MODEL=gemini-2.5-flash

# Thời gian chờ tối đa cho mỗi lượt gọi Gemini API (mili-giây)
AI_TIMEOUT_MS=15000

# Số token đầu ra tối đa cho mỗi lượt phản hồi
AI_MAX_OUTPUT_TOKENS=700

# Số vòng gọi công cụ tối đa trong 1 yêu cầu (tối đa 2 vòng cho V1)
AI_MAX_TOOL_ROUNDS=2

# Độ dài tối đa của câu hỏi người dùng (ký tự)
AI_MAX_MESSAGE_CHARS=1000

# Giới hạn số yêu cầu tối đa mỗi phút trên mỗi tài khoản người dùng
AI_REQUESTS_PER_MINUTE=10
```

### 1.2. Cách bật / tắt nhanh Trợ lý AI
- **Tắt tạm thời AI (Maintenance / Khi chưa nạp khóa API)**:
  - Đặt `AI_ENABLED=false` trong `Backend/.env` (hoặc biến môi trường container `backend`), sau đó khởi động lại dịch vụ Backend.
- **Bật AI với Gemini thật**:
  - Đặt `AI_ENABLED=true` và cung cấp `GEMINI_API_KEY` hợp lệ trong `Backend/.env`.

---

## 2. Quy Trình Kiểm Tra Preflight & Nghiệm Thu Gemini Thật (Live Gemini Verification)

Kịch bản `Backend/scripts/run-ai-v1-live-eval.js` tự động cưỡng bức `NODE_ENV=test`, kiểm tra `assertSafeTestDatabase` (`SELECT current_database()` phải là `nexus_hrms_test`, từ chối ngay nếu trỏ vào `nexus_hrms`), khởi tạo bộ dữ liệu giả lập tổng hợp (`NV-LIVE-*`, `live-eval-*@example.test`) và tự động dọn sạch trong khối `finally`.

### 2.1. Kiểm tra Preflight (Không cần `GEMINI_API_KEY`, không gọi mạng)
```powershell
node Backend/scripts/run-ai-v1-live-eval.js --preflight
```
- Kiểm tra toàn bộ hàm export của `service.js` (`runCopilot`, `resetConversation`, `clearAiRuntimeState`), guard cơ sở dữ liệu kiểm thử `nexus_hrms_test`, lược đồ bảng (`users.role_code`, `roles.role_code`, `employees.department_id`) và vòng đời tạo/xóa synthetic fixtures.

### 2.2. Chạy nghiệm thu Gemini thật sau khi cấu hình `GEMINI_API_KEY` trong `Backend/.env`
```powershell
node Backend/scripts/run-ai-v1-live-eval.js --require-live
```
- Ngân sách cứng: tối đa `<= 30` truy vấn (`18` tình huống đại diện), tổng số lần retry toàn đợt `<= 5` (cấp ngân sách `maxRetries = Math.min(1, remainingRetryBudget)` trước mỗi cuộc gọi).
- Nếu chưa cấu hình `GEMINI_API_KEY`, lệnh `node Backend/scripts/run-ai-v1-live-eval.js` vẫn chạy đầy đủ bước `preflight` rồi trả về `"status": "BLOCKED"` trung thực.
- Nếu phát hiện lỗi xác thực (`AI_PROVIDER_AUTH_ERROR`), sai/ngừng hỗ trợ model (`AI_MODEL_NOT_FOUND`, `AI_MODEL_RETIRED`) hoặc chạm trần hạn mức (`AI_RATE_LIMITED`), script **dừng ngay lập tức**.

---

## 3. Đọc Log Kiểm Toán Đã Che Dữ Liệu Nhạy Cảm (Redacted Audit Log)

Mỗi yêu cầu tới `/api/ai/copilot` đều ghi nhận bản ghi kiểm toán vận hành trong bộ nhớ đệm kiểm toán (`getRecentAiAuditLogs()`) với các trường an toàn:

```json
{
  "requestId": "ai-...",
  "timestamp": "2026-10-24T14:30:00.000Z",
  "userId": "USR-...",
  "roleCode": "EMPLOYEE",
  "model": "gemini-2.5-flash",
  "intent": "payslip_comparison",
  "responseType": "answer",
  "toolsUsed": ["get_my_payslip", "get_my_payslip"],
  "refusalCodes": [],
  "providerCalls": 2,
  "retriesUsed": 0,
  "tokenUsage": {
    "promptTokens": 420,
    "completionTokens": 115,
    "totalTokens": 535
  },
  "latencyMs": 640
}
```

- **Cam kết bảo mật log**: Không bao giờ ghi `GEMINI_API_KEY`, `Authorization` JWT, mật khẩu DB, CCCD, số tài khoản ngân hàng, hay toàn bộ nội dung lương chi tiết ra console/log vận hành.

---

## 4. Bảng Xử Lý Sự Cố Thường Gặp (Troubleshooting)

| Mã HTTP / Mã lỗi (`errorCode`) | Nguyên nhân | Cách xử lý của hệ thống & Hướng khắc phục |
|---|---|---|
| `503 AI_NOT_CONFIGURED` | Thiếu `GEMINI_API_KEY` tại Backend | Cấu hình `GEMINI_API_KEY` trong `Backend/.env` và khởi động lại Backend. |
| `503 AI_MODEL_RETIRED` | Cấu hình model cũ đã ngừng hỗ trợ (`gemini-1.5-*`, `gemini-pro`) | Đặt `GEMINI_MODEL=gemini-2.5-flash` trong `Backend/.env`. |
| `502 AI_PROVIDER_AUTH_ERROR` (`401`/`403` từ Gemini) | Khóa `GEMINI_API_KEY` bị sai, hết hạn hoặc bị giới hạn quyền | Kiểm tra lại khóa API trên Google AI Studio / Google Cloud Console. Hệ thống **không** tự động retry lỗi `401`/`403`. |
| `502 AI_MODEL_NOT_FOUND` (`404` từ Gemini) | Tên model trong `GEMINI_MODEL` không tồn tại hoặc không hỗ trợ `generateContent` | Đặt lại `GEMINI_MODEL=gemini-2.5-flash`. Hệ thống **không** tự động retry lỗi `404`. |
| `429 AI_RATE_LIMITED` | Người dùng gửi quá `AI_REQUESTS_PER_MINUTE` hoặc chạm hạn mức `429` từ Gemini | Hệ thống retry tối đa `1` lần khi còn ngân sách retry và thời gian; nếu vẫn vượt ngưỡng sẽ trả `429 AI_RATE_LIMITED`. |
| `502 AI_PROVIDER_ERROR` (`500`/`502`/`503` từ Gemini) | Máy chủ Google Gemini hoặc kết nối mạng gặp sự cố tạm thời | Hệ thống retry tối đa `1` lần trong ngân sách cho phép. Người dùng có thể bấm nút **"Thử gửi lại"** trên giao diện. |
| `504 AI_TIMEOUT` | Yêu cầu vượt quá `AI_TIMEOUT_MS` | Tăng nhẹ `AI_TIMEOUT_MS` (ví dụ `20000`) hoặc kiểm tra kết nối mạng từ máy chủ Backend tới `generativelanguage.googleapis.com`. |
| `200 OK` kèm `ANSWER_SOURCE_MISMATCH` / `UNGROUNDED_ANSWER_REJECTED` | Mô hình trả về số liệu lệch với DB hoặc tự suy diễn ngoài phạm vi công cụ | Cơ chế bảo vệ chống bịa đặt đã hoạt động đúng thiết kế để chặn dữ kiện sai. Người dùng có thể bấm **"Thử gửi lại"** hoặc chọn các gợi ý có sẵn. |
| `200 OK` kèm `SCOPE_CHANGED_DURING_REQUEST` | Quyền hạn/phòng ban của tài khoản thay đổi hoặc người dùng bấm **"Làm mới"** khi yêu cầu cũ đang xử lý | Hệ thống tự động hủy kết quả cũ để chống rò rỉ dữ liệu giữa các phạm vi quyền hạn. |
