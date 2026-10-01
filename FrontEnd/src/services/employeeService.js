// ============================================
// services/employeeService.js
// ============================================
import api from './api';

const employeeService = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/employees${query ? '?' + query : ''}`);
  },
  getById: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  offboard: (id, data) => api.post(`/employees/${id}/offboard`, data),
  import: (data) => api.post('/employees/import', data),
  getDepartments: () => api.get('/departments'),
  getPositions: () => api.get('/positions'),
};

export default employeeService;
