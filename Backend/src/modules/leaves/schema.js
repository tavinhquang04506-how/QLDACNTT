const { z } = require('zod');
const { isoDate } = require('../employees/schema');

const pick = (o, camel, snake) => (o[camel] !== undefined ? o[camel] : o[snake]);

// The legacy endpoint accepted both camelCase and snake_case; keep doing so.
const normalize = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  return {
    leaveTypeId: pick(v, 'leaveTypeId', 'leave_type_id'),
    startDate: pick(v, 'startDate', 'start_date'),
    endDate: pick(v, 'endDate', 'end_date'),
    totalDays: pick(v, 'totalDays', 'total_days'),
    reason: v.reason,
    handoverTo: pick(v, 'handoverTo', 'handover_to'),
    attachmentUrl: pick(v, 'attachmentUrl', 'attachment_url'),
    attachmentName: pick(v, 'attachmentName', 'attachment_name'),
  };
};

const createBody = z.preprocess(
  normalize,
  z
    .object({
      leaveTypeId: z.string({ required_error: 'Vui lòng chọn loại phép' }).trim().min(1, 'Vui lòng chọn loại phép').max(20),
      startDate: isoDate,
      endDate: isoDate,
      totalDays: z.number({ invalid_type_error: 'Số ngày phải là số' }).positive('Số ngày phải lớn hơn 0').multipleOf(0.5, 'Số ngày phải là bội của 0.5').max(180).optional(),
      reason: z.string({ required_error: 'Vui lòng nhập lý do' }).trim().min(1, 'Vui lòng nhập lý do').max(1000),
      handoverTo: z.string().trim().max(100).nullish(),
      attachmentUrl: z.string().trim().max(2000).nullish(),
      attachmentName: z.string().trim().max(200).nullish(),
    })
    .refine((v) => v.endDate >= v.startDate, { message: 'Ngày kết thúc không được trước ngày bắt đầu', path: ['endDate'] })
);

const STAGES = ['CHO_TRUONG_PHONG_DUYET', 'CHO_HR_PHE_CHUAN', 'DA_PHE_DUYET', 'TU_CHOI', 'DA_HUY'];
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng phải có dạng YYYY-MM');

const idParam = z.object({ id: z.string().trim().min(1).max(30) });
const employeeParam = z.object({ employeeId: z.string().trim().min(1).max(20) });

const listQuery = z.object({
  stage: z.enum(STAGES).optional(),
  month: month.optional(),
  employeeId: z.string().trim().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

const calendarQuery = z.object({ month, department: z.string().trim().optional() });

const approveBody = z.object({ note: z.string().trim().max(1000).optional() });
const rejectBody = z.object({
  note: z.string({ required_error: 'Vui lòng nhập lý do từ chối' }).trim().min(1, 'Vui lòng nhập lý do từ chối').max(1000),
});

module.exports = { createBody, idParam, employeeParam, listQuery, calendarQuery, approveBody, rejectBody, STAGES };
