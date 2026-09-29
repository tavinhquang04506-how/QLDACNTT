# AI_V1_EVALUATION — Báo Cáo Nghiệm Thu 30 Tình Huống & Review 19 (`AI-V1-F01..F03`) Trợ Lý Nhân Sự AI NEXUS HRMS V1

- **Dự án**: `C:\Users\tavin\Downloads\QLDACNTT`
- **Nhánh**: `bugfix/ai-v1-review-f01-f03` -> `develop`
- **Cơ sở dữ liệu kiểm thử**: `nexus_hrms_test` (cô lập 100%, không chạm `nexus_hrms` thật)
- **Tệp kiểm thử tự động**:
  - Unit Backend: `Backend/tests/unit/aiV1Modules.test.js` & `Backend/tests/unit/aiCopilotUnit.test.js` (`150/150 PASS`)
  - Unit Frontend: `FrontEnd/tests/aiCopilotState.test.js` (nằm trong bộ `76/76 PASS` của Frontend)
  - API Integration & Live Runner Mock Suite: `Backend/tests/api/ai-v1-evaluation-30.test.js` (`34/34 PASS`)
  - Browser E2E (`390px` / `768px` / `1440px`): `Backend/scripts/e2e-browser-verify.js` (`ASSERT 1..12 PASS`, gồm `10a..10i`)
  - Live Gemini Runner: `Backend/scripts/run-ai-v1-live-eval.js` (`PREFLIGHT_PASS` / `BLOCKED` khi chưa cấu hình `GEMINI_API_KEY`)

---

## 1. Phân Biệt Rõ Các Cấp Độ Kiểm Chứng

| Cấp độ kiểm thử | Phạm vi kiểm chứng | Kết quả | Mã thoát | Ghi chú |
|---|---|---|---|---|
| **1. Unit Tests (Backend & Frontend)** | Chuẩn hóa tiếng Việt có/không dấu, giải mã thời gian tương đối `Asia/Ho_Chi_Minh`, resolve `"hai kỳ gần nhất"` từ danh sách kỳ công bố (`AI-V1-F02`), giữ `null`/`undefined` là `unavailable` khác số `0` (`AI-V1-F03`), guard môi trường DB test (`AI-V1-F01`), retry có trần `maxRetries = 1`, bảo vệ thế hệ hội thoại UI (`sessionGeneration`). | **PASS** (`150/150` Backend unit, `76/76` Frontend unit) | `0` | Độc lập 100% với mạng ngoài. |
| **2. API Integration & Runner Mock Tests (`nexus_hrms_test`)** | Toàn bộ 30 tình huống nghiệm thu (`V1-01`..`V1-30`) + 4 kiểm thử chuyên sâu cho `AI-V1-F01`, `AI-V1-F02`, `AI-V1-F03` đi qua Express route `/api/ai/copilot` và `runLiveEvaluation` với mock transport (`key-present`, `reuseConvFrom`, `resetFirst`, wrong-fact `FAIL`, retry budget cap). | **PASS** (`34/34` trong `ai-v1-evaluation-30.test.js`) | `0` | Dùng stub transport kiểm soát đầu ra của Gemini để kiểm chứng mọi nhánh nghiệp vụ, bảo mật và runner. |
| **3. Headless Browser E2E (CDP Chrome)** | Đăng nhập giao diện thật, mở ngăn kéo AI Copilot, kiểm tra chip gợi ý động, `answerSections`, `clarification` choices, `followUpSuggestions`, `navigationActions`, nút `Làm mới`, kịch bản `10i` (`AI-V1-F02` & `AI-V1-F03`: `"So sánh lương hai kỳ gần nhất"` lấy `2026-08` vs `2026-06` từ DB, bỏ qua `2026-10` `DU_THAO`, hiển thị `"Chưa đủ dữ liệu đối chiếu"` cho trường `bonus=NULL`), và kiểm tra tràn ngang tại `390px` / `768px` / `1440px`. | **PASS** (`ASSERT 10` & `ASSERT 12`) | `0` | Đã chụp ảnh màn hình thực tế tại `docs/remediation/evidence/screenshots/`. |
| **4. Live Gemini Evaluation (`gemini-2.5-flash`)** | Chạy `runPreflightChecks` (kiểm tra exports, test DB guard, schema columns, synthetic fixtures) rồi gọi `generativelanguage.googleapis.com` khi có `GEMINI_API_KEY` thật theo trần ngân sách (`<= 30` câu hỏi, `<= 5` lần retry). | **BLOCKED** (`preflight.passed = true`) | `0` | Môi trường hiện chưa cấu hình `GEMINI_API_KEY`. Không suy diễn kết quả mock thành kết quả Gemini thật. |

---

## 2. Kết Quả Xác Minh Chi Tiết Ba Hạng Mục Review 19 (`AI-V1-F01` .. `AI-V1-F03`)

