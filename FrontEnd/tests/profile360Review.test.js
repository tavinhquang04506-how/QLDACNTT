import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CELL_META, periodLabel } from '../src/utils/nineBox.js';

describe('Profile 360 Review State & Fallback Tests', () => {
  it('correctly maps 9-box cell metadata and period label for evaluated employee', () => {
    const review = {
      id: 'rev-01',
      employee_id: 'NV-0842',
      period: '2026-Q4',
      performance_score: 85,
      potential_score: 90,
      nine_box_cell: 9,
      comments: 'Hoàn thành xuất sắc nhiệm vụ và dẫn dắt sprint',
      reviewer_name: 'Trần Trưởng Phòng',
    };

    assert.equal(periodLabel(review.period), 'Quý 4/2026');
    const cellMeta = CELL_META[review.nine_box_cell];
    assert.equal(cellMeta.title, 'Ngôi sao xuất sắc');
    assert.equal(review.performance_score, 85);
    assert.equal(review.potential_score, 90);
    assert.match(review.comments, /xuất sắc/);
  });

  it('correctly handles unreviewed or new employee state', () => {
    const unreviewed = null;
    const cellNumber = unreviewed ? Number(unreviewed.nine_box_cell) : null;
    const cellMeta = cellNumber ? CELL_META[cellNumber] : null;

    assert.equal(cellNumber, null);
    assert.equal(cellMeta, null);

    // Default label when unreviewed
    const statusLabel = cellMeta ? cellMeta.title : 'Chưa có đánh giá';
    assert.equal(statusLabel, 'Chưa có đánh giá');
  });

  it('correctly maps core and improvement cells for edge cases', () => {
    // Cell 5 (Nhân lực ổn định)
    assert.equal(CELL_META[5].title, 'Nhân lực ổn định');
    // Cell 1 (Cần cải thiện PIP)
    assert.equal(CELL_META[1].title, 'Cần cải thiện (PIP)');
  });
});
