const { z } = require('zod');

const idParam = z.object({ id: z.string().trim().min(1).max(20) });

const code = z
  .string({ required_error: 'Vui lòng nhập mã phòng ban' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,15}$/, 'Mã phòng ban gồm 2-15 chữ cái hoặc chữ số, không có khoảng trắng');

const fields = {
  name: z.string().trim().min(1, 'Vui lòng nhập tên phòng ban').max(100),
  description: z.string().trim().max(1000).nullable(),
  budgetYearly: z.number().min(0, 'Ngân sách không được âm').max(1e13),
  managerId: z.string().trim().min(1).nullable(),
};

const createBody = z.object({
  code,
  name: fields.name,
  description: fields.description.optional(),
  budgetYearly: fields.budgetYearly.optional(),
  managerId: fields.managerId.optional(),
});

const updateBody = z
  .object({
    name: fields.name.optional(),
    description: fields.description.optional(),
    budgetYearly: fields.budgetYearly.optional(),
    managerId: fields.managerId.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Không có thay đổi nào' });

module.exports = { idParam, createBody, updateBody };
