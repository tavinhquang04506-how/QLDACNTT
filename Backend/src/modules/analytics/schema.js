const { z } = require('zod');
const { isoDate } = require('../employees/schema');

const period = z.string().regex(/^\d{4}-(Q[1-4]|H[12]|FY)$/, 'Kỳ đánh giá có dạng 2026-Q3, 2026-H1 hoặc 2026-FY');
const score = (label) => z.number({ required_error: `Thiếu ${label}`, invalid_type_error: `${label} phải là số` }).min(0, `${label} từ 0 đến 100`).max(100, `${label} từ 0 đến 100`);

const idParam = z.object({ id: z.string().trim().min(1).max(30) });
const employeeParam = z.object({ employeeId: z.string().trim().min(1).max(20) });
const periodQuery = z.object({ period: period.optional() });

const reviewsQuery = z.object({ employeeId: z.string().trim().optional(), period: period.optional(), page: z.string().optional(), limit: z.string().optional() });

const reviewBody = z.object({
  employeeId: z.string({ required_error: 'Thiếu mã nhân viên' }).trim().min(1).max(20),
  period,
  performanceScore: score('điểm hiệu suất'),
  potentialScore: score('điểm tiềm năng'),
  comments: z.string().trim().max(2000).nullish(),
});

const reviewUpdate = z
  .object({ performanceScore: score('điểm hiệu suất').optional(), potentialScore: score('điểm tiềm năng').optional(), comments: z.string().trim().max(2000).nullable().optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Không có thay đổi nào' });

const riskQuery = z.object({ level: z.enum(['Thấp', 'Trung bình', 'Cao']).optional(), departmentId: z.string().trim().optional(), page: z.string().optional(), limit: z.string().optional() });

const goalStatus = z.enum(['pending', 'achieved', 'missed'], { invalid_type_error: 'Trạng thái mục tiêu không hợp lệ' });
const goalNote = z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự');

const goal = z.object({
  title: z.string({ required_error: 'Mục tiêu cần có tiêu đề' }).trim().min(1, 'Mục tiêu cần có tiêu đề').max(300),
  metric: z.string().trim().max(200).optional(),
  target: z.string().trim().max(200).optional(),
  dueDate: isoDate.optional(),
  status: goalStatus.optional(),
  note: goalNote.optional(),
  checkedAt: isoDate.optional(),
});
const goals = z.array(goal, { invalid_type_error: 'goals phải là một mảng' }).min(1, 'Cần ít nhất một mục tiêu').max(20);
const reason = z.string({ required_error: 'Vui lòng nêu căn cứ lập PIP' }).trim().min(10, 'Căn cứ lập PIP cần tối thiểu 10 ký tự').max(2000);

const pipBody = z
  .object({ employeeId: z.string({ required_error: 'Thiếu mã nhân viên' }).trim().min(1).max(20), startDate: isoDate, endDate: isoDate, reason, goals })
  .refine((v) => v.endDate >= v.startDate, { message: 'Ngày kết thúc không được trước ngày bắt đầu', path: ['endDate'] });

const pipUpdate = z
  .object({
    startDate: isoDate.optional(), endDate: isoDate.optional(), goals: goals.optional(), reason: reason.optional(),
    status: z.enum(['active', 'completed', 'failed', 'cancelled']).optional(), outcome: z.string().trim().min(1).max(2000).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Không có thay đổi nào' });

const pipDecision = z
  .object({
    decision: z.enum(['approve', 'reject'], { required_error: 'Thiếu quyết định', invalid_type_error: 'Quyết định là approve hoặc reject' }),
    note: z.string().trim().max(2000).optional(),
    startDate: isoDate.optional(), endDate: isoDate.optional(),
  })
  .refine((v) => v.decision !== 'reject' || (v.note && v.note.length >= 5), { message: 'Vui lòng nêu lý do từ chối (tối thiểu 5 ký tự)', path: ['note'] });

const pipProgress = z.object({
  goals: z.array(z.object({ status: goalStatus, note: goalNote.optional() }), { invalid_type_error: 'goals phải là một mảng' }).min(1).max(20),
});

const pipQuery = z.object({
  employeeId: z.string().trim().optional(), status: z.enum(['proposed', 'active', 'completed', 'failed', 'cancelled', 'rejected']).optional(),
  page: z.string().optional(), limit: z.string().optional(),
});

module.exports = { idParam, employeeParam, periodQuery, reviewsQuery, reviewBody, reviewUpdate, riskQuery, pipBody, pipUpdate, pipDecision, pipProgress, pipQuery };
