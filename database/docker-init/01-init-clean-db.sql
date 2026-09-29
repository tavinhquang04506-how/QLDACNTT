-- ============================================================
-- NEXUS HRMS — Clean Database Initialization Script for Docker
-- Initializes full schema and Master Super Admin Account
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ============================================================
-- ENUM TYPES
-- ============================================================
CREATE TYPE employee_status_enum AS ENUM ('DANG_LAM_VIEC', 'THU_VIEC', 'TAM_HOAN', 'DA_NGHI_VIEC');
CREATE TYPE contract_type_enum AS ENUM ('CHINH_THUC', 'THU_VIEC', 'THOI_VU', 'CONG_TAC_VIEN');
CREATE TYPE contract_status_enum AS ENUM ('CHO_KY', 'HIEU_LUC', 'HET_HAN', 'DA_CHAM_DUT');
CREATE TYPE gender_enum AS ENUM ('Nam', 'Nu', 'Khac');
CREATE TYPE checkin_method_enum AS ENUM ('face_id', 'gps', 'manual', 'qr', 'kiosk');
CREATE TYPE attendance_status_enum AS ENUM ('DUNG_GIO', 'DI_MUON', 'VE_SOM', 'NGHI_PHEP', 'VANG_KHONG_PHEP', 'CONG_TAC', 'NGHI_LE');
CREATE TYPE leave_stage_enum AS ENUM ('CHO_TRUONG_PHONG_DUYET', 'CHO_HR_PHE_CHUAN', 'DA_PHE_DUYET', 'TU_CHOI', 'DA_HUY');
CREATE TYPE leave_type_code_enum AS ENUM ('PHEP_NAM', 'NGHI_OM', 'VIEC_RIENG', 'THAI_SAN', 'KHONG_LUONG', 'CONG_TAC');
CREATE TYPE payroll_status_enum AS ENUM ('DU_THAO', 'DA_CHOT', 'DA_CHUYEN_KHOAN');
CREATE TYPE project_status_enum AS ENUM ('planned', 'in_progress', 'completed', 'paused', 'at_risk');
CREATE TYPE task_stage_enum AS ENUM ('todo', 'in_progress', 'review', 'done');
CREATE TYPE task_priority_enum AS ENUM ('Thấp', 'Trung bình', 'Cao', 'Khẩn cấp');
CREATE TYPE role_code_enum AS ENUM ('CEO', 'HR_DIRECTOR', 'LINE_MANAGER', 'EMPLOYEE', 'KIOSK', 'ADMIN');
CREATE TYPE notification_type_enum AS ENUM ('approval', 'payroll', 'attendance', 'company_award', 'health_check', 'ceo_directive', 'late_attendance', 'ot_request', 'c65_claim', 'payroll_anomaly', 'ai_turnover', 'system');
CREATE TYPE notice_category_enum AS ENUM ('general', 'policy', 'event', 'urgent', 'benefit');

-- ============================================================
-- SEQUENCES
-- ============================================================
CREATE SEQUENCE seq_employee_id START 1100 INCREMENT 1;
CREATE SEQUENCE seq_contract_id START 1000;
CREATE SEQUENCE seq_emp_code START 5000;
CREATE SEQUENCE seq_leave_id START 100;
CREATE SEQUENCE seq_ot_id START 100;
CREATE SEQUENCE seq_claim_id START 100;
CREATE SEQUENCE seq_project_id START 1000;
CREATE SEQUENCE seq_task_id START 1000;
CREATE SEQUENCE seq_squad_id START 100;
CREATE SEQUENCE seq_notice_id START 1;
CREATE SEQUENCE seq_handbook_id START 1;
CREATE SEQUENCE seq_review_id START 1;
CREATE SEQUENCE seq_pip_id START 1;

-- ============================================================
-- TABLES
-- ============================================================

-- 1. Roles
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_code       role_code_enum NOT NULL UNIQUE,
    role_name       VARCHAR(50) NOT NULL UNIQUE,
    description     TEXT,
    permissions     JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Departments
