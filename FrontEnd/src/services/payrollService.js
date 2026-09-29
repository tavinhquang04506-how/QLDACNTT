// ============================================
// services/payrollService.js
// ============================================
import api from './api';

const payrollService = {
  getPeriods: () => api.get('/payroll/periods'),
  getPeriodById: (id) => api.get(`/payroll/periods/${id}`),
  getPayslips: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/payroll/payslips${query ? '?' + query : ''}`);
  },
  getMyPayslips: () => api.get('/payroll/me'),
  calculate: (period) => api.post('/payroll/calculate', { period }),
  getAnomalies: (id) => api.get(`/payroll/periods/${id}/anomalies`),
  updatePayslip: (id, data) => api.put(`/payroll/payslips/${id}`, data),
  getBankTransfer: (id) => api.get(`/payroll/periods/${id}/bank-transfer`),
  lockPeriod: (id, acknowledgeAnomalies = true) =>
    api.post(`/payroll/periods/${id}/lock`, { acknowledgeAnomalies }),
  transferPeriod: (id) => api.post(`/payroll/periods/${id}/transfer`),
};

export default payrollService;
