import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Attendance Calculation and Verification Tests', () => {
  it('validates supported punch methods', () => {
    const validMethods = ['gps', 'manual', 'qr', 'kiosk'];
    assert.ok(validMethods.includes('gps'));
    assert.ok(validMethods.includes('manual'));
    assert.ok(validMethods.includes('qr'));
    assert.ok(validMethods.includes('kiosk'));
    assert.equal(validMethods.includes('face_id'), false);
  });

  it('determines late status based on standard morning shift 08:15 threshold', () => {
    const isLate = (checkInTimeStr) => {
      if (!checkInTimeStr) return false;
      const [hours, minutes] = checkInTimeStr.split(':').map(Number);
      return hours > 8 || (hours === 8 && minutes > 15);
    };

    assert.equal(isLate('08:05'), false);
    assert.equal(isLate('08:15'), false);
    assert.equal(isLate('08:16'), true);
    assert.equal(isLate('09:00'), true);
  });

  it('formats attendance time and date safely without NaN', () => {
    const formatTime = (isoStr) => {
      if (!isoStr) return '--:--';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '--:--';
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    };

    assert.equal(formatTime(null), '--:--');
    assert.equal(formatTime('invalid-date'), '--:--');
  });
});
