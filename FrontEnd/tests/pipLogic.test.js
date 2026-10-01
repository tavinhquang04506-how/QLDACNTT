import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_META,
  OPEN_STATUSES,
  addDays,
  diffDays,
  fmtDate,
  isOpenPlan,
  planBucket,
  computeTimeline,
  goalStats,
  suggestOutcome,
  buildOutcomeText,
  summarizePlans,
  periodRank,
  latestReviewByEmployee,
  isPipCandidate,
  buildReasonFromReview,
  checkpointDates,
  validateDraft,
  cleanGoals,
  escapeHtml,
} from '../src/utils/pip.js';

const plan = (extra = {}) => ({ status: 'active', start_date: '2026-10-01', end_date: '2026-10-31', goals: [], ...extra });

describe('PIP – ngày tháng', () => {
  it('cộng ngày và tính khoảng cách không lệch múi giờ', () => {
    assert.equal(addDays('2026-10-01', 30), '2026-10-31');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(diffDays('2026-10-01', '2026-10-31'), 30);
    assert.equal(diffDays('2026-10-31', '2026-10-01'), -30);
    assert.ok(Number.isNaN(diffDays('bad', '2026-10-01')));
    assert.equal(fmtDate('2026-10-03'), '03/10/2026');
    assert.equal(fmtDate(null), '—');
  });
});

describe('PIP – trạng thái và tiến độ thời gian', () => {
  it('mọi trạng thái backend đều có nhãn hiển thị', () => {
    ['proposed', 'active', 'completed', 'failed', 'cancelled', 'rejected'].forEach((s) => assert.ok(STATUS_META[s]?.label, s));
    assert.deepEqual(OPEN_STATUSES, ['proposed', 'active']);
    assert.equal(isOpenPlan(plan({ status: 'proposed' })), true);
    assert.equal(isOpenPlan(plan({ status: 'rejected' })), false);
    assert.equal(planBucket(plan({ status: 'failed' })), 'closed');
  });

  it('tính phần trăm thời gian, ngày còn lại, sắp hết hạn và quá hạn nghiệm thu', () => {
    const mid = computeTimeline(plan(), '2026-10-16');
    assert.equal(mid.totalDays, 30);
    assert.equal(mid.elapsedDays, 15);
    assert.equal(mid.percent, 50);
    assert.equal(mid.remainingDays, 15);
    assert.equal(mid.overdue, false);
    assert.equal(computeTimeline(plan(), '2026-10-27').dueSoon, true);
    const late = computeTimeline(plan(), '2026-11-05');
    assert.equal(late.overdue, true);
    assert.equal(late.percent, 100);
    assert.equal(computeTimeline(plan({ status: 'completed' }), '2026-11-05').overdue, false); // đã nghiệm thu
    const before = computeTimeline(plan(), '2026-09-25');
    assert.equal(before.notStarted, true);
    assert.equal(before.elapsedDays, 0);
  });
});

describe('PIP – mục tiêu và gợi ý nghiệm thu', () => {
  const goals = (...statuses) => statuses.map((status, i) => ({ title: `G${i}`, status }));

  it('đếm mục tiêu theo trạng thái (thiếu status = chưa đánh giá)', () => {
    const s = goalStats([{ title: 'a' }, ...goals('achieved', 'missed', 'achieved')]);
    assert.deepEqual(s, { total: 4, achieved: 2, missed: 1, pending: 1, evaluated: 3, percentAchieved: 50 });
    assert.equal(goalStats(null).total, 0);
  });

  it('chỉ gợi ý kết quả khi mọi mục tiêu đã được đánh giá; ngưỡng đạt 80%', () => {
    assert.equal(suggestOutcome(goals('achieved', 'pending')), null);
    assert.equal(suggestOutcome([]), null);
    assert.equal(suggestOutcome(goals('achieved', 'achieved', 'achieved', 'achieved', 'missed')), 'completed');
    assert.equal(suggestOutcome(goals('achieved', 'missed')), 'failed');
    assert.match(buildOutcomeText(goals('achieved', 'missed'), 'failed'), /^Đạt 1\/2 mục tiêu/);
  });

  it('tổng hợp danh sách: chờ duyệt, đang chạy, quá hạn, tỷ lệ đạt', () => {
    const s = summarizePlans([
      plan({ status: 'proposed' }), plan(), plan({ end_date: '2026-10-02' }),
      plan({ status: 'completed' }), plan({ status: 'completed' }), plan({ status: 'failed' }), plan({ status: 'rejected' }),
    ], '2026-10-10');
    assert.equal(s.proposed, 1);
    assert.equal(s.active, 2);
    assert.equal(s.overdue, 1);
    assert.equal(s.closed, 4);
    assert.equal(s.successRate, 67);
    assert.equal(summarizePlans([]).successRate, null);
  });
});

