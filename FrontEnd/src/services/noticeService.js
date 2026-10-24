// ============================================
// services/noticeService.js — Company Notices & Verified Attachments
// ============================================
import api, { getAccessToken } from './api';

const DEFAULT_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ||
  'http://localhost:8000/api';

// R44: Synchronize file size limits across UI, Nginx proxy (client_max_body_size 10m), and Express (10mb JSON body)
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB raw binary limit
export const MAX_PROXY_BODY_BYTES = 10 * 1024 * 1024; // 10MB Nginx + Express JSON body limit

export function estimateBase64JsonBytes(rawByteLength, fileName = '') {
  const base64Len = Math.ceil(Number(rawByteLength || 0) / 3) * 4;
  const envelopeOverhead = 512 + String(fileName || '').length * 4;
  return base64Len + envelopeOverhead;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const base64 = res.includes(',') ? res.split(',')[1] : res;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Không thể đọc tệp từ máy tính'));
    reader.readAsDataURL(file);
  });
}

const noticeService = {
  MAX_ATTACHMENT_BYTES,
  MAX_PROXY_BODY_BYTES,
  estimateBase64JsonBytes,
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/notices${query ? '?' + query : ''}`);
  },
  getById: (id) => api.get(`/notices/${id}`),
  create: (data) => api.post('/notices', data),
  update: (id, data) => api.put(`/notices/${id}`, data),
  delete: (id) => api.delete(`/notices/${id}`),
  remove: (id) => api.delete(`/notices/${id}`),
  getReaders: (id) => api.get(`/notices/${id}/readers`),
  remindUnread: (id) => api.post(`/notices/${id}/remind`),
  uploadAttachment: async (fileOrPayload) => {
    if (fileOrPayload && typeof fileOrPayload.contentBase64 === 'string') {
      return api.post('/notices/attachments', fileOrPayload);
    }
    const rawSize = Number(fileOrPayload?.size || 0);
    const estimatedBodyBytes = estimateBase64JsonBytes(rawSize, fileOrPayload?.name);
    if (rawSize > MAX_ATTACHMENT_BYTES || estimatedBodyBytes > MAX_PROXY_BODY_BYTES) {
      const err = new Error(
        `Dung lượng tệp vượt quá giới hạn tối đa 5MB (kích thước truyền tải base64 dự kiến ${(estimatedBodyBytes / (1024 * 1024)).toFixed(2)}MB / giới hạn proxy 10MB).`
      );
      err.status = 413;
      err.code = 'ATTACHMENT_TOO_LARGE';
      throw err;
    }
    const contentBase64 = await fileToBase64(fileOrPayload);
    return api.post('/notices/attachments', {
      name: fileOrPayload.name,
      type: fileOrPayload.type || 'application/octet-stream',
      sizeBytes: fileOrPayload.size,
      contentBase64,
    });
  },
  deleteAttachment: (attachmentId) =>
    api.delete(`/notices/attachments/${encodeURIComponent(attachmentId)}`),
  downloadAttachment: async (noticeId, attachmentId) => {
    const token = getAccessToken();
    const url = `${DEFAULT_BASE_URL}/notices/${encodeURIComponent(noticeId)}/attachments/${encodeURIComponent(attachmentId)}/download`;
    const response = await fetch(url, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      let errMsg = `Không thể tải tệp đính kèm (HTTP ${response.status})`;
      try {
        const errJson = await response.json();
        errMsg = errJson.message || errJson.error?.message || errMsg;
      } catch (_e) {}
      const err = new Error(errMsg);
      err.status = response.status;
      throw err;
    }
    const blob = await response.blob();
    const sha256 = response.headers.get('X-Attachment-SHA256') || null;
    return { blob, sha256 };
  },
};

export default noticeService;
