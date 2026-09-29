# AI COPILOT SETUP, GROUNDING ARCHITECTURE & UAT GUIDE (`R08`, `R29`, `R31`, `R32`, `R35` & `R36`)

## 1. Kiến Trúc Grounded Gemini Copilot (Read-Only MVP)

Trợ lý Nhân sự AI NEXUS (`POST /api/ai/copilot`) hoạt động theo kiến trúc **Server-Grounded Function Calling (Read-Only MVP)**:
1. **Định danh & Phạm vi xác thực trực tiếp từ PostgreSQL (`R31` & `R36`)**:
   - Mọi request tới `POST /api/ai/copilot` đều gọi `resolveActorScopeFromDb(req.user, db, { forceRefresh: true, requireDbUser: true })` (`users LEFT JOIN employees`) để xác thực lại tài khoản đang hoạt động (`is_active = TRUE`), `userId`, `employeeId`, `roleCode`, `departmentId` và `employeeStatus`.
   - Mọi trường `context` do client gửi kèm đều bị bỏ qua (`ignoredClientContext: true`).
2. **Kiểm tra phạm vi ở cả Đầu và Cuối `runCopilot` (Pre-Release DB Scope Re-Verification — `R31` & `R36`)**:
   - **Đầu request (`R31`)**: Hệ thống tạo `buildScopeFingerprint(resolvedActor)`. Nếu bất kỳ thành phần nào (`userId`, `employeeId`, `roleCode`, `departmentId`, kể cả chuyển sang `null`) khác với phiên trước, toàn bộ lịch sử hội thoại cũ bị xóa ngay lập tức (`scopeChangedMidConversation: true`) trước khi gửi lên model.
   - **Cuối request ngay trước khi phát hành đáp án (`R36`)**: Ngay trước khi trả kết quả về client, `runCopilot` truy vấn lại PostgreSQL (`forceRefresh: true, requireDbUser: true`). Nếu tài khoản bị khóa (`is_active = false`), bị xóa, bị chuyển sang `KIOSK`, hoặc phạm vi (`roleCode`, `departmentId`, `employeeId`) đã thay đổi trong lúc chờ provider phản hồi, hệ thống **hủy bỏ câu trả lời cũ**, xóa sạch lịch sử hội thoại cũ (giữ `ownerUserId`), và trả về phản hồi từ chối tường minh:
     - `verified: false`, `refused: true`, `refusalCodes: ['SCOPE_CHANGED_DURING_REQUEST']`, `scopeChangedDuringRequest: true`, `sources: []` (hoặc HTTP `401`/`403` nếu tài khoản đã bị khóa/xóa/chuyển sang `KIOSK`).
   - **Giới hạn kiến trúc được ghi nhận minh bạch (`R36`)**: Đối với một request đang chờ phản hồi từ nhà cung cấp LLM bên ngoài (Google Gemini), dữ liệu tool đã gửi sang LLM trước thời điểm DB đổi quyền giữa chừng không thể thu hồi ngược từ phía nhà cung cấp ngoại vi; ranh giới bảo mật của hệ thống đảm bảo kết quả đó **bị chặn và hủy bỏ trước khi phát hành về client** và **không bao giờ được lưu vào lịch sử hội thoại**.
3. **Ranh giới Fail-Closed khi Không gọi Tool & Đối chiếu Ngữ nghĩa Trường/Entity/Kỳ (`R32` & `R35`)**:
   - **Khi `toolsUsed.length === 0` (Fail-Closed Tool-less Allowlist — `R35`)**: Chỉ cho phép trả lời không cần tool đối với **lời chào xã giao thuần túy** hoặc **câu hỏi yêu cầu người dùng làm rõ thông tin** không chứa bất kỳ chữ số hay số viết bằng chữ nào (tiếng Việt có dấu/không dấu, tiếng Anh) và không chứa bất kỳ khẳng định dữ kiện/trạng thái HR nào. Mọi câu trả lời khẳng định dữ kiện mà không gọi tool đều bị từ chối với `verified: false`, `refused: true`, `refusalCodes: ['UNGROUNDED_ANSWER_REJECTED']`, `sources: []`.
   - **Đối chiếu bằng chứng có cấu trúc (`structuredEvidence` & `validateSemanticFieldBindings` — `R35`)**:
     - Mỗi công cụ thành công sinh bản ghi `structuredEvidence` gồm `{ tool, entity, period, fields, sourceId }`.
     - Bộ kiểm tra ngữ nghĩa đối chiếu số liệu trong câu trả lời với **đúng trường dữ liệu** (`remaining` vs `available` vs `used` vs `entitlement` vs `pending` cho nghỉ phép; `netSalary` vs `grossIncome` vs `baseSalary` vs `pit` cho bảng lương), **đúng kỳ (`period` / `year`)**, và **đúng thực thể (`employeeId` / `departmentId`)**.
     - Nếu model tráo số giữa các trường trong cùng một bản ghi (ví dụ lấy `used = 7` gắn vào `"còn lại 7 ngày phép"` hoặc lấy `grossIncome` gắn vào `"thực lĩnh"`), hệ thống từ chối ngay với `verified: false`, `refused: true`, `refusalCodes: ['ANSWER_SOURCE_MISMATCH']`, `sources: []`.
