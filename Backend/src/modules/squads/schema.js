const { z } = require('zod');

const idParam = z.object({ id: z.string().trim().min(1).max(20) });
const memberParam = z.object({ id: z.string().trim().min(1).max(20), employeeId: z.string().trim().min(1).max(20) });

const createBody = z.object({
  name: z.string({ required_error: 'Vui lòng nhập tên nhóm' }).trim().min(1, 'Vui lòng nhập tên nhóm').max(100),
  projectId: z.string().trim().min(1).max(30).nullish(),
  leadId: z.string().trim().min(1).max(20).nullish(),
  target: z.string().trim().max(1000).nullish(),
});

const updateBody = z
  .object({
    name: createBody.shape.name.optional(),
    projectId: z.string().trim().min(1).max(30).nullable().optional(),
    leadId: z.string().trim().min(1).max(20).optional(),
    target: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Không có thay đổi nào' });

const memberBody = z.object({
  employeeId: z.string({ required_error: 'Vui lòng chọn nhân viên' }).trim().min(1, 'Vui lòng chọn nhân viên').max(20),
  role: z.string().trim().min(1).max(50).optional(),
});

const messageBody = z.object({
  content: z.string({ required_error: 'Vui lòng nhập nội dung' }).trim().min(1, 'Vui lòng nhập nội dung').max(2000, 'Tin nhắn tối đa 2000 ký tự'),
});

const messagesQuery = z.object({
  since: z.string().regex(/^\d{1,18}$/, 'since phải là mã tin nhắn').optional(),
  limit: z.string().optional(),
});

module.exports = { idParam, memberParam, createBody, updateBody, memberBody, messageBody, messagesQuery };
