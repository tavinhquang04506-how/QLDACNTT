// ============================================
// hrKnowledgeBase.js — Metadata Danh mục Quy chế Chuẩn (Đồng bộ với bảng handbook_docs & system_settings)
// Lưu ý: Runtime tra cứu chính sách luôn đọc trực tiếp từ PostgreSQL (handbook_docs & system_settings).
// ============================================

const HR_KNOWLEDGE_BASE = {
  companyName: 'CÔNG TY CP CÔNG NGHỆ FWB NEXUS',
  sourceOfTruth: 'PostgreSQL handbook_docs & system_settings',
  workingHours: {
    docId: 'HB-POL-01',
    title: 'Quy chế Giờ làm việc, Chấm công GPS & Giải trình (2026)',
    schedule: 'Thứ 2 đến Thứ 6: Ca sáng 08:00 - 12:00, Ca chiều 13:30 - 17:30.',
    gracePeriod: 'Ân hạn đi muộn theo cấu hình system_settings.late_grace_minutes (mặc định 15 phút).',
    gpsPolicy: 'Chấm công GPS trong bán kính cấu hình system_settings.gps_radius_meters quanh trụ sở hoặc quét mã động TOTP tại Kiosk.',
  },
  otPolicy: {
    docId: 'HB-POL-04',
    title: 'Chính sách Làm thêm giờ (OT) theo Điều 107 Bộ luật Lao động',
    rates: 'Ngày thường: 150%; Ngày nghỉ hàng tuần: 200%; Ngày Lễ, Tết: 300% đơn giá tiền lương giờ thực trả.',
    maxMonthly: 'Giới hạn tối đa theo system_settings.max_ot_per_month (40 giờ/tháng).',
  },
  leavePolicy: {
    docId: 'HB-POL-02',
    title: 'Chính sách Nghỉ phép năm, Nghỉ ốm BHXH (C65) & Quy trình phê duyệt 2 cấp',
    annualLeave: '12 ngày phép năm hưởng nguyên lương/năm; ngày nghỉ chỉ tính trên ngày làm việc (trừ T7, CN và ngày lễ).',
    workflow: 'Quy trình duyệt 2 cấp: Trưởng phòng duyệt cấp 1 -> Giám đốc Nhân sự phê chuẩn cấp 2 (Đơn cấp quản lý chuyển CEO).',
  },
  insurancePolicy: {
    docId: 'HB-POL-03',
    title: 'Quy định Trích nộp BHXH, BHYT, BHTN bắt buộc',
    compulsory: 'Người lao động đóng 10.5% (8% BHXH, 1.5% BHYT, 1% BHTN); Doanh nghiệp đóng 21.5%.',
  },
  taxPolicy: {
    docId: 'HB-POL-03',
    title: 'Quy định Tiền lương & Thuế TNCN (Nghị quyết 954/2020/UBTVQH14)',
    deductions: 'Giảm trừ bản thân: 11.000.000 đ/tháng; Giảm trừ người phụ thuộc: 4.400.000 đ/người/tháng.',
    brackets: 'Biểu thuế lũy tiến từng phần 7 bậc từ 5% đến 35%.',
  },
  performancePolicy: {
    docId: 'HB-POL-05',
    title: 'Quy định Đánh giá Hiệu suất 9-Box & Kế hoạch Cải thiện Hiệu suất (PIP)',
    matrix: 'Ma trận 9-Box kết hợp Điểm Hiệu suất (0-100) và Điểm Tiềm năng (0-100) phân loại từ Ô 1 đến Ô 9.',
    pipPlan: 'Nhân sự thuộc nhóm hiệu suất thấp (Ô 1, 2, 4) có thể được đề xuất Kế hoạch Cải thiện Hiệu suất (PIP) có mục tiêu định lượng.',
  },
};

module.exports = HR_KNOWLEDGE_BASE;
