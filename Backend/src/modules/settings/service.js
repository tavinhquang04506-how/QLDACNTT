const db = require('../../config/db');
const { AppError, badRequest, forbidden } = require('../../utils/AppError');
const { writeAudit } = require('../../utils/audit');
const { matrix: DEFAULT_RBAC_MATRIX } = require('../../policies/matrix');

const VALID_RBAC_ROLES = ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER', 'EMPLOYEE', 'ADMIN', 'KIOSK'];
const VALID_RBAC_SCOPES = ['all', 'department', 'self'];
const CEO_LOCKED_PERMISSIONS = new Set(['settings.read', 'settings.manage', 'user.read', 'user.update', 'audit.read']);

const DEFAULT_SETTINGS = {
  late_grace_minutes: 15,
  standard_shift_morning: '08:00 - 12:00',
  standard_shift_afternoon: '13:30 - 17:30',
  max_ot_per_month: 40,
  auto_approve_ot: false,
  personal_income_tax_deduction: 11000000,
  dependent_deduction: 4400000,
  employee_bhxh_rate: 10.5,
  employer_bhxh_rate: 21.5,
  standard_work_days: 22,
  ot_multiplier: 1.5,
  default_allowances: 1500000,
  policy_effective_from: '2020-01',
  gps_radius_meters: 250,
  office_lat: 10.77,
  office_lng: 106.7,
  office_name: 'Tòa nhà NEXUS Tower',
  face_confidence_threshold: 98,
};

const KEY_META = {
  late_grace_minutes: { category: 'attendance', type: 'number', min: 0, max: 180 },
  standard_shift_morning: { category: 'attendance', type: 'string' },
  standard_shift_afternoon: { category: 'attendance', type: 'string' },
  max_ot_per_month: { category: 'attendance', type: 'number', min: 1, max: 300 },
  auto_approve_ot: { category: 'attendance', type: 'boolean' },
  personal_income_tax_deduction: { category: 'tax_bhxh', type: 'number', min: 0, max: 100000000 },
  dependent_deduction: { category: 'tax_bhxh', type: 'number', min: 0, max: 100000000 },
  employee_bhxh_rate: { category: 'tax_bhxh', type: 'number', min: 0, max: 100 },
  employer_bhxh_rate: { category: 'tax_bhxh', type: 'number', min: 0, max: 100 },
  standard_work_days: { category: 'payroll', type: 'number', min: 1, max: 31 },
  ot_multiplier: { category: 'payroll', type: 'number', min: 1, max: 5 },
  default_allowances: { category: 'payroll', type: 'number', min: 0, max: 100000000 },
  policy_effective_from: { category: 'tax_bhxh', type: 'period' },
  gps_radius_meters: { category: 'biometrics', type: 'number', min: 10, max: 10000 },
  office_lat: { category: 'biometrics', type: 'number', min: -90, max: 90 },
  office_lng: { category: 'biometrics', type: 'number', min: -180, max: 180 },
  office_name: { category: 'biometrics', type: 'string' },
  face_confidence_threshold: { category: 'biometrics', type: 'number', min: 50, max: 100 },
};

const CAMEL_TO_SNAKE = {
  lateGraceMinutes: 'late_grace_minutes',
  standardShiftMorning: 'standard_shift_morning',
  standardShiftAfternoon: 'standard_shift_afternoon',
  maxOtPerMonth: 'max_ot_per_month',
  autoApproveOT: 'auto_approve_ot',
  autoApproveOt: 'auto_approve_ot',
  personalIncomeTaxDeduction: 'personal_income_tax_deduction',
  dependentDeduction: 'dependent_deduction',
  employeeBhxhRate: 'employee_bhxh_rate',
  employerBhxhRate: 'employer_bhxh_rate',
  standardWorkDays: 'standard_work_days',
  otMultiplier: 'ot_multiplier',
  defaultAllowances: 'default_allowances',
  policyEffectiveFrom: 'policy_effective_from',
  gpsRadiusMeters: 'gps_radius_meters',
  gps_radius: 'gps_radius_meters',
  officeLat: 'office_lat',
  officeLng: 'office_lng',
  officeName: 'office_name',
  faceConfidenceThreshold: 'face_confidence_threshold',
};

