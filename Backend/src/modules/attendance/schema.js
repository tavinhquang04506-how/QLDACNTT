const { z } = require('zod');
const { isoDate } = require('../employees/schema');

const SELF_PUNCH_METHODS = ['gps', 'code_gps', 'code'];
const STATUSES = ['DUNG_GIO', 'DI_MUON', 'VE_SOM', 'NGHI_PHEP', 'VANG_KHONG_PHEP', 'CONG_TAC', 'NGHI_LE'];

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng phải có dạng YYYY-MM');
const dateTime = z.string().datetime({ offset: true, message: 'Thời điểm không hợp lệ (ISO 8601)' });

const punchBody = z
  .object({
    method: z.enum(SELF_PUNCH_METHODS, {
      errorMap: () => ({ message: 'Phương thức tự chấm công chỉ hỗ trợ gps, code hoặc code_gps' }),
    }).default('code_gps'),
    code: z.string().trim().optional(),
    gpsLat: z.number({ invalid_type_error: 'Vĩ độ (gpsLat) phải là số' }).min(-90).max(90).nullish(),
    gpsLng: z.number({ invalid_type_error: 'Kinh độ (gpsLng) phải là số' }).min(-180).max(180).nullish(),
    address: z.string().max(500).nullish(),
    accuracy: z.number().nullish(),
  })
  .superRefine((val, ctx) => {
    const needsCode = val.method === 'code' || val.method === 'code_gps';
    const needsGps = val.method === 'gps' || val.method === 'code_gps';

    if (needsCode) {
      if (typeof val.code !== 'string' || !/^\d{6}$/.test(val.code.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['code'],
          message: 'Mã code Kiosk bắt buộc gồm đúng 6 chữ số',
        });
      }
    }

    if (needsGps) {
      if (typeof val.gpsLat !== 'number' || !Number.isFinite(val.gpsLat)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['gpsLat'],
          message: 'Phương thức chấm công GPS bắt buộc có tọa độ vĩ độ (gpsLat)',
        });
      }
      if (typeof val.gpsLng !== 'number' || !Number.isFinite(val.gpsLng)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['gpsLng'],
          message: 'Phương thức chấm công GPS bắt buộc có tọa độ kinh độ (gpsLng)',
        });
      }
    }
  });

const kioskBody = z.object({ qrToken: z.string({ required_error: 'Thiếu mã QR' }).min(1, 'Thiếu mã QR') });

const listQuery = z.object({
  date: isoDate.optional(),
  month: month.optional(),
  department: z.string().trim().optional(),
  employeeId: z.string().trim().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

const adjustBody = z
  .object({
    employeeId: z.string().trim().min(1),
    workDate: isoDate,
    checkIn: dateTime.optional(),
    checkOut: dateTime.optional(),
    status: z.enum(STATUSES).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.checkIn || v.status, { message: 'Cần có giờ vào hoặc trạng thái', path: ['checkIn'] })
  .refine((v) => !v.checkOut || v.checkIn, { message: 'Giờ ra cần đi kèm giờ vào', path: ['checkOut'] })
  .refine((v) => !v.checkOut || new Date(v.checkOut) > new Date(v.checkIn), {
    message: 'Giờ ra phải sau giờ vào',
    path: ['checkOut'],
  });

const timesheetQuery = z.object({ month, department: z.string().trim().optional() });
const exceptionsQuery = z.object({ date: isoDate.optional() });

module.exports = { punchBody, kioskBody, listQuery, adjustBody, timesheetQuery, exceptionsQuery };
