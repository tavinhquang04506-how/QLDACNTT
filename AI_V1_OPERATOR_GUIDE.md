# AI_V1_OPERATOR_GUIDE — Hướng Dẫn Vận Hành Trợ Lý Nhân Sự AI NEXUS HRMS V1

- **Dự án**: `C:\Users\tavin\Downloads\QLDACNTT`
- **Phiên bản**: AI NEXUS HRMS V1 (`feature/ai-v1-grounded-vietnamese` -> `develop`)

---

## 1. Cấu Hình Biến Môi Trường (`Backend/.env` & Docker Compose)

> **Nguyên tắc bảo mật bắt buộc**:
> - `GEMINI_API_KEY` **chỉ** được đặt tại tầng Backend (`Backend/.env` hoặc biến môi trường của container `backend`).
> - Tuyệt đối **không** đặt `GEMINI_API_KEY` vào `FrontEnd/.env`, `VITE_*`, mã nguồn hoặc commit lên Git.

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
  - Khi `AI_ENABLED=false`, endpoint `POST /api/ai/copilot` trả về mã lỗi `503 AI_DISABLED` kèm thông báo tiếng Việt rõ ràng; giao diện hiển thị nút **"Thử gửi lại"** mà không làm treo trang.
- **Bật AI với Gemini thật**:
  - Đặt `AI_ENABLED=true` và cung cấp `GEMINI_API_KEY` hợp lệ trong `Backend/.env`.

---

## 2. Quy Trình Kiểm Tra Nghiệm Thu Gemini Thật (Live Gemini Verification)

Sau khi người vận hành cấu hình `GEMINI_API_KEY` trong `Backend/.env`, thực hiện lệnh kiểm tra có kiểm soát ngân sách (tối đa `<= 30` truy vấn, `<= 5` lần retry toàn đợt):

```powershell
# Chạy trên cơ sở dữ liệu kiểm thử cô lập nexus_hrms_test:
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/nexus_hrms_test"
node Backend/scripts/run-ai-v1-live-eval.js --require-live
```

- Nếu chưa cấu hình `GEMINI_API_KEY`, lệnh `node Backend/scripts/run-ai-v1-live-eval.js` sẽ báo cáo trạng thái `"status": "BLOCKED"` kèm hướng dẫn mà không phát sinh bất kỳ cuộc gọi mạng nào.
- Nếu phát hiện lỗi xác thực (`401`/`403`), sai tên model (`404`) hoặc hết hạn mức (`429` vượt ngưỡng retry), script sẽ **dừng ngay lập tức** để bảo vệ hạn mức tài khoản.

---

## 3. Đọc Log Kiểm Toán Đã Che Dữ Liệu Nhạy Cảm (Redacted Audit Log)

Mỗi yêu cầu tới `/api/ai/copilot` đều ghi nhận bản ghi kiểm toán vận hành trong bộ nhớ đệm kiểm toán (`getRecentAiAuditLogs()`) với các trường an toàn:

```json
{
  "requestId": "a1b2c3d4-...",
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
    "promptTokenCount": 420,
    "candidatesTokenCount": 115,
    "totalTokenCount": 535
  },
  "latencyMs": 640,
  "redacted": true
}
```

- **Cam kết bảo mật log**: Không bao giờ ghi `GEMINI_API_KEY`, `Authorization` JWT, CCCD, số tài khoản ngân hàng, hay toàn bộ nội dung lương chi tiết ra console/log vận hành.

---

## 4. Bảng Xử Lý Sự Cố Thường Gặp (Troubleshooting)

| Mã HTTP / Mã lỗi (`errorCode`) | Nguyên nhân | Cách xử lý của hệ thống & Hướng khắc phục |
|---|---|---|
| `503 AI_DISABLED` | `AI_ENABLED=false` | Hệ thống đã tắt chủ động tính năng AI. Đặt `AI_ENABLED=true` khi sẵn sàng mở lại. |
| `503 AI_PROVIDER_NOT_CONFIGURED` | Thiếu `GEMINI_API_KEY` tại Backend | Cấu hình `GEMINI_API_KEY` trong `Backend/.env` và khởi động lại Backend. |
| `502 AI_PROVIDER_AUTH_FAILED` (`401`/`403` từ Gemini) | Khóa `GEMINI_API_KEY` bị sai, hết hạn hoặc bị giới hạn IP/API | Kiểm tra lại khóa API trên Google AI Studio / Google Cloud Console. Hệ thống **không** tự động retry lỗi `401`/`403`. |
| `502 AI_PROVIDER_MODEL_NOT_FOUND` (`404` từ Gemini) | Tên model trong `GEMINI_MODEL` không tồn tại hoặc không hỗ trợ `generateContent` | Đặt lại `GEMINI_MODEL=gemini-2.5-flash`. Hệ thống **không** tự động retry lỗi `404`. |
| `429 AI_RATE_LIMITED` | Người dùng gửi quá `AI_REQUESTS_PER_MINUTE` (mặc định `10` lần/phút) | Chờ hết chu kỳ 60 giây hoặc điều chỉnh `AI_REQUESTS_PER_MINUTE` nếu cần thiết. |
| `503 AI_PROVIDER_QUOTA_EXCEEDED` (`429` từ Gemini) | Hạn mức (Quota/RPM/TPM) của tài khoản Gemini API bị vượt quá | Hệ thống tự động retry tối đa `1` lần nếu còn thời gian chờ; nếu vẫn lỗi sẽ trả thông báo rõ ràng. Kiểm tra hạn mức billing trên Google AI Studio. |
| `503 AI_PROVIDER_UNAVAILABLE` (`500`/`502`/`503` từ Gemini) | Máy chủ Google Gemini gặp sự cố tạm thời | Hệ thống tự động retry tối đa `1` lần (`backoff` ngắn). Người dùng có thể bấm nút **"Thử gửi lại"** trên giao diện. |
| `504 AI_PROVIDER_TIMEOUT` | Yêu cầu vượt quá `AI_TIMEOUT_MS` (mặc định `15000ms`) | Tăng nhẹ `AI_TIMEOUT_MS` (ví dụ `20000`) hoặc kiểm tra kết nối mạng từ máy chủ Backend tới `generativelanguage.googleapis.com`. |
| `200 OK` kèm `ANSWER_SOURCE_MISMATCH` / `UNGROUNDED_ANSWER_REJECTED` | Mô hình trả về số liệu lệch với DB hoặc tự suy diễn ngoài phạm vi công cụ | Cơ chế bảo vệ chống bịa đặt đã hoạt động đúng thiết kế để chặn dữ kiện sai. Người dùng có thể bấm **"Thử gửi lại"** hoặc chọn các gợi ý có sẵn. |
| `200 OK` kèm `SCOPE_CHANGED_DURING_REQUEST` | Quyền hạn/phòng ban của tài khoản thay đổi hoặc người dùng bấm **"Làm mới"** khi yêu cầu cũ đang xử lý | Hệ thống tự động hủy kết quả cũ để chống rò rỉ dữ liệu giữa các phạm vi quyền hạn. |
