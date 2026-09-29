/**
 * Generate StarUML ERD (.mdj) — NEXUS HR 20 tables
 * Synchronized with schema.sql v2 + Frontend mockData
 * Run: node generate_erd.js
 */
const fs = require('fs');
const path = require('path');

let idCounter = 100;
function genId() { return `AAAAAA${String(idCounter++).padStart(6, '0')}`; }

const projectId = genId();
const dataModelId = genId();
const diagramId = genId();

const COLORS = {
  auth:       '#BBDEFB',  // Xanh dương nhạt — Auth
  core:       '#C8E6C9',  // Xanh lá nhạt — Core HR
  attendance: '#FFE0B2',  // Cam nhạt — Chấm công
  leave:      '#E1BEE7',  // Tím nhạt — Nghỉ phép
  payroll:    '#FFF9C4',  // Vàng nhạt — Lương
  project:    '#B2EBF2',  // Cyan nhạt — Dự án
  squad:      '#F8BBD0',  // Hồng nhạt — Squad
  system:     '#CFD8DC',  // Xám nhạt — Hệ thống
};

const entities = [
  // ── AUTH ──
  {
    name: 'roles', group: 'auth', x: 70, y: 50,
    columns: [
      { name: 'id', type: 'UUID', pk: true },
      { name: 'role_code', type: 'role_code_enum', notNull: true, unique: true },
      { name: 'role_name', type: 'VARCHAR(50)', notNull: true, unique: true },
      { name: 'description', type: 'TEXT' },
      { name: 'permissions', type: 'JSONB' },
      { name: 'created_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },
  {
    name: 'users', group: 'auth', x: 450, y: 50,
    columns: [
      { name: 'id', type: 'UUID', pk: true },
      { name: 'employee_id', type: 'VARCHAR(20)', fk: true, unique: true },
      { name: 'email', type: 'VARCHAR(100)', notNull: true, unique: true },
      { name: 'password_hash', type: 'VARCHAR(255)', notNull: true },
      { name: 'role_code', type: 'role_code_enum', notNull: true },
      { name: 'is_active', type: 'BOOLEAN', notNull: true },
      { name: 'last_login_at', type: 'TIMESTAMPTZ' },
      { name: 'failed_login_attempts', type: 'INTEGER', notNull: true },
      { name: 'locked_until', type: 'TIMESTAMPTZ' },
      { name: 'created_at', type: 'TIMESTAMPTZ', notNull: true },
      { name: 'updated_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },
  {
    name: 'user_roles', group: 'auth', x: 250, y: 310,
    columns: [
      { name: 'user_id', type: 'UUID', pk: true, fk: true },
      { name: 'role_id', type: 'UUID', pk: true, fk: true },
      { name: 'assigned_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },

  // ── CORE HR ──
  {
    name: 'departments', group: 'core', x: 70, y: 500,
    columns: [
      { name: 'id', type: 'VARCHAR(20)', pk: true },
      { name: 'name', type: 'VARCHAR(100)', notNull: true, unique: true },
      { name: 'manager_id', type: 'VARCHAR(20)', fk: true },
      { name: 'budget_yearly', type: 'NUMERIC(15,2)' },
      { name: 'description', type: 'TEXT' },
      { name: 'is_active', type: 'BOOLEAN', notNull: true },
      { name: 'created_at', type: 'TIMESTAMPTZ', notNull: true },
      { name: 'updated_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },
  {
    name: 'employees', group: 'core', x: 500, y: 430,
    columns: [
      { name: 'id', type: 'VARCHAR(20)', pk: true },
      { name: 'full_name', type: 'VARCHAR(100)', notNull: true },
      { name: 'department_id', type: 'VARCHAR(20)', fk: true },
      { name: 'position_id', type: 'VARCHAR(20)', fk: true },
      { name: 'job_title', type: 'VARCHAR(100)', notNull: true },
      { name: 'work_email', type: 'VARCHAR(100)', notNull: true, unique: true },
      { name: 'phone_number', type: 'VARCHAR(20)' },
      { name: 'citizen_id', type: 'VARCHAR(20)' },
      { name: 'base_salary', type: 'NUMERIC(12,2)', notNull: true },
      { name: 'contract_type', type: 'contract_type_enum', notNull: true },
      { name: 'joined_date', type: 'DATE', notNull: true },
      { name: 'manager_id', type: 'VARCHAR(20)', fk: true },
      { name: 'status', type: 'employee_status_enum', notNull: true },
      { name: 'avatar_url', type: 'TEXT' },
      { name: 'face_encoding', type: 'BYTEA' },
      { name: 'bank_account', type: 'VARCHAR(30)' },
      { name: 'bank_name', type: 'VARCHAR(50)' },
      { name: 'kpi_score', type: 'NUMERIC(5,2)' },
      { name: 'attendance_rate', type: 'NUMERIC(5,2)' },
      { name: 'created_at', type: 'TIMESTAMPTZ', notNull: true },
      { name: 'updated_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },
  {
    name: 'positions', group: 'core', x: 1050, y: 500,
    columns: [
      { name: 'id', type: 'VARCHAR(20)', pk: true },
      { name: 'name', type: 'VARCHAR(100)', notNull: true },
      { name: 'level', type: 'INTEGER' },
      { name: 'description', type: 'TEXT' },
      { name: 'is_active', type: 'BOOLEAN', notNull: true },
      { name: 'created_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },

  // ── ATTENDANCE ──
  {
    name: 'attendance_logs', group: 'attendance', x: 70, y: 980,
    columns: [
      { name: 'id', type: 'BIGSERIAL', pk: true },
      { name: 'employee_id', type: 'VARCHAR(20)', notNull: true, fk: true },
      { name: 'work_date', type: 'DATE', notNull: true },
      { name: 'check_in_time', type: 'TIMESTAMPTZ' },
      { name: 'check_out_time', type: 'TIMESTAMPTZ' },
      { name: 'check_in_method', type: 'checkin_method_enum' },
      { name: 'status', type: 'attendance_status_enum', notNull: true },
      { name: 'late_minutes', type: 'INTEGER', notNull: true },
      { name: 'work_hours', type: 'NUMERIC(4,2)' },
      { name: 'ot_hours', type: 'NUMERIC(4,2)' },
      { name: 'gps_lat', type: 'NUMERIC(10,6)' },
      { name: 'gps_lng', type: 'NUMERIC(10,6)' },
      { name: 'face_confidence', type: 'NUMERIC(5,2)' },
      { name: 'note', type: 'TEXT' },
      { name: 'created_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },

  // ── LEAVE ──
  {
    name: 'leave_types', group: 'leave', x: 500, y: 980,
    columns: [
      { name: 'id', type: 'VARCHAR(20)', pk: true },
      { name: 'name', type: 'VARCHAR(50)', notNull: true, unique: true },
      { name: 'code', type: 'leave_type_code_enum', notNull: true },
      { name: 'max_days_per_year', type: 'INTEGER', notNull: true },
      { name: 'is_paid', type: 'BOOLEAN', notNull: true },
      { name: 'description', type: 'TEXT' },
      { name: 'created_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },
  {
    name: 'leave_requests', group: 'leave', x: 870, y: 930,
    columns: [
      { name: 'id', type: 'VARCHAR(30)', pk: true },
      { name: 'employee_id', type: 'VARCHAR(20)', notNull: true, fk: true },
      { name: 'leave_type_id', type: 'VARCHAR(20)', notNull: true, fk: true },
      { name: 'start_date', type: 'DATE', notNull: true },
      { name: 'end_date', type: 'DATE', notNull: true },
      { name: 'total_days', type: 'NUMERIC(3,1)', notNull: true },
      { name: 'reason', type: 'TEXT', notNull: true },
      { name: 'handover_to', type: 'VARCHAR(100)' },
      { name: 'attachment_url', type: 'TEXT' },
      { name: 'stage', type: 'leave_stage_enum', notNull: true },
      { name: 'manager_approved_by', type: 'VARCHAR(20)', fk: true },
      { name: 'manager_note', type: 'TEXT' },
      { name: 'hr_approved_by', type: 'VARCHAR(20)', fk: true },
      { name: 'hr_note', type: 'TEXT' },
      { name: 'submitted_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },
  {
    name: 'leave_balances', group: 'leave', x: 1300, y: 980,
    columns: [
      { name: 'id', type: 'BIGSERIAL', pk: true },
      { name: 'employee_id', type: 'VARCHAR(20)', notNull: true, fk: true },
      { name: 'leave_type_id', type: 'VARCHAR(20)', notNull: true, fk: true },
      { name: 'year', type: 'INTEGER', notNull: true },
      { name: 'total_days', type: 'NUMERIC(4,1)', notNull: true },
      { name: 'used_days', type: 'NUMERIC(4,1)', notNull: true },
      { name: 'remaining_days', type: 'NUMERIC(4,1)' },
    ],
  },

  // ── PAYROLL ──
  {
    name: 'payroll_periods', group: 'payroll', x: 70, y: 1480,
    columns: [
      { name: 'id', type: 'BIGSERIAL', pk: true },
      { name: 'period', type: 'VARCHAR(10)', notNull: true, unique: true },
      { name: 'total_headcount', type: 'INTEGER', notNull: true },
      { name: 'total_net', type: 'NUMERIC(15,2)' },
      { name: 'total_bhxh', type: 'NUMERIC(15,2)' },
      { name: 'total_tax', type: 'NUMERIC(15,2)' },
      { name: 'status', type: 'payroll_status_enum', notNull: true },
      { name: 'locked_by', type: 'VARCHAR(20)', fk: true },
      { name: 'created_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },
  {
    name: 'payslips', group: 'payroll', x: 500, y: 1480,
    columns: [
      { name: 'id', type: 'BIGSERIAL', pk: true },
      { name: 'period_id', type: 'BIGINT', notNull: true, fk: true },
      { name: 'employee_id', type: 'VARCHAR(20)', notNull: true, fk: true },
      { name: 'base_salary', type: 'NUMERIC(12,2)', notNull: true },
      { name: 'actual_work_days', type: 'NUMERIC(4,1)', notNull: true },
      { name: 'ot_pay', type: 'NUMERIC(12,2)' },
      { name: 'gross_income', type: 'NUMERIC(12,2)', notNull: true },
      { name: 'bhxh_amount', type: 'NUMERIC(10,2)' },
      { name: 'bhyt_amount', type: 'NUMERIC(10,2)' },
      { name: 'bhtn_amount', type: 'NUMERIC(10,2)' },
      { name: 'pit_amount', type: 'NUMERIC(12,2)' },
      { name: 'net_salary', type: 'NUMERIC(12,2)', notNull: true },
      { name: 'status', type: 'payroll_status_enum', notNull: true },
      { name: 'paid_date', type: 'DATE' },
    ],
  },

  // ── PROJECTS ──
  {
    name: 'projects', group: 'project', x: 70, y: 1950,
    columns: [
      { name: 'id', type: 'VARCHAR(30)', pk: true },
      { name: 'code', type: 'VARCHAR(20)', notNull: true, unique: true },
      { name: 'name', type: 'VARCHAR(200)', notNull: true },
      { name: 'department_id', type: 'VARCHAR(20)', fk: true },
      { name: 'manager_id', type: 'VARCHAR(20)', fk: true },
      { name: 'start_date', type: 'DATE' },
      { name: 'end_date', type: 'DATE' },
      { name: 'progress', type: 'INTEGER', notNull: true },
      { name: 'status', type: 'project_status_enum', notNull: true },
      { name: 'priority', type: 'task_priority_enum', notNull: true },
      { name: 'budget_hours', type: 'INTEGER' },
      { name: 'used_hours', type: 'INTEGER' },
      { name: 'created_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },
  {
    name: 'tasks', group: 'project', x: 500, y: 1950,
    columns: [
      { name: 'id', type: 'VARCHAR(20)', pk: true },
      { name: 'project_id', type: 'VARCHAR(30)', notNull: true, fk: true },
      { name: 'title', type: 'VARCHAR(300)', notNull: true },
      { name: 'assignee_id', type: 'VARCHAR(20)', fk: true },
      { name: 'creator_id', type: 'VARCHAR(20)', fk: true },
      { name: 'deadline', type: 'DATE' },
      { name: 'priority', type: 'task_priority_enum', notNull: true },
      { name: 'kpi_weight', type: 'INTEGER' },
      { name: 'progress', type: 'INTEGER', notNull: true },
      { name: 'stage', type: 'task_stage_enum', notNull: true },
      { name: 'deliverable_url', type: 'TEXT' },
      { name: 'review_note', type: 'TEXT' },
      { name: 'created_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },
  {
    name: 'task_logs', group: 'project', x: 1000, y: 1950,
    columns: [
      { name: 'id', type: 'BIGSERIAL', pk: true },
      { name: 'task_id', type: 'VARCHAR(20)', notNull: true, fk: true },
      { name: 'actor_id', type: 'VARCHAR(20)', fk: true },
      { name: 'action', type: 'VARCHAR(50)', notNull: true },
      { name: 'from_stage', type: 'task_stage_enum' },
      { name: 'to_stage', type: 'task_stage_enum' },
      { name: 'note', type: 'TEXT' },
      { name: 'created_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },

  // ── SQUADS ──
  {
    name: 'squads', group: 'squad', x: 70, y: 2400,
    columns: [
      { name: 'id', type: 'VARCHAR(20)', pk: true },
      { name: 'name', type: 'VARCHAR(100)', notNull: true },
      { name: 'project_id', type: 'VARCHAR(30)', fk: true },
      { name: 'lead_id', type: 'VARCHAR(20)', fk: true },
      { name: 'target', type: 'TEXT' },
      { name: 'created_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },
  {
    name: 'squad_members', group: 'squad', x: 500, y: 2400,
    columns: [
      { name: 'squad_id', type: 'VARCHAR(20)', pk: true, fk: true },
      { name: 'employee_id', type: 'VARCHAR(20)', pk: true, fk: true },
      { name: 'role_in_squad', type: 'VARCHAR(50)' },
      { name: 'joined_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },
  {
    name: 'squad_messages', group: 'squad', x: 900, y: 2400,
    columns: [
      { name: 'id', type: 'BIGSERIAL', pk: true },
      { name: 'squad_id', type: 'VARCHAR(20)', notNull: true, fk: true },
      { name: 'sender_id', type: 'VARCHAR(20)', notNull: true, fk: true },
      { name: 'content', type: 'TEXT', notNull: true },
      { name: 'sent_at', type: 'TIMESTAMPTZ', notNull: true },
      { name: 'is_system_notice', type: 'BOOLEAN', notNull: true },
    ],
  },

  // ── SYSTEM ──
  {
    name: 'audit_logs', group: 'system', x: 70, y: 2800,
    columns: [
      { name: 'id', type: 'BIGSERIAL', pk: true },
      { name: 'user_id', type: 'UUID', fk: true },
      { name: 'employee_id', type: 'VARCHAR(20)' },
      { name: 'action', type: 'VARCHAR(50)', notNull: true },
      { name: 'table_name', type: 'VARCHAR(50)', notNull: true },
      { name: 'record_id', type: 'VARCHAR(50)' },
      { name: 'old_values', type: 'JSONB' },
      { name: 'new_values', type: 'JSONB' },
      { name: 'ip_address', type: 'VARCHAR(45)' },
      { name: 'created_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },
  {
    name: 'notifications', group: 'system', x: 600, y: 2800,
    columns: [
      { name: 'id', type: 'VARCHAR(30)', pk: true },
      { name: 'user_id', type: 'UUID', fk: true },
      { name: 'role_target', type: 'role_code_enum' },
      { name: 'type', type: 'notification_type_enum', notNull: true },
      { name: 'category', type: 'VARCHAR(100)' },
      { name: 'title', type: 'VARCHAR(300)', notNull: true },
      { name: 'summary', type: 'TEXT' },
      { name: 'sender_name', type: 'VARCHAR(100)' },
      { name: 'priority', type: 'VARCHAR(20)' },
      { name: 'is_read', type: 'BOOLEAN', notNull: true },
      { name: 'action_payload', type: 'JSONB' },
      { name: 'created_at', type: 'TIMESTAMPTZ', notNull: true },
    ],
  },
];

// ── Relationships ──
const relationships = [
  ['roles', 'user_roles', '1', '0..*'],
  ['users', 'user_roles', '1', '0..*'],
  ['employees', 'users', '1', '0..1'],
  ['departments', 'employees', '1', '0..*'],
  ['positions', 'employees', '1', '0..*'],
  ['employees', 'employees', '1', '0..*'],          // manager
  ['employees', 'departments', '1', '0..*'],          // dept manager
  ['employees', 'attendance_logs', '1', '0..*'],
  ['employees', 'leave_requests', '1', '0..*'],
  ['leave_types', 'leave_requests', '1', '0..*'],
  ['employees', 'leave_requests', '1', '0..*'],       // manager approve
  ['employees', 'leave_balances', '1', '0..*'],
  ['leave_types', 'leave_balances', '1', '0..*'],
  ['payroll_periods', 'payslips', '1', '0..*'],
  ['employees', 'payslips', '1', '0..*'],
  ['departments', 'projects', '1', '0..*'],
  ['employees', 'projects', '1', '0..*'],              // project manager
  ['projects', 'tasks', '1', '0..*'],
  ['employees', 'tasks', '1', '0..*'],                 // assignee
  ['tasks', 'task_logs', '1', '0..*'],
  ['projects', 'squads', '1', '0..*'],
  ['employees', 'squads', '1', '0..*'],                // squad lead
  ['squads', 'squad_members', '1', '0..*'],
  ['employees', 'squad_members', '1', '0..*'],
  ['squads', 'squad_messages', '1', '0..*'],
  ['employees', 'squad_messages', '1', '0..*'],
  ['users', 'audit_logs', '1', '0..*'],
  ['users', 'notifications', '1', '0..*'],
];

// ── Build ──
const entityIdMap = {};
const viewIdMap = {};
const allEntities = [];
const allRels = [];
const allViews = [];
const allRelViews = [];

for (const ent of entities) {
  const eid = genId();
  entityIdMap[ent.name] = eid;
  const cols = ent.columns.map(c => ({
    _type: 'ERDColumn', _id: genId(), _parent: { $ref: eid },
    name: c.name, type: c.type || '',
    primaryKey: !!c.pk, foreignKey: !!c.fk,
    nullable: !(c.notNull || c.pk), unique: !!c.unique
  }));
  allEntities.push({
    _type: 'ERDEntity', _id: eid, _parent: { $ref: dataModelId },
    name: ent.name, columns: cols
  });
  const vid = genId();
  viewIdMap[ent.name] = vid;
  allViews.push({
    _type: 'ERDEntityView', _id: vid, _parent: { $ref: diagramId },
    model: { $ref: eid },
    left: ent.x, top: ent.y, width: 300, height: 25 + ent.columns.length * 17,
    fillColor: COLORS[ent.group] || '#FFFFFF',
    lineColor: '#424242', fontColor: '#212121', font: 'Arial;13;0'
  });
}

for (const [src, tgt, sc, tc] of relationships) {
  const rid = genId();
  allRels.push({
    _type: 'ERDRelationship', _id: rid, _parent: { $ref: dataModelId }, name: '',
    end1: { _type: 'ERDRelationshipEnd', _id: genId(), _parent: { $ref: rid }, reference: { $ref: entityIdMap[src] }, cardinality: sc },
    end2: { _type: 'ERDRelationshipEnd', _id: genId(), _parent: { $ref: rid }, reference: { $ref: entityIdMap[tgt] }, cardinality: tc },
    identifying: false
  });
  allRelViews.push({
    _type: 'ERDRelationshipView', _id: genId(), _parent: { $ref: diagramId },
    model: { $ref: rid }, head: { $ref: viewIdMap[src] }, tail: { $ref: viewIdMap[tgt] },
    lineColor: '#616161', font: 'Arial;11;0'
  });
}

const mdj = {
  _type: 'Project', _id: projectId, name: 'NEXUS_HR_Database',
  ownedElements: [{
    _type: 'ERDDataModel', _id: dataModelId, _parent: { $ref: projectId }, name: 'HR_Database_20_Tables',
    ownedElements: [...allEntities, ...allRels, {
      _type: 'ERDDiagram', _id: diagramId, _parent: { $ref: dataModelId },
      name: 'NEXUS_HR_ERD', defaultDiagram: true,
      ownedViews: [...allViews, ...allRelViews]
    }]
  }]
};

const out = path.join(__dirname, '..', 'docs', 'ERD_HR_System.mdj');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(mdj, null, 2), 'utf-8');

console.log('Done! ' + out);
console.log('Entities: ' + allEntities.length);
console.log('Relationships: ' + allRels.length);
console.log('Total columns: ' + allEntities.reduce((s, e) => s + e.columns.length, 0));
