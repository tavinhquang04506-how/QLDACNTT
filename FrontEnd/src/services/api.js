// ============================================
// services/api.js — Axios-like Fetch wrapper + JWT + Auto Refresh
// ============================================

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

/**
 * Lấy JWT token từ localStorage
 */
const getToken = () => localStorage.getItem('nexus_token');
const getRefreshToken = () => localStorage.getItem('nexus_refresh_token');

/**
 * Thử refresh token khi gặp 401
 */
let isRefreshing = false;
let refreshSubscribers = [];

function onRefreshed(newToken) {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
}

async function tryRefreshToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const newAccessToken = data.accessToken || data.token;
    if (newAccessToken) {
      localStorage.setItem('nexus_token', newAccessToken);
      if (data.refreshToken) {
        localStorage.setItem('nexus_refresh_token', data.refreshToken);
      }
      return newAccessToken;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Core fetch wrapper với JWT auto-attach & auto-refresh
 */
async function request(endpoint, options = {}, isRetry = false) {
  const url = `${BASE_URL}${endpoint}`;
  const token = getToken();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  // Nếu có body và không phải FormData, stringify
  if (config.body && typeof config.body === 'object' && !isFormData) {
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(url, config);

    // Đọc body stream một lần duy nhất
    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json().catch(() => ({})) : await response.text().catch(() => '');

    // Token hết hạn → cố gắng refresh token một lần
    if (response.status === 401 && !isRetry && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
      if (!isRefreshing) {
        isRefreshing = true;
        const newToken = await tryRefreshToken();
        isRefreshing = false;

        if (newToken) {
          onRefreshed(newToken);
          return request(endpoint, options, true);
        } else {
          localStorage.removeItem('nexus_token');
          localStorage.removeItem('nexus_refresh_token');
          localStorage.removeItem('nexus_user');
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
          return { success: false, status: 401, message: 'Phiên làm việc đã hết hạn' };
        }
      } else {
        // Đợi refresh hoàn tất rồi retry
        return new Promise((resolve) => {
          refreshSubscribers.push((newToken) => {
            if (newToken) {
              resolve(request(endpoint, options, true));
            } else {
              resolve({ success: false, status: 401, message: 'Phiên làm việc đã hết hạn' });
            }
          });
        });
      }
    }

    if (!response.ok) {
      const errObj = typeof data === 'object' ? data : { message: data };
      throw { success: false, status: response.status, ...errObj, message: errObj.message || `Lỗi HTTP ${response.status}` };
    }

    return data;
  } catch (error) {
    if (error && error.status) throw error; // API error — re-throw
    console.error(`❌ API Error [${endpoint}]:`, error);
    throw { success: false, message: error?.message || 'Không thể kết nối server' };
  }
}

// Convenience methods
const api = {
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body }),
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body }),
  patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
};

export default api;
