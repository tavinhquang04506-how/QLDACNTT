// ============================================
// fileExportUtils.js — Xuất / Nhập File CSV & Excel với UTF-8 BOM chuẩn tiếng Việt
// ============================================

/**
 * Tạo nội dung CSV chuẩn UTF-8 có chèn BOM (\uFEFF) giúp Excel mở không bị lỗi font tiếng Việt
 */
export function generateCSVContent(headers = [], rows = []) {
  const escapeCell = (cell) => {
    if (cell === null || cell === undefined) return '';
    const str = String(cell);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.map(escapeCell).join(',');
  const rowLines = rows.map((r) => {
    if (Array.isArray(r)) {
      return r.map(escapeCell).join(',');
    }
    return Object.values(r).map(escapeCell).join(',');
  });

  return '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
}

/**
 * Kích hoạt tải file xuống máy tính người dùng trực tiếp trên trình duyệt
 */
export function downloadFile(filename, content, mimeType = 'text/csv;charset=utf-8;') {
  if (typeof window === 'undefined') return;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Trả về nội dung File Excel/CSV Mẫu Chuẩn Cho Nhập Nhân Sự
 */
export function getEmployeeTemplateCSV() {
  const headers = [
    'Mã NV',
    'Họ và Tên',
    'Email',
    'Số Điện Thoại',
    'Phòng Ban',
    'Chức Vụ',
    'Lương Cơ Bản',
    'Số CCCD',
    'Tài Khoản VCB',
    'Ngày Vào Làm',
  ];

  const today = new Date().toISOString().split('T')[0];
  const sampleRows = [
    [
      'NV-9001',
      'Đỗ Hoàng Phúc',
      'phuc.do@fwbnexus.vn',
      '0988123456',
      'DEPT-IT',
      'Senior DevOps Engineer',
      '28000000',
      '079203009988',
      '0071008889999',
      today,
    ],
    [
      'NV-9002',
      'Nguyễn Bích Ngọc',
      'ngoc.nguyen@fwbnexus.vn',
      '0912345678',
      'DEPT-MKT',
      'Digital Marketing Lead',
      '24000000',
      '079204001122',
      '0071007776666',
      today,
    ],
  ];

  return generateCSVContent(headers, sampleRows);
}

/**
 * Phân tích cú pháp tệp CSV được tải lên thành mảng đối tượng nhân viên
 */
export function parseCSVToEmployeeRows(csvText) {
  if (!csvText) return [];

  // Remove BOM if present
  let clean = csvText;
  if (clean.charCodeAt(0) === 0xFEFF) {
    clean = clean.slice(1);
  }

  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse lines considering quotes
  const parseLine = (line) => {
    const result = [];
    let insideQuote = false;
    let entry = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuote && line[i + 1] === '"') {
          entry += '"';
          i++;
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        result.push(entry.trim());
        entry = '';
      } else {
        entry += char;
      }
    }
    result.push(entry.trim());
    return result;
  };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length >= 3 && cols[1]) {
      rows.push({
        code: cols[0] || `NV-${9000 + i}`,
        id: cols[0] || `NV-${9000 + i}`,
        name: cols[1],
        full_name: cols[1],
        email: cols[2] || `user${i}@fwbnexus.vn`,
        phone: cols[3] || '0901234567',
        department_id: cols[4] || 'DEPT-IT',
        department: cols[4] || 'Phòng Kỹ thuật Phần mềm',
        job_title: cols[5] || 'Chuyên viên',
        role: cols[5] || 'Chuyên viên',
        base_salary: Number(cols[6]?.replace(/\D/g, '') || 20000000),
        contractSalary: Number(cols[6]?.replace(/\D/g, '') || 20000000),
        id_card: cols[7] || '079203001234',
        bank_account: cols[8] || '0071001234567',
        joined_date: cols[9] || new Date().toISOString().split('T')[0],
      });
    }
  }

  return rows;
}
