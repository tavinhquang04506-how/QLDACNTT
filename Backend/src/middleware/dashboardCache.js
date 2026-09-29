// ============================================
// dashboardCache.js — Scoped In-Memory Caching for Dashboard Metrics (F01)
// ============================================

const cacheStore = new Map();
const CACHE_TTL_MS = 15000; // 15 seconds TTL

function buildDashboardCacheKey(req) {
  if (!req || !req.user) return null;
  const userId = req.user.userId || req.user.id || '';
  const employeeId = req.user.employeeId || req.user.employee_id || '';
  const roleCode = req.user.roleCode || req.user.role || '';
  const scope = req.scope || '';
  if (!userId && !employeeId) return null;

  const queryEntries = Object.entries(req.query || {})
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('&');

  const routePath = `${req.baseUrl || ''}${req.path || ''}`;
  return `dashboard:${userId}:${employeeId}:${roleCode}:${scope}:${routePath}?${queryEntries}`;
}

function createDashboardCacheMiddleware(options = {}) {
  const ttlMs = options.ttlMs ?? CACHE_TTL_MS;
  const forceEnable = Boolean(options.enabled);

  return function dashboardCacheMiddleware(req, res, next) {
    const testEnabled =
      forceEnable ||
      process.env.ENABLE_DASHBOARD_CACHE_IN_TEST === 'true' ||
      (req.headers && req.headers['x-enable-cache'] === '1');

    if (process.env.NODE_ENV === 'test' && !testEnabled) {
      return next();
    }
    if (req.method !== 'GET') return next();

    const key = buildDashboardCacheKey(req);
    if (!key) return next();

    const entry = cacheStore.get(key);
    const now = Date.now();
    if (entry && now - entry.time < ttlMs) {
      if (typeof res.setHeader === 'function') {
        res.setHeader('X-Cache-Status', 'HIT');
        res.setHeader('X-Cache', 'HIT');
      }
      return res.json(entry.data);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const status = res.statusCode || 200;
      if (status >= 200 && status < 300) {
        cacheStore.set(key, { data: body, time: Date.now() });
        if (typeof res.setHeader === 'function') {
          res.setHeader('X-Cache-Status', 'MISS');
          res.setHeader('X-Cache', 'MISS');
        }
      }
      return originalJson(body);
    };

    return next();
  };
}

const dashboardCacheMiddleware = createDashboardCacheMiddleware();

function invalidateDashboardCache() {
  cacheStore.clear();
}

module.exports = {
  CACHE_TTL_MS,
  buildDashboardCacheKey,
  buildCacheKey: buildDashboardCacheKey,
  createDashboardCacheMiddleware,
  dashboardCacheMiddleware,
  invalidateDashboardCache,
  clearDashboardCache: invalidateDashboardCache,
};
