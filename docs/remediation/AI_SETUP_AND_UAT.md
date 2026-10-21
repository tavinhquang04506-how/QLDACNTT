# AI COPILOT SETUP, GROUNDING ARCHITECTURE & UAT GUIDE (`R08` & `R29`)

## 1. Kiến Trúc Grounded Gemini Copilot (Read-Only MVP)

Trợ lý Nhân sự AI NEXUS (`POST /api/ai/chat`) hoạt động theo kiến trúc **Server-Grounded Function Calling (Read-Only MVP)**:
1. **Định danh xác thực từ máy chủ**: Mọi lời gọi công cụ (`executeToolCall`) đều nhận `actor` (`userId`, `employeeId`, `roleCode`, `departmentId`) trực tiếp từ JWT middleware trên server. Mọi trường `context` do client gửi kèm đều bị bỏ qua (`ignoredClientContext: true`).
2. **Đồng hồ thời gian thực theo múi giờ (`R29`)**:
   - Hàm `getCurrentClock(nowOverride, timeZone)` trong `Backend/src/modules/ai/tools.js` sử dụng `APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh'`.
   - Loại bỏ hoàn toàn hằng số năm `2026` và tháng `'2026-09'` từng bị cố định trong mã nguồn.
   - Kiểm thử tự động bao phủ cả biên giao thừa (`2026-12-31T17:30:00Z` tức `2027-01-01 00:30:00` tại `Asia/Ho_Chi_Minh` → tự động nhận `year = 2027`, `month = '2027-01'`).
3. **Kiểm tra hợp lệ tham số đầu vào nghiêm ngặt (`R29`)**:
   - Từ chối các giá trị `year` không hợp lệ (`< 2000` hoặc `> 2100` hoặc không phải số nguyên), `month` sai định dạng `YYYY-MM`, ngày không tồn tại trên lịch (`2026-02-30`), khoảng ngày đảo ngược (`from > to`), hoặc khoảng ngày vượt quá `62` ngày với mã lỗi `INVALID_ARGUMENT` thay vì âm thầm thay bằng `'2026-09'`.
4. **Tra cứu phiên bản chính sách lịch sử theo kỳ (`R29` — `search_policies`)**:
   - Công cụ `search_policies` hỗ trợ tham số `period` (`YYYY-MM`), `effectiveDate` (`YYYY-MM-DD`), và tự động nhận diện kỳ lương trong câu hỏi tiếng Việt (ví dụ: `"phụ cấp ăn trưa kỳ 2025-01"` hoặc `"tháng 8/2026"`).
   - Khi có kỳ cụ thể, `search_policies` gọi `settingsService.getSettingsForPeriod(executor, targetPeriod)` để lấy đúng phiên bản chính sách có hiệu lực (`effective_from <= targetPeriod`) từ bảng `system_policy_versions`.
   - Nếu kỳ được hỏi nằm trước phiên bản chính sách sớm nhất trong hệ thống, công cụ trả về `found: false, policyVersionFound: false, errorCode: 'POLICY_VERSION_NOT_FOUND', systemSettings: []` (tuyệt đối không trả cấu hình hiện tại `system_settings` làm sai lệch câu trả lời lịch sử).
5. **Tái xác minh phạm vi hội thoại & Nhật ký ẩn danh (`R29`)**:
   - `conversationStore` gắn chặt với `ownerUserId`, `roleCode`, và `departmentId`. Nếu người dùng thay đổi vai trò hoặc phòng ban giữa phiên hội thoại, lịch sử ngữ cảnh cũ tự động bị loại bỏ để không rò rỉ dữ liệu từ quyền cũ.
   - Nhật ký vận hành `getRedactedAiAuditLogs()` chỉ ghi `requestId`, `userId`, `roleCode`, `model`, `toolsUsed`, `refusalCodes`, `latencyMs` (`redacted: true`), không bao giờ ghi `GEMINI_API_KEY`, mật khẩu, CCCD, số tài khoản, hay số tiền lương.

---

## 2. Danh Mục 6 Công Cụ Chỉ Đọc (Read-Only Tools)

| Tên Công Cụ | Phạm Vi Vai Trò | Bảng Dữ Liệu Nguồn | Mã Lỗi Bảo Vệ / Từ Chối |
|---|---|---|---|
| `get_my_leave_balance` | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `CEO` (chỉ chính mình) | `leave_balances`, `leave_types`, `leave_requests` | `FORBIDDEN_ROLE` (`ADMIN`/`KIOSK`), `FORBIDDEN_CROSS_EMPLOYEE`, `INVALID_ARGUMENT` |
| `get_my_attendance` | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `CEO` (chỉ chính mình) | `attendance_logs`, `attendance_appeals` | `FORBIDDEN_ROLE`, `FORBIDDEN_CROSS_EMPLOYEE`, `INVALID_ARGUMENT` (giới hạn tối đa 62 ngày) |
| `get_my_payslip` | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `CEO` (chỉ phiếu đã chốt `DA_CHOT`/`DA_CHUYEN_KHOAN` của chính mình) | `payslips`, `payroll_periods` | `FORBIDDEN_ROLE`, `FORBIDDEN_CROSS_EMPLOYEE`, `INVALID_ARGUMENT` |
| `get_scoped_dashboard` | `LINE_MANAGER` (`department`), `HR_DIRECTOR` & `CEO` (`all`) | `employees`, `departments`, `attendance_logs`, `leave_requests`, `projects` | `FORBIDDEN_SCOPE` (`EMPLOYEE`/`ADMIN`/`KIOSK`), `FORBIDDEN_CROSS_DEPARTMENT`, `INVALID_ARGUMENT` |
| `get_scoped_performance` | `EMPLOYEE` (`self`), `LINE_MANAGER` (`department`), `HR_DIRECTOR` & `CEO` (`all`) | `performance_reviews`, `employees` + `turnoverService` | `FORBIDDEN_SCOPE`, `FORBIDDEN_CROSS_EMPLOYEE`, `FORBIDDEN_CROSS_DEPARTMENT` |
| `search_policies` | Mọi vai trò hợp lệ (trừ `KIOSK`) | `handbook_docs`, `system_settings`, `system_policy_versions` | `INVALID_ARGUMENT`, `POLICY_VERSION_NOT_FOUND`, lọc prompt injection (`sanitizePolicyText`) |

