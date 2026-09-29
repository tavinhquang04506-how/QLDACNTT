-- Phase 4: ids, notification read state, notices, handbook, performance reviews, PIP plans, task-log actor.
CREATE SEQUENCE seq_project_id START 1000;
CREATE SEQUENCE seq_task_id START 1000;
CREATE SEQUENCE seq_squad_id START 100;
CREATE SEQUENCE seq_notice_id START 1;
CREATE SEQUENCE seq_handbook_id START 1;
CREATE SEQUENCE seq_review_id START 1;
CREATE SEQUENCE seq_pip_id START 1;

-- Per-user read state (role-addressed notifications are shared rows, so is_read cannot be per user).
CREATE TABLE notification_reads (
    notification_id VARCHAR(30) NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (notification_id, user_id)
);
CREATE INDEX idx_notif_reads_user ON notification_reads(user_id);

CREATE TYPE notice_category_enum AS ENUM ('general', 'policy', 'event', 'urgent', 'benefit');

CREATE TABLE company_notices (
    id                   VARCHAR(30) PRIMARY KEY DEFAULT 'NT-' || LPAD(nextval('seq_notice_id')::TEXT, 4, '0'),
    title                VARCHAR(300) NOT NULL,
    content              TEXT NOT NULL,
    category             notice_category_enum NOT NULL DEFAULT 'general',
    priority             VARCHAR(10) NOT NULL DEFAULT 'normal',
    author_id            VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    target_role          role_code_enum,
    target_department_id VARCHAR(20) REFERENCES departments(id) ON DELETE SET NULL,
    is_pinned            BOOLEAN NOT NULL DEFAULT FALSE,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    published_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at           TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_notice_priority CHECK (priority IN ('low', 'normal', 'high')),
    CONSTRAINT chk_notice_expiry CHECK (expires_at IS NULL OR expires_at > published_at)
);
CREATE INDEX idx_notice_active ON company_notices(is_active, published_at DESC);
CREATE TRIGGER trg_company_notices_updated BEFORE UPDATE ON company_notices
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
COMMENT ON TABLE company_notices IS 'Thông báo nội bộ — gửi tới tất cả, theo vai trò hoặc theo phòng ban';

CREATE TABLE handbook_docs (
    id          VARCHAR(30) PRIMARY KEY DEFAULT 'HB-' || LPAD(nextval('seq_handbook_id')::TEXT, 4, '0'),
    title       VARCHAR(300) NOT NULL,
    category    VARCHAR(100) NOT NULL DEFAULT 'Chung',
    content     TEXT NOT NULL,
    version     INTEGER NOT NULL DEFAULT 1,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by  VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_handbook_version CHECK (version >= 1)
);
CREATE TRIGGER trg_handbook_docs_updated BEFORE UPDATE ON handbook_docs
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
COMMENT ON TABLE handbook_docs IS 'Cẩm nang nhân viên; version tăng mỗi lần đổi nội dung';

CREATE TABLE performance_reviews (
    id                 VARCHAR(30) PRIMARY KEY DEFAULT 'PR-' || LPAD(nextval('seq_review_id')::TEXT, 4, '0'),
    employee_id        VARCHAR(20) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    period             VARCHAR(10) NOT NULL,
    reviewer_id        VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    performance_score  NUMERIC(5, 2) NOT NULL,
    potential_score    NUMERIC(5, 2) NOT NULL,
    nine_box_cell      SMALLINT NOT NULL,
    comments           TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_review_period UNIQUE (employee_id, period),
    CONSTRAINT chk_review_period CHECK (period ~ '^\d{4}-(Q[1-4]|H[12]|FY)$'),
    CONSTRAINT chk_review_perf CHECK (performance_score BETWEEN 0 AND 100),
    CONSTRAINT chk_review_pot CHECK (potential_score BETWEEN 0 AND 100),
    CONSTRAINT chk_review_cell CHECK (nine_box_cell BETWEEN 1 AND 9)
);
CREATE INDEX idx_review_employee ON performance_reviews(employee_id, period DESC);
CREATE TRIGGER trg_performance_reviews_updated BEFORE UPDATE ON performance_reviews
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
COMMENT ON TABLE performance_reviews IS 'Đánh giá năng lực theo kỳ; nine_box_cell 1..9 (9 = hiệu suất và tiềm năng cao nhất)';

CREATE TABLE pip_plans (
    id          VARCHAR(30) PRIMARY KEY DEFAULT 'PIP-' || LPAD(nextval('seq_pip_id')::TEXT, 4, '0'),
    employee_id VARCHAR(20) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    created_by  VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    goals       JSONB NOT NULL DEFAULT '[]'::jsonb,
    status      VARCHAR(12) NOT NULL DEFAULT 'active',
    outcome     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_pip_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_pip_status CHECK (status IN ('active', 'completed', 'failed', 'cancelled')),
    CONSTRAINT chk_pip_goals CHECK (jsonb_typeof(goals) = 'array')
);
CREATE UNIQUE INDEX uq_pip_one_active ON pip_plans(employee_id) WHERE status = 'active';
CREATE TRIGGER trg_pip_plans_updated BEFORE UPDATE ON pip_plans
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
COMMENT ON TABLE pip_plans IS 'Kế hoạch cải thiện hiệu suất (PIP); tối đa một kế hoạch active cho mỗi nhân viên';

-- Task stage changes now record who moved the task (set via set_config('app.employee_id', ...)).
CREATE OR REPLACE FUNCTION fn_task_stage_log()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.stage IS DISTINCT FROM NEW.stage THEN
        INSERT INTO task_logs (task_id, actor_id, action, from_stage, to_stage)
        VALUES (NEW.id, NULLIF(current_setting('app.employee_id', true), ''), 'STAGE_CHANGE', OLD.stage, NEW.stage);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
