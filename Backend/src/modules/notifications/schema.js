const { z } = require('zod');

const TYPES = ['approval', 'payroll', 'attendance', 'company_award', 'health_check', 'ceo_directive', 'late_attendance', 'ot_request', 'c65_claim', 'payroll_anomaly', 'ai_turnover', 'system'];
const ROLES = ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER', 'EMPLOYEE', 'KIOSK', 'ADMIN'];

const idParam = z.object({ id: z.string().trim().min(1).max(30) });

const listQuery = z.object({
  unread: z.enum(['true', 'false']).optional(),
  type: z.enum(TYPES).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

const createBody = z
  .object({
    userId: z.string().uuid().optional(),
    roleTarget: z.enum(ROLES).optional(),
    type: z.enum(TYPES).default('system'),
    category: z.string().trim().max(100).optional(),
    title: z.string({ required_error: 'Vui lòng nhập tiêu đề' }).trim().min(1, 'Vui lòng nhập tiêu đề').max(300),
    summary: z.string().trim().max(2000).optional(),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
    actionType: z.string().trim().max(50).optional(),
    actionPayload: z.record(z.any()).optional(),
  })
  .refine((v) => Boolean(v.userId) !== Boolean(v.roleTarget), { message: 'Chọn đúng một trong hai: userId hoặc roleTarget', path: ['userId'] });

module.exports = { idParam, listQuery, createBody, TYPES };
