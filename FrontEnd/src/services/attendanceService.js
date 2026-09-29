// ============================================
// services/attendanceService.js
// ============================================
import api from './api';

const attendanceService = {
  getKioskCode: () => api.get('/attendance/kiosk-code'),
  checkIn: (data = {}) => {
    return api.post('/attendance/check-in', {
      method: data.method || 'code_gps',
      code: data.code || undefined,
      gpsLat: data.gpsLat ?? null,
      gpsLng: data.gpsLng ?? null,
      address: data.address || null,
      accuracy: data.accuracy || null,
    });
  },
  checkOut: (data = {}) => {
    return api.post('/attendance/check-out', {
      method: data.method || 'code_gps',
      code: data.code || undefined,
      gpsLat: data.gpsLat ?? null,
      gpsLng: data.gpsLng ?? null,
      address: data.address || null,
      accuracy: data.accuracy || null,
    });
  },
  punch: (data = {}) => {
    const { type, ...rest } = data;
    const payload = {
      method: rest.method || 'code_gps',
      code: rest.code || undefined,
      gpsLat: rest.gpsLat ?? null,
      gpsLng: rest.gpsLng ?? null,
      address: rest.address || null,
      accuracy: rest.accuracy || null,
    };
    return type === 'check_out'
      ? api.post('/attendance/check-out', payload)
      : api.post('/attendance/check-in', payload);
  },
  kioskPunch: (data) => {
    const payload = typeof data === 'string' ? { qrToken: data } : data?.qrToken ? data : { qrToken: data?.code || data?.token || 'KIOSK-TOKEN' };
    return api.post('/attendance/kiosk/punch', payload);
  },
  getMyToday: () => api.get('/attendance/me/today'),
  getQr: () => api.get('/attendance/qr'),
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/attendance${query ? '?' + query : ''}`);
  },
  getLogs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/attendance${query ? '?' + query : ''}`);
  },
  getTimesheet: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/attendance/timesheet${query ? '?' + query : ''}`);
  },
  getExceptions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/attendance/exceptions${query ? '?' + query : ''}`);
  },
  getLive: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/attendance/live${query ? '?' + query : ''}`);
  },
  adjust: (data) => api.post('/attendance/adjust', data),
};

export default attendanceService;
