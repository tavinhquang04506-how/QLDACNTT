import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCSVContent,
  getEmployeeTemplateCSV,
  parseCSVToEmployeeRows
} from '../src/utils/fileExportUtils.js';

test('File Export & Excel Import Unit Test Suite', async (t) => {
  await t.test('generateCSVContent should produce UTF-8 BOM and correct rows', () => {
    const headers = ['Mã NV', 'Họ Tên', 'Lương Thực Nhận'];
    const rows = [
      ['NV-0001', 'Lê Vũ Ngọc Duy', '65,000,000'],
      ['NV-0002', 'Trần Mai Hương', '45,000,000'],
    ];

    const csv = generateCSVContent(headers, rows);
    assert.ok(csv.startsWith('\uFEFF'));
    assert.ok(csv.includes('Mã NV,Họ Tên,Lương Thực Nhận'));
    assert.ok(csv.includes('NV-0001,Lê Vũ Ngọc Duy,"65,000,000"'));
  });

  await t.test('getEmployeeTemplateCSV returns valid 10-column onboarding template', () => {
    const template = getEmployeeTemplateCSV();
    assert.ok(template.includes('Mã NV'));
    assert.ok(template.includes('Họ và Tên'));
    assert.ok(template.includes('Email'));
    assert.ok(template.includes('Phòng Ban'));
    assert.ok(template.includes('Lương Cơ Bản'));
  });

  await t.test('parseCSVToEmployeeRows correctly parses uploaded CSV text', () => {
    const sampleCsv = `Mã NV,Họ và Tên,Email,Số Điện Thoại,Phòng Ban,Chức Vụ,Lương Cơ Bản,Số CCCD,Tài Khoản VCB\nNV-9001,Nguyễn Văn Mới,moi.nguyen@fwbnexus.vn,0901234567,DEPT-IT,Lập trình viên,22000000,079203001234,0071009998888`;
    const rows = parseCSVToEmployeeRows(sampleCsv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].code, 'NV-9001');
    assert.equal(rows[0].name, 'Nguyễn Văn Mới');
    assert.equal(rows[0].email, 'moi.nguyen@fwbnexus.vn');
    assert.equal(rows[0].department_id, 'DEPT-IT');
    assert.equal(rows[0].base_salary, 22000000);
  });
});
