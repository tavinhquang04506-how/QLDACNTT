// ============================================
// services/contractService.js — Contracts
// ============================================
import api from './api';

const contractService = {
  getByEmployeeId: (employeeId) => api.get(`/employees/${employeeId}/contracts`),
  create: (employeeId, data) => api.post(`/employees/${employeeId}/contracts`, data),
  getById: (id) => api.get(`/contracts/${id}`),
  update: (id, data) => api.put(`/contracts/${id}`, data),
  activate: (id) => api.post(`/contracts/${id}/activate`),
  terminate: (id, data) => api.post(`/contracts/${id}/terminate`, data),
};

export default contractService;
