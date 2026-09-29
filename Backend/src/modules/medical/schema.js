const { z } = require('zod');
const { isoDate } = require('../employees/schema');

const createBody = z.object({
  claimDate: isoDate,
  amount: z.number({ required_error: 'Vui lòng nhập số tiền', invalid_type_error: 'Số tiền phải là số' })
    .positive('Số tiền phải lớn hơn 0').max(1_000_000_000, 'Số tiền quá lớn'),
  hospital: z.string().trim().max(200).nullish(),
  description: z.string({ required_error: 'Vui lòng nhập nội dung' }).trim().min(1, 'Vui lòng nhập nội dung').max(2000),
  attachmentUrl: z.string().trim().max(2000).nullish(),
  leaveRequestId: z.string().trim().min(1).max(30).nullish(),
});

module.exports = { createBody };
