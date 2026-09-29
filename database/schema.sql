-- ============================================================
-- HỆ THỐNG QUẢN TRỊ NHÂN SỰ NEXUS HR / FwB HRMS
-- Database: PostgreSQL 16
-- Schema: 20 bảng — Đồng bộ 100% Frontend + Đặc tả v2.0
-- Author: Database + QA/Tester Team (Nhóm 2 FwB)
-- Updated: 16/09/2026
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ============================================================
-- CUSTOM ENUM TYPES
-- ============================================================
CREATE TYPE employee_status_enum AS ENUM ('DANG_LAM_VIEC', 'THU_VIEC', 'TAM_HOAN', 'DA_NGHI_VIEC');
CREATE TYPE contract_type_enum AS ENUM ('CHINH_THUC', 'THU_VIEC', 'THOI_VU', 'CONG_TAC_VIEN');
CREATE TYPE gender_enum AS ENUM ('Nam', 'Nu', 'Khac');
CREATE TYPE checkin_method_enum AS ENUM ('face_id', 'gps', 'manual', 'qr', 'kiosk', 'code_gps');
CREATE TYPE attendance_status_enum AS ENUM ('DUNG_GIO', 'DI_MUON', 'VE_SOM', 'NGHI_PHEP', 'VANG_KHONG_PHEP', 'CONG_TAC', 'NGHI_LE');
CREATE TYPE leave_stage_enum AS ENUM ('CHO_TRUONG_PHONG_DUYET', 'CHO_HR_PHE_CHUAN', 'DA_PHE_DUYET', 'TU_CHOI', 'DA_HUY');
CREATE TYPE leave_type_code_enum AS ENUM ('PHEP_NAM', 'NGHI_OM', 'VIEC_RIENG', 'THAI_SAN', 'KHONG_LUONG', 'CONG_TAC');
CREATE TYPE payroll_status_enum AS ENUM ('DU_THAO', 'DA_CHOT', 'DA_CHUYEN_KHOAN');
CREATE TYPE project_status_enum AS ENUM ('planned', 'in_progress', 'completed', 'paused', 'at_risk');
CREATE TYPE task_stage_enum AS ENUM ('todo', 'in_progress', 'review', 'done');
CREATE TYPE task_priority_enum AS ENUM ('Thấp', 'Trung bình', 'Cao', 'Khẩn cấp');
CREATE TYPE role_code_enum AS ENUM ('CEO', 'HR_DIRECTOR', 'LINE_MANAGER', 'EMPLOYEE', 'KIOSK', 'ADMIN');
CREATE TYPE notification_type_enum AS ENUM ('approval', 'payroll', 'attendance', 'company_award', 'health_check', 'ceo_directive', 'late_attendance', 'ot_request', 'c65_claim', 'payroll_anomaly', 'ai_turnover', 'system');

-- ============================================================
-- SEQUENCES (Tạo mã tự động)
-- ============================================================
CREATE SEQUENCE seq_employee_id START 1100 INCREMENT 1;

-- ============================================================
-- BẢNG 1: roles (Vai trò hệ thống)
-- ============================================================
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_code       role_code_enum NOT NULL UNIQUE,
    role_name       VARCHAR(50) NOT NULL UNIQUE,
    description     TEXT,
    permissions     JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE roles IS '5 vai trò: CEO, HR_DIRECTOR, LINE_MANAGER, EMPLOYEE, KIOSK';

