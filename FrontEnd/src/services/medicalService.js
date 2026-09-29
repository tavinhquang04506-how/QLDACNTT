// ============================================
// services/medicalService.js — Medical Claims
// ============================================
import api from './api';

const medicalService = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/medical-claims${query ? '?' + query : ''}`);
  },
  getById: (id) => api.get(`/medical-claims/${id}`),
  create: (data) => api.post('/medical-claims', data),
  approve: (id, note = '') => api.patch(`/medical-claims/${id}/approve`, { note }),
  reject: (id, note = '') => api.patch(`/medical-claims/${id}/reject`, { note }),
  cancel: (id) => api.patch(`/medical-claims/${id}/cancel`, {}),
};

export default medicalService;
