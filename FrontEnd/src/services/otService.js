// ============================================
// services/otService.js — Overtime Requests
// ============================================
import api from './api';

const otService = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/ot-requests${query ? '?' + query : ''}`);
  },
  getById: (id) => api.get(`/ot-requests/${id}`),
  create: (data) => api.post('/ot-requests', data),
  approve: (id, note = '') => api.patch(`/ot-requests/${id}/approve`, { note }),
  reject: (id, note = '') => api.patch(`/ot-requests/${id}/reject`, { note }),
  cancel: (id) => api.patch(`/ot-requests/${id}/cancel`, {}),
};

export default otService;