-- ============================================================
-- BẢNG 2: departments (Phòng ban)
-- ============================================================
CREATE TABLE departments (
    id              VARCHAR(20) PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE,
    manager_id      VARCHAR(20),  -- FK thêm sau khi có bảng employees
    budget_yearly   NUMERIC(15, 2),
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE departments IS 'Phòng ban: DEPT-IT, DEPT-HR, DEPT-ACC, DEPT-MKT, DEPT-SALES, DEPT-CEO';

-- ============================================================
-- BẢNG 3: positions (Chức danh)
-- ============================================================
CREATE TABLE positions (
    id              VARCHAR(20) PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    level           INTEGER DEFAULT 0,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE positions IS 'Chức danh công việc (không gắn lương cố định, lương gắn theo hợp đồng nhân viên)';

-- ============================================================
-- BẢNG 4: employees (Hồ sơ nhân sự) — BẢNG TRUNG TÂM
-- ============================================================
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

COMMENT ON TABLE employees IS 'Hồ sơ nhân sự chi tiết, PK format NV-XXXX';
COMMENT ON COLUMN employees.citizen_id IS 'Số CCCD — Dữ liệu nhạy cảm, cần mã hóa';
COMMENT ON COLUMN employees.base_salary IS 'Lương hợp đồng — Dữ liệu bảo mật';
COMMENT ON COLUMN employees.face_encoding IS 'Mã hóa khuôn mặt cho chấm công AI';

-- Thêm FK manager_id cho departments
ALTER TABLE departments
    ADD CONSTRAINT fk_dept_manager FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL;

-- ============================================================
-- BẢNG 5: users (Tài khoản đăng nhập)
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     VARCHAR(20) UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
    email           VARCHAR(100) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role_code       role_code_enum NOT NULL DEFAULT 'EMPLOYEE',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE users IS 'Tài khoản đăng nhập, role_code xác định quyền hạn RBAC';

-- ============================================================
-- BẢNG 6: user_roles (Phân quyền N:N — mở rộng)
-- ============================================================
CREATE TABLE user_roles (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

-- ============================================================
-- BẢNG 7: attendance_logs (Nhật ký chấm công)
-- ============================================================
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
    check_in_lat    NUMERIC(10, 6),
    check_in_lng    NUMERIC(10, 6),
    check_in_address TEXT,
    check_out_lat   NUMERIC(10, 6),
    check_out_lng   NUMERIC(10, 6),
    check_out_address TEXT,
    distance_meters NUMERIC(8, 2),
    face_confidence NUMERIC(5, 2),
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_att_employee_date UNIQUE (employee_id, work_date),
    CONSTRAINT chk_att_checkout CHECK (check_out_time IS NULL OR check_out_time > check_in_time),
    CONSTRAINT chk_face_conf CHECK (face_confidence IS NULL OR (face_confidence >= 0 AND face_confidence <= 100))
);

COMMENT ON TABLE attendance_logs IS 'Chấm công hàng ngày — GPS, FaceID, Kiosk';

-- ============================================================
-- BẢNG 8: leave_types (Loại nghỉ phép — Lookup)
-- ============================================================
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

-- ============================================================
-- BẢNG 9: leave_requests (Đơn xin nghỉ phép — Quy trình 2 cấp)
-- ============================================================
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
    -- Quy trình phê duyệt 2 cấp
    stage           leave_stage_enum NOT NULL DEFAULT 'CHO_TRUONG_PHONG_DUYET',
    -- Cấp 1: Trưởng phòng
    manager_approved_by VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    manager_approved_at TIMESTAMPTZ,
    manager_note    TEXT,
    -- Cấp 2: HR Director / CEO
    hr_approved_by  VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    hr_approved_at  TIMESTAMPTZ,
    hr_note         TEXT,
    --
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_leave_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_leave_days CHECK (total_days > 0)
);

COMMENT ON TABLE leave_requests IS 'Đơn nghỉ phép — Quy trình duyệt 2 cấp: Trưởng phòng → HR/CEO';

-- ============================================================
-- BẢNG 10: leave_balances (Số dư ngày phép)
-- ============================================================
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

-- ============================================================
-- BẢNG 11: payroll_periods (Kỳ lương tháng)
-- ============================================================
CREATE TABLE payroll_periods (
    id              BIGSERIAL PRIMARY KEY,
    period          VARCHAR(10) NOT NULL UNIQUE,  -- '2026-09'
    total_headcount INTEGER NOT NULL DEFAULT 0,
    total_net       NUMERIC(15, 2) DEFAULT 0,
    total_bhxh      NUMERIC(15, 2) DEFAULT 0,
    total_tax       NUMERIC(15, 2) DEFAULT 0,
    total_ot_hours  NUMERIC(8, 2) DEFAULT 0,
    status          payroll_status_enum NOT NULL DEFAULT 'DU_THAO',
    locked_by       VARCHAR(20) REFERENCES employees(id),
    locked_at       TIMESTAMPTZ,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE payroll_periods IS 'Bảng lương tổng hợp theo tháng';

-- ============================================================
-- BẢNG 12: payslips (Phiếu lương cá nhân)
-- ============================================================
CREATE TABLE payslips (
    id              BIGSERIAL PRIMARY KEY,
    period_id       BIGINT NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
    employee_id     VARCHAR(20) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    -- Thu nhập
    base_salary     NUMERIC(12, 2) NOT NULL,
    actual_work_days NUMERIC(4, 1) NOT NULL DEFAULT 22,
    standard_work_days INTEGER NOT NULL DEFAULT 22,
    ot_hours        NUMERIC(6, 2) DEFAULT 0,
    ot_pay          NUMERIC(12, 2) DEFAULT 0,
    allowances      NUMERIC(12, 2) DEFAULT 0,
    bonus           NUMERIC(12, 2) DEFAULT 0,
    gross_income    NUMERIC(12, 2) NOT NULL DEFAULT 0,
    -- Khấu trừ bảo hiểm (theo Luật LĐ Việt Nam)
    bhxh_amount     NUMERIC(10, 2) DEFAULT 0,   -- 8%
    bhyt_amount     NUMERIC(10, 2) DEFAULT 0,   -- 1.5%
    bhtn_amount     NUMERIC(10, 2) DEFAULT 0,   -- 1%
    -- Thuế TNCN
    pit_deduction   NUMERIC(10, 2) DEFAULT 0,   -- Giảm trừ bản thân 11tr
    pit_taxable     NUMERIC(12, 2) DEFAULT 0,   -- Thu nhập chịu thuế
    pit_amount      NUMERIC(12, 2) DEFAULT 0,   -- Thuế TNCN phải nộp
    -- Kết quả
    total_deductions NUMERIC(12, 2) DEFAULT 0,
    net_salary      NUMERIC(12, 2) NOT NULL DEFAULT 0,
    -- Trạng thái
    status          payroll_status_enum NOT NULL DEFAULT 'DU_THAO',
    paid_date       DATE,
    bank_account    VARCHAR(30),
    bank_name       VARCHAR(50),
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_payslip UNIQUE (period_id, employee_id)
);

COMMENT ON TABLE payslips IS 'Phiếu lương cá nhân chi tiết — BHXH, BHYT, BHTN, Thuế TNCN';

-- ============================================================
-- BẢNG 13: projects (Dự án)
-- ============================================================
CREATE TABLE projects (
    id              VARCHAR(30) PRIMARY KEY,
    code            VARCHAR(20) NOT NULL UNIQUE,
    name            VARCHAR(200) NOT NULL,
    department_id   VARCHAR(20) REFERENCES departments(id) ON DELETE SET NULL,
    manager_id      VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    start_date      DATE,
    end_date        DATE,
    progress        INTEGER NOT NULL DEFAULT 0,
    status          project_status_enum NOT NULL DEFAULT 'planned',
    priority        task_priority_enum NOT NULL DEFAULT 'Trung bình',
    description     TEXT,
    budget_hours    INTEGER DEFAULT 0,
    used_hours      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_proj_progress CHECK (progress >= 0 AND progress <= 100),
    CONSTRAINT chk_proj_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

COMMENT ON TABLE projects IS 'Dự án — PK format PRJ-XXX';

-- ============================================================
-- BẢNG 14: tasks (Nhiệm vụ Kanban)
-- ============================================================
CREATE TABLE tasks (
    id              VARCHAR(20) PRIMARY KEY,
    project_id      VARCHAR(30) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title           VARCHAR(300) NOT NULL,
    description     TEXT,
    assignee_id     VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    creator_id      VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    deadline        DATE,
    priority        task_priority_enum NOT NULL DEFAULT 'Trung bình',
    kpi_weight      INTEGER DEFAULT 0,
    estimated_hours NUMERIC(6, 2),
    progress        INTEGER NOT NULL DEFAULT 0,
    stage           task_stage_enum NOT NULL DEFAULT 'todo',
    deliverable_url TEXT,
    deliverable_note TEXT,
    review_note     TEXT,
    reviewed_by     VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_task_progress CHECK (progress >= 0 AND progress <= 100),
    CONSTRAINT chk_task_kpi CHECK (kpi_weight >= 0 AND kpi_weight <= 100)
);

COMMENT ON TABLE tasks IS 'Kanban 4 cột: todo → in_progress → review → done';

-- ============================================================
-- BẢNG 15: task_logs (Lịch sử thao tác task)
-- ============================================================
CREATE TABLE task_logs (
    id              BIGSERIAL PRIMARY KEY,
    task_id         VARCHAR(20) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    actor_id        VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    action          VARCHAR(50) NOT NULL,
    from_stage      task_stage_enum,
    to_stage        task_stage_enum,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE task_logs IS 'Lịch sử chuyển trạng thái task + ghi chú nghiệm thu';

-- ============================================================
-- BẢNG 16: squads (Đội nhóm dự án)
-- ============================================================
CREATE TABLE squads (
    id              VARCHAR(20) PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    project_id      VARCHAR(30) REFERENCES projects(id) ON DELETE SET NULL,
    lead_id         VARCHAR(20) REFERENCES employees(id) ON DELETE SET NULL,
    target          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE squads IS 'Đội nhóm dự án — VD: Squad Core Banking, Squad Mobile App';

-- ============================================================
-- BẢNG 17: squad_members (Thành viên đội nhóm)
-- ============================================================
CREATE TABLE squad_members (
    squad_id        VARCHAR(20) NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    employee_id     VARCHAR(20) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    role_in_squad   VARCHAR(50) DEFAULT 'Member',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (squad_id, employee_id)
);

-- ============================================================
-- BẢNG 18: squad_messages (Tin nhắn chat nhóm)
-- ============================================================
CREATE TABLE squad_messages (
    id              BIGSERIAL PRIMARY KEY,
    squad_id        VARCHAR(20) NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    sender_id       VARCHAR(20) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_system_notice BOOLEAN NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE squad_messages IS 'Tin nhắn chat real-time qua WebSocket';

-- ============================================================
-- BẢNG 19: audit_logs (Nhật ký hệ thống)
-- ============================================================
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    employee_id     VARCHAR(20),
    action          VARCHAR(50) NOT NULL,
    table_name      VARCHAR(50) NOT NULL,
    record_id       VARCHAR(50),
    old_values      JSONB,
    new_values      JSONB,
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_logs IS 'Audit trail tự động — ghi lại mọi thay đổi dữ liệu';

-- ============================================================
-- BẢNG 20: notifications (Thông báo)
-- ============================================================
CREATE TABLE notifications (
    id              VARCHAR(30) PRIMARY KEY DEFAULT 'NOTIF-' || LPAD(nextval('seq_employee_id')::TEXT, 4, '0'),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    role_target     role_code_enum,
    type            notification_type_enum NOT NULL DEFAULT 'system',
    category        VARCHAR(100),
    title           VARCHAR(300) NOT NULL,
    summary         TEXT,
    sender_name     VARCHAR(100),
    sender_role     VARCHAR(100),
    sender_avatar   TEXT,
    priority        VARCHAR(20) DEFAULT 'normal',
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    action_type     VARCHAR(50),
    action_payload  JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notifications IS 'Thông báo phân theo vai trò — khớp mockNotifications.js';

-- ============================================================
-- INDEXES
-- ============================================================

-- Employees
CREATE INDEX idx_emp_department ON employees(department_id);
CREATE INDEX idx_emp_position ON employees(position_id);
CREATE INDEX idx_emp_manager ON employees(manager_id);
CREATE INDEX idx_emp_status ON employees(status);
CREATE INDEX idx_emp_email ON employees(work_email);

-- Users
CREATE INDEX idx_users_employee ON users(employee_id);
CREATE INDEX idx_users_role ON users(role_code);

-- Attendance
CREATE INDEX idx_att_employee ON attendance_logs(employee_id);
CREATE INDEX idx_att_date ON attendance_logs(work_date);
CREATE INDEX idx_att_emp_date ON attendance_logs(employee_id, work_date);

-- Leave
CREATE INDEX idx_leave_req_employee ON leave_requests(employee_id);
CREATE INDEX idx_leave_req_stage ON leave_requests(stage);
CREATE INDEX idx_leave_req_dates ON leave_requests(start_date, end_date);
CREATE INDEX idx_leave_bal_employee ON leave_balances(employee_id);

-- Payroll
CREATE INDEX idx_payslip_period ON payslips(period_id);
CREATE INDEX idx_payslip_employee ON payslips(employee_id);

-- Projects & Tasks
CREATE INDEX idx_task_project ON tasks(project_id);
CREATE INDEX idx_task_assignee ON tasks(assignee_id);
CREATE INDEX idx_task_stage ON tasks(stage);
CREATE INDEX idx_task_log_task ON task_logs(task_id);

-- Squads
CREATE INDEX idx_squad_project ON squads(project_id);
CREATE INDEX idx_squad_msg_squad ON squad_messages(squad_id);
CREATE INDEX idx_squad_msg_sent ON squad_messages(sent_at DESC);

-- Audit & Notifications
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_table ON audit_logs(table_name);
CREATE INDEX idx_notif_user ON notifications(user_id);
CREATE INDEX idx_notif_read ON notifications(user_id, is_read);

-- ============================================================
-- TRIGGER: Auto updated_at
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
        'departments', 'employees', 'users',
        'attendance_logs', 'leave_requests', 'leave_balances',
        'projects', 'tasks'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp()',
            t, t
        );
    END LOOP;
END;
$$;

-- ============================================================
-- TRIGGER: Auto tính work_hours + late_minutes
-- ============================================================
CREATE OR REPLACE FUNCTION fn_calc_attendance()
RETURNS TRIGGER AS $$
BEGIN
    -- Tính giờ làm
    IF NEW.check_in_time IS NOT NULL AND NEW.check_out_time IS NOT NULL THEN
        NEW.work_hours = ROUND(EXTRACT(EPOCH FROM (NEW.check_out_time - NEW.check_in_time)) / 3600.0, 2);
        IF NEW.work_hours > 8.0 THEN
            NEW.ot_hours = ROUND(NEW.work_hours - 8.0, 2);
        ELSE
            NEW.ot_hours = 0;
        END IF;
    END IF;

    -- Tính phút đi muộn (so với 8:00)
    IF NEW.check_in_time IS NOT NULL THEN
        DECLARE
            checkin_time TIME := NEW.check_in_time::TIME;
            standard_time TIME := '08:00:00';
        BEGIN
            IF checkin_time > standard_time THEN
                NEW.late_minutes = EXTRACT(EPOCH FROM (checkin_time - standard_time)) / 60;
                IF NEW.late_minutes > 0 THEN
                    NEW.status = 'DI_MUON';
                END IF;
            ELSE
                NEW.late_minutes = 0;
                NEW.status = 'DUNG_GIO';
            END IF;
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_attendance_calc
    BEFORE INSERT OR UPDATE ON attendance_logs
    FOR EACH ROW EXECUTE FUNCTION fn_calc_attendance();

-- ============================================================
-- TRIGGER: Auto cập nhật leave_balances khi duyệt phép
-- ============================================================
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

-- ============================================================
-- TRIGGER: Audit trail cho employees
-- ============================================================
CREATE OR REPLACE FUNCTION fn_audit_trail()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (action, table_name, record_id, new_values)
        VALUES ('INSERT', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (action, table_name, record_id, old_values, new_values)
        VALUES ('UPDATE', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (action, table_name, record_id, old_values)
        VALUES ('DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employees_audit
    AFTER INSERT OR UPDATE OR DELETE ON employees
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trail();

-- ============================================================
-- TRIGGER: Auto ghi task_logs khi task thay đổi stage
-- ============================================================
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

-- View tổng quan nhân viên (ẩn dữ liệu nhạy cảm)
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

-- View tổng quan chấm công hôm nay
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

-- Materialized View Dashboard thống kê
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

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Tìm kiếm nhân viên (hỗ trợ tiếng Việt không dấu)
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

-- Tính lương tháng cho 1 nhân viên
CREATE OR REPLACE FUNCTION fn_calculate_payslip(
    p_employee_id VARCHAR(20),
    p_period VARCHAR(10)  -- '2026-09'
)
RETURNS TABLE (
    base_sal NUMERIC, work_d BIGINT, ot_h NUMERIC,
    ot_p NUMERIC, gross NUMERIC,
    bhxh NUMERIC, bhyt NUMERIC, bhtn NUMERIC,
    pit NUMERIC, net NUMERIC
) AS $$
DECLARE
    v_month INTEGER;
    v_year INTEGER;
    v_base NUMERIC;
BEGIN
    v_month := SPLIT_PART(p_period, '-', 2)::INTEGER;
    v_year := SPLIT_PART(p_period, '-', 1)::INTEGER;

    SELECT e.base_salary INTO v_base FROM employees e WHERE e.id = p_employee_id;

    RETURN QUERY
    SELECT
        v_base,
        COUNT(a.id),
        COALESCE(SUM(a.ot_hours), 0),
        ROUND(COALESCE(SUM(a.ot_hours), 0) * (v_base / 22 / 8) * 1.5, 0),
        v_base + ROUND(COALESCE(SUM(a.ot_hours), 0) * (v_base / 22 / 8) * 1.5, 0),
        ROUND(v_base * 0.08, 0),
        ROUND(v_base * 0.015, 0),
        ROUND(v_base * 0.01, 0),
        GREATEST(0, ROUND((v_base - v_base * 0.105 - 11000000) * 0.05, 0)),
        v_base + ROUND(COALESCE(SUM(a.ot_hours), 0) * (v_base / 22 / 8) * 1.5, 0)
            - ROUND(v_base * 0.105, 0)
            - GREATEST(0, ROUND((v_base - v_base * 0.105 - 11000000) * 0.05, 0))
    FROM attendance_logs a
    WHERE a.employee_id = p_employee_id
      AND EXTRACT(MONTH FROM a.work_date) = v_month
      AND EXTRACT(YEAR FROM a.work_date) = v_year
      AND a.status IN ('DUNG_GIO', 'DI_MUON');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- SEED DATA (Đồng bộ với Frontend mockData + AuthContext)
-- ============================================================

-- 1. Vai trò
INSERT INTO roles (role_code, role_name, description, permissions) VALUES
('CEO', 'Tổng Giám Đốc', 'Cấp 1 — Lãnh đạo tối cao', '{"all": true}'),
('HR_DIRECTOR', 'Giám Đốc Nhân Sự', 'Cấp 2A — Quản lý toàn bộ nhân sự', '{"manage_employees": true, "manage_leave": true, "manage_payroll": true, "view_reports": true, "manage_ai": true}'),
('LINE_MANAGER', 'Trưởng Phòng', 'Cấp 2B — Quản lý nhân viên phòng ban', '{"view_team": true, "approve_leave": true, "manage_tasks": true, "create_projects": true}'),
('EMPLOYEE', 'Nhân Viên', 'Cấp 3 — Nhân viên tự phục vụ (ESS)', '{"view_self": true, "request_leave": true, "update_tasks": true}'),
('KIOSK', 'Kiosk Chấm Công', 'Thiết bị chấm công sảnh', '{"attendance_only": true}');

-- 2. Phòng ban (khớp Frontend mockEmployees)
INSERT INTO departments (id, name, budget_yearly, description) VALUES
('DEPT-CEO', 'Ban Điều Hành và Lãnh Đạo', 0, 'Ban Giám Đốc điều hành công ty'),
('DEPT-HR', 'Nhân sự và Vận hành', 2400000000, 'Quản lý tuyển dụng, đào tạo, chế độ nhân viên, C&B'),
('DEPT-IT', 'Kỹ thuật Phần mềm', 3600000000, 'Phòng Phát triển Phần mềm — Frontend, Backend, DevOps, QA'),
('DEPT-SALES', 'Kinh doanh và Dự án', 1800000000, 'Phòng Kinh doanh B2B, Account Management'),
('DEPT-ACC', 'Tài chính Kế toán', 1200000000, 'Quản lý tài chính, kế toán, thuế'),
('DEPT-MKT', 'Marketing và Truyền thông', 1500000000, 'Truyền thông thương hiệu, Digital Marketing');

-- 3. Chức danh
INSERT INTO positions (id, name, level) VALUES
('POS-CEO', 'Tổng Giám Đốc', 10),
('POS-DIR', 'Giám Đốc Khối', 9),
('POS-MGR', 'Trưởng Phòng', 8),
('POS-LEAD', 'Team Lead', 7),
('POS-SR', 'Senior', 6),
('POS-MID', 'Chuyên Viên', 5),
('POS-JR', 'Nhân Viên', 4),
('POS-INTERN', 'Thực Tập Sinh', 3);

-- 4. Nhân viên (AuthContext roles + mockEmployees)
INSERT INTO employees (id, full_name, department_id, position_id, job_title, work_email, phone_number, citizen_id, base_salary, contract_type, joined_date, status, bank_account, bank_name, kpi_score, attendance_rate) VALUES
-- 4 nhân vật chính (AuthContext.jsx)
('NV-0001', 'Lê Vũ Ngọc Duy', 'DEPT-CEO', 'POS-CEO', 'Tổng Giám Đốc (CEO)', 'ceo@fwbnexus.vn', '0900 000 001', '079185001001', 80000000, 'CHINH_THUC', '2018-01-15', 'DANG_LAM_VIEC', '0071 0008 89988', 'Vietcombank', 99.0, 100),
('NV-1001', 'Trần Mai Hương', 'DEPT-HR', 'POS-DIR', 'Giám Đốc Nhân Sự (HRD)', 'hrd@fwbnexus.vn', '0900 000 002', '079188002002', 55000000, 'CHINH_THUC', '2019-06-01', 'DANG_LAM_VIEC', '1018 0099 11', 'Vietcombank', 97.5, 99.0),
('NV-1002', 'Vũ Đình Khang', 'DEPT-IT', 'POS-MGR', 'Trưởng Phòng Kỹ Thuật Phần Mềm', 'lead@fwbnexus.vn', '0900 000 003', '079190003003', 42000000, 'CHINH_THUC', '2020-03-15', 'DANG_LAM_VIEC', '0071 9384 11', 'Vietcombank', 98.5, 100),
('NV-0842', 'Phạm Minh Quân', 'DEPT-IT', 'POS-SR', 'Kỹ sư Phần mềm (Frontend)', 'employee@fwbnexus.vn', '0900 000 004', '079196004004', 28000000, 'CHINH_THUC', '2022-08-01', 'DANG_LAM_VIEC', '1903 4455 66', 'Techcombank', 94.0, 97.5),
-- Nhân viên từ mockEmployees.js
('NV-1003', 'Đặng Thu Thảo', 'DEPT-HR', 'POS-MID', 'Chuyên viên Lương và Chế độ', 'thao.dang@fwbnexus.vn', '0912 345 678', '079196001234', 28000000, 'CHINH_THUC', '2023-03-15', 'DANG_LAM_VIEC', '1018 2948 29', 'Vietcombank', 96.0, 98.5),
('NV-1004', 'Trần Đình Trọng', 'DEPT-IT', 'POS-LEAD', 'Team Lead DevOps', 'trong.tran@fwbnexus.vn', '0909 112 233', '079192005678', 38000000, 'CHINH_THUC', '2022-08-01', 'DANG_LAM_VIEC', '0071 9384 11', 'Vietcombank', 98.5, 100),
('NV-1005', 'Vũ Mai Chi', 'DEPT-MKT', 'POS-SR', 'Senior Designer', 'chi.vu@fwbnexus.vn', '0938 776 554', '079198009988', 18000000, 'CHINH_THUC', '2023-11-10', 'DANG_LAM_VIEC', '1029 3847 55', 'Vietcombank', 72.4, 92.0),
('NV-1006', 'Phan Minh Đạt', 'DEPT-ACC', 'POS-MID', 'Kế toán viên', 'dat.phan@fwbnexus.vn', '0977 889 900', '079195004321', 24000000, 'CHINH_THUC', '2024-02-05', 'DANG_LAM_VIEC', '1903 4455 66', 'Techcombank', 92.0, 96.5),
('NV-1007', 'Hoàng Quốc Bảo', 'DEPT-IT', 'POS-MID', 'Backend Developer', 'bao.hoang@fwbnexus.vn', '0968 123 456', '079197008765', 30000000, 'CHINH_THUC', '2023-04-12', 'DANG_LAM_VIEC', '1903 8472 90', 'Techcombank', 94.2, 97.0),
('NV-1008', 'Lê Ngọc Bích', 'DEPT-SALES', 'POS-MID', 'Account Manager', 'bich.le@fwbnexus.vn', '0902 334 455', '079194002345', 32000000, 'CHINH_THUC', '2022-09-20', 'DANG_LAM_VIEC', '0071 8899 00', 'Vietcombank', 91.0, 95.0),
('NV-1042', 'Lê Hoàng Nam', 'DEPT-ACC', 'POS-MID', 'Kế toán tổng hợp', 'nam.le@fwbnexus.vn', '0901 555 666', '079196005566', 22000000, 'CHINH_THUC', '2023-06-01', 'DANG_LAM_VIEC', '1903 5566 77', 'Techcombank', 87.5, 94.0),
-- Nhân viên từ mockLeaveRequests + notifications
('NV-0219', 'Nguyễn Thị Hà', 'DEPT-ACC', 'POS-MID', 'Kế toán viên', 'ha.nguyen@fwbnexus.vn', '0901 777 888', '079196007788', 15000000, 'CHINH_THUC', '2023-09-01', 'DANG_LAM_VIEC', '1903 7788 99', 'Vietcombank', 88.0, 95.5),
('NV-0843', 'Lê Hoàng Nam', 'DEPT-IT', 'POS-MID', 'Kỹ sư Frontend (Web)', 'nam.lh@fwbnexus.vn', '0901 999 000', '079197009900', 25000000, 'CHINH_THUC', '2023-08-15', 'DANG_LAM_VIEC', '1903 9900 11', 'Techcombank', 85.0, 93.0),
('NV-0845', 'Hoàng Văn Long', 'DEPT-IT', 'POS-LEAD', 'Senior Backend Lead', 'long.hoang@fwbnexus.vn', '0901 222 333', '079193002233', 38000000, 'CHINH_THUC', '2023-07-01', 'DANG_LAM_VIEC', '0071 2233 44', 'Vietcombank', 88.0, 96.0);

-- Cập nhật manager
UPDATE employees SET manager_id = 'NV-0001' WHERE id IN ('NV-1001', 'NV-1002');
UPDATE employees SET manager_id = 'NV-1001' WHERE id IN ('NV-1003');
UPDATE employees SET manager_id = 'NV-1002' WHERE id IN ('NV-0842', 'NV-1004', 'NV-1007', 'NV-0843', 'NV-0845');
UPDATE employees SET manager_id = 'NV-1001' WHERE id IN ('NV-1005', 'NV-1006', 'NV-1008', 'NV-1042', 'NV-0219');

-- Cập nhật manager phòng ban
UPDATE departments SET manager_id = 'NV-0001' WHERE id = 'DEPT-CEO';
UPDATE departments SET manager_id = 'NV-1001' WHERE id = 'DEPT-HR';
UPDATE departments SET manager_id = 'NV-1002' WHERE id = 'DEPT-IT';
UPDATE departments SET manager_id = 'NV-1008' WHERE id = 'DEPT-SALES';
UPDATE departments SET manager_id = 'NV-1006' WHERE id = 'DEPT-ACC';
UPDATE departments SET manager_id = 'NV-1005' WHERE id = 'DEPT-MKT';

-- 5. Tài khoản đăng nhập
INSERT INTO users (employee_id, email, password_hash, role_code) VALUES
('NV-0001', 'ceo@fwbnexus.vn', crypt('Ceo@123456', gen_salt('bf')), 'CEO'),
('NV-1001', 'hrd@fwbnexus.vn', crypt('Hrd@123456', gen_salt('bf')), 'HR_DIRECTOR'),
('NV-1002', 'lead@fwbnexus.vn', crypt('Lead@12345', gen_salt('bf')), 'LINE_MANAGER'),
('NV-0842', 'employee@fwbnexus.vn', crypt('Emp@123456', gen_salt('bf')), 'EMPLOYEE'),
('NV-1003', 'thao.dang@fwbnexus.vn', crypt('Emp@123456', gen_salt('bf')), 'EMPLOYEE'),
('NV-1004', 'trong.tran@fwbnexus.vn', crypt('Emp@123456', gen_salt('bf')), 'EMPLOYEE'),
('NV-1007', 'bao.hoang@fwbnexus.vn', crypt('Emp@123456', gen_salt('bf')), 'EMPLOYEE');

-- Phân quyền
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u JOIN roles r ON u.role_code = r.role_code;

-- 6. Loại nghỉ phép
INSERT INTO leave_types (id, name, code, max_days_per_year, is_paid, description) VALUES
('LT-AL', 'Nghỉ phép năm', 'PHEP_NAM', 12, TRUE, 'Phép năm theo Bộ luật Lao động'),
('LT-SL', 'Nghỉ ốm BHXH', 'NGHI_OM', 30, TRUE, 'Nghỉ ốm có giấy C65 BHXH'),
('LT-PL', 'Nghỉ việc riêng', 'VIEC_RIENG', 3, TRUE, 'Nghỉ kết hôn, tang chế, hiếu hỉ'),
('LT-ML', 'Nghỉ thai sản', 'THAI_SAN', 180, TRUE, 'Nghỉ thai sản theo quy định'),
('LT-UL', 'Nghỉ không lương', 'KHONG_LUONG', 30, FALSE, 'Nghỉ không hưởng lương'),
('LT-BT', 'Nghỉ công tác', 'CONG_TAC', 30, TRUE, 'Công tác ngoài văn phòng');

-- 7. Số dư phép năm 2026
INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days)
SELECT e.id, 'LT-AL', 2026, 12, CASE
    WHEN e.id = 'NV-0842' THEN 3.5  -- Phạm Minh Quân: dùng 3.5 ngày
    WHEN e.id = 'NV-1003' THEN 2.5
    WHEN e.id = 'NV-1005' THEN 4.0
    ELSE ROUND((random() * 3)::NUMERIC, 1)
END
FROM employees e WHERE e.status = 'DANG_LAM_VIEC';

-- 8. Dự án (khớp mockProjectsTasks.js)
INSERT INTO projects (id, code, name, department_id, manager_id, start_date, end_date, progress, status, priority, description, budget_hours, used_hours) VALUES
('PRJ-NEXUS-V2', 'PRJ-2026-01', 'Nâng cấp Cổng Dịch Vụ Nhân Sự Tập Trung NEXUS HR v2.0', 'DEPT-IT', 'NV-1002', '2026-08-01', '2026-10-30', 78, 'in_progress', 'Khẩn cấp', 'Hiện đại hóa toàn diện hệ thống HRMS doanh nghiệp', 480, 374),
('PRJ-AI-ATTENDANCE', 'PRJ-2026-02', 'Hệ Thống Kiosk Chấm Công AI Nhận Diện Khuôn Mặt Real-time', 'DEPT-IT', 'NV-1002', '2026-08-15', '2026-11-15', 60, 'in_progress', 'Cao', 'Tích hợp camera RTSP, giải thuật liveness detection', 320, 192),
('PRJ-MOBILE-ESS', 'PRJ-2026-03', 'Ứng Dụng Mobile ESS Cho Nhân Viên (iOS và Android)', 'DEPT-IT', 'NV-1002', '2026-09-01', '2026-12-15', 35, 'in_progress', 'Trung bình', 'Xây dựng ứng dụng di động cho nhân viên check-in GPS', 400, 140),
('PRJ-SECURITY-AUDIT', 'PRJ-2026-04', 'Kiểm Toán Bảo Mật Dữ Liệu Nhân Sự và Tuân Thủ NĐ 13/2023', 'DEPT-IT', 'NV-1002', '2026-07-01', '2026-08-31', 100, 'completed', 'Cao', 'Mã hóa CCCD, BHXH và phân quyền nghiêm ngặt', 160, 155);

-- 9. Tasks (khớp mockProjectsTasks.js — một số task tiêu biểu)
INSERT INTO tasks (id, project_id, title, description, assignee_id, creator_id, deadline, priority, kpi_weight, estimated_hours, progress, stage) VALUES
('TSK-101', 'PRJ-NEXUS-V2', 'Thiết kế và Lập trình 3 chế độ xem Lịch Nghỉ Phép', 'Xây dựng modal lịch nghỉ phép hỗ trợ chuyển tab tương tác', 'NV-0842', 'NV-1002', '2026-09-20', 'Cao', 25, 32, 85, 'review'),
('TSK-102', 'PRJ-NEXUS-V2', 'Xây dựng Bảng lương tổng hợp và Phiếu lương PDF', 'Engine tính toán BHXH, Thuế TNCN, xuất PDF phiếu lương', 'NV-1007', 'NV-1002', '2026-09-25', 'Khẩn cấp', 30, 40, 60, 'in_progress'),
('TSK-103', 'PRJ-AI-ATTENDANCE', 'Tích hợp Camera RTSP + Face Detection', 'Kết nối camera IP, triển khai liveness detection', 'NV-1004', 'NV-1002', '2026-10-10', 'Cao', 35, 48, 45, 'in_progress'),
('TSK-104', 'PRJ-NEXUS-V2', 'Thiết kế giao diện Kanban Board quản lý task', 'Drag-drop 4 cột, cập nhật %, nộp bàn giao', 'NV-0842', 'NV-1002', '2026-09-15', 'Trung bình', 20, 24, 100, 'done'),
('TSK-105', 'PRJ-MOBILE-ESS', 'Wireframe UI/UX ứng dụng Mobile', 'Thiết kế Figma 20 màn hình chính iOS/Android', 'NV-1005', 'NV-1002', '2026-09-30', 'Trung bình', 15, 20, 30, 'in_progress'),
('TSK-106', 'PRJ-NEXUS-V2', 'Xây dựng API REST Phân hệ Nghỉ phép 2 cấp duyệt', 'Endpoint CRUD leave requests + approval workflow', 'NV-1007', 'NV-1002', '2026-09-22', 'Cao', 25, 36, 40, 'in_progress');

-- 10. Squads (khớp mockProjectsTasks.js)
INSERT INTO squads (id, name, project_id, lead_id, target) VALUES
('SQ-01', 'Squad Core Banking', 'PRJ-NEXUS-V2', 'NV-0845', 'Module thanh toán và xử lý lương tự động'),
('SQ-02', 'Squad Mobile App', 'PRJ-MOBILE-ESS', 'NV-0842', 'Ứng dụng mobile ESS cho nhân viên'),
('SQ-03', 'Squad Internal DevOps', 'PRJ-AI-ATTENDANCE', 'NV-1004', 'Hạ tầng CI/CD và triển khai Kiosk chấm công');

INSERT INTO squad_members (squad_id, employee_id, role_in_squad) VALUES
('SQ-01', 'NV-0845', 'TechLead'),
('SQ-01', 'NV-1007', 'Member'),
('SQ-01', 'NV-0842', 'Member'),
('SQ-02', 'NV-0842', 'TechLead'),
('SQ-02', 'NV-1005', 'Member'),
('SQ-02', 'NV-0843', 'Member'),
('SQ-03', 'NV-1004', 'TechLead'),
('SQ-03', 'NV-1007', 'Member');

-- 11. Tin nhắn mẫu
INSERT INTO squad_messages (squad_id, sender_id, content, sent_at) VALUES
('SQ-01', 'NV-0845', 'Đã hoàn thành merge Pull Request #48 cho module Chấm công Kiosk!', NOW() - INTERVAL '2 hours'),
('SQ-01', 'NV-1007', 'Đang review code, có 2 điểm cần bổ sung unit test', NOW() - INTERVAL '1 hour'),
('SQ-01', 'NV-0842', 'OK anh, em sẽ bổ sung trong sprint tới', NOW() - INTERVAL '30 minutes');

-- 12. Chấm công mẫu (5 ngày gần nhất)
DO $$
DECLARE
    emp RECORD;
    d DATE;
    ci TIMESTAMPTZ;
    co TIMESTAMPTZ;
BEGIN
    FOR emp IN SELECT id FROM employees WHERE status = 'DANG_LAM_VIEC' LOOP
        FOR d IN SELECT generate_series(CURRENT_DATE - 4, CURRENT_DATE, '1 day'::INTERVAL)::DATE LOOP
            IF EXTRACT(DOW FROM d) NOT IN (0, 6) THEN
                ci := d + (TIME '07:45:00' + (random() * INTERVAL '35 minutes'));
                co := d + (TIME '17:00:00' + (random() * INTERVAL '60 minutes'));
                INSERT INTO attendance_logs (employee_id, work_date, check_in_time, check_out_time, check_in_method, face_confidence)
                VALUES (emp.id, d, ci, co, 'face_id', 85.0 + random() * 15.0)
                ON CONFLICT (employee_id, work_date) DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;
END;
$$;

-- 13. Đơn nghỉ phép mẫu (Quy trình 2 cấp)
INSERT INTO leave_requests (
    id, employee_id, leave_type_id, start_date, end_date, total_days,
    reason, handover_to, stage,
    manager_approved_by, manager_approved_at, manager_note,
    hr_approved_by, hr_approved_at, hr_note, submitted_at
) VALUES 
('LP-2026-001', 'NV-0842', 'LT-AL', CURRENT_DATE + 2, CURRENT_DATE + 3, 2.0, 'Nghỉ giải quyết việc gia đình cá nhân', 'Đặng Thảo', 'CHO_TRUONG_PHONG_DUYET', NULL, NULL, NULL, NULL, NULL, NULL, NOW() - INTERVAL '1 day'),
('LP-2026-002', 'NV-1003', 'LT-SL', CURRENT_DATE - 3, CURRENT_DATE - 2, 2.0, 'Khám sức khỏe chuyên sâu có chỉ định giấy C65', 'Trần Trọng', 'CHO_HR_PHE_CHUAN', 'NV-1002', NOW() - INTERVAL '2 days', 'Đồng ý duyệt cấp 1, chuyển HR duyệt thủ tục bảo hiểm', NULL, NULL, NULL, NOW() - INTERVAL '3 days'),
('LP-2026-003', 'NV-1005', 'LT-AL', CURRENT_DATE - 10, CURRENT_DATE - 9, 2.0, 'Nghỉ phép thường niên kết hợp nghỉ dưỡng', 'Phạm Minh Quân', 'DA_PHE_DUYET', 'NV-1002', NOW() - INTERVAL '10 days', 'Đồng ý sắp xếp công việc', 'NV-1001', NOW() - INTERVAL '9 days', 'HR phê duyệt theo chế độ phép năm', NOW() - INTERVAL '11 days')
ON CONFLICT (id) DO NOTHING;

-- 14. Kỳ lương mẫu (Tháng 08/2026 đã chốt và Tháng 09/2026 dự thảo)
INSERT INTO payroll_periods (id, period, total_headcount, total_net, total_bhxh, total_tax, total_ot_hours, status, locked_by, locked_at, note) VALUES
(1, '2026-08', 14, 254200000, 24000000, 8500000, 48.5, 'DA_CHOT', 'NV-1001', '2026-09-05 17:30:00', 'Kỳ lương Tháng 08/2026 đã chốt và chuyển khoản thành công'),
(2, '2026-09', 14, 0, 0, 0, 24.0, 'DU_THAO', NULL, NULL, 'Kỳ lương Tháng 09/2026 đang tổng hợp dữ liệu chấm công')
ON CONFLICT (period) DO NOTHING;

-- 15. Thông báo mẫu
INSERT INTO notifications (id, role_target, type, category, title, summary, sender_name, sender_role, is_read, created_at) VALUES
('NOTIF-0001', 'CEO', 'payroll', 'Tài chính & Lương', 'Bảng lương Tháng 08/2026 đã được phê duyệt và giải ngân', 'Tổng chi ngân sách lương: 254,200,000 VNĐ cho 14 nhân sự.', 'Trần Mai Hương', 'Giám Đốc Nhân Sự (HRD)', false, NOW() - INTERVAL '2 hours'),
('NOTIF-0002', 'LINE_MANAGER', 'approval', 'Nghỉ phép', 'Đơn xin nghỉ phép mới chờ phê duyệt: LP-2026-001', 'Nhân viên Phạm Minh Quân xin nghỉ 2 ngày.', 'Phạm Minh Quân', 'Kỹ sư Phần mềm', false, NOW() - INTERVAL '4 hours'),
('NOTIF-0003', 'HR_DIRECTOR', 'c65_claim', 'Bảo hiểm & Phép', 'Đơn nghỉ ốm C65 chờ HR duyệt chế độ: LP-2026-002', 'Trưởng phòng Vũ Đình Khang đã duyệt cấp 1 cho nhân viên Trần Quang Thắng.', 'Vũ Đình Khang', 'Trưởng phòng Kỹ thuật', false, NOW() - INTERVAL '1 day'),
('NOTIF-0004', 'EMPLOYEE', 'payroll', 'Phiếu lương cá nhân', 'Phiếu lương Tháng 08/2026 đã sẵn sàng trên cổng ESS', 'Đã hoàn tất thanh toán tiền lương qua ngân hàng Vietcombank. Vui lòng kiểm tra sao kê.', 'Phòng Kế toán & Nhân sự', 'C&B Specialist', true, NOW() - INTERVAL '3 days'),
('NOTIF-0005', 'EMPLOYEE', 'system', 'Hệ thống', 'Chào mừng bạn đến với Cổng thông tin Nhân sự NEXUS HR v2.0', 'Trải nghiệm các tính năng chấm công FaceID, cổng dự án Kanban và quản lý ngày phép trực tuyến.', 'Ban Quản Trị Hệ Thống', 'Admin', true, NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- HOÀN THÀNH
-- ============================================================
REFRESH MATERIALIZED VIEW mv_dashboard_stats;

SELECT '✅ NEXUS HR Database — 20 bảng đã tạo thành công!' AS message;
SELECT
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS total_tables,
    (SELECT COUNT(*) FROM employees) AS total_employees,
    (SELECT COUNT(*) FROM users) AS total_users,
    (SELECT COUNT(*) FROM projects) AS total_projects,
    (SELECT COUNT(*) FROM tasks) AS total_tasks,
    (SELECT COUNT(*) FROM squads) AS total_squads;