function toCamelMap(snakeObj) {
  return {
    ...snakeObj,
    lateGraceMinutes: snakeObj.late_grace_minutes,
    standardShiftMorning: snakeObj.standard_shift_morning,
    standardShiftAfternoon: snakeObj.standard_shift_afternoon,
    maxOtPerMonth: snakeObj.max_ot_per_month,
    autoApproveOT: Boolean(snakeObj.auto_approve_ot),
    personalIncomeTaxDeduction: snakeObj.personal_income_tax_deduction,
    dependentDeduction: snakeObj.dependent_deduction,
    employeeBhxhRate: snakeObj.employee_bhxh_rate,
    employerBhxhRate: snakeObj.employer_bhxh_rate,
    standardWorkDays: snakeObj.standard_work_days,
    otMultiplier: snakeObj.ot_multiplier,
    defaultAllowances: snakeObj.default_allowances,
    policyEffectiveFrom: snakeObj.policy_effective_from,
    gpsRadiusMeters: snakeObj.gps_radius_meters,
    officeLat: snakeObj.office_lat,
    officeLng: snakeObj.office_lng,
    officeName: snakeObj.office_name,
    faceConfidenceThreshold: snakeObj.face_confidence_threshold,
  };
}

function extractSnakePolicy(obj = {}) {
  const out = {};
  for (const key of Object.keys(KEY_META)) {
    if (obj[key] !== undefined) {
      out[key] = obj[key];
    }
  }
  return out;
}

async function getSettings(executor = db, { forUpdate = false } = {}) {
  const { rows } = await executor.query(
    `SELECT key, value, category, description, updated_by, updated_at FROM system_settings WHERE key != 'rbac_role_matrix' ORDER BY key${forUpdate ? ' FOR UPDATE' : ''}`
  );
  if (!rows || rows.length === 0) {
    throw new AppError(500, 'SETTINGS_NOT_INITIALIZED', 'Bảng cấu hình hệ thống system_settings chưa được khởi tạo');
  }
  const merged = {};
  let updatedAt = null;
  let updatedBy = null;
  for (const r of rows) {
    merged[r.key] = r.value;
    if (!updatedAt || (r.updated_at && new Date(r.updated_at) > new Date(updatedAt))) {
      updatedAt = r.updated_at;
      updatedBy = r.updated_by || updatedBy;
    }
  }
  return {
    ...toCamelMap(merged),
    updated_at: updatedAt,
    updated_by: updatedBy,
  };
}

/**
 * R09: Resolve the exact policy version effective for `period` ('YYYY-MM') from `system_policy_versions`.
 * Never substitutes hardcoded DEFAULT_SETTINGS or guesses missing historical policy when `period` predates all stored versions.
 */
async function getSettingsForPeriod(executor = db, period = null) {
  if (!period) {
    return getSettings(executor);
  }
  const normalizedPeriod = String(period).trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(normalizedPeriod)) {
    throw badRequest(`Kỳ truy xuất chính sách không hợp lệ: ${period}`);
  }

  const { rows } = await executor.query(
    `SELECT id, effective_from, policy, created_by, updated_at
       FROM system_policy_versions
      WHERE effective_from <= $1
      ORDER BY effective_from DESC, id DESC
      LIMIT 1`,
    [normalizedPeriod]
  );

  if (rows.length === 0) {
    const earliest = await executor.query(
      'SELECT MIN(effective_from) AS min_period FROM system_policy_versions'
    );
    const minPeriod = earliest.rows[0]?.min_period || 'chưa có';
    throw new AppError(
      422,
      'POLICY_VERSION_NOT_FOUND',
      `Chưa có dữ liệu phiên bản chính sách lương/thuế cho kỳ ${normalizedPeriod} (phiên bản lịch sử sớm nhất trong hệ thống có hiệu lực từ kỳ ${minPeriod})`
    );
  }

  const row = rows[0];
  const policyObj = {
    ...(row.policy || {}),
    policy_effective_from: row.effective_from,
  };

  return {
    ...toCamelMap(policyObj),
    policy_version_id: row.id,
    updated_at: row.updated_at,
    updated_by: row.created_by || null,
  };
}

