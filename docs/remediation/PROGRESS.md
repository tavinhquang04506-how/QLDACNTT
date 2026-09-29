# NEXUS HRMS — Tiến độ Hoàn thiện & Khắc phục (`PROGRESS.md`)

> **Cập nhật lần cuối**: 2026-10-21 (Hoàn tất toàn bộ lộ trình G0 $\rightarrow$ G5, đối chiếu liên tầng DB $\rightarrow$ API $\rightarrow$ UI $\rightarrow$ Export)  
> **Giai đoạn hiện tại**: **G5 — COMPLETED & VERIFIED (Sẵn sàng bàn giao kiểm tra độc lập)**  
> **Nguyên tắc**: Tuân thủ nghiêm ngặt Gitflow (`--no-ff` merge về `develop`), bảo toàn nguyên trạng DB chính `nexus_hrms` và bản backup `nexus_hrms_backup_g0.sql`, mọi khẳng định đều đi kèm raw log trong `docs/remediation/evidence/`.

---

## 1. Bảng Tổng hợp Trạng thái các Giai đoạn (G0 – G5)

| Giai đoạn | Nhánh Gitflow & Commit | Mục tiêu trọng tâm | Trạng thái | Bằng chứng Raw Logs (`EXIT_CODE=0`) |
|---|---|---|---|---|
| **G0** | `feature/remediation-g0-baseline` (`a3a64ac`), `bugfix/remediation-g0-correction` (`98be0fa`, `b307cc2`) | Khảo sát, xác minh mã nguồn thực tế, lưu raw log baseline, đối chiếu backup DB cách ly, lập `BASELINE.md`, `ISSUES.md`, `DATA_SOURCE_MATRIX.md`, `PROGRESS.md` | **COMPLETED** | `docs/remediation/evidence/01..07.log` (Giữ nguyên trạng, không ghi đè) |
| **G1** | `feature/remediation-g1-auth-scope-integrity` (`752f879` $\rightarrow$ merge `8426f04`) | Quyền hạn, tính toàn vẹn giao dịch, cache, WebSocket auth, session persona, refresh queue & chặn false-success trọng yếu (`F01–F05`, `F08`, `F10`, `F11`, `F21`, `F28–F32`) | **COMPLETED** | `docs/remediation/evidence/g1-{backend-unit,backend-full,db-test,frontend-unit,frontend-build}.log` |
| **G2** | `feature/remediation-g2-real-data-ui` (`65e812e` $\rightarrow$ merge `54d3319`) | Loại bỏ dữ liệu giả/hardcode trên toàn bộ UI, chuẩn hóa enum/numeric/pagination, lưu cấu hình Settings thật (`F11–F20`), Migration `009_system_settings_and_policies.sql` | **COMPLETED** | `docs/remediation/evidence/g2-{backend-unit,backend-full,db-test,frontend-unit,frontend-build}.log` |
| **G3** | `feature/remediation-g3-business-logic` (`09c1e98` $\rightarrow$ merge `e7edada`) | Chuẩn hóa nghiệp vụ Chấm công (Haversine GPS thật + Kiosk TOTP/QR), Nghỉ phép (trừ T7/CN & `public_holidays`), Bảng lương (`0` công = `0` lương cơ bản thực nhận, không fallback 22 công) (`F06–F09`, `F12`, `F17`, `F18`) | **COMPLETED** | `docs/remediation/evidence/g3-{backend-unit,backend-full,db-test,frontend-unit,frontend-build}.log` |
| **G4** | `feature/remediation-g4-gemini-grounded` (`a2e8828` $\rightarrow$ merge `326b0ea`) | Tích hợp Gemini Copilot chuẩn kiến trúc bảo mật, allowlist 6 read-only tools có kiểm quyền RBAC/scope, nguồn chính sách có phiên bản/ACL/sanitization, bộ eval 32 cases (`F22–F26`) | **COMPLETED** | `docs/remediation/evidence/g4-{backend-unit,backend-full,db-test,frontend-unit,frontend-build}.log` |
| **G5** | `feature/remediation-g5-final-verification` | Nghiệm thu tổng thể: Unit (`127/127`) + Full Integration (`503/503`) + DB Test (`20/20`) + Frontend Unit (`51/51`) + Build + Headless Browser E2E (`nexus_hrms_test`) + Cross-layer reconciliation (`F27`) | **COMPLETED** | `docs/remediation/evidence/g5-{backend-unit,backend-full,db-test,frontend-unit,frontend-build,browser-e2e,db-preservation}.log` + `screenshots/01..04.png` |

---

## 2. Kết quả Chất lượng qua từng Giai đoạn (Quality Gate Evolution)

