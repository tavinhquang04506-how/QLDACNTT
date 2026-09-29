import api from './api';

export const userService = {
  /**
   * Lấy danh mục vai trò và ma trận cấu hình phân quyền RBAC theo vai trò
   */
  getRbacRoles: () => api.get('/settings/rbac-roles'),
  getRbacMatrix: () => api.get('/settings/rbac-roles'),

  /**
   * Tạo mới một Vai trò RBAC tùy chỉnh
   */
  createRbacRole: (payload) => api.post('/settings/rbac-roles', payload),

  /**
   * Cập nhật thông tin nhận diện của một Vai trò RBAC (Tên, Cấp bậc, Màu sắc, Phạm vi, Mô tả)
   */
  updateRbacRoleInfo: (roleCode, payload) =>
    api.patch(`/settings/rbac-roles/${encodeURIComponent(roleCode)}`, payload),

  /**
   * Xóa một Vai trò RBAC khỏi hệ thống
   */
  deleteRbacRole: (roleCode) =>
    api.delete(`/settings/rbac-roles/${encodeURIComponent(roleCode)}`),

  /**
   * Lưu cấu hình phân quyền của 1 vai trò (hoặc toàn bộ ma trận) vào CSDL
   */
  updateRbacRoles: (payload) => api.put('/settings/rbac-roles', payload),
  updateRbacMatrix: (payload) => api.put('/settings/rbac-roles', payload),

  /**
   * Khôi phục cấu hình phân quyền của 1 vai trò (hoặc toàn bộ danh mục gốc) về mặc định chuẩn
   */
  resetRbacRoles: (payload = {}) => api.post('/settings/rbac-roles/reset', payload),
  resetRbacMatrix: (payload = {}) => api.post('/settings/rbac-roles/reset', payload),

  /**
   * Lấy danh sách tài khoản hệ thống kèm thông tin nhân sự & phòng ban
   * @param {Object} params - { search, role, active, page, limit }
   */
  getAll: (params = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.role) query.append('role', params.role);
    if (params.active !== undefined && params.active !== '') {
      query.append('active', String(params.active));
    }
    if (params.page) query.append('page', String(params.page));
    query.append('limit', String(params.limit || 200));
    return api.get(`/users?${query.toString()}`);
  },
  list: (params = {}) => userService.getAll(params),

  /**
   * Lấy thông tin chi tiết 1 tài khoản
   */
  getById: (id) => api.get(`/users/${id}`),

  /**
   * Cấp mới tài khoản đăng nhập cho nhân sự hoặc thiết bị Kiosk / Admin
   * @param {Object} payload - { employeeId?, email, role, password? }
   */
  create: (payload) => api.post('/users', payload),

  /**
   * Cập nhật vai trò (roleCode) hoặc trạng thái kích hoạt (isActive)
   * @param {string} id - UUID tài khoản
   * @param {Object} payload - { role?, isActive? }
   */
  update: (id, payload) => api.patch(`/users/${id}`, payload),

  /**
   * Cấp lại mật khẩu tạm thời (buộc đổi mật khẩu ở lần đăng nhập kế tiếp & thu hồi phiên cũ)
   */
  resetPassword: (id) => api.post(`/users/${id}/reset-password`, {}),

  /**
   * Mở khóa tài khoản bị tạm khóa do nhập sai mật khẩu nhiều lần
   */
  unlock: (id) => api.post(`/users/${id}/unlock`, {}),

  /**
   * Truy vấn nhật ký kiểm toán bảo mật & phân quyền
   * @param {Object} params - { table, action, userId, from, to, page, limit }
   */
  getAuditLogs: (params = {}) => {
    const query = new URLSearchParams();
    if (params.table) query.append('table', params.table);
    if (params.action) query.append('action', params.action);
    if (params.userId) query.append('userId', params.userId);
    if (params.from) query.append('from', params.from);
    if (params.to) query.append('to', params.to);
    if (params.page) query.append('page', String(params.page));
    query.append('limit', String(params.limit || 100));
    return api.get(`/audit-logs?${query.toString()}`);
  },
  listAuditLogs: (params = {}) => userService.getAuditLogs(params),
};

export default userService;
