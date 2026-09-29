const test = require('node:test');
const assert = require('node:assert/strict');
const noticesService = require('../../src/modules/notices/service');
const notificationsService = require('../../src/modules/notifications/service');
const db = require('../../src/config/db');

test('Notices Upgrade: attachments column exists and getReaders works', async () => {
  // Query real CEO user from database
  const ceoUser = (await db.query("SELECT u.id AS user_id, u.role_code, u.employee_id, u.email FROM users u WHERE u.role_code = 'CEO' LIMIT 1")).rows[0];
  assert.ok(ceoUser, 'CEO user must exist in users table');

  const actor = {
    userId: ceoUser.user_id,
    roleCode: ceoUser.role_code,
    employeeId: ceoUser.employee_id,
    email: ceoUser.email
  };

  // 1. Create notice with attachments
  const sampleNotice = await noticesService.create(actor, {
    title: 'Quyết định kiểm thử hệ thống thông báo 2026',
    content: 'Nội dung văn bản chỉ đạo kiểm thử có tệp đính kèm.',
    category: 'policy',
    priority: 'normal',
    isPinned: true,
    attachments: [
      {
        id: 'att-1',
        name: 'Quy_dinh_2026.pdf',
        size: '1.2 MB',
        type: 'application/pdf',
        url: 'https://example.com/files/quy_dinh.pdf'
      }
    ]
  }, { ip: '127.0.0.1' });

  assert.ok(sampleNotice.id, 'Notice should have an ID');
  assert.ok(Array.isArray(sampleNotice.attachments), 'Notice attachments should be an array');
  assert.equal(sampleNotice.attachments.length, 1);
  assert.equal(sampleNotice.attachments[0].name, 'Quy_dinh_2026.pdf');

  // 2. Test getReaders
  const readersReport = await noticesService.getReaders(actor, sampleNotice.id);
  assert.equal(readersReport.noticeId, sampleNotice.id);
  assert.ok(readersReport.totalTargeted >= 1, 'Should have targeted active employees');
  assert.ok(Array.isArray(readersReport.readers));
  assert.ok(Array.isArray(readersReport.unread));

  // 3. Test update notice attachments
  const updatedNotice = await noticesService.update(actor, sampleNotice.id, {
    title: 'Quyết định kiểm thử hệ thống thông báo 2026 (Đã cập nhật)',
    attachments: [
      {
        id: 'att-2',
        name: 'Phu_luc_01.docx',
        size: '450 KB',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        url: 'https://example.com/files/phu_luc.docx'
      }
    ]
  }, { ip: '127.0.0.1' });

  assert.equal(updatedNotice.attachments[0].name, 'Phu_luc_01.docx');

  // 4. Test notifications clearRead
  const clearRes = await notificationsService.clearRead(actor);
  assert.ok(typeof clearRes.deletedCount === 'number');

  // 5. Cleanup test notice
  await noticesService.remove(actor, sampleNotice.id, { ip: '127.0.0.1' });
  console.log('✅ Notices upgrade & read receipts backend tests passed 100%!');
  process.exit(0);
});
