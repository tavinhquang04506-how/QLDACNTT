/**
 * Parse TRUST_PROXY for Express `trust proxy`.
 * unset/""/"false" -> false; "1","2" -> hop count; other strings -> subnet/preset list.
 * "true" is refused: it trusts every X-Forwarded-For hop, so clients could spoof their IP
 * and bypass the login rate limiter.
 */
function parseTrustProxy(value) {
  const v = (value || '').trim();
  if (v === '' || v === 'false') return false;
  if (v === 'true') {
    throw new Error('TRUST_PROXY=true is unsafe; set a hop count (e.g. 1) or a subnet list');
  }
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  return v;
}

module.exports = { parseTrustProxy };
