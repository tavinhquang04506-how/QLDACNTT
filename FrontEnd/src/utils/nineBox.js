// ============================================
// utils/nineBox.js
// Quy ước ma trận 9-Box dùng chung cho trang Đánh giá hiệu suất và các modal.
// Công thức trùng khớp backend (Backend/src/modules/analytics/nineBox.js):
//   level: >= 80 → 3 (Cao), >= 60 → 2 (Trung bình), còn lại → 1 (Thấp)
//   cell  = (level(tiềm năng) - 1) * 3 + level(hiệu suất)
// ============================================

export const levelOf = (score) => (score >= 80 ? 3 : score >= 60 ? 2 : 1);
export const cellOf = (performance, potential) => (levelOf(potential) - 1) * 3 + levelOf(performance);

export const LEVEL_LABEL = { 1: 'Thấp', 2: 'Trung bình', 3: 'Cao' };

/** Nhóm năng lực theo ô (dùng cho thống kê / khuyến nghị). */
export const TOP_TALENT_CELLS = [6, 8, 9];
export const NEEDS_IMPROVEMENT_CELLS = [1, 2, 4];
export const CORE_CELLS = [3, 5, 7];
export const PIP_CELLS = [1, 2, 4];

/** Metadata giao diện + chiến lược hành động khuyến nghị cho từng ô 9-Box. */
export const CELL_META = {
  9: {
    cell: 9, title: 'Ngôi sao xuất sắc', desc: 'Lãnh đạo tương lai và chuyên gia nòng cốt', tag: 'Quy hoạch kế cận',
    card: 'from-emerald-50 to-teal-50 border-emerald-200 hover:border-emerald-400', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500', bar: 'bg-emerald-500',
    actions: ['Đưa vào danh sách quy hoạch kế cận cấp quản lý', 'Giao dự án chiến lược, mở rộng phạm vi ảnh hưởng', 'Rà soát đãi ngộ giữ chân (lương, thưởng, cổ phần)'],
  },
  8: {
    cell: 8, title: 'Tiềm năng phát triển', desc: 'Sẵn sàng nhận trách nhiệm lớn hơn', tag: 'Đào tạo quản lý',
    card: 'from-sky-50 to-blue-50 border-sky-200 hover:border-sky-400', badge: 'bg-sky-100 text-sky-800 border-sky-200', dot: 'bg-sky-500', bar: 'bg-sky-500',
    actions: ['Cử tham gia chương trình đào tạo quản lý', 'Giao vai trò dẫn dắt nhóm nhỏ / mentor', 'Đặt mục tiêu hiệu suất cao hơn cho kỳ tới'],
  },
  7: {
    cell: 7, title: 'Ngôi sao đang lên', desc: 'Nhân tố bứt phá cần trao quyền', tag: 'Cố vấn chuyên môn',
    card: 'from-indigo-50 to-violet-50 border-indigo-200 hover:border-indigo-400', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200', dot: 'bg-indigo-500', bar: 'bg-indigo-500',
    actions: ['Ghép cặp với cố vấn chuyên môn cấp cao', 'Làm rõ kỳ vọng và tiêu chí thành công', 'Theo dõi 1-on-1 hai tuần một lần'],
  },
  6: {
    cell: 6, title: 'Nhân lực cốt lõi', desc: 'Đóng góp vượt trội và ổn định', tag: 'Khen thưởng đặc biệt',
    card: 'from-emerald-50 to-green-50 border-emerald-200 hover:border-emerald-400', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-400', bar: 'bg-emerald-400',
    actions: ['Đề xuất khen thưởng / thưởng hiệu suất', 'Mở rộng chuyên môn sang mảng liên quan', 'Ghi nhận công khai trong đội ngũ'],
  },
  5: {
    cell: 5, title: 'Nhân lực ổn định', desc: 'Hoàn thành tốt nhiệm vụ được giao', tag: 'Duy trì động lực',
    card: 'from-slate-50 to-gray-50 border-slate-200 hover:border-slate-400', badge: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400', bar: 'bg-slate-400',
    actions: ['Duy trì động lực bằng mục tiêu rõ ràng', 'Đào tạo kỹ năng để nâng lên ô cao hơn', 'Phản hồi định kỳ hằng tháng'],
  },
  4: {
    cell: 4, title: 'Cần hỗ trợ nghiệp vụ', desc: 'Cần cải thiện năng lực thực thi', tag: 'Huấn luyện kèm cặp',
    card: 'from-amber-50 to-orange-50 border-amber-200 hover:border-amber-400', badge: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500', bar: 'bg-amber-500',
    actions: ['Huấn luyện kèm cặp 1-on-1 hằng tuần', 'Chia nhỏ mục tiêu, kiểm tra tiến độ thường xuyên', 'Cân nhắc lập PIP 30 ngày nếu không cải thiện'],
  },
  3: {
    cell: 3, title: 'Chuyên gia chuyên môn', desc: 'Chuyên môn sâu, hiệu suất cao', tag: 'Đãi ngộ chuyên gia',
    card: 'from-blue-50 to-cyan-50 border-blue-200 hover:border-blue-400', badge: 'bg-blue-100 text-blue-800 border-blue-200', dot: 'bg-blue-500', bar: 'bg-blue-500',
    actions: ['Xây lộ trình chuyên gia (Individual Contributor)', 'Đãi ngộ theo giá trị chuyên môn', 'Mời chia sẻ tri thức nội bộ'],
  },
  2: {
    cell: 2, title: 'Nhân sự thực thi', desc: 'Vận hành quy trình chuẩn xác', tag: 'Định kỳ đánh giá',
    card: 'from-stone-50 to-slate-50 border-stone-200 hover:border-stone-400', badge: 'bg-stone-100 text-stone-700 border-stone-200', dot: 'bg-stone-400', bar: 'bg-stone-400',
    actions: ['Đánh giá lại định kỳ mỗi quý', 'Xác định rào cản ảnh hưởng hiệu suất', 'Lập kế hoạch đào tạo kỹ năng thực thi'],
  },
  1: {
    cell: 1, title: 'Cần cải thiện (PIP)', desc: 'Hiệu suất và tiềm năng đều thấp', tag: 'Lập lộ trình 30 ngày',
    card: 'from-rose-50 to-red-50 border-rose-200 hover:border-rose-400', badge: 'bg-rose-100 text-rose-800 border-rose-200', dot: 'bg-rose-500', bar: 'bg-rose-500',
    actions: ['Lập Kế hoạch cải thiện hiệu suất (PIP) 30 ngày', 'Thống nhất mục tiêu đo lường được với nhân viên', 'Họp đánh giá cuối kỳ PIP cùng HR'],
  },
};