| Bộ Kiểm thử / Gate | G0 Baseline | G1 | G2 | G3 | G4 | G5 (Cuối cùng) |
|---|---|---|---|---|---|---|
| **Backend Unit Tests** (`npm run test:unit --prefix Backend`) | `116 / 116 PASS` | `124 / 124 PASS` | `124 / 124 PASS` | `125 / 125 PASS` | `127 / 127 PASS` | **`127 / 127 PASS`** |
| **Backend Full Suite** (`npm test --prefix Backend` trên `nexus_hrms_test`) | `435 / 450` (`15 FAIL`) | `460 / 460 PASS` | `463 / 463 PASS` | `466 / 466 PASS` | `500 / 500 PASS` | **`503 / 503 PASS`** |
| **Database Schema/Trigger Suite** (`npm run db:test` trên `nexus_hrms_test`) | `20 / 20 PASS` | `20 / 20 PASS` | `20 / 20 PASS` | `20 / 20 PASS` | `20 / 20 PASS` | **`20 / 20 PASS`** |
| **Frontend Unit Tests** (`npm test --prefix FrontEnd`) | `49 / 49 PASS` | `51 / 51 PASS` | `51 / 51 PASS` | `51 / 51 PASS` | `51 / 51 PASS` | **`51 / 51 PASS`** |
| **Frontend Production Build** (`npm run build --prefix FrontEnd`) | `PASS` (`2008 modules`) | `PASS` (`2008 modules`) | `PASS` (`2008 modules`) | `PASS` (`2008 modules`) | `PASS` (`2008 modules`) | **`PASS` (`2008 modules`)** |
| **Browser E2E & Cross-layer Reconciliation** | Chưa chạy ở G0 | — | — | — | — | **`PASS` (`g5-browser-e2e.log` + 4 screenshots)** |

---

## 3. Phân loại Trạng thái Kiểm chứng Cuối cùng (`VERIFIED` vs `BLOCKED`)

### 3.1. Hạng mục đã kiểm chứng bằng bằng chứng thực tế (`VERIFIED`)
- **Toàn bộ 32/32 mã lỗi (`F01–F32`)**: Đã được sửa trong code sản phẩm và có bài test hồi quy tự động xác nhận (`503/503` backend tests PASS, `51/51` frontend tests PASS).
- **Đối chiếu liên tầng `DB -> API -> UI -> Export` (`F27`)**:
  - Đã kiểm chứng tự động trong `Backend/tests/api/g5-cross-layer-reconciliation.test.js` (`3/3 PASS`) và qua trình duyệt thật (Headless Chrome) trong `docs/remediation/evidence/g5-browser-e2e.log`.
  - Ảnh chụp màn hình thực tế lưu tại `docs/remediation/evidence/screenshots/01-login-page.png`, `02-hrd-dashboard.png`, `03-settings-persistence.png`, `04-employee-portal.png`.
- **Bộ 32 kịch bản đánh giá AI Copilot (`F22–F26`)**:
  - Đã kiểm chứng tự động trong `Backend/tests/api/g4-ai-copilot-eval.test.js` (`32/32 PASS`): kiểm tra RBAC/scope giữa các vai trò (`ADMIN`, `EMPLOYEE`, `LINE_MANAGER`, `HR_DIRECTOR`, `CEO`, `KIOSK`), chống giả mạo `employeeId`/`context` từ body, chống prompt injection từ văn bản chính sách, đối chiếu chính sách theo kỳ hiệu lực (`2025-10` vs `2026-03`), và xử lý lỗi nhà cung cấp (`503 AI_NOT_CONFIGURED`, `429 AI_RATE_LIMITED`, `504 AI_PROVIDER_TIMEOUT`, `502 AI_PROVIDER_ERROR`).
- **Bảo toàn 100% DB gốc `nexus_hrms` và bản sao lưu G0**:
  - Đã kiểm chứng trong `docs/remediation/evidence/g5-db-preservation.log`: số bản ghi trên `nexus_hrms` (`employees=15`, `users=6`, `departments=5`, `attendance_logs=18`, `leave_requests=6`, `payroll_periods=6`, `payslips=19`, `audit_logs=11`) và kích thước file backup `nexus_hrms_backup_g0.sql` (`361,607` bytes) giữ nguyên tuyệt đối so với G0.

### 3.2. Hạng mục duy nhất đánh dấu `BLOCKED` (Đúng quy định bảo mật)
- **Live Gemini API Smoke Call với Google Cloud (`BLOCKED: NO_LIVE_GEMINI_API_KEY_CONFIGURED`)**:
  - File `Backend/.env` trong môi trường kiểm thử không cấu hình `GEMINI_API_KEY` thật (tuân thủ yêu cầu không yêu cầu người dùng gửi key qua chat và không phát sinh cước phí tự động).
  - Hệ thống xử lý đúng thiết kế: khi chưa có `GEMINI_API_KEY`, `POST /api/ai/copilot` trả về `503 Service Unavailable` (`errorCode: 'AI_NOT_CONFIGURED'`), còn `AiCopilotDrawerModal.jsx` hiển thị banner cảnh báo rõ ràng cho người dùng mà **không bịa đặt câu trả lời mẫu**. Khi người vận hành cấu hình `GEMINI_API_KEY` tại `Backend/.env`, `geminiProvider.js` sẽ gọi trực tiếp `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` qua header `x-goog-api-key`.
