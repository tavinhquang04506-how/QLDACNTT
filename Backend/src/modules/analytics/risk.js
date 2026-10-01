/**
 * Turnover-risk scoring. Pure and deterministic: every point comes from a named signal with a readable
 * explanation, and the score is the sum of those points (0-100). It is an indicator for HR, not a prediction.
 *
 * metrics: { salary, peerAvgSalary|null, otRecent, otPrev, monthsSinceChange, latestPerformance|null,
 *            previousPerformance|null, unpaidAbsences60, lateCount30 }
 */
function computeTurnoverRisk(m) {
  const signals = [];
  const add = (code, title, points, detail) => {
    if (points > 0) signals.push({ code, title, points, detail });
  };

  if (m.peerAvgSalary && m.salary < m.peerAvgSalary) {
    const gap = ((m.peerAvgSalary - m.salary) / m.peerAvgSalary) * 100;
    add('PAY_GAP', 'Lương thấp hơn mặt bằng cùng chức danh', Math.min(30, Math.round(gap * 1.2)),
      `Thấp hơn ${gap.toFixed(0)}% so với mức trung bình của đồng nghiệp cùng chức danh`);
  }

  if (m.otRecent >= 10) {
    add('OT_LOAD', 'Làm thêm giờ nhiều', Math.min(15, Math.floor(m.otRecent / 2)), `${m.otRecent} giờ làm thêm trong 30 ngày gần nhất`);
    const rise = ((m.otRecent - m.otPrev) / Math.max(m.otPrev, 1)) * 100;
    if (rise >= 50) add('OT_TREND', 'Làm thêm giờ tăng mạnh', 5, `Tăng so với 30 ngày trước đó (${m.otPrev} giờ)`);
  }

  const base = m.monthsSinceChange >= 24 ? 10 : m.monthsSinceChange >= 18 ? 5 : 0;
  const bonus = base > 0 && m.latestPerformance !== null && m.latestPerformance >= 80 ? 5 : 0;
  add('STAGNATION', 'Lâu chưa thay đổi vị trí/hợp đồng', base + bonus,
    `${m.monthsSinceChange} tháng chưa có thay đổi hợp đồng hoặc chức danh${bonus ? ' dù hiệu suất cao' : ''}`);

  if (m.latestPerformance !== null && m.latestPerformance < 60) {
    add('LOW_PERFORMANCE', 'Điểm hiệu suất thấp', 10, `Điểm đánh giá gần nhất ${m.latestPerformance}`);
  }
  if (m.latestPerformance !== null && m.previousPerformance !== null && m.previousPerformance - m.latestPerformance >= 10) {
    add('PERFORMANCE_DROP', 'Hiệu suất giảm', 10, `Giảm ${(m.previousPerformance - m.latestPerformance).toFixed(0)} điểm so với kỳ trước`);
  }
  if (m.unpaidAbsences60 >= 3) {
    add('UNPAID_ABSENCE', 'Vắng không phép', 10, `${m.unpaidAbsences60} ngày vắng không phép trong 60 ngày`);
  }
  if (m.lateCount30 >= 6) {
    add('FREQUENT_LATE', 'Đi muộn thường xuyên', 5, `${m.lateCount30} lần đi muộn trong 30 ngày`);
  }

  const score = Math.min(100, signals.reduce((sum, s) => sum + s.points, 0));
  return { score, level: score >= 60 ? 'Cao' : score >= 30 ? 'Trung bình' : 'Thấp', signals };
}

module.exports = { computeTurnoverRisk };