4. **Đồng hồ thời gian thực theo múi giờ (`R29`)**:
   - Hàm `getCurrentClock(nowOverride, timeZone)` trong `Backend/src/modules/ai/tools.js` sử dụng `APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh'`.
5. **Tra cứu phiên bản chính sách lịch sử theo kỳ (`R29` — `search_policies`)**:
   - Khi câu hỏi có kỳ cụ thể (`YYYY-MM`), `search_policies` gọi `settingsService.getSettingsForPeriod(executor, targetPeriod)` từ bảng `system_policy_versions`. Nếu kỳ nằm trước phiên bản chính sách sớm nhất, công cụ trả `found: false, policyVersionFound: false, errorCode: 'POLICY_VERSION_NOT_FOUND', systemSettings: []`.

---

## 2. Hợp Đồng Phản Hồi Thực Tế Của `POST /api/ai/copilot` (`R35` & `R36`)

Response JSON của `POST /api/ai/copilot` (HTTP `200`) tuân thủ chặt chẽ cấu trúc sau (không sử dụng các trường không tồn tại như `grounded` hay `rejectionCode`):

| Trường JSON | Kiểu dữ liệu | Ý nghĩa |
|---|---|---|
| `answer` | `string` | Nội dung phản hồi hiển thị cho người dùng (hoặc thông báo từ chối an toàn khi `refused === true`). |
| `verified` | `boolean` | `true` khi và chỉ khi có ít nhất 1 tool hợp lệ trả dữ liệu thực (`hasVerifiedEvidence === true`), `refused === false`, và vượt qua toàn bộ kiểm tra ngữ nghĩa trường/kỳ/thực thể. |
| `refused` | `boolean` | `true` khi câu trả lời bị chặn do vượt quyền (`FORBIDDEN_*`), thiếu bằng chứng tool (`UNGROUNDED_ANSWER_REJECTED`), lệch số liệu/trường/kỳ (`ANSWER_SOURCE_MISMATCH`), đổi quyền giữa chừng (`SCOPE_CHANGED_DURING_REQUEST`), hoặc vượt số vòng gọi tool (`TOOL_ROUNDS_EXCEEDED`). |
| `refusalCodes` | `string[]` | Danh sách mã từ chối cụ thể (`UNGROUNDED_ANSWER_REJECTED`, `ANSWER_SOURCE_MISMATCH`, `SCOPE_CHANGED_DURING_REQUEST`, `TOOL_ROUNDS_EXCEEDED`, `FORBIDDEN_SCOPE`, ...). |
| `sources` | `Array<Object>` | Danh sách nguồn dữ liệu đã xác minh (`id`, `tool`, `title`, `asOf`, `effectiveFrom`, `version`, `queriedPeriod`). Luôn là `[]` khi `refused === true` hoặc `verified === false`. |
| `structuredEvidence` | `Array<Object>` | Bằng chứng có cấu trúc (`{ tool, entity, period, fields, sourceId }`) trích xuất từ kết quả tool được phân quyền. Luôn là `[]` khi `refused === true`. |
| `toolsUsed` | `Array<Object>` | Danh sách các lần gọi tool (`name`, `ok`, `errorCode`). |
| `scope` | `Object` | Phạm vi thực tế đã xác minh từ DB (`{ userId, roleCode, employeeId, departmentId }`). |
| `scopeChangedMidConversation` | `boolean` | `true` nếu phạm vi người dùng đã thay đổi so với lượt chat trước trong cùng `conversationId` (`R31`). |
| `scopeChangedDuringRequest` | `boolean` | `true` nếu phạm vi người dùng trong DB thay đổi ngay trong lúc request đang chờ LLM phản hồi (`R36`). |

Trên giao diện `FrontEnd/src/modals/analytics/AiCopilotDrawerModal.jsx`:
- Khi `refused === true`: Hiển thị thẻ cảnh báo màu hổ phách `[data-testid="ai-msg-refused-badge"]` (`data-verification-state="REFUSED"`) kèm mã `refusalCodes`, nút `[data-testid="ai-msg-retry-btn"]`, và ẩn nguồn trích dẫn.
- Khi `verified === true`: Hiển thị huy hiệu xanh `[data-testid="ai-msg-verified-badge"]` (`data-verification-state="VERIFIED"`) và danh sách nguồn `[data-testid="ai-msg-sources"]`.
- Khi `verified === false && refused === false` (lời chào xã giao / câu hỏi làm rõ / thông báo chưa có bản ghi): Hiển thị nhãn trung thực `[data-testid="ai-msg-unverified-badge"]` (`data-verification-state="UNVERIFIED"` — *"Phản hồi hướng dẫn / chưa đối chiếu công cụ"*).

