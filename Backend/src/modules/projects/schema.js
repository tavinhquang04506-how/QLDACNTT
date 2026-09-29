const { z } = require('zod');
const { isoDate } = require('../employees/schema');

const PRIORITIES = ['Thấp', 'Trung bình', 'Cao', 'Khẩn cấp'];
const STATUSES = ['planned', 'in_progress', 'completed', 'paused', 'at_risk'];

const pick = (o, camel, snake) => (o[camel] !== undefined ? o[camel] : o[snake]);

// Accept the legacy snake_case body as well as camelCase.
const normalize = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const out = { ...v };
  const map = { departmentId: 'department_id', managerId: 'manager_id', startDate: 'start_date', endDate: 'end_date', budgetHours: 'budget_hours' };
  for (const [camel, snake] of Object.entries(map)) out[camel] = pick(v, camel, snake);
  return out;
};

const fields = {
  name: z.string({ required_error: 'Tên dự án là bắt buộc' }).trim().min(1, 'Tên dự án là bắt buộc').max(200),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, 'Mã dự án gồm 3-20 ký tự chữ, số hoặc dấu -'),
  departmentId: z.string().trim().min(1).max(20),
  managerId: z.string().trim().min(1).max(20),
  startDate: isoDate,
  endDate: isoDate,
  priority: z.enum(PRIORITIES),
  description: z.string().trim().max(5000),
  budgetHours: z.number({ invalid_type_error: 'Số giờ phải là số' }).int('Số giờ phải là số nguyên').min(0).max(1_000_000),
};

const datesOk = (v) => !v.startDate || !v.endDate || v.endDate >= v.startDate;
const datesIssue = { message: 'Ngày kết thúc không được trước ngày bắt đầu', path: ['endDate'] };

const createBody = z.preprocess(
  normalize,
  z
    .object({
      name: fields.name,
      code: fields.code.optional(),
      departmentId: fields.departmentId.nullish(),
      managerId: fields.managerId.nullish(),
      startDate: fields.startDate.nullish(),
      endDate: fields.endDate.nullish(),
      priority: fields.priority.optional(),
      description: fields.description.nullish(),
      budgetHours: fields.budgetHours.optional(),
    })
    .refine(datesOk, datesIssue)
);

const updateBody = z.preprocess(
  normalize,
  z
    .object({
      name: fields.name.optional(),
      departmentId: fields.departmentId.nullable().optional(),
      managerId: fields.managerId.nullable().optional(),
      startDate: fields.startDate.nullable().optional(),
      endDate: fields.endDate.nullable().optional(),
      priority: fields.priority.optional(),
      status: z.enum(STATUSES).optional(),
      description: fields.description.nullable().optional(),
      budgetHours: fields.budgetHours.optional(),
    })
    .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Không có thay đổi nào' })
    .refine(datesOk, datesIssue)
);

const idParam = z.object({ id: z.string().trim().min(1).max(30) });

module.exports = { createBody, updateBody, idParam, PRIORITIES, STATUSES };
