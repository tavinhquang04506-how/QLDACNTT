// ============================================
// utils/pip.js
// Nghiệp vụ Kế hoạch cải thiện hiệu suất (PIP) dùng chung cho modal PIP và trang Đánh giá hiệu suất.
// Vòng đời (khớp backend Backend/src/modules/analytics/pip.js):
//   proposed (Trưởng phòng đề xuất) → active (HR/CEO phê duyệt) → completed | failed | cancelled (nghiệm thu)
//   proposed → rejected (HR/CEO từ chối, kèm lý do)
// Hàm thuần, không gọi API → kiểm thử bằng node:test.
// ============================================
import { CELL_META, PIP_CELLS, periodLabel } from './nineBox.js';

export const OPEN_STATUSES = ['proposed', 'active'];
export const CLOSED_STATUSES = ['completed', 'failed', 'cancelled', 'rejected'];

export const STATUS_META = {
  proposed: { label: 'Chờ HR phê duyệt', short: 'Chờ duyệt', badge: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500', bar: 'bg-amber-400' },
  active: { label: 'Đang thực hiện', short: 'Đang chạy', badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', bar: 'bg-blue-500' },
  completed: { label: 'Đạt – Hoàn thành PIP', short: 'Đạt', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', bar: 'bg-emerald-500' },
  failed: { label: 'Không đạt', short: 'Không đạt', badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500', bar: 'bg-rose-500' },
  cancelled: { label: 'Đã hủy', short: 'Đã hủy', badge: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400', bar: 'bg-slate-400' },
  rejected: { label: 'Đề xuất bị từ chối', short: 'Bị từ chối', badge: 'bg-stone-100 text-stone-700 border-stone-200', dot: 'bg-stone-400', bar: 'bg-stone-400' },
};

export const GOAL_STATUS_META = {
  pending: { label: 'Chưa đánh giá', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
  achieved: { label: 'Đạt', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  missed: { label: 'Không đạt', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
};

/** Kết quả nghiệm thu HR có thể chọn khi đóng một PIP đang chạy. */
export const CLOSE_OPTIONS = [
  { value: 'completed', label: 'Đạt – kết thúc PIP', hint: 'Nhân sự đáp ứng các mục tiêu, quay lại chu kỳ đánh giá thường.' },
  { value: 'failed', label: 'Không đạt', hint: 'Không đáp ứng mục tiêu — HR xem xét điều chuyển / chấm dứt HĐ theo quy định.' },
  { value: 'cancelled', label: 'Hủy kế hoạch', hint: 'Dừng PIP vì lý do khách quan (nghỉ dài hạn, thay đổi vị trí...).' },
];

export const DURATION_PRESETS = [30, 60, 90];

/** Mẫu mục tiêu SMART gợi ý (người lập vẫn phải chỉnh theo vị trí cụ thể). */
export const GOAL_TEMPLATES = [
  { title: 'Hoàn thành công việc được giao đúng hạn', metric: 'Tỷ lệ task đúng hạn', target: '≥ 90%' },
  { title: 'Nâng cao chất lượng đầu ra', metric: 'Số lỗi / sản phẩm bị trả lại', target: 'Giảm ≥ 50% so với kỳ trước' },
  { title: 'Tuân thủ nội quy và thời gian làm việc', metric: 'Số lần đi muộn / vắng không phép', target: '0 lần' },
  { title: 'Bổ sung kỹ năng chuyên môn còn thiếu', metric: 'Khóa đào tạo / bài kiểm tra', target: 'Hoàn thành, đạt ≥ 80 điểm' },
  { title: 'Chủ động báo cáo tiến độ', metric: 'Buổi 1-on-1 với quản lý', target: 'Hằng tuần, đủ 100%' },
];

// --------------------------------------------
// Ngày tháng (chuỗi ISO YYYY-MM-DD, không lệch múi giờ)
// --------------------------------------------
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const toUtc = (iso) => {
  const m = ISO_RE.exec(iso || '');
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
};
const DAY = 86400000;

export function todayIso(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function addDays(iso, days) {
  const t = toUtc(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t + days * DAY).toISOString().slice(0, 10);
}

/** Số ngày từ a đến b (b - a). NaN nếu ngày không hợp lệ. */
export function diffDays(a, b) {
  return Math.round((toUtc(b) - toUtc(a)) / DAY);
}

export function fmtDate(iso) {
  const m = ISO_RE.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

export function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

// --------------------------------------------
// Trạng thái kế hoạch
// --------------------------------------------
export const isOpenPlan = (plan) => OPEN_STATUSES.includes(plan?.status);
export const planBucket = (plan) => (plan?.status === 'proposed' ? 'proposed' : plan?.status === 'active' ? 'active' : 'closed');

/**
 * Tiến độ thời gian của kế hoạch so với ngày `today`.
 * overdue: kế hoạch đang chạy đã qua ngày kết thúc mà chưa nghiệm thu.
 */
export function computeTimeline(plan, today = todayIso()) {
  const start = plan?.start_date;
  const end = plan?.end_date;
  const totalDays = Math.max(1, diffDays(start, end) || 0);
  if (Number.isNaN(toUtc(start)) || Number.isNaN(toUtc(end))) {
    return { totalDays: 0, elapsedDays: 0, remainingDays: 0, percent: 0, notStarted: false, overdue: false, dueSoon: false };
  }
  const sinceStart = diffDays(start, today);
  const elapsedDays = Math.min(totalDays, Math.max(0, sinceStart));
  const remainingDays = diffDays(today, end);
  const active = plan.status === 'active';
  return {
    totalDays,
    elapsedDays,
    remainingDays,
    percent: Math.round((elapsedDays / totalDays) * 100),
    notStarted: sinceStart < 0,
    overdue: active && remainingDays < 0,
    dueSoon: active && remainingDays >= 0 && remainingDays <= 7,
  };
}

export function goalStats(goals) {
  const list = Array.isArray(goals) ? goals : [];
  const count = (s) => list.filter((g) => (g?.status || 'pending') === s).length;
  const achieved = count('achieved');
  const missed = count('missed');
  const pending = list.length - achieved - missed;
  return {
    total: list.length,
    achieved,
    missed,
    pending,
    evaluated: achieved + missed,
    percentAchieved: list.length ? Math.round((achieved / list.length) * 100) : 0,
  };
}

/** Ngưỡng gợi ý: đạt ≥ 80% mục tiêu → "Đạt". HR vẫn là người quyết định cuối cùng. */
export const PASS_RATIO = 0.8;

/** Gợi ý kết quả nghiệm thu từ kết quả từng mục tiêu; null khi còn mục tiêu chưa đánh giá. */
export function suggestOutcome(goals) {
  const s = goalStats(goals);
  if (s.total === 0 || s.pending > 0) return null;
  return s.achieved / s.total >= PASS_RATIO ? 'completed' : 'failed';
}

export function buildOutcomeText(goals, status) {
  const s = goalStats(goals);
  const head = `Đạt ${s.achieved}/${s.total} mục tiêu`;
  if (status === 'completed') return `${head}. Nhân sự đã cải thiện hiệu suất theo cam kết, kết thúc PIP và quay lại chu kỳ đánh giá thường.`;
  if (status === 'failed') return `${head}. Chưa đáp ứng yêu cầu cải thiện; đề nghị HR xem xét phương án tiếp theo theo quy định.`;
  return '';
}

/** Thống kê nhanh cho màn hình danh sách. */
export function summarizePlans(plans, today = todayIso()) {
  const list = Array.isArray(plans) ? plans : [];
  const by = (s) => list.filter((p) => p.status === s).length;
  const completed = by('completed');
  const failed = by('failed');
  return {
    total: list.length,
    proposed: by('proposed'),
    active: by('active'),
    overdue: list.filter((p) => computeTimeline(p, today).overdue).length,
    closed: list.filter((p) => CLOSED_STATUSES.includes(p.status)).length,
    completed,
    failed,
    successRate: completed + failed > 0 ? Math.round((completed / (completed + failed)) * 100) : null,
  };
}

// --------------------------------------------
// Căn cứ lập PIP từ kết quả đánh giá 9-Box
// --------------------------------------------
const PART_RANK = { Q1: 1, Q2: 2, H1: 2.5, Q3: 3, Q4: 4, H2: 4.5, FY: 5 };
export function periodRank(period) {
  const m = /^(\d{4})-(Q[1-4]|H[12]|FY)$/.exec(period || '');
  return m ? Number(m[1]) * 10 + PART_RANK[m[2]] : -1;
}

/** Map employee_id → đánh giá gần nhất (kỳ mới nhất, rồi cập nhật mới nhất). */
export function latestReviewByEmployee(reviews) {
  const map = new Map();
  (Array.isArray(reviews) ? reviews : []).forEach((r) => {
    if (!r?.employee_id) return;
    const cur = map.get(r.employee_id);
    const better = !cur
      || periodRank(r.period) > periodRank(cur.period)
      || (periodRank(r.period) === periodRank(cur.period) && String(r.updated_at || '') > String(cur.updated_at || ''));
    if (better) map.set(r.employee_id, r);
  });
  return map;
}

export const isPipCandidate = (review) => Boolean(review && PIP_CELLS.includes(Number(review.nine_box_cell)));

export function buildReasonFromReview(review) {
  if (!review) return '';
  const cell = Number(review.nine_box_cell);
  const meta = CELL_META[cell];
  const parts = [
    `Kết quả đánh giá ${periodLabel(review.period)}: hiệu suất ${Number(review.performance_score)}/100, tiềm năng ${Number(review.potential_score)}/100`
      + (meta ? ` — thuộc ô ${cell} "${meta.title}" của ma trận 9-Box.` : '.'),
  ];
  if (review.comments) parts.push(`Nhận xét của người đánh giá: ${review.comments}`);
  return parts.join('\n');
}

/** Hạn mục tiêu chia đều các mốc trong kỳ PIP (vd 3 mục tiêu / 90 ngày → ngày 30, 60, 90). */
export function checkpointDates(startIso, endIso, count) {
  const total = diffDays(startIso, endIso);
  if (!count || Number.isNaN(total) || total < 0) return [];
  return Array.from({ length: count }, (_, i) => addDays(startIso, Math.round((total * (i + 1)) / count)));
}

/** Kiểm tra bản nháp trước khi gửi; trả về danh sách lỗi (rỗng = hợp lệ). */
export function validateDraft(draft) {
  const errors = [];
  if (!draft?.employeeId) errors.push('Chọn nhân sự cần lập PIP.');
  if (!draft?.reason || draft.reason.trim().length < 10) errors.push('Nêu căn cứ lập PIP (tối thiểu 10 ký tự).');
  const span = diffDays(draft?.startDate, draft?.endDate);
  if (Number.isNaN(span)) errors.push('Chọn ngày bắt đầu và ngày kết thúc hợp lệ.');
  else if (span < 0) errors.push('Ngày kết thúc không được trước ngày bắt đầu.');
  const goals = (draft?.goals || []).filter((g) => g.title?.trim());
  if (goals.length === 0) errors.push('Cần ít nhất một mục tiêu có tiêu đề.');
  if (!Number.isNaN(span) && span >= 0) {
    goals.forEach((g, i) => {
      if (g.dueDate && (diffDays(draft.startDate, g.dueDate) < 0 || diffDays(g.dueDate, draft.endDate) < 0)) {
        errors.push(`Hạn của mục tiêu ${i + 1} phải nằm trong thời gian PIP.`);
      }
    });
  }
  return errors;
}

/** Chuẩn hóa mục tiêu trước khi gửi API (bỏ trường rỗng, cắt khoảng trắng). */
export function cleanGoals(goals) {
  return (goals || [])
    .filter((g) => g.title?.trim())
    .map((g) => {
      const out = { title: g.title.trim() };
      if (g.metric?.trim()) out.metric = g.metric.trim();
      if (g.target?.trim()) out.target = g.target.trim();
      if (g.dueDate) out.dueDate = g.dueDate;
      return out;
    });
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
