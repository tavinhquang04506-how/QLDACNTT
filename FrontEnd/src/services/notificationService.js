// ============================================
// services/notificationService.js
// ============================================
import api from './api';

const notificationService = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/notifications${query ? '?' + query : ''}`);
  },
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.patch(`/notifications/${id}/read`, {}),
  markAllAsRead: () => api.post('/notifications/read-all', {}),
  delete: (id) => api.delete(`/notifications/${id}`),
  remove: (id) => api.delete(`/notifications/${id}`),
  clearRead: () => api.post('/notifications/clear-read', {}),
};

export default notificationService;
