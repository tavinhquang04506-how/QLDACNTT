// ============================================
// services/leaveService.js
// ============================================
import api from './api';

const leaveService = {
  submit: (data) => api.post('/leaves', data),
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/leaves${query ? '?' + query : ''}`);
  },
  getTypes: () => api.get('/leaves/types'),
  getBalances: (empId = 'me') => api.get(`/leaves/balances/${empId}`),
  approve: (id, note) => api.patch(`/leaves/${id}/approve`, { note }),
  reject: (id, note) => api.patch(`/leaves/${id}/reject`, { note }),
  cancel: (id) => api.patch(`/leaves/${id}/cancel`, {}),
};

export default leaveService;