| Mã hạng mục | Kỳ vọng (Expected) | Thực tế sau khi sửa (Actual) | Trạng thái |
|---|---|---|---|
| **`AI-V1-F01` (Live Evaluation Runner & Isolation)** | Gọi đúng hàm export (`runCopilot`, `resetConversation`, `clearAiRuntimeState`); dùng đúng lược đồ `users.role_code` & `roles.role_code`; chặn môi trường DB chính (`nexus_hrms`) trước mọi truy vấn; tạo/dọn synthetic fixtures (`NV-LIVE-*`) cho đủ các role mà không fallback về `EMPLOYEE`; có `runPreflightChecks` chạy cả khi chưa có key; nối `conversationId` qua `reuseConvFrom` và gọi `resetConversation` khi `resetFirst=true`; so khớp dữ kiện/nguồn/kỳ/mã từ chối (dữ kiện sai dù `responseType='answer'` phải `FAIL`); cấp ngân sách retry còn lại trước khi gọi. | Preflight pass (`verifiedDatabase="nexus_hrms_test"`, 5 role fixtures tạo/xóa sạch); `DB_NAME="nexus_hrms"` bị chặn ngay với `TEST_DB_GUARD_FORBIDDEN`; nhánh `key-present` qua mock transport chạy `18/18` kịch bản `PASS` (gồm `V1-07` nối `V1-06` và `V1-10` reset); kịch bản `answer` sai số liệu trả `status="FAIL"`; `maxTotalRetries=0` chặn retry ngay từ lần `429` đầu tiên. | **PASS** (Mock/Preflight) / **BLOCKED** (Live key) |
| **`AI-V1-F02` (Resolve `"hai kỳ gần nhất"` từ DB)** | Giữ `relativePeriodType='latest_two_published'` mà không đoán `[prevMonth, currentMonth]` theo lịch; truy vấn 2 kỳ `DISTINCT` đã công bố (`DA_CHOT`, `DA_CHUYEN_KHOAN`) của chính actor theo `period DESC`; khóa cặp kỳ tại server không để tool args làm lệch; `< 2` kỳ công bố trả `responseType='empty'`; câu hỏi chỉ định rõ `"tháng này và tháng trước"` giữ đúng kỳ lịch được yêu cầu; hỗ trợ hỏi tiếp sau giải thích lương kỳ gần nhất. | Với clock `2026-10`, kỳ `2026-10` `DU_THAO` và hai kỳ công bố không liên tiếp `2026-08` & `2026-06`: `"So sánh lương hai kỳ gần nhất"` trả về so sánh `2026-06` vs `2026-08` (`delta netSalary = +1.150.000 ₫`) ngay cả khi model gọi `period="2026-10"`; nhân viên chỉ có 1 kỳ công bố (`2026-08`) trả `responseType="empty"`; câu `"So sánh lương tháng này và tháng trước"` giữ `['2026-09', '2026-10']`; hỏi tiếp `"Còn tháng trước?"` sau `"Giải thích lương kỳ gần nhất"` lấy đúng `2026-06`. | **PASS** (Unit + API + Browser E2E) |
| **`AI-V1-F03` (Giữ `null` khác số `0` trong so sánh lương)** | Không ép `Number(null ?? 0) -> 0` tại `tools.js`, `service.js` hay `claimRenderer.js`; kiểm tra cùng `employeeId`, 2 kỳ `YYYY-MM` phân biệt và trạng thái đã công bố tại `computePayslipComparison`; trường thiếu một hoặc hai bên đánh dấu `unavailable=true, available=false, delta=null`, không sinh `calculationClaims`/`changedComponents`, không sinh `NaN`, giữ nguyên số `0` thật; giao diện hiển thị `"Chưa đủ dữ liệu đối chiếu"`. | Khi `netSalary=null` hoặc `bonus=null`: `earlierValue=null, laterValue=null, delta=null, unavailable=true, available=false`, không sinh claim chênh lệch và không có `NaN`; `otPay: 0 -> 800000` vẫn tính đúng `delta = +800000`; từ chối `employeeId` lệch, kỳ trùng hoặc `DU_THAO` (`null`); UI hiển thị `"Chưa đủ dữ liệu đối chiếu"`. | **PASS** (Unit + API + Browser E2E) |

---

## 3. Ma Trận 30 Tình Huống Nghiệm Thu Gốc (`V1-01` .. `V1-30`)

Toàn bộ 30 tình huống nghiệm thu gốc (`V1-01`..`V1-30`) cùng 4 bài kiểm thử bổ sung cho `AI-V1-F01..F03` (` tổng cộng 34/34 tests`) đều đạt **PASS** trên `nexus_hrms_test` (`exit code = 0`). Cột **Live Gemini** giữ trạng thái **BLOCKED** cho tới khi người vận hành cấu hình `GEMINI_API_KEY` thật trong `Backend/.env`.
