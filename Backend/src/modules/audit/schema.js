const { z } = require('zod');

const listQuery = z.object({
  table: z.string().trim().min(1).max(50).optional(),
  action: z.string().trim().min(1).max(50).optional(),
  userId: z.string().uuid('userId không hợp lệ').optional(),
  from: z.coerce.date({ invalid_type_error: 'from không phải ngày hợp lệ' }).optional(),
  to: z.coerce.date({ invalid_type_error: 'to không phải ngày hợp lệ' }).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

module.exports = { listQuery };