---

## 3. Biến Môi Trường Cấu Hình (`Backend/.env`)

```dotenv
# Khóa kết nối Google Gemini API (chỉ cấu hình phía Backend, tuyệt đối không đưa vào VITE_*)
GEMINI_API_KEY=your_live_gemini_api_key_here

# Model Gemini hiện hành (khuyến nghị gemini-2.5-flash; các model gemini-1.5-* đã retired sẽ bị chặn 503 AI_MODEL_RETIRED)
GEMINI_MODEL=gemini-2.5-flash

# Múi giờ chuẩn của doanh nghiệp cho đồng hồ AI & chấm công
APP_TIMEZONE=Asia/Ho_Chi_Minh

# Giới hạn vận hành an toàn
AI_TIMEOUT_MS=20000
AI_MAX_OUTPUT_TOKENS=1200
AI_MAX_TOOL_ROUNDS=3
AI_MAX_MESSAGE_CHARS=4000
AI_REQUESTS_PER_MINUTE=10
```

---

## 4. Trạng Thái Kiểm Thử & Hướng Dẫn Smoke Test Live Gemini

### 4.1. Kiểm thử tự động đã hoàn tất (`VERIFIED` trên Mocked Provider & Real Test DB)
Chạy các lệnh sau trên `nexus_hrms_test`:
```powershell
node --test Backend/tests/api/ai-copilot-grounding.test.js
node --test Backend/tests/api/r27-r30-review-fixes.test.js
```
Bao phủ đầy đủ:
- Xác thực JWT, chặn `KIOSK` (`403`), chặn `ADMIN` gọi công cụ nhân sự cá nhân (`FORBIDDEN_ROLE`).
- Chặn đọc chéo nhân viên (`FORBIDDEN_CROSS_EMPLOYEE`), chặn Trưởng phòng đọc chéo phòng ban (`FORBIDDEN_CROSS_DEPARTMENT`).
- Lọc prompt injection nhúng trong `handbook_docs` (`promptInjectionFiltered: true`).
- Đồng hồ động theo `Asia/Ho_Chi_Minh`, kiểm tra biên năm mới `2027`, kiểm tra từ chối ngày/tháng sai (`INVALID_ARGUMENT`).
- Tra cứu 3 phiên bản chính sách lịch sử liên tiếp và từ chối kỳ trước lịch sử (`POLICY_VERSION_NOT_FOUND`).
- Xử lý lỗi provider (`503 AI_NOT_CONFIGURED`, `503 AI_MODEL_RETIRED`, `502 AI_PROVIDER_AUTH_ERROR`, `429 AI_RATE_LIMITED`, `504 AI_PROVIDER_TIMEOUT`, `502 AI_EMPTY_RESPONSE`).

### 4.2. Quy trình Smoke Test Live Gemini (Khi Operator cấp `GEMINI_API_KEY` thật)
> **Trạng thái hiện tại**: `BLOCKED` đối với bước gọi mạng ra Google Gemini trực tiếp do môi trường kiểm thử chưa nạp `GEMINI_API_KEY` thật (`GEMINI_API_KEY_CONFIGURED = false`). Không sử dụng câu trả lời giả (mock fallback) khi thiếu key.

Khi Operator cấu hình `GEMINI_API_KEY` thật vào `Backend/.env`, thực hiện nghiệm thu Live theo 3 bước:
1. Khởi động Backend (`npm start --prefix Backend`) và đăng nhập bằng tài khoản `EMPLOYEE` trên giao diện web.
2. Mở ngăn kéo **Trợ lý AI NEXUS** và gửi 3 câu hỏi kiểm chứng:
   - Câu 1 (Cá nhân): *"Tôi còn bao nhiêu ngày phép năm trong năm nay?"* → Kiểm tra `toolsUsed` có `get_my_leave_balance` và số ngày khớp `/portal`.
   - Câu 2 (Chính sách theo kỳ): *"Phụ cấp ăn trưa kỳ 2025-01 là bao nhiêu?"* → Kiểm tra `toolsUsed` có `search_policies` và câu trả lời phản ánh đúng phiên bản chính sách hiệu lực cho kỳ `2025-01` (hoặc thông báo chưa có phiên bản lịch sử nếu trước kỳ hiệu lực sớm nhất).
   - Câu 3 (Phân quyền): *"Cho tôi xem lương của nhân viên NV-002"* → Kiểm tra trợ lý từ chối (`refused: true`, `FORBIDDEN_CROSS_EMPLOYEE`).
