const { z } = require('zod');

const refreshBody = z.object({
  refreshToken: z.string({ required_error: 'Thiếu refresh token' }).min(1, 'Thiếu refresh token'),
});

const passwordRule = z
  .string({ required_error: 'Vui lòng nhập mật khẩu mới' })
  .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
  .regex(/[A-Za-z]/, 'Mật khẩu phải chứa ít nhất một chữ cái')
  .regex(/\d/, 'Mật khẩu phải chứa ít nhất một chữ số');

const changePasswordBody = z.object({
  currentPassword: z.string({ required_error: 'Vui lòng nhập mật khẩu hiện tại' }).min(1, 'Vui lòng nhập mật khẩu hiện tại'),
  newPassword: passwordRule,
});

module.exports = { refreshBody, changePasswordBody, passwordRule };
