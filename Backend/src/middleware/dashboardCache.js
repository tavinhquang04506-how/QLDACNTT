// ============================================
// dashboardCache.js — Lightweight In-Memory Caching for Dashboard Metrics
// ============================================

const cacheStore = new Map();
const CACHE_TTL_MS = 15000; // 15 seconds TTL

function dashboardCacheMiddleware(req, res, next) {
  if (process.env.NODE_ENV === 'test') return next();
  if (req.method !== 'GET') return next();

  const key = req.user ? `${req.user.id}:${req.user.roleCode}:${req.scope || ''}` : 'anon';
  const entry = cacheStore.get(key);
  const now = Date.now();
  if (entry && now - entry.time < CACHE_TTL_MS) {
    res.setHeader('X-Cache-Status', 'HIT');
    return res.json(entry.data);
  }

  // Intercept json send to store in cache
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      cacheStore.set(key, { data: body, time: Date.now() });
      res.setHeader('X-Cache-Status', 'MISS');
    }
    return originalJson(body);
  };

  next();
}

function invalidateDashboardCache() {
  cacheStore.clear();
}

module.exports = {
  dashboardCacheMiddleware,
  invalidateDashboardCache,
};