async function listPolicyVersions(executor = db) {
  const { rows } = await executor.query(
    `SELECT id, effective_from, policy, created_by, created_at, updated_at
       FROM system_policy_versions
      ORDER BY effective_from DESC, id DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    effective_from: r.effective_from,
    policy: toCamelMap({ ...(r.policy || {}), policy_effective_from: r.effective_from }),
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

function normalizeAndValidatePatch(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Dữ liệu cấu hình không hợp lệ');
  }
  const updates = {};
  for (const [rawKey, rawVal] of Object.entries(body)) {
    if (rawVal === undefined || rawKey === 'expectedUpdatedAt' || rawKey === 'expected_updated_at') continue;
    const snakeKey = CAMEL_TO_SNAKE[rawKey] || rawKey;
    const meta = KEY_META[snakeKey];
    if (!meta) continue;

    if (meta.type === 'number') {
      const n = Number(rawVal);
      if (!Number.isFinite(n)) {
        throw badRequest(`Giá trị ${rawKey} phải là số hợp lệ`);
      }
      if (meta.min !== undefined && n < meta.min) {
        throw badRequest(`Giá trị ${rawKey} không được nhỏ hơn ${meta.min}`);
      }
      if (meta.max !== undefined && n > meta.max) {
        throw badRequest(`Giá trị ${rawKey} không được lớn hơn ${meta.max}`);
      }
      updates[snakeKey] = n;
    } else if (meta.type === 'boolean') {
      if (typeof rawVal !== 'boolean') {
        throw badRequest(`Giá trị ${rawKey} phải là kiểu boolean`);
      }
      updates[snakeKey] = rawVal;
    } else if (meta.type === 'period') {
      const s = String(rawVal).trim();
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) {
        throw badRequest(`Giá trị ${rawKey} phải có định dạng YYYY-MM`);
      }
      updates[snakeKey] = s;
    } else if (meta.type === 'string') {
      const s = String(rawVal).trim();
      if (!s || s.length > 200) {
        throw badRequest(`Giá trị ${rawKey} không hợp lệ`);
      }
      updates[snakeKey] = s;
    }
  }

  if (Object.keys(updates).length === 0) {
    throw badRequest('Không có tham số cấu hình hợp lệ nào để cập nhật');
  }
  return updates;
}

async function updateSettings(actor, body, req = null) {
  const updates = normalizeAndValidatePatch(body);
  const expectedUpdatedAt = body?.expectedUpdatedAt ?? body?.expected_updated_at ?? null;
  const actorEmpId = actor?.employeeId || actor?.employee_id || null;

  return db.withTransaction(async (client) => {
    // Serialize against any concurrent draft payroll lock in lock order (payroll_periods -> system_settings)
    await client.query("SELECT id FROM payroll_periods WHERE status = 'DU_THAO' ORDER BY id FOR UPDATE");
    const before = await getSettings(client, { forUpdate: true });

    if (expectedUpdatedAt && before.updated_at) {
      const dbTime = new Date(before.updated_at).getTime();
      const clientTime = new Date(expectedUpdatedAt).getTime();
      if (!Number.isFinite(clientTime) || Math.abs(dbTime - clientTime) > 5) {
        throw new AppError(
          409,
          'SETTINGS_STALE',
          'Cấu hình hệ thống đã được cập nhật bởi phiên làm việc khác. Vui lòng tải lại dữ liệu mới nhất trước khi lưu.'
        );
      }
    }

    const beforeEffectiveFrom = String(before.policy_effective_from || '2020-01');
    const beforePolicy = extractSnakePolicy(before);

    // Ensure the prior active policy version is preserved in system_policy_versions before applying new updates
    await client.query(
      `INSERT INTO system_policy_versions (effective_from, policy, created_by)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (effective_from) DO NOTHING`,
      [beforeEffectiveFrom, JSON.stringify(beforePolicy), before.updated_by || null]
    );

    const oldValues = {};
    for (const key of Object.keys(updates)) {
      oldValues[key] = before[key];
      const meta = KEY_META[key];
      await client.query(
        `INSERT INTO system_settings (key, value, category, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, $4, NOW())
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value,
               updated_by = EXCLUDED.updated_by,
               updated_at = NOW()`,
        [key, JSON.stringify(updates[key]), meta.category, actorEmpId]
      );
    }

    const after = await getSettings(client);
    const targetEffectiveFrom = String(after.policy_effective_from || beforeEffectiveFrom);
    const nextPolicy = {
      ...extractSnakePolicy(after),
      policy_effective_from: targetEffectiveFrom,
    };

    await client.query(
      `INSERT INTO system_policy_versions (effective_from, policy, created_by, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (effective_from) DO UPDATE
         SET policy = EXCLUDED.policy,
             created_by = EXCLUDED.created_by,
             updated_at = NOW()`,
      [targetEffectiveFrom, JSON.stringify(nextPolicy), actorEmpId]
    );

    await writeAudit(client, {
      user: actor,
      action: 'UPDATE_SYSTEM_SETTINGS',
      table: 'system_settings',
      recordId: targetEffectiveFrom,
      oldValues,
      newValues: { ...updates, policy_effective_from: targetEffectiveFrom },
      req,
    });

    return after;
  });
}

function cloneDefaultRbacMatrix() {
  const copy = {};
  for (const [permKey, roleMap] of Object.entries(DEFAULT_RBAC_MATRIX)) {
    copy[permKey] = { ...roleMap };
  }
  return copy;
}

async function getRbacRoleMatrix(executor = db) {
  const baseMatrix = cloneDefaultRbacMatrix();
  const [settingRes, countsRes] = await Promise.all([
    executor.query(
      `SELECT value, updated_by, updated_at FROM system_settings WHERE key = 'rbac_role_matrix'`
    ),
    executor.query(
      `SELECT role_code, COUNT(*)::int AS count FROM users GROUP BY role_code`
    ),
  ]);

  let updatedAt = null;
  let updatedBy = null;
  if (settingRes.rows.length > 0) {
    const row = settingRes.rows[0];
    updatedAt = row.updated_at;
    updatedBy = row.updated_by;
    const saved = row.value && typeof row.value === 'object' ? row.value : {};
    for (const [permKey, roleScopes] of Object.entries(saved)) {
      if (!baseMatrix[permKey] || !roleScopes || typeof roleScopes !== 'object') continue;
      const nextMap = { ...baseMatrix[permKey] };
      for (const roleCode of VALID_RBAC_ROLES) {
        if (roleCode in roleScopes) {
          const val = roleScopes[roleCode];
          if (val === null || val === 'none' || val === '') {
            delete nextMap[roleCode];
          } else if (VALID_RBAC_SCOPES.includes(val)) {
            nextMap[roleCode] = val;
          }
        }
      }
      baseMatrix[permKey] = nextMap;
    }
  }

  // Ensure CEO locked permissions are always 'all'
  for (const lockedKey of CEO_LOCKED_PERMISSIONS) {
    if (baseMatrix[lockedKey]) {
      baseMatrix[lockedKey].CEO = 'all';
    }
  }

  const roleCounts = VALID_RBAC_ROLES.reduce((acc, r) => {
    acc[r] = 0;
    return acc;
  }, {});
  for (const r of countsRes.rows) {
    if (r.role_code) roleCounts[r.role_code] = Number(r.count) || 0;
  }

  return {
    matrix: baseMatrix,
    defaultMatrix: cloneDefaultRbacMatrix(),
    roleCounts,
    updatedAt,
    updatedBy,
  };
}

async function updateRbacRoleMatrix(actor, body = {}, req = null) {
  const actorRole = actor?.roleCode || actor?.role || 'EMPLOYEE';
  const actorEmpId = actor?.employeeId || actor?.employee_id || null;
  const targetRole = body?.roleCode ? String(body.roleCode).trim().toUpperCase() : null;

  if (targetRole && !VALID_RBAC_ROLES.includes(targetRole)) {
    throw badRequest(`Vai trò không hợp lệ: ${targetRole}`);
  }
  if (actorRole === 'HR_DIRECTOR' && targetRole && ['CEO', 'ADMIN'].includes(targetRole)) {
    throw forbidden('Giám đốc Nhân sự không được phép chỉnh sửa cấu hình quyền hạn của vai trò CEO hoặc ADMIN');
  }

  return db.withTransaction(async (client) => {
    const current = await getRbacRoleMatrix(client);
    const nextMatrix = cloneDefaultRbacMatrix();
    for (const [permKey, scopes] of Object.entries(current.matrix)) {
      nextMatrix[permKey] = { ...scopes };
    }

    if (targetRole && body?.permissions && typeof body.permissions === 'object') {
      for (const [permKey, rawScope] of Object.entries(body.permissions)) {
        if (!nextMatrix[permKey]) continue;
        if (targetRole === 'CEO' && CEO_LOCKED_PERMISSIONS.has(permKey)) {
          nextMatrix[permKey].CEO = 'all';
          continue;
        }
        const normalizedScope = rawScope ? String(rawScope).toLowerCase() : null;
        if (!normalizedScope || normalizedScope === 'none') {
          delete nextMatrix[permKey][targetRole];
        } else if (VALID_RBAC_SCOPES.includes(normalizedScope)) {
          nextMatrix[permKey][targetRole] = normalizedScope;
        } else {
          throw badRequest(`Phạm vi quyền "${rawScope}" của "${permKey}" không hợp lệ`);
        }
      }
    } else if (body?.matrix && typeof body.matrix === 'object') {
      for (const [permKey, roleScopes] of Object.entries(body.matrix)) {
        if (!nextMatrix[permKey] || !roleScopes || typeof roleScopes !== 'object') continue;
        for (const rCode of VALID_RBAC_ROLES) {
          if (actorRole === 'HR_DIRECTOR' && ['CEO', 'ADMIN'].includes(rCode)) continue;
          if (rCode === 'CEO' && CEO_LOCKED_PERMISSIONS.has(permKey)) {
            nextMatrix[permKey].CEO = 'all';
            continue;
          }
          if (rCode in roleScopes) {
            const s = roleScopes[rCode] ? String(roleScopes[rCode]).toLowerCase() : null;
            if (!s || s === 'none') {
              delete nextMatrix[permKey][rCode];
            } else if (VALID_RBAC_SCOPES.includes(s)) {
              nextMatrix[permKey][rCode] = s;
            }
          }
        }
      }
    } else {
      throw badRequest('Dữ liệu cập nhật phân quyền vai trò không hợp lệ');
    }

    // Serialize explicit nulls for removed default permissions so getRbacRoleMatrix knows they were turned off
    const serialized = {};
    for (const permKey of Object.keys(DEFAULT_RBAC_MATRIX)) {
      serialized[permKey] = {};
      for (const rCode of VALID_RBAC_ROLES) {
        serialized[permKey][rCode] = nextMatrix[permKey]?.[rCode] || null;
      }
    }

    await client.query(
      `INSERT INTO system_settings (key, value, category, description, updated_by, updated_at)
       VALUES ('rbac_role_matrix', $1::jsonb, 'rbac', 'Ma trận phân quyền RBAC theo vai trò', $2, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
      [JSON.stringify(serialized), actorEmpId]
    );

    await writeAudit(client, {
      user: actor,
      action: 'UPDATE_RBAC_ROLE_MATRIX',
      table: 'roles',
      recordId: targetRole || 'ALL_ROLES',
      oldValues: targetRole
        ? Object.fromEntries(Object.keys(DEFAULT_RBAC_MATRIX).map((k) => [k, current.matrix[k]?.[targetRole] || null]))
        : undefined,
      newValues: targetRole
        ? Object.fromEntries(Object.keys(DEFAULT_RBAC_MATRIX).map((k) => [k, nextMatrix[k]?.[targetRole] || null]))
        : { updatedRole: 'ALL_ROLES' },
      req,
    });

    return getRbacRoleMatrix(client);
  });
}

