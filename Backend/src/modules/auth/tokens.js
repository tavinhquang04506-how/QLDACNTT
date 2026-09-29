const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const db = require('../../config/db');
const { AppError } = require('../../utils/AppError');

const REFRESH_TTL_DAYS = 7;

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

/** `user` uses the snake_case column names selected by the login/refresh queries. */
function signAccessToken(user) {
  return jwt.sign(
    { userId: user.user_id, employeeId: user.employee_id, roleCode: user.role_code, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

function expiresInSeconds(accessToken) {
  const claims = jwt.decode(accessToken);
  return claims.exp - claims.iat;
}

/** Create and persist a refresh token; only its hash is stored. */
async function issueRefreshToken(executor, userId, req, familyId = crypto.randomUUID()) {
  const token = crypto.randomBytes(48).toString('base64url');
  const { rows } = await executor.query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, NOW() + ($4 || ' days')::interval, $5, $6) RETURNING id`,
    [
      userId,
      familyId,
      hashToken(token),
      String(REFRESH_TTL_DAYS),
      req?.ip ? String(req.ip).slice(0, 45) : null,
      req?.headers?.['user-agent'] ?? null,
    ]
  );
  return { token, familyId, id: rows[0].id };
}

const invalid = () => new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token không hợp lệ hoặc đã hết hạn');

/**
 * Exchange a refresh token for a new one (rotation). Replaying an already-rotated
 * token revokes the whole family so a stolen token cannot be used silently.
 */
async function rotateRefreshToken(rawToken, req) {
  const outcome = await db.withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT rt.id, rt.user_id, rt.family_id, rt.expires_at, rt.revoked_at,
              u.employee_id, u.role_code, u.email, u.is_active, u.locked_until
         FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = $1 FOR UPDATE OF rt`,
      [hashToken(rawToken)]
    );
    const row = rows[0];
    if (!row) return { error: invalid() };

    if (row.revoked_at) {
      await client.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL',
        [row.family_id]
      );
      return { error: new AppError(401, 'REFRESH_TOKEN_REUSED', 'Phiên đăng nhập không còn hợp lệ, vui lòng đăng nhập lại') };
    }
    if (new Date(row.expires_at) <= new Date()) return { error: invalid() };
    if (!row.is_active || (row.locked_until && new Date(row.locked_until) > new Date())) {
      return { error: new AppError(401, 'ACCOUNT_DISABLED', 'Tài khoản đã bị khóa hoặc vô hiệu hóa') };
    }

    const next = await issueRefreshToken(client, row.user_id, req, row.family_id);
    await client.query('UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = $2 WHERE id = $1', [row.id, next.id]);
    return {
      user: { user_id: row.user_id, employee_id: row.employee_id, role_code: row.role_code, email: row.email },
      refreshToken: next.token,
    };
  });

  // Throw after COMMIT so the family revocation above is persisted.
  if (outcome.error) throw outcome.error;
  return outcome;
}

async function revokeRefreshToken(rawToken) {
  const { rowCount } = await db.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashToken(rawToken)]
  );
  return rowCount > 0;
}

async function revokeAllForUser(executor, userId) {
  await executor.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

module.exports = {
  hashToken, signAccessToken, expiresInSeconds, issueRefreshToken,
  rotateRefreshToken, revokeRefreshToken, revokeAllForUser,
};
