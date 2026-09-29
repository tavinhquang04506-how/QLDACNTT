-- Phase 3: leave ids, overtime requests, medical claims.
CREATE SEQUENCE seq_leave_id START 100;
CREATE SEQUENCE seq_ot_id START 1;
CREATE SEQUENCE seq_claim_id START 1;

CREATE TABLE ot_requests (
    id                  VARCHAR(30) PRIMARY KEY DEFAULT 'OT-' || EXTRACT(YEAR FROM CURRENT_DATE)::INT || '-' || LPAD(nextval('seq_ot_id')::TEXT, 3, '0'),
    employee_id         VARCHAR(20) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    work_date           DATE NOT NULL,
    start_time          TIME NOT NULL,
    end_time            TIME NOT NULL,
    hours               NUMERIC(4, 2) NOT NULL,
    reason              TEXT NOT NULL,
    stage               leave_stage_enum NOT NULL DEFAULT 'CHO_TRUONG_PHONG_DUYET',
    manager_approved_by VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    manager_approved_at TIMESTAMPTZ,
    manager_note        TEXT,
    hr_approved_by      VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    hr_approved_at      TIMESTAMPTZ,
    hr_note             TEXT,
    submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_ot_times CHECK (end_time > start_time),
    CONSTRAINT chk_ot_hours CHECK (hours > 0 AND hours <= 12)
);

CREATE INDEX idx_ot_employee_date ON ot_requests(employee_id, work_date);
CREATE INDEX idx_ot_stage ON ot_requests(stage);
CREATE TRIGGER trg_ot_requests_updated BEFORE UPDATE ON ot_requests
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
COMMENT ON TABLE ot_requests IS 'Đăng ký làm thêm giờ — cùng quy trình duyệt với nghỉ phép';

CREATE TABLE medical_claims (
    id                  VARCHAR(30) PRIMARY KEY DEFAULT 'MC-' || EXTRACT(YEAR FROM CURRENT_DATE)::INT || '-' || LPAD(nextval('seq_claim_id')::TEXT, 3, '0'),
    employee_id         VARCHAR(20) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    claim_date          DATE NOT NULL,
    amount              NUMERIC(12, 2) NOT NULL,
    hospital            VARCHAR(200),
    description         TEXT NOT NULL,
    attachment_url      TEXT,
    leave_request_id    VARCHAR(30) REFERENCES leave_requests(id) ON DELETE SET NULL,
    stage               leave_stage_enum NOT NULL DEFAULT 'CHO_TRUONG_PHONG_DUYET',
    manager_approved_by VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    manager_approved_at TIMESTAMPTZ,
    manager_note        TEXT,
    hr_approved_by      VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    hr_approved_at      TIMESTAMPTZ,
    hr_note             TEXT,
    submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_claim_amount CHECK (amount > 0)
);

CREATE INDEX idx_claim_employee ON medical_claims(employee_id);
CREATE INDEX idx_claim_stage ON medical_claims(stage);
CREATE TRIGGER trg_medical_claims_updated BEFORE UPDATE ON medical_claims
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
COMMENT ON TABLE medical_claims IS 'Bồi thường / hoàn ứng chi phí y tế — cùng quy trình duyệt với nghỉ phép';
