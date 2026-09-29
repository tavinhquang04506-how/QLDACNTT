-- ============================================================
-- Migration 010: Public Holidays Calendar & Payroll Policy Snapshot (R01, R04, R05)
-- ============================================================

ALTER TYPE checkin_method_enum ADD VALUE IF NOT EXISTS 'code';

CREATE TABLE IF NOT EXISTS public_holidays (
    holiday_date DATE PRIMARY KEY,
    name         VARCHAR(150) NOT NULL,
    is_paid      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public_holidays IS 'Lịch nghỉ lễ chính thức hưởng nguyên lương theo Bộ luật Lao động';

INSERT INTO public_holidays (holiday_date, name, is_paid) VALUES
  ('2025-01-01', 'Tết Dương lịch 2025', TRUE),
  ('2025-04-30', 'Ngày Giải phóng miền Nam 30/4', TRUE),
  ('2025-05-01', 'Ngày Quốc tế Lao động 1/5', TRUE),
  ('2025-09-02', 'Quốc khánh 2/9', TRUE),
  ('2026-01-01', 'Tết Dương lịch 2026', TRUE),
  ('2026-04-30', 'Ngày Giải phóng miền Nam 30/4', TRUE),
  ('2026-05-01', 'Ngày Quốc tế Lao động 1/5', TRUE),
  ('2026-09-02', 'Quốc khánh 2/9', TRUE),
  ('2027-01-01', 'Tết Dương lịch 2027', TRUE),
  ('2027-04-30', 'Ngày Giải phóng miền Nam 30/4', TRUE),
  ('2027-05-01', 'Ngày Quốc tế Lao động 1/5', TRUE),
  ('2027-09-02', 'Quốc khánh 2/9', TRUE),
  ('2028-01-01', 'Tết Dương lịch 2028', TRUE),
  ('2028-04-30', 'Ngày Giải phóng miền Nam 30/4', TRUE),
  ('2028-05-01', 'Ngày Quốc tế Lao động 1/5', TRUE),
  ('2028-09-02', 'Quốc khánh 2/9', TRUE)
ON CONFLICT (holiday_date) DO NOTHING;

ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS policy_snapshot JSONB;

COMMENT ON COLUMN payroll_periods.policy_snapshot IS 'Bản chụp cấu hình chính sách (thuế, BHXH, ngày công chuẩn, hệ số OT, trần OT) tại thời điểm tính/chốt kỳ lương';

INSERT INTO system_settings (key, value, category, description) VALUES
  ('standard_work_days', '22'::jsonb, 'payroll', 'Số ngày công chuẩn trong tháng để tính lương ngày và đơn giá OT'),
  ('ot_multiplier', '1.5'::jsonb, 'payroll', 'Hệ số nhân đơn giá tiền lương làm thêm giờ ngày thường'),
  ('default_allowances', '1500000'::jsonb, 'payroll', 'Phụ cấp định kỳ mặc định (ăn trưa + xăng xe) khi có ngày công'),
  ('policy_effective_from', '"2020-01"'::jsonb, 'tax_bhxh', 'Kỳ lương bắt đầu áp dụng cấu hình chính sách hiện hành (YYYY-MM)')
ON CONFLICT (key) DO NOTHING;
