const { z } = require('zod');
const { isoDate } = require('../employees/schema');

const employeeParam = z.object({ id: z.string().trim().min(1).max(20) });
const contractParam = z.object({ id: z.string().trim().min(1).max(30) });

const TYPES = ['CHINH_THUC', 'THU_VIEC', 'THOI_VU', 'CONG_TAC_VIEN'];

const fields = {
  salary: z.number({ invalid_type_error: 'Lương phải là số' }).min(0, 'Lương không được âm').max(9_999_999_999),
  fileUrl: z.string().trim().max(2000),
  signedAt: z.string().datetime({ offset: true, message: 'Thời điểm ký không hợp lệ' }),
  note: z.string().trim().max(2000),
};

const createBody = z
  .object({
    contractNo: z.string().trim().min(1).max(50).optional(),
    type: z.enum(TYPES),
    startDate: isoDate,
    endDate: isoDate.nullish(),
    salary: fields.salary,
    status: z.enum(['HIEU_LUC', 'CHO_KY']).optional(),
    fileUrl: fields.fileUrl.nullish(),
    signedAt: fields.signedAt.nullish(),
    note: fields.note.nullish(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: 'Ngày kết thúc không được trước ngày bắt đầu',
    path: ['endDate'],
  });

const updateBody = z
  .object({
    salary: fields.salary.optional(),
    endDate: isoDate.nullable().optional(),
    fileUrl: fields.fileUrl.nullable().optional(),
    signedAt: fields.signedAt.nullable().optional(),
    note: fields.note.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Không có thay đổi nào' });

const terminateBody = z.object({
  terminationDate: isoDate.optional(),
  note: fields.note.optional(),
});

module.exports = { employeeParam, contractParam, createBody, updateBody, terminateBody };
