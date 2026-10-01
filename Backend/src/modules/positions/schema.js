const { z } = require('zod');

const idParam = z.object({ id: z.string().trim().min(1).max(20) });

const listQuery = z.object({ includeInactive: z.enum(['true', 'false']).optional() });

const code = z
  .string({ required_error: 'Vui lòng nhập mã chức danh' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,15}$/, 'Mã chức danh gồm 2-15 chữ cái hoặc chữ số, không có khoảng trắng');

const fields = {
  name: z.string().trim().min(1, 'Vui lòng nhập tên chức danh').max(100),
  level: z.number().int('Cấp bậc phải là số nguyên').min(0).max(10),
  description: z.string().trim().max(1000).nullable(),
};

const createBody = z.object({
  code,
  name: fields.name,
  level: fields.level.optional(),
  description: fields.description.optional(),
});

const updateBody = z
  .object({
    name: fields.name.optional(),
    level: fields.level.optional(),
    description: fields.description.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Không có thay đổi nào' });

module.exports = { idParam, listQuery, createBody, updateBody };
