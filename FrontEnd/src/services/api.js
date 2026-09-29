// ============================================
// services/api.js — Fetch wrapper + JWT + Single-flight Auto Refresh (F21)
// ============================================

const DEFAULT_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ||
  'http://localhost:8000/api';

export function createApiClient({
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = (...args) => fetch(...args),
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  onUnauthorizedRedirect = () => {
    if (typeof window !== 'undefined' && window.location && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  },
} = {}) {
  const getToken = () => storage?.getItem('nexus_token') || null;
  const getRefreshToken = () => storage?.getItem('nexus_refresh_token') || null;

  let refreshPromise = null;

  function clearSession() {
    if (!storage) return;
    storage.removeItem('nexus_token');
    storage.removeItem('nexus_refresh_token');
    storage.removeItem('nexus_user');
    storage.removeItem('nexus_role_key');
  }

  async function performRefresh() {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    try {
      const res = await fetchImpl(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) return null;

      const data = await res.json().catch(() => ({}));
      const newAccessToken = data.accessToken || data.token;
      if (newAccessToken) {
        storage?.setItem('nexus_token', newAccessToken);
        if (data.refreshToken) {
          storage?.setItem('nexus_refresh_token', data.refreshToken);
        }
        return newAccessToken;
      }
      return null;
    } catch {
      return null;
    }
  }

  function refreshTokenOnce() {
    if (!refreshPromise) {
      refreshPromise = performRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }

  async function request(endpoint, options = {}, isRetry = false) {
    const url = `${baseUrl}${endpoint}`;
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

    if (config.body && typeof config.body === 'object' && !isFormData) {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetchImpl(url, config);

      const contentType = response.headers?.get?.('content-type') || '';
      const isJson = contentType.includes('application/json');
      const data = isJson
        ? await response.json().catch(() => ({}))
        : await response.text().catch(() => '');

      // Token hết hạn → dùng single-flight refreshPromise cho mọi request 401 đồng thời
      if (
        response.status === 401 &&
        !isRetry &&
        !endpoint.includes('/auth/login') &&
        !endpoint.includes('/auth/refresh')
      ) {
        const newToken = await refreshTokenOnce();
        if (newToken) {
          return request(endpoint, options, true);
        }

        clearSession();
        onUnauthorizedRedirect();
        throw {
          success: false,
          status: 401,
          code: 'SESSION_EXPIRED',
          message: 'Phiên làm việc đã hết hạn, vui lòng đăng nhập lại',
        };
      }

      if (!response.ok) {
        const errObj = typeof data === 'object' && data !== null ? data : { message: String(data || '') };
        throw {
          success: false,
          status: response.status,
          ...errObj,
          message: errObj.message || `Lỗi HTTP ${response.status}`,
        };
      }

      return data;
    } catch (error) {
      if (error && error.status) throw error;
      throw {
        success: false,
        status: 0,
        code: 'NETWORK_ERROR',
        message: error?.message || 'Không thể kết nối máy chủ',
      };
    }
  }

  return {
    request,
    get: (endpoint, options = {}) => request(endpoint, { ...options, method: 'GET' }),
    post: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'POST', body }),
    put: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PUT', body }),
    patch: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PATCH', body }),
    delete: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),
  };
}

const api = createApiClient();

export default api;
