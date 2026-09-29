const { z } = require('zod');

const CATEGORIES = ['general', 'policy', 'event', 'urgent', 'benefit'];
const ROLES = ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER', 'EMPLOYEE', 'KIOSK', 'ADMIN'];
const dateTime = z.string().datetime({ offset: true, message: 'Thời điểm không hợp lệ (ISO 8601)' });

const idParam = z.object({ id: z.string().trim().min(1).max(30) });

const listQuery = z.object({
  category: z.enum(CATEGORIES).optional(),
  all: z.enum(['true', 'false']).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

const fields = {
  title: z.string({ required_error: 'Vui lòng nhập tiêu đề' }).trim().min(1, 'Vui lòng nhập tiêu đề').max(300),
  content: z.string({ required_error: 'Vui lòng nhập nội dung' }).trim().min(1, 'Vui lòng nhập nội dung').max(20000),
};

const windowOk = (v) => !v.expiresAt || new Date(v.expiresAt) > new Date(v.publishedAt ?? Date.now());
const windowIssue = { message: 'Thời điểm hết hạn phải sau thời điểm đăng', path: ['expiresAt'] };

const createBody = z
  .object({
    title: fields.title,
    content: fields.content,
    category: z.enum(CATEGORIES).default('general'),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
    targetRole: z.enum(ROLES).nullish(),
    targetDepartmentId: z.string().trim().min(1).max(20).nullish(),
    isPinned: z.boolean().default(false),
    publishedAt: z.string().nullish(),
    expiresAt: z.string().nullish(),
    attachments: z.array(z.any()).nullish(),
  })
  .refine(windowOk, windowIssue);

const updateBody = z
  .object({
    title: fields.title.optional(),
    content: fields.content.optional(),
    category: z.enum(CATEGORIES).optional(),
    priority: z.enum(['low', 'normal', 'high']).optional(),
    targetRole: z.enum(ROLES).nullable().optional(),
    targetDepartmentId: z.string().trim().min(1).max(20).nullable().optional(),
    isPinned: z.boolean().optional(),
    isActive: z.boolean().optional(),
    publishedAt: z.string().nullish(),
    expiresAt: z.string().nullish(),
    attachments: z.array(z.any()).nullish(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Không có thay đổi nào' })
  .refine(windowOk, windowIssue);

module.exports = { idParam, listQuery, createBody, updateBody };
