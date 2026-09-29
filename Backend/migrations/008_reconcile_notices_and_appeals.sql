-- Phase 8 (G1 Remediation):
-- 1. Reconcile company_notices.attachments column (F28)
-- 2. Formalize attendance_appeals schema, sequence, foreign keys, constraints and indexes (F04, F05, F28)

ALTER TABLE company_notices
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE SEQUENCE IF NOT EXISTS seq_appeal_id START WITH 1001 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS attendance_appeals (
  id              VARCHAR(50) PRIMARY KEY DEFAULT ('APL-' || nextval('seq_appeal_id')),
  employee_id     VARCHAR(50) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_name   VARCHAR(100),
  department_name VARCHAR(100),
  date            DATE NOT NULL,
  appeal_type     VARCHAR(50) NOT NULL DEFAULT 'DI_MUON',
  reason          TEXT NOT NULL,
  proof_url       TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'CHO_DUYET',
  review_note     TEXT,
  reviewer_id     VARCHAR(50) REFERENCES employees(id) ON DELETE SET NULL,
  reviewer_name   VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  CONSTRAINT chk_appeal_status CHECK (status IN ('CHO_DUYET', 'DA_DUYET', 'TU_CHOI'))
);

ALTER TABLE attendance_appeals
  ALTER COLUMN id SET DEFAULT ('APL-' || nextval('seq_appeal_id')),
  ALTER COLUMN status SET DEFAULT 'CHO_DUYET',
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE attendance_appeals DROP CONSTRAINT IF EXISTS chk_appeal_status;
ALTER TABLE attendance_appeals ADD CONSTRAINT chk_appeal_status
  CHECK (status IN ('CHO_DUYET', 'DA_DUYET', 'TU_CHOI'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'attendance_appeals'::regclass
      AND contype = 'f'
  ) THEN
    DELETE FROM attendance_appeals a WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = a.employee_id);
    ALTER TABLE attendance_appeals
      ADD CONSTRAINT fk_attendance_appeals_employee
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_appeals_emp_date ON attendance_appeals(employee_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_appeals_status ON attendance_appeals(status, created_at DESC);