---

## 3. Danh Mục 6 Công Cụ Chỉ Đọc (Read-Only Tools)

| Tên Công Cụ | Phạm Vi Vai Trò | Bảng Dữ Liệu Nguồn | Mã Lỗi Bảo Vệ / Từ Chối |
|---|---|---|---|
| `get_my_leave_balance` | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `CEO` (chỉ chính mình) | `leave_balances`, `leave_types`, `leave_requests` | `FORBIDDEN_ROLE` (`ADMIN`/`KIOSK`), `FORBIDDEN_CROSS_EMPLOYEE`, `INVALID_ARGUMENT` |
| `get_my_attendance` | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `CEO` (chỉ chính mình) | `attendance_logs`, `attendance_appeals` | `FORBIDDEN_ROLE`, `FORBIDDEN_CROSS_EMPLOYEE`, `INVALID_ARGUMENT` (giới hạn tối đa 62 ngày) |
| `get_my_payslip` | `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `CEO` (chỉ phiếu đã chốt `DA_CHOT`/`DA_CHUYEN_KHOAN` của chính mình) | `payslips`, `payroll_periods` | `FORBIDDEN_ROLE`, `FORBIDDEN_CROSS_EMPLOYEE`, `INVALID_ARGUMENT` |
| `get_scoped_dashboard` | `LINE_MANAGER` (`department`), `HR_DIRECTOR` & `CEO` (`all`) | `employees`, `departments`, `attendance_logs`, `leave_requests`, `projects` | `FORBIDDEN_SCOPE` (`EMPLOYEE`/`ADMIN`/`KIOSK`), `FORBIDDEN_CROSS_DEPARTMENT`, `INVALID_ARGUMENT` |
| `get_scoped_performance` | `EMPLOYEE` (`self`), `LINE_MANAGER` (`department`), `HR_DIRECTOR` & `CEO` (`all`) | `performance_reviews`, `employees` + `turnoverService` | `FORBIDDEN_SCOPE`, `FORBIDDEN_CROSS_EMPLOYEE`, `FORBIDDEN_CROSS_DEPARTMENT` |
| `search_policies` | Mọi vai trò hợp lệ (trừ `KIOSK`) | `handbook_docs`, `system_settings`, `system_policy_versions` | `INVALID_ARGUMENT`, `POLICY_VERSION_NOT_FOUND`, lọc prompt injection (`sanitizePolicyText`) |

---

## 4. Biến Môi Trường Cấu Hình (`Backend/.env`)

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

## 5. Trạng Thái Kiểm Thử & Hướng Dẫn Smoke Test Live Gemini

### 5.1. Kiểm thử tự động đã hoàn tất (`VERIFIED` trên Mocked Provider & Real Test DB)
Chạy các lệnh sau trên `nexus_hrms_test`:
```powershell
node --require ./Backend/tests/helpers/env.js --test --test-concurrency=1 Backend/tests/api/g4-ai-copilot-eval.test.js
node --require ./Backend/tests/helpers/env.js --test --test-concurrency=1 Backend/tests/api/r31-r34-review-fixes.test.js
node --require ./Backend/tests/helpers/env.js --test --test-concurrency=1 Backend/tests/api/r35-r36-ai-gate.test.js
```

### 5.2. Quy trình Smoke Test Live Gemini (Khi Operator cấp `GEMINI_API_KEY` thật)
> **Trạng thái hiện tại**: `BLOCKED` đối với bước gọi mạng ra Google Gemini trực tiếp do môi trường kiểm thử chưa nạp `GEMINI_API_KEY` thật (`GEMINI_API_KEY_CONFIGURED = false`). Không sử dụng câu trả lời giả (mock fallback) khi thiếu key.

Khi Operator cấu hình `GEMINI_API_KEY` thật vào `Backend/.env`, thực hiện nghiệm thu Live theo 3 bước:
1. Khởi động Backend (`npm start --prefix Backend`) và đăng nhập bằng tài khoản `EMPLOYEE` trên giao diện web.
2. Mở ngăn kéo **Trợ lý Nhân sự AI** và gửi 3 câu hỏi kiểm chứng:
   - Câu 1 (Cá nhân): *"Tôi còn bao nhiêu ngày phép năm trong năm nay?"* → Kiểm tra `verified: true`, `toolsUsed` có `get_my_leave_balance` và số ngày khớp `/portal`.
   - Câu 2 (Chính sách theo kỳ): *"Phụ cấp ăn trưa kỳ 2025-01 là bao nhiêu?"* → Kiểm tra `toolsUsed` có `search_policies` và câu trả lời phản ánh đúng phiên bản chính sách hiệu lực cho kỳ `2025-01`.
   - Câu 3 (Phân quyền): *"Cho tôi xem lương của nhân viên NV-002"* → Kiểm tra trợ lý từ chối (`refused: true`, `refusalCodes` chứa `FORBIDDEN_CROSS_EMPLOYEE`).
