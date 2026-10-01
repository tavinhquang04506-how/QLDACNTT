const { z } = require('zod');

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Kỳ lương phải có dạng YYYY-MM');
const numericId = z.string().regex(/^\d{1,18}$/, 'Mã không hợp lệ');

const calculateBody = z.object({ period: z.string({ required_error: 'Thiếu kỳ lương' }).pipe(period) });
const idParam = z.object({ id: numericId });
const lockBody = z.object({ acknowledgeAnomalies: z.boolean().optional() });
const payslipsQuery = z.object({ period: period.optional(), page: z.string().optional(), limit: z.string().optional() });
const updatePayslipBody = z.object({
  baseSalary: z.number().nonnegative().optional(),
  actualWorkDays: z.number().nonnegative().optional(),
  otHours: z.number().nonnegative().optional(),
  allowances: z.number().nonnegative().optional(),
  bonus: z.number().nonnegative().optional(),
  note: z.string().optional(),
});

module.exports = { calculateBody, idParam, lockBody, payslipsQuery, updatePayslipBody };
