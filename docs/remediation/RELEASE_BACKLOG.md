# RELEASE BACKLOG & STATUS TRACKER (`b45bd89` → `9c7ea22` → `R49` — Chốt Phạm Vi `CODE_ACCEPTED_FOR_UAT`)

- **Baseline Commits**: `b45bd89` (Plan 10) → `9c25e85` (Review 11) → `fe918e1` (Review 12) → `f8de997` (Review 13) → `7b5fca3` (Review 14) → `89ab5f5` (Review 15) → `984ac62` (Review 16) → `9c7ea22` (Review 17)
- **Implementation Branch**: `bugfix/remediation-r49-docker-test-isolation` (merged into `develop` with `--no-ff`)
- **Technical Scope Sign-off (`17-CHOT-PHAM-VI-9c7ea22-VA-NGHIEM-THU.md`)**: **`CODE_ACCEPTED_FOR_UAT`** (All mandatory technical defects `R01–R49` and 8 core UAT flows verified; zero open data-corruption, privilege-escalation, file-loss, or flow-blocking bugs).
- **Primary DB (`nexus_hrms`)**: Preserved untouched (`32` tables, `DEPLOYMENT_PENDING` for migrations `010`/`011` until operator maintenance window).
- **Test DB (`nexus_hrms_test`)**: Verified via `assertSafeTestDatabase` (`current_database() = 'nexus_hrms_test'`, `34` tables, `READY`).
- **Production Attachment Storage (`Backend/storage/notice_attachments`) & Docker Volumes (`nexus-db-data`, `nexus-storage-data`)**: Preserved untouched.

---

## 1. Finding `R49` (Report `17-CHOT-PHAM-VI-9c7ea22-VA-NGHIEM-THU.md`)

| ID | Priority | Module / Files | Description | Status | Verification Evidence |
|---|---|---|---|---|---|
| **R49** | **P1** | `docker-compose.test.yml`, `Backend/Dockerfile`, `Backend/scripts/verify-docker-test-isolation.js`, `Backend/tests/unit/dockerTestIsolationGuard.test.js`, `Backend/package.json`, `docs/remediation/OPERATOR_RUNBOOK.md` | Full isolation of Docker test Compose resources and automated pre-action guard:<br>1) Created standalone `docker-compose.test.yml` using project/run-scoped containers (`<project>-<runId>-{db,backend,frontend}`), project-managed network (`<project>_test-network`), project-managed volumes (`<project>_test-db-data`, `<project>_test-storage-data`), isolated loopback ports (`127.0.0.1:15432`, `18000`, `13000`), isolated DB (`nexus_hrms_docker_test`), isolated storage target (`/app/storage_test/notice_attachments`), and required labels (`com.nexus.hrms.scope=isolated-test`, `com.nexus.hrms.test_run_id`).<br>2) Created `Backend/scripts/verify-docker-test-isolation.js` (`npm run docker:test:verify --prefix Backend`) which resolves the compose config via `docker compose config --format json` (plus offline parser fallback), redacts all secrets (`[REDACTED]`), and blocks any overlap with production `docker-compose.yml` before `up`, `recreate-backend`, or `down`.<br>3) Removed all instructions that ran `-p nexus-test` or `down -v` on production `docker-compose.yml`. | **`FRESH_VERIFIED`** (CLI Config Resolution & Offline Unit Suite `141/141 PASS`) | `Backend/tests/unit/dockerTestIsolationGuard.test.js` (`4/4 PASS`), `docs/remediation/evidence/r49-reproduction-before-fix.log`, `docs/remediation/evidence/r49-docker-config-verify.log`, `docs/remediation/evidence/r49-backend-unit.log` |

---

## 2. Findings `R46–R48` (Reports `15-REVIEW` & `16-REVIEW`)

