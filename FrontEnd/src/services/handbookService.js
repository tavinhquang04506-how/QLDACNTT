// ============================================
// services/handbookService.js — Company Handbook
// ============================================
import api from './api';

const handbookService = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/handbook${query ? '?' + query : ''}`);
  },
  getCategories: () => api.get('/handbook/categories'),
  getById: (id) => api.get(`/handbook/${id}`),
  create: (data) => api.post('/handbook', data),
  update: (id, data) => api.put(`/handbook/${id}`, data),
  delete: (id) => api.delete(`/handbook/${id}`),
};

export default handbookService;
