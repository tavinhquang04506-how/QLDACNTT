// ============================================
// services/payrollService.js
// ============================================
import api from './api';
import { fetchAllPayslipsForPeriod } from '../utils/payrollPeriodState';

const payrollService = {
  getPeriods: () => api.get('/payroll/periods'),
  getPeriodById: (id) => api.get(`/payroll/periods/${id}`),
  getPayslips: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/payroll/payslips${query ? '?' + query : ''}`);
  },
  getAllPayslipsForPeriod: (period, pageSize = 500, extraParams = {}) =>
    fetchAllPayslipsForPeriod(payrollService.getPayslips, {
      period,
      pageSize,
      extraParams,
    }),
  getMyPayslips: () => api.get('/payroll/me'),
  calculate: (period, options = {}) =>
    api.post('/payroll/calculate', {
      period,
      ...(options && typeof options === 'object' ? options : {}),
    }),
  getAnomalies: (id) => api.get(`/payroll/periods/${id}/anomalies`),
  updatePayslip: (id, data) => api.put(`/payroll/payslips/${id}`, data),
  getBankTransfer: (id) => api.get(`/payroll/periods/${id}/bank-transfer`),
  lockPeriod: (id, acknowledgeAnomalies = false, extra = {}) =>
    api.post(`/payroll/periods/${id}/lock`, {
      acknowledgeAnomalies: Boolean(acknowledgeAnomalies),
      ...(extra && typeof extra === 'object' ? extra : {}),
    }),
  transferPeriod: (id) => api.post(`/payroll/periods/${id}/transfer`),
};

export default payrollService;
