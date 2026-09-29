-- Phase 2: employment contracts, termination reason, audit trigger with actor attribution.
CREATE TYPE contract_status_enum AS ENUM ('CHO_KY', 'HIEU_LUC', 'HET_HAN', 'DA_CHAM_DUT');

CREATE SEQUENCE seq_contract_id START 1;
CREATE SEQUENCE seq_emp_code START 5000;

CREATE TABLE contracts (
    id          VARCHAR(30) PRIMARY KEY DEFAULT 'CT-' || LPAD(nextval('seq_contract_id')::TEXT, 5, '0'),
    employee_id VARCHAR(20) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    contract_no VARCHAR(50) NOT NULL UNIQUE,
    type        contract_type_enum NOT NULL,
    start_date  DATE NOT NULL,
    end_date    DATE,
    salary      NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status      contract_status_enum NOT NULL DEFAULT 'HIEU_LUC',
    file_url    TEXT,
    signed_at   TIMESTAMPTZ,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_contract_dates CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT chk_contract_salary CHECK (salary >= 0)
);

CREATE UNIQUE INDEX uq_contract_one_active ON contracts(employee_id) WHERE status = 'HIEU_LUC';
CREATE INDEX idx_contract_employee ON contracts(employee_id);

CREATE TRIGGER trg_contracts_updated BEFORE UPDATE ON contracts
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

COMMENT ON TABLE contracts IS 'Hợp đồng lao động; tối đa một hợp đồng HIEU_LUC cho mỗi nhân viên';

ALTER TABLE employees ADD COLUMN termination_reason TEXT;

INSERT INTO contracts (employee_id, contract_no, type, start_date, salary, status)
SELECT id, 'HDLD-' || id, contract_type, joined_date, base_salary, 'HIEU_LUC'
  FROM employees
 WHERE status <> 'DA_NGHI_VIEC';

-- Audit trigger: attribute the acting user (set via set_config('app.user_id', ...)) and never store face_encoding.
CREATE OR REPLACE FUNCTION fn_audit_trail()
RETURNS TRIGGER AS $$
DECLARE
    actor_user UUID := NULLIF(current_setting('app.user_id', true), '')::UUID;
    actor_emp  VARCHAR(20) := NULLIF(current_setting('app.employee_id', true), '');
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (user_id, employee_id, action, table_name, record_id, new_values)
        VALUES (actor_user, actor_emp, 'INSERT', TG_TABLE_NAME, NEW.id, to_jsonb(NEW) - 'face_encoding');
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (user_id, employee_id, action, table_name, record_id, old_values, new_values)
        VALUES (actor_user, actor_emp, 'UPDATE', TG_TABLE_NAME, NEW.id,
                to_jsonb(OLD) - 'face_encoding', to_jsonb(NEW) - 'face_encoding');
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (user_id, employee_id, action, table_name, record_id, old_values)
        VALUES (actor_user, actor_emp, 'DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD) - 'face_encoding');
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
