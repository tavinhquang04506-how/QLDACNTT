// ============================================
// services/analyticsService.js
// ============================================
import api from './api';

const analyticsService = {
  getSummary: () => api.get('/analytics/summary'),
  getNineBox: () => api.get('/analytics/nine-box'),
  getDepartmentScores: () => api.get('/analytics/department-scores'),
  getTurnoverRisk: (empIdOrParams, maybeParams = {}) => {
    if (typeof empIdOrParams === 'string' && empIdOrParams) {
      const q = new URLSearchParams(maybeParams).toString();
      return api.get(`/analytics/turnover-risk/${empIdOrParams}${q ? '?' + q : ''}`);
    }
    const params = typeof empIdOrParams === 'object' && empIdOrParams !== null ? empIdOrParams : maybeParams;
    const q = new URLSearchParams(params).toString();
    return api.get(`/analytics/turnover-risk${q ? '?' + q : ''}`);
  },
  getPip: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/analytics/pip${query ? '?' + query : ''}`);
  },
  getPipById: (id) => api.get(`/analytics/pip/${id}`),
  createPip: (data) => api.post('/analytics/pip', data),
  updatePip: (id, data) => api.put(`/analytics/pip/${id}`, data),
  /** HR/CEO: { decision: 'approve' | 'reject', note?, startDate?, endDate? } */
  decidePip: (id, data) => api.post(`/analytics/pip/${id}/decision`, data),
  /** Trưởng phòng / HR: goals = [{ status: 'pending' | 'achieved' | 'missed', note? }] theo đúng thứ tự mục tiêu */
  updatePipProgress: (id, goals) => api.patch(`/analytics/pip/${id}/progress`, { goals }),
  getReviews: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/analytics/reviews${query ? '?' + query : ''}`);
  },
  createReview: (data) => api.post('/analytics/reviews', data),
  updateReview: (id, data) => api.put(`/analytics/reviews/${id}`, data),
};

export default analyticsService;