CREATE TABLE departments (
    id              VARCHAR(20) PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE,
    manager_id      VARCHAR(20),
    budget_yearly   NUMERIC(15, 2),
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Positions
CREATE TABLE positions (
    id              VARCHAR(20) PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    level           INTEGER DEFAULT 0,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Employees
CREATE TABLE employees (
    id              VARCHAR(20) PRIMARY KEY,
    full_name       VARCHAR(100) NOT NULL,
    department_id   VARCHAR(20) REFERENCES departments(id) ON DELETE SET NULL,
    position_id     VARCHAR(20) REFERENCES positions(id) ON DELETE SET NULL,
    job_title       VARCHAR(100) NOT NULL,
    work_email      VARCHAR(100) NOT NULL UNIQUE,
    phone_number    VARCHAR(20),
    citizen_id      VARCHAR(20),
    date_of_birth   DATE,
    gender          gender_enum,
    address         TEXT,
    base_salary     NUMERIC(12, 2) NOT NULL DEFAULT 0,
    contract_type   contract_type_enum NOT NULL DEFAULT 'CHINH_THUC',
    joined_date     DATE NOT NULL,
    termination_date DATE,
    termination_reason TEXT,
    manager_id      VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    status          employee_status_enum NOT NULL DEFAULT 'DANG_LAM_VIEC',
    avatar_url      TEXT,
    face_encoding   BYTEA,
    bank_account    VARCHAR(30),
    bank_name       VARCHAR(50),
    kpi_score       NUMERIC(5, 2) DEFAULT 0,
    attendance_rate NUMERIC(5, 2) DEFAULT 100,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_emp_self_manager CHECK (manager_id != id)
);

ALTER TABLE departments
    ADD CONSTRAINT fk_dept_manager FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL;

-- 5. Contracts
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

-- 6. Users
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     VARCHAR(20) UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
    email           VARCHAR(100) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role_code       role_code_enum NOT NULL DEFAULT 'EMPLOYEE',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at   TIMESTAMPTZ,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Refresh Tokens
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id   UUID NOT NULL,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    replaced_by UUID,
    ip          VARCHAR(45),
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_family ON refresh_tokens(family_id);

-- 8. User Roles
CREATE TABLE user_roles (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

-- 9. Attendance Logs
CREATE TABLE attendance_logs (
    id              BIGSERIAL PRIMARY KEY,
    employee_id     VARCHAR(20) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    work_date       DATE NOT NULL,
    check_in_time   TIMESTAMPTZ,
    check_out_time  TIMESTAMPTZ,
    check_in_method checkin_method_enum DEFAULT 'manual',
    check_out_method checkin_method_enum,
    status          attendance_status_enum NOT NULL DEFAULT 'DUNG_GIO',
    late_minutes    INTEGER NOT NULL DEFAULT 0,
    work_hours      NUMERIC(4, 2) DEFAULT 0,
    ot_hours        NUMERIC(4, 2) DEFAULT 0,
    gps_lat         NUMERIC(10, 6),
    gps_lng         NUMERIC(10, 6),
    face_confidence NUMERIC(5, 2),
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_att_employee_date UNIQUE (employee_id, work_date),
    CONSTRAINT chk_att_checkout CHECK (check_out_time IS NULL OR check_out_time > check_in_time),
    CONSTRAINT chk_face_conf CHECK (face_confidence IS NULL OR (face_confidence >= 0 AND face_confidence <= 100))
);

-- 10. Leave Types
CREATE TABLE leave_types (
    id              VARCHAR(20) PRIMARY KEY,
    name            VARCHAR(50) NOT NULL UNIQUE,
    code            leave_type_code_enum NOT NULL UNIQUE,
    max_days_per_year INTEGER NOT NULL,
    is_paid         BOOLEAN NOT NULL DEFAULT TRUE,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Leave Requests
CREATE TABLE leave_requests (
    id              VARCHAR(30) PRIMARY KEY,
    employee_id     VARCHAR(20) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id   VARCHAR(20) NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    total_days      NUMERIC(3, 1) NOT NULL,
    reason          TEXT NOT NULL,
    handover_to     VARCHAR(100),
    attachment_url  TEXT,
    attachment_name VARCHAR(200),
    stage           leave_stage_enum NOT NULL DEFAULT 'CHO_TRUONG_PHONG_DUYET',
    manager_approved_by VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    manager_approved_at TIMESTAMPTZ,
    manager_note    TEXT,
    hr_approved_by  VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    hr_approved_at  TIMESTAMPTZ,
    hr_note         TEXT,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_leave_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_leave_days CHECK (total_days > 0)
);

-- 12. Leave Balances
CREATE TABLE leave_balances (
    id              BIGSERIAL PRIMARY KEY,
    employee_id     VARCHAR(20) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id   VARCHAR(20) NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    year            INTEGER NOT NULL,
    total_days      NUMERIC(4, 1) NOT NULL,
    used_days       NUMERIC(4, 1) NOT NULL DEFAULT 0,
    remaining_days  NUMERIC(4, 1) GENERATED ALWAYS AS (total_days - used_days) STORED,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_leave_bal UNIQUE (employee_id, leave_type_id, year),
    CONSTRAINT chk_leave_bal CHECK (used_days >= 0 AND used_days <= total_days)
);

-- 13. Overtime Requests
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

-- 14. Medical Claims
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

-- 15. Payroll Periods
CREATE TABLE payroll_periods (
    id              SERIAL PRIMARY KEY,
    period          VARCHAR(10) NOT NULL UNIQUE,
    total_headcount INTEGER DEFAULT 0,
    total_net       NUMERIC(15, 2) DEFAULT 0,
    total_bhxh      NUMERIC(15, 2) DEFAULT 0,
    total_tax       NUMERIC(15, 2) DEFAULT 0,
    total_ot_hours  NUMERIC(8, 2) DEFAULT 0,
    status          payroll_status_enum NOT NULL DEFAULT 'DU_THAO',
    locked_by       VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    locked_at       TIMESTAMPTZ,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Payslips
CREATE TABLE payslips (
    id              BIGSERIAL PRIMARY KEY,
    period_id       INTEGER NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
    employee_id     VARCHAR(20) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    base_salary     NUMERIC(12, 2) NOT NULL,
    work_days       NUMERIC(4, 1) NOT NULL DEFAULT 0,
    standard_days   INTEGER NOT NULL DEFAULT 22,
    actual_salary   NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ot_hours        NUMERIC(5, 2) DEFAULT 0,
    ot_salary       NUMERIC(12, 2) DEFAULT 0,
    bonus           NUMERIC(12, 2) DEFAULT 0,
    allowance       NUMERIC(12, 2) DEFAULT 0,
    gross_salary    NUMERIC(12, 2) NOT NULL DEFAULT 0,
    bhxh_amount     NUMERIC(12, 2) DEFAULT 0,
    bhyt_amount     NUMERIC(12, 2) DEFAULT 0,
    bhtn_amount     NUMERIC(12, 2) DEFAULT 0,
    pit_amount      NUMERIC(12, 2) DEFAULT 0,
    advance_deduction NUMERIC(12, 2) DEFAULT 0,
    total_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0,
    net_salary      NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payment_status  VARCHAR(20) NOT NULL DEFAULT 'CHO_THANH_TOAN',
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payslip_period_emp UNIQUE (period_id, employee_id)
);

-- 17. Projects
CREATE TABLE projects (
    id              VARCHAR(30) PRIMARY KEY DEFAULT 'PRJ-' || LPAD(nextval('seq_project_id')::TEXT, 4, '0'),
    code            VARCHAR(20) UNIQUE NOT NULL,
    name            VARCHAR(150) NOT NULL,
    department_id   VARCHAR(20) REFERENCES departments(id) ON DELETE SET NULL,
    manager_id      VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    start_date      DATE NOT NULL,
    end_date        DATE,
    progress        INTEGER NOT NULL DEFAULT 0,
    status          project_status_enum NOT NULL DEFAULT 'planned',
    priority        task_priority_enum NOT NULL DEFAULT 'Trung bình',
    description     TEXT,
    budget_hours    INTEGER DEFAULT 0,
    used_hours      NUMERIC(7, 2) DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_prj_dates CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT chk_prj_prog CHECK (progress >= 0 AND progress <= 100)
);

-- 18. Tasks
CREATE TABLE tasks (
    id              VARCHAR(30) PRIMARY KEY DEFAULT 'TSK-' || LPAD(nextval('seq_task_id')::TEXT, 4, '0'),
    project_id      VARCHAR(30) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    assignee_id     VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    creator_id      VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    deadline        DATE,
    priority        task_priority_enum NOT NULL DEFAULT 'Trung bình',
    kpi_weight      INTEGER DEFAULT 10,
    estimated_hours NUMERIC(5, 2) DEFAULT 0,
    actual_hours    NUMERIC(5, 2) DEFAULT 0,
    progress        INTEGER NOT NULL DEFAULT 0,
    stage           task_stage_enum NOT NULL DEFAULT 'todo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_task_prog CHECK (progress >= 0 AND progress <= 100),
    CONSTRAINT chk_task_kpi CHECK (kpi_weight >= 0 AND kpi_weight <= 100)
);

-- 19. Task Logs
CREATE TABLE task_logs (
    id              BIGSERIAL PRIMARY KEY,
    task_id         VARCHAR(30) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    actor_id        VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    action          VARCHAR(50) NOT NULL,
    from_stage      task_stage_enum,
    to_stage        task_stage_enum,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 20. Squads
CREATE TABLE squads (
    id              VARCHAR(30) PRIMARY KEY DEFAULT 'SQ-' || LPAD(nextval('seq_squad_id')::TEXT, 3, '0'),
    name            VARCHAR(100) NOT NULL,
    project_id      VARCHAR(30) REFERENCES projects(id) ON DELETE SET NULL,
    lead_id         VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    target          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE squad_members (
    squad_id        VARCHAR(30) NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    employee_id     VARCHAR(20) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    role_in_squad   VARCHAR(50) DEFAULT 'Member',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (squad_id, employee_id)
);

CREATE TABLE squad_messages (
    id              BIGSERIAL PRIMARY KEY,
    squad_id        VARCHAR(30) NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    sender_id       VARCHAR(20) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 21. Audit Logs
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    employee_id     VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    action          VARCHAR(50) NOT NULL,
    table_name      VARCHAR(50) NOT NULL,
    record_id       VARCHAR(50),
    old_values      JSONB,
    new_values      JSONB,
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 22. Notifications & Reads
CREATE TABLE notifications (
    id              VARCHAR(30) PRIMARY KEY,
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    role_target     role_code_enum,
    type            notification_type_enum NOT NULL DEFAULT 'system',
    category        VARCHAR(50) DEFAULT 'Hệ thống',
    title           VARCHAR(200) NOT NULL,
    summary         TEXT NOT NULL,
    action_url      VARCHAR(200),
    sender_name     VARCHAR(100),
    sender_role     VARCHAR(100),
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_reads (
    notification_id VARCHAR(30) NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (notification_id, user_id)
);
CREATE INDEX idx_notif_reads_user ON notification_reads(user_id);

-- 23. Company Notices
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

-- 24. Handbook Docs
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

-- 25. Performance Reviews
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

-- 26. PIP Plans
CREATE TABLE pip_plans (
    id          VARCHAR(30) PRIMARY KEY DEFAULT 'PIP-' || LPAD(nextval('seq_pip_id')::TEXT, 4, '0'),
    employee_id VARCHAR(20) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    created_by  VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    goals       JSONB NOT NULL DEFAULT '[]'::jsonb,
    status      VARCHAR(12) NOT NULL DEFAULT 'active',
    outcome     TEXT,
    reason      TEXT,
    approved_by VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    closed_at   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_pip_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_pip_status CHECK (status IN ('proposed', 'active', 'completed', 'failed', 'cancelled', 'rejected')),
    CONSTRAINT chk_pip_goals CHECK (jsonb_typeof(goals) = 'array')
);
CREATE UNIQUE INDEX uq_pip_one_open ON pip_plans(employee_id) WHERE status IN ('proposed', 'active');

-- 27. Schema Migrations Table
CREATE TABLE IF NOT EXISTS schema_migrations (
    name       VARCHAR(200) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'departments', 'employees', 'contracts', 'users',
        'attendance_logs', 'leave_requests', 'leave_balances',
        'ot_requests', 'medical_claims', 'payroll_periods', 'payslips',
        'projects', 'tasks', 'squads', 'company_notices', 'handbook_docs',
        'performance_reviews', 'pip_plans'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp()',
            t, t
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION fn_calc_attendance()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.check_in_time IS NOT NULL AND NEW.check_out_time IS NOT NULL THEN
        NEW.work_hours = ROUND(EXTRACT(EPOCH FROM (NEW.check_out_time - NEW.check_in_time)) / 3600.0, 2);
        IF NEW.work_hours > 8.0 THEN
            NEW.ot_hours = ROUND(NEW.work_hours - 8.0, 2);
        ELSE
            NEW.ot_hours = 0;
        END IF;
    END IF;

    IF NEW.check_in_time IS NOT NULL THEN
        DECLARE
            checkin_time TIME := NEW.check_in_time::TIME;
            standard_time TIME := '08:00:00';
        BEGIN
            IF checkin_time > standard_time THEN
                NEW.late_minutes = EXTRACT(EPOCH FROM (checkin_time - standard_time)) / 60;
                IF NEW.late_minutes > 0 AND NEW.status IN ('DUNG_GIO', 'DI_MUON') THEN
                    NEW.status = 'DI_MUON';
                END IF;
            ELSE
                NEW.late_minutes = 0;
                IF NEW.status IN ('DUNG_GIO', 'DI_MUON') THEN
                    NEW.status = 'DUNG_GIO';
                END IF;
            END IF;
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_attendance_calc
    BEFORE INSERT OR UPDATE ON attendance_logs
    FOR EACH ROW EXECUTE FUNCTION fn_calc_attendance();

CREATE OR REPLACE FUNCTION fn_update_leave_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.stage = 'DA_PHE_DUYET' AND (OLD.stage IS DISTINCT FROM 'DA_PHE_DUYET') THEN
        UPDATE leave_balances
        SET used_days = used_days + NEW.total_days
        WHERE employee_id = NEW.employee_id
          AND leave_type_id = NEW.leave_type_id
          AND year = EXTRACT(YEAR FROM NEW.start_date);
    END IF;

    IF OLD.stage = 'DA_PHE_DUYET' AND NEW.stage != 'DA_PHE_DUYET' THEN
        UPDATE leave_balances
        SET used_days = GREATEST(used_days - OLD.total_days, 0)
        WHERE employee_id = OLD.employee_id
          AND leave_type_id = OLD.leave_type_id
          AND year = EXTRACT(YEAR FROM OLD.start_date);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_leave_balance
    AFTER UPDATE ON leave_requests
    FOR EACH ROW EXECUTE FUNCTION fn_update_leave_balance();

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

CREATE TRIGGER trg_employees_audit
    AFTER INSERT OR UPDATE OR DELETE ON employees
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trail();

CREATE OR REPLACE FUNCTION fn_task_stage_log()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.stage IS DISTINCT FROM NEW.stage THEN
        INSERT INTO task_logs (task_id, action, from_stage, to_stage)
        VALUES (NEW.id, 'STAGE_CHANGE', OLD.stage, NEW.stage);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_task_stage_log
    AFTER UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION fn_task_stage_log();

-- ============================================================
-- VIEWS
-- ============================================================
CREATE OR REPLACE VIEW v_employee_public AS
SELECT
    e.id, e.full_name, e.job_title, e.work_email, e.phone_number,
    e.status, e.joined_date, e.avatar_url,
    e.kpi_score, e.attendance_rate,
    d.name AS department_name,
    p.name AS position_name,
    mgr.full_name AS manager_name
FROM employees e
LEFT JOIN departments d ON e.department_id = d.id
LEFT JOIN positions p ON e.position_id = p.id
LEFT JOIN employees mgr ON e.manager_id = mgr.id;

CREATE OR REPLACE VIEW v_today_attendance AS
SELECT
    e.id AS employee_id, e.full_name, e.job_title,
    d.name AS department_name,
    a.check_in_time, a.check_out_time, a.check_in_method,
    a.status, a.late_minutes, a.work_hours, a.ot_hours,
    a.face_confidence
FROM employees e
LEFT JOIN attendance_logs a ON e.id = a.employee_id AND a.work_date = CURRENT_DATE
LEFT JOIN departments d ON e.department_id = d.id
WHERE e.status = 'DANG_LAM_VIEC';

CREATE MATERIALIZED VIEW mv_dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM employees WHERE status = 'DANG_LAM_VIEC') AS total_active,
    (SELECT COUNT(*) FROM employees WHERE status = 'DA_NGHI_VIEC') AS total_inactive,
    (SELECT COUNT(*) FROM attendance_logs WHERE work_date = CURRENT_DATE AND status = 'DUNG_GIO') AS present_today,
    (SELECT COUNT(*) FROM attendance_logs WHERE work_date = CURRENT_DATE AND status = 'DI_MUON') AS late_today,
    (SELECT COUNT(*) FROM leave_requests WHERE stage = 'CHO_TRUONG_PHONG_DUYET') AS pending_leaves,
    (SELECT COUNT(*) FROM projects WHERE status = 'in_progress') AS active_projects,
    (SELECT COUNT(*) FROM tasks WHERE stage IN ('todo', 'in_progress')) AS open_tasks,
    NOW() AS last_refreshed;

CREATE OR REPLACE FUNCTION fn_search_employees(search_term TEXT)
RETURNS TABLE (
    id VARCHAR(20), full_name VARCHAR(100), job_title VARCHAR(100),
    work_email VARCHAR(100), department_name VARCHAR(100)
) AS $$
BEGIN
    RETURN QUERY
    SELECT e.id, e.full_name, e.job_title, e.work_email, d.name
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE e.status = 'DANG_LAM_VIEC'
      AND (
          unaccent(LOWER(e.full_name)) LIKE '%' || unaccent(LOWER(search_term)) || '%'
          OR LOWER(e.id) LIKE '%' || LOWER(search_term) || '%'
          OR LOWER(e.work_email) LIKE '%' || LOWER(search_term) || '%'
      );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- MASTER LOOKUP SEED DATA (Clean Master Catalogs)
-- ============================================================

-- 1. Roles
INSERT INTO roles (role_code, role_name, description, permissions) VALUES
('CEO', 'Tổng Giám Đốc', 'Cấp 1 — Lãnh đạo tối cao', '{"all": true}'),
('HR_DIRECTOR', 'Giám Đốc Nhân Sự', 'Cấp 2A — Quản lý toàn bộ nhân sự', '{"manage_employees": true, "manage_leave": true, "manage_payroll": true, "view_reports": true, "manage_ai": true}'),
('LINE_MANAGER', 'Trưởng Phòng', 'Cấp 2B — Quản lý nhân viên phòng ban', '{"view_team": true, "approve_leave": true, "manage_tasks": true, "create_projects": true}'),
('EMPLOYEE', 'Nhân Viên', 'Cấp 3 — Nhân viên tự phục vụ (ESS)', '{"view_self": true, "request_leave": true, "update_tasks": true}'),
('KIOSK', 'Kiosk Chấm Công', 'Thiết bị chấm công sảnh', '{"attendance_only": true}'),
('ADMIN', 'Quản Trị Kỹ Thuật', 'Quản trị hệ thống và người dùng', '{"manage_system": true, "manage_users": true}');

-- 2. Core Departments
INSERT INTO departments (id, name, budget_yearly, description) VALUES
('DEPT-CEO', 'Ban Điều Hành và Lãnh Đạo', 0, 'Ban Giám Đốc điều hành công ty'),
('DEPT-HR', 'Nhân sự và Vận hành', 2400000000, 'Quản lý tuyển dụng, đào tạo, chế độ nhân viên, C&B'),
('DEPT-IT', 'Kỹ thuật Phần mềm', 3600000000, 'Phòng Phát triển Phần mềm — Frontend, Backend, DevOps, QA'),
('DEPT-SALES', 'Kinh doanh và Dự án', 1800000000, 'Phòng Kinh doanh B2B, Account Management'),
('DEPT-ACC', 'Tài chính Kế toán', 1200000000, 'Quản lý tài chính, kế toán, thuế'),
('DEPT-MKT', 'Marketing và Truyền thông', 1500000000, 'Truyền thông thương hiệu, Digital Marketing');

-- 3. Core Positions
INSERT INTO positions (id, name, level) VALUES
('POS-CEO', 'Tổng Giám Đốc', 10),
('POS-DIR', 'Giám Đốc Khối', 9),
('POS-MGR', 'Trưởng Phòng', 8),
('POS-LEAD', 'Team Lead', 7),
('POS-SR', 'Senior', 6),
('POS-MID', 'Chuyên Viên', 5),
('POS-JR', 'Nhân Viên', 4),
('POS-INTERN', 'Thực Tập Sinh', 3);

-- 4. Standard Leave Types
INSERT INTO leave_types (id, name, code, max_days_per_year, is_paid, description) VALUES
('LT-AL', 'Nghỉ phép năm', 'PHEP_NAM', 12, TRUE, 'Phép năm theo Bộ luật Lao động'),
('LT-SL', 'Nghỉ ốm BHXH', 'NGHI_OM', 30, TRUE, 'Nghỉ ốm có giấy C65 BHXH'),
('LT-PL', 'Nghỉ việc riêng', 'VIEC_RIENG', 3, TRUE, 'Nghỉ kết hôn, tang chế, hiếu hỉ'),
('LT-ML', 'Nghỉ thai sản', 'THAI_SAN', 180, TRUE, 'Nghỉ thai sản theo quy định'),
('LT-UL', 'Nghỉ không lương', 'KHONG_LUONG', 30, FALSE, 'Nghỉ không hưởng lương'),
('LT-BT', 'Nghỉ công tác', 'CONG_TAC', 30, TRUE, 'Công tác ngoài văn phòng');

-- ============================================================
-- SUPER ADMIN ACCOUNT SEED (DUY NHẤT 1 TÀI KHOẢN ADMIN TỔNG)
-- ============================================================

-- 1. Hồ sơ nhân sự gốc cho Super Admin
INSERT INTO employees (
    id, full_name, department_id, position_id, job_title,
    work_email, phone_number, citizen_id, base_salary,
    contract_type, joined_date, status, bank_account, bank_name,
    kpi_score, attendance_rate
) VALUES (
    'NV-0001', 'Quản Trị Viên Hệ Thống', 'DEPT-CEO', 'POS-CEO', 'Tổng Giám Đốc (Super Admin)',
    'admin@fwbnexus.vn', '0900 000 001', '079185001001', 100000000,
    'CHINH_THUC', '2020-01-01', 'DANG_LAM_VIEC', '0071 0008 89988', 'Vietcombank',
    100.0, 100.0
);

-- Cập nhật manager cho phòng ban CEO
UPDATE departments SET manager_id = 'NV-0001' WHERE id = 'DEPT-CEO';

-- 2. Hợp đồng chính thức cho Super Admin
INSERT INTO contracts (employee_id, contract_no, type, start_date, salary, status)
VALUES ('NV-0001', 'HDLD-NV-0001', 'CHINH_THUC', '2020-01-01', 100000000, 'HIEU_LUC');

-- 3. Tài khoản đăng nhập Super Admin (Mật khẩu: Admin@2026!)
INSERT INTO users (employee_id, email, password_hash, role_code, is_active)
VALUES (
    'NV-0001',
    'admin@fwbnexus.vn',
    '$2a$10$pY8IqE4IkJ7W/Ckh93c4k.JfMmygtZ81s6w1dB0IKC4W3WuzsgaAS',
    'CEO',
    TRUE
);

-- 4. Gán quyền cho Super Admin (Cả CEO và ADMIN)
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.email = 'admin@fwbnexus.vn' AND r.role_code IN ('CEO', 'ADMIN');

-- 5. Số dư ngày phép khởi tạo cho Super Admin
INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days)
SELECT 'NV-0001', id, EXTRACT(YEAR FROM CURRENT_DATE)::INT, max_days_per_year, 0
FROM leave_types;

-- 6. Đánh dấu đã áp dụng toàn bộ schema migrations
INSERT INTO schema_migrations (name) VALUES
('001_auth_sessions.sql'),
('002_hr_core.sql'),
('003_time_and_money.sql'),
('004_fix_sequences.sql'),
('005_work_and_insight.sql'),
('006_attendance_status_and_notes.sql'),
('007_pip_workflow.sql')
ON CONFLICT (name) DO NOTHING;

REFRESH MATERIALIZED VIEW mv_dashboard_stats;

-- ============================================================
-- XÁC NHẬN HOÀN TẤT
-- ============================================================
SELECT '✅ Khởi tạo Database sạch & Super Admin admin@fwbnexus.vn thành công!' AS result;
