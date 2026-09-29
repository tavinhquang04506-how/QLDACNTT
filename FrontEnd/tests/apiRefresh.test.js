import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/services/api.js';

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (h) => (String(h).toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test('F21: concurrent 401 requests share a single refresh call and both retry with new token', async () => {
  const storage = createMemoryStorage({
    nexus_token: 'expired-token',
    nexus_refresh_token: 'valid-refresh',
  });
  let refreshCallCount = 0;

  const client = createApiClient({
    baseUrl: 'http://test.local/api',
    storage,
    onUnauthorizedRedirect: () => {},
    fetchImpl: async (url, config) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCallCount += 1;
        await new Promise((r) => setTimeout(r, 20));
        return jsonResponse(200, {
          accessToken: 'fresh-token-123',
          refreshToken: 'fresh-refresh-456',
        });
      }
      if (config.headers.Authorization === 'Bearer expired-token') {
        return jsonResponse(401, { message: 'Token expired' });
      }
      if (config.headers.Authorization === 'Bearer fresh-token-123') {
        return jsonResponse(200, { success: true, url });
      }
      return jsonResponse(500, { message: 'Unexpected auth header' });
    },
  });

  const [r1, r2, r3] = await Promise.all([
    client.get('/dashboard/stats'),
    client.get('/employees'),
    client.get('/notifications'),
  ]);

  assert.equal(refreshCallCount, 1);
  assert.equal(r1.success, true);
  assert.equal(r2.success, true);
  assert.equal(r3.success, true);
  assert.equal(storage.getItem('nexus_token'), 'fresh-token-123');
  assert.equal(storage.getItem('nexus_refresh_token'), 'fresh-refresh-456');
});

test('F21: when refresh fails, all concurrent 401 callers reject (never resolve false-401 object) and session is cleared', async () => {
  const storage = createMemoryStorage({
    nexus_token: 'expired-token',
    nexus_refresh_token: 'revoked-refresh',
    nexus_user: '{"id":"U-1"}',
  });
  let refreshCallCount = 0;
  let redirectCount = 0;

  const client = createApiClient({
    baseUrl: 'http://test.local/api',
    storage,
    onUnauthorizedRedirect: () => {
      redirectCount += 1;
    },
    fetchImpl: async (url) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCallCount += 1;
        await new Promise((r) => setTimeout(r, 20));
        return jsonResponse(401, { message: 'Refresh token revoked' });
      }
      return jsonResponse(401, { message: 'Access token expired' });
    },
  });

  const results = await Promise.allSettled([
    client.get('/dashboard/stats'),
    client.get('/employees'),
  ]);

  assert.equal(refreshCallCount, 1);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[0].reason.status, 401);
  assert.equal(results[1].reason.status, 401);
  assert.equal(results[0].reason.code, 'SESSION_EXPIRED');
  assert.equal(results[1].reason.code, 'SESSION_EXPIRED');
  assert.equal(storage.getItem('nexus_token'), null);
  assert.equal(storage.getItem('nexus_refresh_token'), null);
  assert.equal(storage.getItem('nexus_user'), null);
  assert.ok(redirectCount >= 1);
});