async function resetRbacRoleMatrix(actor, body = {}, req = null) {
  const actorRole = actor?.roleCode || actor?.role || 'EMPLOYEE';
  const actorEmpId = actor?.employeeId || actor?.employee_id || null;
  const targetRole = body?.roleCode ? String(body.roleCode).trim().toUpperCase() : null;

  if (targetRole && !VALID_RBAC_ROLES.includes(targetRole)) {
    throw badRequest(`Vai trò không hợp lệ: ${targetRole}`);
  }
  if (actorRole === 'HR_DIRECTOR' && targetRole && ['CEO', 'ADMIN'].includes(targetRole)) {
    throw forbidden('Giám đốc Nhân sự không được phép đặt lại quyền của vai trò CEO hoặc ADMIN');
  }

  return db.withTransaction(async (client) => {
    if (!targetRole) {
      await client.query(`DELETE FROM system_settings WHERE key = 'rbac_role_matrix'`);
    } else {
      const current = await getRbacRoleMatrix(client);
      const defaults = cloneDefaultRbacMatrix();
      const serialized = {};
      for (const permKey of Object.keys(DEFAULT_RBAC_MATRIX)) {
        serialized[permKey] = {};
        for (const rCode of VALID_RBAC_ROLES) {
          if (rCode === targetRole) {
            serialized[permKey][rCode] = defaults[permKey]?.[rCode] || null;
          } else {
            serialized[permKey][rCode] = current.matrix[permKey]?.[rCode] || null;
          }
        }
      }
      await client.query(
        `INSERT INTO system_settings (key, value, category, description, updated_by, updated_at)
         VALUES ('rbac_role_matrix', $1::jsonb, 'rbac', 'Ma trận phân quyền RBAC theo vai trò', $2, NOW())
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value,
               updated_by = EXCLUDED.updated_by,
               updated_at = NOW()`,
        [JSON.stringify(serialized), actorEmpId]
      );
    }

    await writeAudit(client, {
      user: actor,
      action: 'RESET_RBAC_ROLE_MATRIX',
      table: 'roles',
      recordId: targetRole || 'ALL_ROLES',
      newValues: { resetToDefault: targetRole || 'ALL_ROLES' },
      req,
    });

    return getRbacRoleMatrix(client);
  });
}

module.exports = {
  DEFAULT_SETTINGS,
  getSettings,
  getSettingsForPeriod,
  listPolicyVersions,
  updateSettings,
  getRbacRoleMatrix,
  updateRbacRoleMatrix,
  resetRbacRoleMatrix,
};
