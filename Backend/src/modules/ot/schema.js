const { z } = require('zod');
const { isoDate } = require('../employees/schema');

const time = z.string({ required_error: 'Thiếu giờ' }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải có dạng HH:MM');
const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

const createBody = z
  .object({
    workDate: isoDate,
    startTime: time,
    endTime: time,
    reason: z.string({ required_error: 'Vui lòng nhập lý do' }).trim().min(1, 'Vui lòng nhập lý do').max(1000),
  })
  .refine((v) => minutes(v.endTime) > minutes(v.startTime), { message: 'Giờ kết thúc phải sau giờ bắt đầu', path: ['endTime'] })
  .refine((v) => minutes(v.endTime) - minutes(v.startTime) <= 240, { message: 'Tối đa 4 giờ làm thêm mỗi ngày', path: ['endTime'] });

module.exports = { createBody, minutes };
