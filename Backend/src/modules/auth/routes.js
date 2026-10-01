// ============================================
// routes/auth.js — Authentication API
// ============================================
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../config/db');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const tokens = require('./tokens');
const session = require('./session.controller');
const { refreshBody, changePasswordBody } = require('./schema');

const router = express.Router();

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Response: { success, token, user }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập email và mật khẩu',
      });
    }

    // 1. Tìm user + employee info
    const { rows } = await db.query(`
      SELECT 
        u.id AS user_id,
        u.email,
        u.password_hash,
        u.role_code,
        u.is_active,
        u.failed_login_attempts,
        u.must_change_password,
        u.locked_until,
        e.id AS employee_id,
        e.full_name,
        e.job_title,
        e.avatar_url,
        e.phone_number,
        e.base_salary,
        e.kpi_score,
        e.attendance_rate,
        e.status AS employee_status,
        d.id AS department_id,
        d.name AS department_name,
        p.name AS position_name
      FROM users u
      LEFT JOIN employees e ON u.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN positions p ON e.position_id = p.id
      WHERE LOWER(u.email) = LOWER($1)
    `, [email]);

    // 2. Email không tồn tại
    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không chính xác',
      });
    }

    const user = rows[0];

    // 3. Kiểm tra tài khoản bị khóa
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(423).json({
        success: false,
        message: `Tài khoản đã bị khóa. Vui lòng thử lại sau ${remaining} phút`,
      });
    }

    // 4. Kiểm tra tài khoản active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản đã bị vô hiệu hóa',
      });
    }

    // 5. Kiểm tra mật khẩu
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      // Tăng failed_login_attempts
      const newAttempts = (user.failed_login_attempts || 0) + 1;
      const lockUntil = newAttempts >= 5
        ? new Date(Date.now() + 15 * 60 * 1000) // Khóa 15 phút sau 5 lần sai
        : null;

      await db.query(
        'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
        [newAttempts, lockUntil, user.user_id]
      );

      const remaining = 5 - newAttempts;
      return res.status(401).json({
        success: false,
        message: remaining > 0
          ? `Email hoặc mật khẩu không chính xác. Còn ${remaining} lần thử`
          : 'Tài khoản đã bị khóa 15 phút do nhập sai quá 5 lần',
      });
    }

    // 6. Login thành công → Reset failed attempts, cập nhật last_login
    await db.query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1',
      [user.user_id]
    );

    // 7. Tạo access token + refresh token
    const accessToken = tokens.signAccessToken(user);
    const { token: refreshToken } = await tokens.issueRefreshToken(db, user.user_id, req);

    // 8. Trả response (KHÔNG bao giờ trả password_hash)
    return res.json({
      success: true,
      message: 'Đăng nhập thành công',
      token: accessToken, // legacy field, same as accessToken
      accessToken,
      refreshToken,
      expiresIn: tokens.expiresInSeconds(accessToken),
      mustChangePassword: user.must_change_password,
      user: {
        id: user.user_id,
        employeeId: user.employee_id,
        email: user.email,
        roleCode: user.role_code,
        fullName: user.full_name,
        jobTitle: user.job_title,
        avatarUrl: user.avatar_url,
        phoneNumber: user.phone_number,
        departmentId: user.department_id,
        departmentName: user.department_name,
        positionName: user.position_name,
        kpiScore: user.kpi_score,
        attendanceRate: user.attendance_rate,
      },
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi đăng nhập',
    });
  }
});

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>
 * Response: Thông tin user hiện tại (đã đăng nhập)
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        u.id AS user_id,
        u.email,
        u.role_code,
        u.last_login_at,
        e.id AS employee_id,
        e.full_name,
        e.job_title,
        e.avatar_url,
        e.phone_number,
        e.base_salary,
        e.kpi_score,
        e.attendance_rate,
        e.status,
        e.joined_date,
        e.citizen_id,
        e.date_of_birth,
        e.gender,
        e.address,
        e.bank_account,
        e.bank_name,
        e.contract_type,
        d.id AS department_id,
        d.name AS department_name,
        p.name AS position_name
      FROM users u
      LEFT JOIN employees e ON u.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN positions p ON e.position_id = p.id
      WHERE u.id = $1
    `, [req.user.userId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    }

    const u = rows[0];
    return res.json({
      success: true,
      user: {
        id: u.user_id,
        employeeId: u.employee_id,
        email: u.email,
        roleCode: u.role_code,
        fullName: u.full_name,
        jobTitle: u.job_title,
        avatarUrl: u.avatar_url,
        phoneNumber: u.phone_number,
        departmentId: u.department_id,
        departmentName: u.department_name,
        positionName: u.position_name,
        kpiScore: u.kpi_score,
        attendanceRate: u.attendance_rate,
        baseSalary: u.base_salary,
        status: u.status,
        joinedDate: u.joined_date,
        citizenId: u.citizen_id,
        dateOfBirth: u.date_of_birth,
        gender: u.gender,
        address: u.address,
        bankAccount: u.bank_account,
        bankName: u.bank_name,
        contractType: u.contract_type,
        lastLoginAt: u.last_login_at,
      },
    });
  } catch (error) {
    console.error('❌ Get profile error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

router.post('/refresh', validate({ body: refreshBody }), session.refresh);
router.post('/logout', validate({ body: refreshBody }), session.logout);
router.post('/change-password', authenticate, validate({ body: changePasswordBody }), session.changePassword);

module.exports = router;
