const { z } = require('zod');
const { passwordRule } = require('../auth/schema');

const ROLES = ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER', 'EMPLOYEE', 'KIOSK', 'ADMIN'];

const idParam = z.object({ id: z.string().uuid('Mã tài khoản không hợp lệ') });

const listQuery = z.object({
  search: z.string().trim().optional(),
  role: z.enum(ROLES).optional(),
  active: z.enum(['true', 'false']).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

const createBody = z
  .object({
    employeeId: z.string().trim().min(1).optional(),
    email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
    role: z.enum(ROLES),
    password: passwordRule.optional(),
  })
  .refine((v) => v.employeeId || ['KIOSK', 'ADMIN'].includes(v.role), {
    message: 'Vui lòng chọn nhân viên cho tài khoản này',
    path: ['employeeId'],
  });

const updateBody = z
  .object({ role: z.enum(ROLES).optional(), isActive: z.boolean().optional() })
  .refine((v) => v.role !== undefined || v.isActive !== undefined, { message: 'Không có thay đổi nào' });

module.exports = { idParam, listQuery, createBody, updateBody, ROLES };
