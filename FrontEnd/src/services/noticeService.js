// ============================================
// services/noticeService.js — Company Notices
// ============================================
import api from './api';

const noticeService = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/notices${query ? '?' + query : ''}`);
  },
  getById: (id) => api.get(`/notices/${id}`),
  create: (data) => api.post('/notices', data),
  update: (id, data) => api.put(`/notices/${id}`, data),
  delete: (id) => api.delete(`/notices/${id}`),
  remove: (id) => api.delete(`/notices/${id}`),
  getReaders: (id) => api.get(`/notices/${id}/readers`),
  remindUnread: (id) => api.post(`/notices/${id}/remind`),
};

export default noticeService;
