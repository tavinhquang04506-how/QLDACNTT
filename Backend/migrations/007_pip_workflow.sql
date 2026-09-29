-- PIP workflow: line managers propose a plan, HR/CEO approve or reject it, then the plan is tracked goal by goal
-- and closed with an outcome. A proposal and an active plan both count as the employee's single open plan.
ALTER TABLE pip_plans DROP CONSTRAINT IF EXISTS chk_pip_status;
ALTER TABLE pip_plans ADD CONSTRAINT chk_pip_status
    CHECK (status IN ('proposed', 'active', 'completed', 'failed', 'cancelled', 'rejected'));

ALTER TABLE pip_plans ADD COLUMN IF NOT EXISTS reason      TEXT;
ALTER TABLE pip_plans ADD COLUMN IF NOT EXISTS approved_by VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE pip_plans ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE pip_plans ADD COLUMN IF NOT EXISTS closed_at   TIMESTAMPTZ;

-- Plans created before this migration were activated directly by HR/CEO.
UPDATE pip_plans SET approved_by = created_by, approved_at = created_at WHERE approved_at IS NULL;
UPDATE pip_plans SET closed_at = updated_at WHERE status IN ('completed', 'failed', 'cancelled') AND closed_at IS NULL;

DROP INDEX IF EXISTS uq_pip_one_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pip_one_open ON pip_plans(employee_id) WHERE status IN ('proposed', 'active');

COMMENT ON COLUMN pip_plans.reason IS 'Căn cứ lập PIP (kết quả đánh giá, sự việc cụ thể)';
COMMENT ON COLUMN pip_plans.approved_by IS 'HR/CEO phê duyệt hoặc từ chối đề xuất';
COMMENT ON TABLE pip_plans IS 'Kế hoạch cải thiện hiệu suất (PIP); mỗi nhân viên tối đa một kế hoạch đang mở (proposed/active)';
