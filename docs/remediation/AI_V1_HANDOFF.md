# AI_V1_HANDOFF — Tài Liệu Bàn Giao Nâng Cấp Trợ Lý Nhân Sự AI NEXUS HRMS V1 (Kèm Khắc Phục Review 19 `AI-V1-F01..F03`)

- **Dự án**: `C:\Users\tavin\Downloads\QLDACNTT`
- **Kế hoạch & Review**: `18-KE-HOACH-NANG-CAP-AI-NEXUS-V1.md` & `19-REVIEW-AI-V1-141a14f.md`
- **Nhánh Gitflow**: `bugfix/ai-v1-review-f01-f03` -> hợp nhất (`--no-ff`) vào `develop`
- **Cơ sở dữ liệu kiểm thử**: `nexus_hrms_test` (`nexus_hrms` chính giữ nguyên 100%: `32` bảng, `50` nhân viên, `50` người dùng, `100` phiếu lương, `50` số dư phép)

---

## 1. Tóm Tắt Khắc Phục Review 19 (`AI-V1-F01` .. `AI-V1-F03`)

### 1.1. `AI-V1-F01` (P1 — Live Evaluation Runner & Isolation)
- Cập nhật `Backend/scripts/run-ai-v1-live-eval.js`:
  - Gọi đúng API thực tế của `Backend/src/modules/ai/service.js` (`runCopilot({ actor, message, conversationId, executor, options })`, `resetConversation(convId, actor)`, `clearAiRuntimeState()`).
  - Kiểm tra `validateLiveEvalDatabaseEnvironment` và `assertSafeTestDatabase` (`SELECT current_database()` phải là `nexus_hrms_test`) **trước** mọi truy vấn dữ liệu; chặn ngay nếu `DB_NAME`, `DB_NAME_TEST`, `DATABASE_URL` hoặc `NODE_ENV` trỏ tới cơ sở dữ liệu chính (`nexus_hrms`).
  - Khởi tạo **synthetic fixtures xác định** (`NV-LIVE-*`, `live-eval-*@example.test`) theo đúng lược đồ thật (`users.role_code`, `roles.role_code`, `employees.department_id`) cho đầy đủ 5 vai trò (`EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `ADMIN`, `KIOSK`) và tự động dọn sạch trong `finally`; tuyệt đối không lấy user đang active bất kỳ trong DB và không fallback role thiếu về `EMPLOYEE`.
  - Bổ sung `runPreflightChecks` chạy không cần mạng ngay cả khi chưa cấu hình `GEMINI_API_KEY`.
  - Lưu `conversationMap` để nối `conversationId` cho `reuseConvFrom` (`V1-07` nối `V1-06`) và gọi `resetConversation` khi `resetFirst: true` (`V1-10`).
  - Kiểm chứng dữ kiện miền (`verify(res, expectedFacts)`): kiểm tra `verified`, `refused`, `refusalCodes`, `sources`, `period`, số liệu phép/lương/chênh lệch (trả `FAIL` nếu `responseType === 'answer'` nhưng sai dữ kiện).
  - Cấp ngân sách retry còn lại trước mỗi lần gọi (`maxRetries = Math.min(1, maxTotalRetries - retriesUsed)`) và ánh xạ đúng mã lỗi của `geminiProvider.js` (`AI_PROVIDER_AUTH_ERROR`, `AI_MODEL_NOT_FOUND`, `AI_MODEL_RETIRED`, `AI_NOT_CONFIGURED`, `AI_RATE_LIMITED`).
  - Cập nhật `AI_V1_OPERATOR_GUIDE.md` và `AI_V1_HANDOFF.md` bỏ hoàn toàn chuỗi `DATABASE_URL` có mật khẩu hardcode.

### 1.2. `AI-V1-F02` (P2 — Resolve `"hai kỳ gần nhất"` từ các kỳ đã công bố trong DB)
- Cập nhật `Backend/src/modules/ai/intentSlots.js`, `Backend/src/modules/ai/tools.js`, `Backend/src/modules/ai/service.js`:
  - Tách biệt câu hỏi `"So sánh lương tháng này và tháng trước"` (`relativePeriodType = 'current_and_previous_month'`, giữ `[prevMonth, currentMonth]`) với `"So sánh lương hai kỳ gần nhất"` (`relativePeriodType = 'latest_two_published'`, không tự suy từ lịch).
  - Bổ sung `resolveLatestPublishedPayslipPeriods(actor, limit, executor)` truy vấn các kỳ `DISTINCT pp.period` có trạng thái `DA_CHOT` / `DA_CHUYEN_KHOAN` của chính nhân viên theo thứ tự `pp.period DESC`.
  - Nếu `< 2` kỳ đã công bố trong DB, trả `responseType = 'empty'`, `verified = false`, `payslipComparison = null`.
  - Khóa `lockedComparisonPeriods` tại tầng thực thi công cụ trong `service.js` để tham số tool của model không thể làm lệch cặp kỳ máy chủ đã xác định.

### 1.3. `AI-V1-F03` (P2 — Giữ giá trị thiếu `null`/`undefined` khác số `0` trong so sánh lương)
- Cập nhật `Backend/src/modules/ai/tools.js`, `Backend/src/modules/ai/service.js`, `Backend/src/modules/ai/claimRenderer.js`:
  - Dùng `toFiniteNumberOrNull` xuyên suốt từ `getMyPayslip` -> `buildStructuredEvidenceFromTools` -> `computePayslipComparison` để không bao giờ biến `null`/`undefined` thành `0`, đồng thời bảo toàn giá trị `0` thật.
  - Tại `computePayslipComparison`, kiểm tra chặt cùng `employeeId`, hai kỳ `YYYY-MM` phân biệt và trạng thái đã công bố (`DA_CHOT`, `DA_CHUYEN_KHOAN`, `DA_CHI`).
  - Khi một hoặc cả hai kỳ thiếu số liệu (`null`/`undefined`), đánh dấu `{ available: false, unavailable: true, delta: null }`, loại khỏi `calculationClaims` và `changedComponents`, không sinh `NaN`, và hiển thị `"Chưa đủ dữ liệu đối chiếu"`.

---

## 2. Kết Quả Từng Lệnh Kiểm Tra & Mã Thoát (Exit Code)

| STT | Lệnh kiểm tra | Kết quả | Mã thoát |
|---|---|---|---|
| 1 | `npm run test:unit --prefix Backend` | **PASS** (`150/150` tests) | `0` |
| 2 | `npm test --prefix FrontEnd` | **PASS** (`76/76` tests) | `0` |
| 3 | `npm run db:test` | **PASS** (`20/20` bảng chuẩn, `nexus_hrms_test` đồng bộ 100%) | `0` |
| 4 | `node --require ./Backend/tests/helpers/env.js --test Backend/tests/api/ai-v1-evaluation-30.test.js` | **PASS** (`34/34` tests: 30 tình huống V1 + 4 tests `AI-V1-F01..F03`) | `0` |
| 5 | `node Backend/scripts/e2e-browser-verify.js` | **PASS** (`ASSERT 1..12`, gồm `10a..10i` với `AI-V1-F02` & `AI-V1-F03` trên DOM thật) | `0` |
| 6 | `node Backend/scripts/check-phase-a-baseline.js` | **PASS** (`nexus_hrms` nguyên vẹn 100%, `nexus_hrms_test` `READY`) | `0` |
| 7 | `node Backend/scripts/run-ai-v1-live-eval.js` | **BLOCKED** (`preflight.passed = true`, chưa cấu hình `GEMINI_API_KEY`) | `0` |

---

## 3. Bảng Trạng Thái Cổng Nghiệm Thu Cuối Kỳ

| Cổng nghiệm thu | Trạng thái | Ghi chú chi tiết |
|---|---|---|
| **`IMPLEMENTATION_VERIFIED`** | **PASS** | Hoàn tất các giai đoạn A–H và đóng toàn bộ 3 hạng mục `AI-V1-F01..F03`; đạt 100% kiểm thử Unit (`150/150` Backend + `76/76` Frontend), Database (`db:test`), API Integration & Live Runner Mock (`34/34`), và Headless Browser E2E (`ASSERT 1..12`). |
| **`LIVE_GEMINI_VERIFIED`** | **BLOCKED** | Preflight và mock transport nhánh `key-present` của runner đã `PASS`; cổng gọi Gemini thật giữ trạng thái `BLOCKED` do môi trường chưa cấu hình `GEMINI_API_KEY`. |
| **`READY_FOR_PRODUCTION_V1`** | **BLOCKED** | Phụ thuộc cả (1) cấu hình `GEMINI_API_KEY` + chạy live evaluation đạt, (2) áp dụng 2 migration còn chờ (`010_payroll_policy_snapshot_and_holidays.sql`, `011_system_policy_versions.sql`) lên DB `nexus_hrms` trong khung bảo trì, và (3) kiểm chứng cổng vận hành Docker. |

---

## 4. Danh Sách Việc Người Vận Hành (Operator) Cần Thực Hiện

1. **Cấu hình khóa Gemini API thật tại Backend**:
   - Mở tệp `Backend/.env` và cấu hình:
     ```env
     AI_ENABLED=true
     GEMINI_API_KEY=<khoa_api_gemini_that_cua_ban>
     GEMINI_MODEL=gemini-2.5-flash
     ```
2. **Chạy kiểm tra preflight và nghiệm thu Gemini thật có kiểm soát ngân sách**:
   ```powershell
   node Backend/scripts/run-ai-v1-live-eval.js --preflight
   node Backend/scripts/run-ai-v1-live-eval.js --require-live
   ```
3. **Các cổng hạ tầng và cơ sở dữ liệu khi triển khai môi trường thật**:
   - Áp dụng 2 migration còn chờ (`010_payroll_policy_snapshot_and_holidays.sql`, `011_system_policy_versions.sql`) lên DB chính `nexus_hrms` trong khung giờ bảo trì.
   - Bật Docker Desktop daemon để kiểm chứng container hóa cô lập (`docker compose -f docker-compose.test.yml -p nexus-test up -d --build`).
