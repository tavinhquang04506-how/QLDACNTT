// ============================================
// services/dashboardService.js
// ============================================
import api from './api';

const dashboardService = {
  getStats: () => api.get('/dashboard/stats'),
  getNotifications: () => api.get('/dashboard/notifications'),
  getDepartments: () => api.get('/departments'),
};

export default dashboardService;
