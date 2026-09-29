// ============================================
// services/projectService.js
// ============================================
import api from './api';

const projectService = {
  getAll: () => api.get('/projects'),
  getById: (id) => api.get(`/projects/${id}`),
  createProject: (data) => api.post('/projects', data),
  updateProject: (id, data) => api.put(`/projects/${id}`, data),
  deleteProject: (id) => api.delete(`/projects/${id}`),
  getTasks: (projectId) => api.get(`/projects/${projectId}/tasks`),
  createTask: (projectId, data) => api.post(`/projects/${projectId}/tasks`, data),
  updateTask: (taskId, data) => api.put(`/tasks/${taskId}`, data),
  updateTaskStage: (taskId, stage, note) =>
    api.patch(`/tasks/${taskId}/stage`, { stage, note }),
  reviewTask: (taskId, approved, note) => {
    const decision = typeof approved === 'string' ? approved : approved ? 'accept' : 'reject';
    return api.post(`/tasks/${taskId}/review`, { decision, note: note || '' });
  },
  getTaskLogs: (taskId) => api.get(`/tasks/${taskId}/logs`),
  getSquads: () => api.get('/squads'),
  createSquad: (data) => api.post('/squads', data),
  updateSquad: (id, data) => api.put(`/squads/${id}`, data),
  deleteSquad: (id) => api.delete(`/squads/${id}`),
  addSquadMember: (squadId, employeeId) =>
    api.post(`/squads/${squadId}/members`, { employeeId }),
  removeSquadMember: (squadId, employeeId) =>
    api.delete(`/squads/${squadId}/members/${employeeId}`),
  getSquadMessages: (squadId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/squads/${squadId}/messages${query ? '?' + query : ''}`);
  },
  sendSquadMessage: (squadId, message) => {
    const payload = typeof message === 'object' ? message : { content: message };
    return api.post(`/squads/${squadId}/messages`, payload);
  },
  clearSquadMessages: (squadId) => api.delete(`/squads/${squadId}/messages`),
  leaveSquad: (squadId) => api.post(`/squads/${squadId}/leave`),
  rejoinSquad: (squadId) => api.post(`/squads/${squadId}/rejoin`),
};


export default projectService;
