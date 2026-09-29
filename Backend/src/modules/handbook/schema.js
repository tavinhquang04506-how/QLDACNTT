const { z } = require('zod');

const idParam = z.object({ id: z.string().trim().min(1).max(30) });

const listQuery = z.object({
  category: z.string().trim().max(100).optional(),
  search: z.string().trim().max(200).optional(),
  all: z.enum(['true', 'false']).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

const fields = {
  title: z.string({ required_error: 'Vui lòng nhập tiêu đề' }).trim().min(1, 'Vui lòng nhập tiêu đề').max(300),
  category: z.string().trim().min(1).max(100),
  content: z.string({ required_error: 'Vui lòng nhập nội dung' }).trim().min(1, 'Vui lòng nhập nội dung').max(200000),
};

const createBody = z.object({ title: fields.title, category: fields.category.default('Chung'), content: fields.content });

const updateBody = z
  .object({ title: fields.title.optional(), category: fields.category.optional(), content: fields.content.optional(), isActive: z.boolean().optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Không có thay đổi nào' });

module.exports = { idParam, listQuery, createBody, updateBody };
