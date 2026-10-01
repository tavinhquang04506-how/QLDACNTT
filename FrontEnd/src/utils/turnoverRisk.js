// ============================================
// utils/turnoverRisk.js
// ============================================

export const SIGNAL_DEFINITIONS = {
  PAY_GAP: {
    title: 'Chênh lệch lương so với đồng nghiệp',
    category: 'compensation',
    actionLabel: 'Xem xét đãi ngộ',
    desc: 'Lương cơ sở thấp hơn mặt bằng trung bình của các đồng nghiệp cùng vị trí chức danh.',
  },
  OT_LOAD: {
    title: 'Cường độ làm thêm giờ cao',
    category: 'workload',
    actionLabel: 'Xem bảng chấm công',
    desc: 'Số giờ làm thêm tích lũy trong 30 ngày qua vượt quá ngưỡng khuyến cáo (từ 10 giờ trở lên).',
  },
  OT_TREND: {
    title: 'Gia tăng đột biến giờ làm thêm',
    category: 'workload',
    actionLabel: 'Xem bảng chấm công',
    desc: 'Khối lượng OT tăng trên 50% so với chu kỳ 30 ngày trước đó, cảnh báo nguy cơ kiệt sức.',
  },
  STAGNATION: {
    title: 'Thâm niên chức danh chưa thay đổi',
    category: 'growth',
    actionLabel: 'Xem hồ sơ 360',
    desc: 'Trên 18-24 tháng chưa có điều chỉnh hợp đồng, nâng bậc lương hoặc bổ nhiệm vị trí mới.',
  },
  LOW_PERFORMANCE: {
    title: 'Điểm hiệu suất kỳ gần nhất thấp',
    category: 'performance',
    actionLabel: 'Lập kế hoạch PIP',
    desc: 'Kết quả đánh giá hiệu suất kỳ gần nhất dưới 60 điểm.',
  },
  PERFORMANCE_DROP: {
    title: 'Hiệu suất sụt giảm mạnh',
    category: 'performance',
    actionLabel: 'Đánh giá lại',
    desc: 'Điểm hiệu suất giảm từ 10 điểm trở lên so với kỳ đánh giá trước đó.',
  },
  UNPAID_ABSENCE: {
    title: 'Vắng mặt không phép bất thường',
    category: 'attendance',
    actionLabel: 'Xem bảng chấm công',
    desc: 'Có từ 3 ngày nghỉ vắng không phép trong vòng 60 ngày gần nhất.',
  },
  FREQUENT_LATE: {
    title: 'Đi muộn thường xuyên',
    category: 'attendance',
    actionLabel: 'Xem bảng chấm công',
    desc: 'Ghi nhận từ 6 lần đi muộn trong 30 ngày làm việc gần nhất.',
  },
};

export const LEVEL_CONFIG = {
  'Cao': {
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-700',
    badge: 'bg-rose-100 text-rose-800 border-rose-300',
    dot: 'bg-rose-500',
    headerBg: 'bg-rose-500 text-white',
  },
  'Trung bình': {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    dot: 'bg-amber-500',
    headerBg: 'bg-amber-500 text-white',
  },
  'Thấp': {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    dot: 'bg-emerald-500',
    headerBg: 'bg-emerald-500 text-white',
  },
};

export function isTopTalentAtRisk(emp, talentIds = []) {
  if (!emp || !talentIds || !talentIds.length) return false;
  const isTalent = talentIds.includes(emp.employee_id || emp.id);
  const isRisk = emp.level === 'Cao' || emp.level === 'Trung bình' || emp.score >= 30;
  return Boolean(isTalent && isRisk);
}

export function computeRiskStats(riskList = [], talentIds = []) {
  const list = Array.isArray(riskList) ? riskList : [];
  let high = 0;
  let mid = 0;
  let low = 0;
  let talentsAtRisk = 0;

  list.forEach((r) => {
    if (r.level === 'Cao' || r.score >= 60) high += 1;
    else if (r.level === 'Trung bình' || r.score >= 30) mid += 1;
    else low += 1;

    if (isTopTalentAtRisk(r, talentIds)) {
      talentsAtRisk += 1;
    }
  });

  return {
    total: list.length,
    high,
    mid,
    low,
    talentsAtRisk,
  };
}

export function filterRiskList(riskList = [], options = {}) {
  const {
    search = '',
    levelFilter = 'all',
    deptFilter = 'all',
    talentIds = [],
    onlyTalentsAtRisk = false,
    sortBy = 'score_desc',
  } = options;

  let list = Array.isArray(riskList) ? [...riskList] : [];

  if (deptFilter && deptFilter !== 'all') {
    list = list.filter((r) => r.department_id === deptFilter);
  }

  if (levelFilter && levelFilter !== 'all') {
    list = list.filter((r) => r.level === levelFilter);
  }

  if (onlyTalentsAtRisk) {
    list = list.filter((r) => isTopTalentAtRisk(r, talentIds));
  }

  const q = search.toLowerCase().trim();
  if (q) {
    list = list.filter((r) =>
      (r.full_name || '').toLowerCase().includes(q) ||
      (r.employee_id || '').toLowerCase().includes(q) ||
      (r.department_name || '').toLowerCase().includes(q) ||
      (r.job_title || '').toLowerCase().includes(q)
    );
  }

  const sorters = {
    score_desc: (a, b) => b.score - a.score || (a.full_name || '').localeCompare(b.full_name || '', 'vi'),
    score_asc: (a, b) => a.score - b.score || (a.full_name || '').localeCompare(b.full_name || '', 'vi'),
    name: (a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'vi'),
  };

  return list.sort(sorters[sortBy] || sorters.score_desc);
}