describe('PIP – căn cứ từ đánh giá 9-Box', () => {
  it('xếp hạng kỳ và lấy đánh giá gần nhất của từng nhân sự', () => {
    assert.ok(periodRank('2026-Q4') > periodRank('2026-Q3'));
    assert.ok(periodRank('2026-FY') > periodRank('2026-Q4'));
    assert.ok(periodRank('2027-Q1') > periodRank('2026-FY'));
    const map = latestReviewByEmployee([
      { employee_id: 'A', period: '2026-Q3', nine_box_cell: 5 },
      { employee_id: 'A', period: '2026-Q4', nine_box_cell: 1 },
      { employee_id: 'B', period: '2026-Q2', nine_box_cell: 2 },
    ]);
    assert.equal(map.get('A').period, '2026-Q4');
    assert.equal(isPipCandidate(map.get('A')), true);
    assert.equal(isPipCandidate({ nine_box_cell: 5 }), false);
    assert.equal(isPipCandidate(null), false);
  });

  it('soạn căn cứ lập PIP từ điểm và nhận xét thật', () => {
    const text = buildReasonFromReview({ period: '2026-Q4', performance_score: '45', potential_score: '50', nine_box_cell: 1, comments: 'Trễ hạn nhiều' });
    assert.match(text, /Quý 4\/2026/);
    assert.match(text, /hiệu suất 45\/100, tiềm năng 50\/100/);
    assert.match(text, /ô 1 "Cần cải thiện \(PIP\)"/);
    assert.match(text, /Trễ hạn nhiều/);
    assert.equal(buildReasonFromReview(null), '');
  });
});

describe('PIP – bản nháp', () => {
  const draft = (extra = {}) => ({
    employeeId: 'NV-1', reason: 'Hiệu suất quý 4 thấp', startDate: '2026-10-01', endDate: '2026-12-30',
    goals: [{ title: 'Giảm lỗi', dueDate: '2026-11-01' }], ...extra,
  });

  it('chia hạn mục tiêu theo các mốc đều nhau', () => {
    assert.deepEqual(checkpointDates('2026-10-01', '2026-12-30', 3), ['2026-10-31', '2026-11-30', '2026-12-30']);
    assert.deepEqual(checkpointDates('2026-10-01', '2026-09-01', 2), []);
  });

  it('báo lỗi các trường bắt buộc và hạn mục tiêu ngoài kỳ', () => {
    assert.deepEqual(validateDraft(draft()), []);
    assert.equal(validateDraft(draft({ employeeId: '' })).length, 1);
    assert.equal(validateDraft(draft({ reason: 'ngắn' })).length, 1);
    assert.equal(validateDraft(draft({ endDate: '2026-09-01' })).length, 1);
    assert.equal(validateDraft(draft({ goals: [{ title: '  ' }] })).length, 1);
    assert.match(validateDraft(draft({ goals: [{ title: 'x', dueDate: '2027-02-01' }] }))[0], /mục tiêu 1/);
  });

  it('làm sạch mục tiêu và escape HTML khi in', () => {
    assert.deepEqual(cleanGoals([{ title: ' A ', metric: '', target: ' 90% ', dueDate: '' }, { title: '' }]), [{ title: 'A', target: '90%' }]);
    assert.equal(escapeHtml('<b>"x" & \'y\'</b>'), '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
  });
});
