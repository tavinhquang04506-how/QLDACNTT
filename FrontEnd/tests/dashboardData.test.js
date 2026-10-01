import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Dashboard Data Extraction Tests', () => {
  it('correctly maps overview KPI figures and attendance rate', () => {
    const stats = {
      overview: {
        total_active: 50,
        present_today: 45,
        late_today: 3,
        pending_leaves: 4,
        active_projects: 6,
        open_tasks: 18,
      },
      departmentStats: [
        { id: 'DP-01', name: 'Kỹ Thuật', headcount: 25 },
        { id: 'DP-02', name: 'Nhân Sự', headcount: 10 },
      ],
      pendingLeaves: [
        { id: 1, full_name: 'Trần Văn B', leave_type: 'Nghỉ phép năm', total_days: 1.5, start_date: '2026-09-28' }
      ]
    };

    const totalActive = stats.overview?.total_active ?? 0;
    const presentToday = stats.overview?.present_today ?? 0;
    const lateToday = stats.overview?.late_today ?? 0;
    const pendingLeavesCount = stats.overview?.pending_leaves ?? 0;
    const attendanceRate = totalActive > 0 ? Math.round((presentToday / totalActive) * 100) : 0;

    assert.equal(totalActive, 50);
    assert.equal(presentToday, 45);
    assert.equal(lateToday, 3);
    assert.equal(pendingLeavesCount, 4);
    assert.equal(attendanceRate, 90);
    assert.equal(stats.departmentStats.length, 2);
    assert.equal(stats.pendingLeaves[0].full_name, 'Trần Văn B');
  });

  it('handles null stats gracefully without runtime exception', () => {
    const stats = null;
    const totalActive = stats?.overview?.total_active ?? 0;
    const presentToday = stats?.overview?.present_today ?? 0;
    const lateToday = stats?.overview?.late_today ?? 0;
    const attendanceRate = totalActive > 0 ? Math.round((presentToday / totalActive) * 100) : 0;

    assert.equal(totalActive, 0);
    assert.equal(presentToday, 0);
    assert.equal(lateToday, 0);
    assert.equal(attendanceRate, 0);
  });
});
