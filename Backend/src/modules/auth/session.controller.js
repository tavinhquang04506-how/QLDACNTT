const bcrypt = require('bcryptjs');
const db = require('../../config/db');
const asyncHandler = require('../../utils/asyncHandler');
const { AppError, notFound } = require('../../utils/AppError');
const { writeAudit } = require('../../utils/audit');
const tokens = require('./tokens');

const refresh = asyncHandler(async (req, res) => {
  const { user, refreshToken } = await tokens.rotateRefreshToken(req.body.refreshToken, req);
  const accessToken = tokens.signAccessToken(user);
  res.json({
    success: true,
    accessToken,
    token: accessToken,
    refreshToken,
    expiresIn: tokens.expiresInSeconds(accessToken),
  });
});

const logout = asyncHandler(async (req, res) => {
  await tokens.revokeRefreshToken(req.body.refreshToken);
  res.json({ success: true, message: 'Đăng xuất thành công' });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.userId]);
  if (rows.length === 0) throw notFound('Không tìm thấy tài khoản');

  if (!(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
    throw new AppError(401, 'WRONG_PASSWORD', 'Mật khẩu hiện tại không chính xác');
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await db.withTransaction(async (client) => {
    await client.query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() WHERE id = $2',
      [newHash, req.user.userId]
    );
    await tokens.revokeAllForUser(client, req.user.userId);
    await writeAudit(client, {
      user: req.user, action: 'CHANGE_PASSWORD', table: 'users', recordId: req.user.userId, req,
    });
  });

  res.json({ success: true, message: 'Đổi mật khẩu thành công' });
});

module.exports = { refresh, logout, changePassword };