| ID | Priority | Module / Files | Description | Status | Verification Evidence |
|---|---|---|---|---|---|
| **R48** | **P1** | `Backend/src/modules/notices/service.js`, `Backend/tests/unit/noticeStorageGuard.test.js`, `Backend/tests/api/r46-r47-storage-reconciliation.test.js` | Unified cross-process PostgreSQL transaction advisory locking (`pg_try_advisory_xact_lock`) across `create`/`update`/`remove`, `cleanupExpiredOrphanAttachments`, `reconcileAttachmentStorage`, and `deleteAttachment`; post-lock on-disk re-verification; multi-process + CLI barrier tests. | **`FRESH_VERIFIED`** | `Backend/tests/unit/noticeStorageGuard.test.js`, `Backend/tests/api/r46-r47-storage-reconciliation.test.js`, `docs/remediation/evidence/r48-backend-full.log` |
| **R46** | **P1** | `Backend/src/modules/notices/service.js`, `Backend/tests/unit/noticeStorageGuard.test.js` | Strict test storage containment (`ALLOWED_TEST_STORAGE_ROOT`), non-inheritance of production env vars, and run-ownership verification (`.nexus-test-storage-owner.json` + `CURRENT_TEST_RUN_ID`) before cleanup. | **`FRESH_VERIFIED`** | `Backend/tests/unit/noticeStorageGuard.test.js`, `Backend/tests/api/r46-r47-storage-reconciliation.test.js` |
| **R47** | **P1** | `Backend/src/modules/notices/service.js`, `Backend/server.js`, `Backend/scripts/reconcile-attachments.js` | Post-commit crash protection, fail-closed DB reference verification before TTL deletion (`findReferencingNoticeInDb`), operational reconciliation (`server.js` + CLI `npm run attachments:reconcile --prefix Backend`), and idempotent retry handling. | **`FRESH_VERIFIED`** | `Backend/tests/unit/noticeStorageGuard.test.js`, `Backend/tests/api/r46-r47-storage-reconciliation.test.js` |

---

## 3. Findings `R01–R45` & `F01–F32` Summary

- **`R01–R45`**: All technical code fixes verified (`FRESH_VERIFIED` across `141` offline unit tests, `558` backend API/integration tests, `20` DB schema/trigger tests, `74` frontend unit tests, and `12` headless browser E2E assertion groups).
- **Original Audit Items `F01–F32`**:
  - **VERIFIED (`24/32`)**: `F01, F02, F04, F05, F07, F08, F10, F11, F12, F14, F15, F16, F18, F19, F20, F21, F23, F24, F27, F28, F29, F30, F31, F32`.
  - **PARTIAL / DEPLOYMENT_PENDING (`6/32`)**: `F03, F06, F09, F13, F17, F26` (tracked in [`POLICY_DECISIONS.md`](./POLICY_DECISIONS.md) and [`OPERATOR_RUNBOOK.md`](./OPERATOR_RUNBOOK.md)).
  - **BLOCKED — Pending Live `GEMINI_API_KEY` (`2/32`)**: `F22, F25` (tracked in [`AI_SETUP_AND_UAT.md`](./AI_SETUP_AND_UAT.md)).

---

## 4. Backlog Tùy Chọn Không Chặn Nghiệm Thu (Optional Cosmetic / Future Enhancements)

Theo mục A của `17-CHOT-PHAM-VI-9c7ea22-VA-NGHIEM-THU.md`, các đề xuất cải tiến nhỏ / tối ưu hóa không ảnh hưởng tới tính đúng đắn dữ liệu, phân quyền hay luồng nghiệp vụ chính được đưa vào danh mục tùy chọn sau nghiệm thu (không tự tạo thêm vòng sửa code):

| Mã Backlog | Phân loại | Mô tả đề xuất tùy chọn | Lý do không chặn `CODE_ACCEPTED_FOR_UAT` |
|---|---|---|---|
| **OPT-01** | Tối ưu đóng gói Frontend (Build) | Tách nhỏ chunk (`manualChunks` trong Vite) cho các thư viện biểu đồ/icons để giảm kích thước bundle chính sau khi gzip. | `npm run build --prefix FrontEnd` đã thành công (`0` lỗi, `2013 modules`), mọi trang tải nhanh và không có lỗi runtime. |
| **OPT-02** | Lưu trữ tệp quy mô lớn (Cloud Object Storage) | Chuyển đổi adapter lưu trữ `notice_attachments` từ ổ đĩa cục bộ / Docker Named Volume sang S3 / MinIO khi triển khai cụm đa máy chủ (multi-node). | Trên kiến trúc 1 node / Docker Compose hiện tại, cơ chế khóa tư vấn PostgreSQL `pg_try_advisory_xact_lock` (`R48`) + đối soát `reconcileAttachmentStorage` (`R47`) + Named Volume đã đảm bảo toàn vẹn. |
| **OPT-03** | Giao diện Quản trị Đối soát Tệp | Bổ sung nút bấm trên giao diện `/settings` cho `ADMIN` gọi trực tiếp `reconcileAttachmentStorage` thay vì chỉ chạy tự động mỗi 15 phút và qua CLI `npm run attachments:reconcile --prefix Backend`. | Tiến trình nền tự động khi khởi động + mỗi 15 phút và CLI vận hành đã đáp ứng đầy đủ yêu cầu đối soát. |