/** Thứ tự hiển thị lưới 3x3: hàng trên = tiềm năng cao. */
export const GRID_ORDER = [7, 8, 9, 4, 5, 6, 1, 2, 3];

// ============================================
// Kỳ đánh giá (khớp regex backend: ^\d{4}-(Q[1-4]|H[12]|FY)$)
// ============================================
export function currentPeriod(date = new Date()) {
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

export function previousPeriod(period) {
  const m = /^(\d{4})-(Q[1-4]|H[12]|FY)$/.exec(period || '');
  if (!m) return null;
  const year = Number(m[1]);
  const part = m[2];
  if (part === 'FY') return `${year - 1}-FY`;
  if (part.startsWith('H')) return part === 'H1' ? `${year - 1}-H2` : `${year}-H1`;
  const q = Number(part.slice(1));
  return q === 1 ? `${year - 1}-Q4` : `${year}-Q${q - 1}`;
}

export function periodLabel(period) {
  const m = /^(\d{4})-(Q[1-4]|H[12]|FY)$/.exec(period || '');
  if (!m) return period || '';
  const [, year, part] = m;
  if (part === 'FY') return `Cả năm ${year}`;
  if (part.startsWith('H')) return `${part === 'H1' ? '6 tháng đầu' : '6 tháng cuối'} ${year}`;
  return `Quý ${part.slice(1)}/${year}`;
}

/** Danh sách kỳ cho bộ chọn: năm hiện tại và năm trước, mới nhất trước. */
export function buildPeriodOptions(date = new Date()) {
  const year = date.getFullYear();
  const options = [];
  [year, year - 1].forEach((y) => {
    ['Q4', 'Q3', 'Q2', 'Q1', 'H2', 'H1', 'FY'].forEach((p) => options.push(`${y}-${p}`));
  });
  return options;
}

/** Điểm trung bình (1 chữ số thập phân), null nếu không có dữ liệu. */
export function average(values) {
  if (!Array.isArray(values)) return null;
  const nums = values
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map(Number)
    .filter((v) => Number.isFinite(v));
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10;
}
