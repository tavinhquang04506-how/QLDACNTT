const { z } = require('zod');
const { isoDate } = require('../employees/schema');
const { PRIORITIES } = require('../projects/schema');

const STAGES = ['todo', 'in_progress', 'review', 'done'];
const pick = (o, camel, snake) => (o[camel] !== undefined ? o[camel] : o[snake]);

const normalize = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const out = { ...v };
  const map = { assigneeId: 'assignee_id', kpiWeight: 'kpi_weight', estimatedHours: 'estimated_hours', deliverableUrl: 'deliverable_url', deliverableNote: 'deliverable_note' };
  for (const [camel, snake] of Object.entries(map)) out[camel] = pick(v, camel, snake);
  return out;
};

const fields = {
  title: z.string({ required_error: 'Vui lòng nhập tiêu đề nhiệm vụ' }).trim().min(1, 'Vui lòng nhập tiêu đề nhiệm vụ').max(300),
  description: z.string().trim().max(5000),
  assigneeId: z.string().trim().min(1).max(20),
  deadline: isoDate,
  priority: z.enum(PRIORITIES),
  kpiWeight: z.number({ invalid_type_error: 'Trọng số phải là số' }).int().min(0, 'Trọng số từ 0 đến 100').max(100, 'Trọng số từ 0 đến 100'),
  estimatedHours: z.number({ invalid_type_error: 'Số giờ phải là số' }).min(0).max(9999),
  progress: z.number({ invalid_type_error: 'Tiến độ phải là số' }).int().min(0, 'Tiến độ từ 0 đến 100').max(100, 'Tiến độ từ 0 đến 100'),
  deliverableUrl: z.string().trim().max(2000),
  deliverableNote: z.string().trim().max(2000),
};

const createBody = z.preprocess(
  normalize,
  z.object({
    title: fields.title,
    description: fields.description.nullish(),
    assigneeId: fields.assigneeId.nullish(),
    deadline: fields.deadline.nullish(),
    priority: fields.priority.optional(),
    kpiWeight: fields.kpiWeight.optional(),
    estimatedHours: fields.estimatedHours.optional(),
    stage: z.enum(['todo', 'in_progress']).optional(),
  })
);

const updateBody = z.preprocess(
  normalize,
  z
    .object({
      title: fields.title.optional(),
      description: fields.description.nullable().optional(),
      assigneeId: fields.assigneeId.optional(),
      deadline: fields.deadline.nullable().optional(),
      priority: fields.priority.optional(),
      kpiWeight: fields.kpiWeight.optional(),
      estimatedHours: fields.estimatedHours.optional(),
      progress: fields.progress.optional(),
      deliverableUrl: fields.deliverableUrl.nullable().optional(),
      deliverableNote: fields.deliverableNote.nullable().optional(),
    })
    .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Không có thay đổi nào' })
);

const stageBody = z.object({
  stage: z.enum(STAGES, { errorMap: () => ({ message: `Stage không hợp lệ. Cho phép: ${STAGES.join(', ')}` }) }),
  note: z.string().trim().max(1000).optional(),
});

const reviewBody = z.object({
  decision: z.enum(['accept', 'reject'], { errorMap: () => ({ message: 'decision phải là accept hoặc reject' }) }),
  note: z.string().trim().max(1000).optional(),
});

const idParam = z.object({ id: z.string().trim().min(1).max(20) });
const projectParam = z.object({ id: z.string().trim().min(1).max(30) });

module.exports = { createBody, updateBody, stageBody, reviewBody, idParam, projectParam, STAGES };
