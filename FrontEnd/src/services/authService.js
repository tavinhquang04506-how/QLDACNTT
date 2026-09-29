// ============================================
// services/authService.js — Authentication
// ============================================
import api from './api';

const authService = {
  /**
   * Đăng nhập
   * @param {string} email
   * @param {string} password
   * @returns {{ token, user }}
   */
  async login(email, password) {
    const data = await api.post('/auth/login', { email, password });
    if (data.success && (data.token || data.accessToken)) {
      const token = data.accessToken || data.token;
      localStorage.setItem('nexus_token', token);
      if (data.refreshToken) {
        localStorage.setItem('nexus_refresh_token', data.refreshToken);
      }
      if (data.user) {
        localStorage.setItem('nexus_user', JSON.stringify(data.user));
        if (data.user.roleCode) {
          localStorage.setItem('nexus_role_key', data.user.roleCode);
        }
      }
    }
    return data;
  },

  /**
   * Đăng xuất
   */
  async logout() {
    const refreshToken = localStorage.getItem('nexus_refresh_token');
    if (refreshToken) {
      try {
        await api.post('/auth/logout', { refreshToken });
      } catch (e) {
        console.warn('Logout API warning:', e);
      }
    }
    localStorage.removeItem('nexus_token');
    localStorage.removeItem('nexus_refresh_token');
    localStorage.removeItem('nexus_user');
    localStorage.removeItem('nexus_role_key');
  },

  /**
   * Lấy thông tin user hiện tại từ API
   */
  async getProfile() {
    return api.get('/auth/me');
  },

  /**
   * Đổi mật khẩu
   */
  async changePassword(currentPassword, newPassword) {
    return api.post('/auth/change-password', { currentPassword, newPassword });
  },

  /**
   * Lấy user từ localStorage (không gọi API)
   */
  getStoredUser() {
    const str = localStorage.getItem('nexus_user');
    return str ? JSON.parse(str) : null;
  },

  /**
   * Kiểm tra đã đăng nhập chưa
   */
  isAuthenticated() {
    return !!localStorage.getItem('nexus_token');
  },
};

export default authService;
