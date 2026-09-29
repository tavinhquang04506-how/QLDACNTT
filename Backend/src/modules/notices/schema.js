const { z } = require('zod');

const CATEGORIES = ['general', 'policy', 'event', 'urgent', 'benefit'];
const ROLES = ['CEO', 'HR_DIRECTOR', 'LINE_MANAGER', 'EMPLOYEE', 'KIOSK', 'ADMIN'];
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

const dateTime = z
  .string()
  .refine((s) => /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(s) && !Number.isNaN(Date.parse(s)), {
    message: 'Thời điểm không hợp lệ (ISO 8601)',
  });

const idParam = z.object({ id: z.string().trim().min(1).max(30) });

const attachmentDownloadParam = z.object({
  id: z.string().trim().min(1).max(30),
  attachmentId: z.string().trim().min(1).max(80),
});

const attachmentIdParam = z.object({
  attachmentId: z.string().trim().min(1).max(80),
});

const uploadAttachmentBody = z.object({
  name: z
    .string({ required_error: 'Vui lòng cung cấp tên tệp đính kèm' })
    .trim()
    .min(1, 'Tên tệp không được để trống')
    .max(255, 'Tên tệp quá dài'),
  type: z.string().trim().max(150).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  contentBase64: z
    .string({ required_error: 'Dữ liệu tệp tải lên (contentBase64) là bắt buộc' })
    .min(1, 'Tệp tải lên không được rỗng'),
});

const attachmentRefSchema = z.object({
  id: z
    .string({ required_error: 'Thiếu mã tệp đính kèm (id)' })
    .trim()
    .regex(
      /^NATT-[A-Za-z0-9-]+$/,
      'Tệp đính kèm phải được tải lên máy chủ hợp lệ (không chấp nhận blob: hoặc tệp mẫu giả lập)'
    ),
  name: z.string().trim().min(1).max(255).optional(),
  size: z.string().trim().max(50).optional(),
  sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES).optional(),
  type: z.string().trim().max(150).optional(),
  sha256: z.string().trim().max(128).optional(),
  url: z
    .string()
    .trim()
    .refine(
      (u) => !/^blob:/i.test(u) && !/example\.com/i.test(u),
      'Không chấp nhận đường dẫn tạm thời (blob:) hoặc liên kết mẫu giả lập (example.com)'
    )
    .nullish(),
  available: z.boolean().optional(),
  legacyUnavailable: z.boolean().optional(),
});

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
    publishedAt: dateTime.nullish(),
    expiresAt: dateTime.nullish(),
    attachments: z.array(attachmentRefSchema).max(10, 'Tối đa 10 tệp đính kèm mỗi thông báo').nullish(),
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
    publishedAt: dateTime.nullish(),
    expiresAt: dateTime.nullish(),
    attachments: z.array(attachmentRefSchema).max(10, 'Tối đa 10 tệp đính kèm mỗi thông báo').nullish(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Không có thay đổi nào' })
  .refine(windowOk, windowIssue);

module.exports = {
  MAX_ATTACHMENT_BYTES,
  idParam,
  attachmentDownloadParam,
  attachmentIdParam,
  uploadAttachmentBody,
  attachmentRefSchema,
  listQuery,
  createBody,
  updateBody,
};
