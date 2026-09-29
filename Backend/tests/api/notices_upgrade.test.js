const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const noticesService = require('../../src/modules/notices/service');
const notificationsService = require('../../src/modules/notifications/service');
const db = require('../../src/config/db');

after(async () => {
  await db.pool.end();
});

test('Notices Upgrade: real uploaded attachments, getReaders, update and cleanup work', async () => {
  const ceoUser = (
    await db.query(
      "SELECT u.id AS user_id, u.role_code, u.employee_id, u.email FROM users u WHERE u.role_code = 'CEO' LIMIT 1"
    )
  ).rows[0];
  assert.ok(ceoUser, 'CEO user must exist in users table');

  const actor = {
    userId: ceoUser.user_id,
    roleCode: ceoUser.role_code,
    employeeId: ceoUser.employee_id,
    email: ceoUser.email,
  };

  // 0. R39 Guard: Unuploaded / fake example.com attachment IDs must be rejected
  await assert.rejects(
    () =>
      noticesService.create(
        actor,
        {
          title: 'Quyết định giả mạo tệp đính kèm',
          content: 'Nội dung thử nghiệm.',
          category: 'policy',
          priority: 'normal',
          isPinned: false,
          attachments: [
            {
              id: 'att-1',
              name: 'Quy_dinh_2026.pdf',
              size: '1.2 MB',
              type: 'application/pdf',
            },
          ],
        },
        { ip: '127.0.0.1' }
      ),
    (err) => err.status === 400
  );

  // 1. Upload real PDF attachment and create notice
  const uploadedPdf = await noticesService.uploadAttachment(actor, {
    name: 'Quy_dinh_2026.pdf',
    type: 'application/pdf',
    contentBase64: Buffer.from('%PDF-1.4\nQuy dinh 2026 real content\n%%EOF', 'utf8').toString('base64'),
  });
  assert.match(uploadedPdf.id, /^NATT-/);

  const sampleNotice = await noticesService.create(
    actor,
    {
      title: 'Quyết định kiểm thử hệ thống thông báo 2026',
      content: 'Nội dung văn bản chỉ đạo kiểm thử có tệp đính kèm.',
      category: 'policy',
      priority: 'normal',
      isPinned: true,
      attachments: [
        {
          id: uploadedPdf.id,
          name: uploadedPdf.name,
          size: uploadedPdf.size,
          sizeBytes: uploadedPdf.sizeBytes,
          type: uploadedPdf.type,
          sha256: uploadedPdf.sha256,
        },
      ],
    },
    { ip: '127.0.0.1' }
  );

  assert.ok(sampleNotice.id, 'Notice should have an ID');
  assert.ok(Array.isArray(sampleNotice.attachments), 'Notice attachments should be an array');
  assert.equal(sampleNotice.attachments.length, 1);
  assert.equal(sampleNotice.attachments[0].id, uploadedPdf.id);
  assert.equal(sampleNotice.attachments[0].name, 'Quy_dinh_2026.pdf');
  assert.equal(sampleNotice.attachments[0].available, true);

  // 2. Test getReaders
  const readersReport = await noticesService.getReaders(actor, sampleNotice.id);
  assert.equal(readersReport.noticeId, sampleNotice.id);
  assert.ok(readersReport.totalTargeted >= 1, 'Should have targeted active employees');
  assert.ok(Array.isArray(readersReport.readers));
  assert.ok(Array.isArray(readersReport.unread));

  // 3. Upload second real attachment and update notice attachments
  const uploadedDocx = await noticesService.uploadAttachment(actor, {
    name: 'Phu_luc_01.docx',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    contentBase64: Buffer.from('PK\x03\x04 Real DOCX binary payload for Phu_luc_01', 'utf8').toString('base64'),
  });

  const updatedNotice = await noticesService.update(
    actor,
    sampleNotice.id,
    {
      title: 'Quyết định kiểm thử hệ thống thông báo 2026 (Đã cập nhật)',
      attachments: [
        {
          id: uploadedDocx.id,
          name: uploadedDocx.name,
          size: uploadedDocx.size,
          sizeBytes: uploadedDocx.sizeBytes,
          type: uploadedDocx.type,
          sha256: uploadedDocx.sha256,
        },
      ],
    },
    { ip: '127.0.0.1' }
  );

  assert.equal(updatedNotice.attachments[0].id, uploadedDocx.id);
  assert.equal(updatedNotice.attachments[0].name, 'Phu_luc_01.docx');

  // 4. Test notifications clearRead
  const clearRes = await notificationsService.clearRead(actor);
  assert.ok(typeof clearRes.deletedCount === 'number');

  // 5. Cleanup test notice (also cleans up attached disk files)
  await noticesService.remove(actor, sampleNotice.id, { ip: '127.0.0.1' });
});
