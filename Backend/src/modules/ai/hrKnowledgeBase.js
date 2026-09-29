// ============================================
// hrKnowledgeBase.js — CSDL Tri Thức Quy Chế Nhân Sự Doanh Nghiệp FwB
// ============================================

const HR_KNOWLEDGE_BASE = {
  companyName: 'CÔNG TY CP CÔNG NGHỆ FWB NEXUS',
  workingHours: {
    title: 'Thời gian làm việc và Chấm công',
    schedule: 'Thứ 2 đến Thứ 6 (08:00 - 17:30), nghỉ trưa 12:00 - 13:30. Nghỉ Thứ 7 và Chủ Nhật.',
    gracePeriod: 'Cho phép linh hoạt 15 phút đầu giờ sáng (đến trước 08:15 không tính đi trễ).',
    gpsPolicy: 'Chấm công GPS yêu cầu nằm trong bán kính 150m quanh trụ sở văn phòng.',
    kioskPolicy: 'Kiosk cổng quét mã Dynamic Code 15 giây hoặc Face ID tại sảnh.',
  },
  otPolicy: {
    title: 'Quy chế Làm thêm giờ (Overtime - OT)',
    rates: 'Ngày thường: 150% lương giờ; Cuối tuần (T7, CN): 200% lương giờ; Ngày Lễ, Tết: 300% lương giờ.',
    approval: 'Tất cả giờ OT phải đăng ký trước 17:00 trong ngày và được Trưởng phòng phê duyệt.',
    maxMonthly: 'Giới hạn trần 40 giờ OT/tháng theo quy định Bộ luật Lao động Việt Nam.',
  },
  leavePolicy: {
    title: 'Chính sách Nghỉ phép & Chế độ phúc lợi',
    annualLeave: '12 ngày phép hưởng nguyên lương mỗi năm. Cứ mỗi 5 năm làm việc được cộng thêm 1 ngày thâm niên.',
    workflow: 'Quy trình duyệt 2 cấp: Cấp 1 (Trưởng phòng duyệt chuyên môn) -> Cấp 2 (Giám đốc Nhân sự/CEO duyệt trừ quỹ phép).',
    medicalClaim: 'Nghỉ ốm đau có giấy chứng nhận y tế (Medical Claim) hưởng 75% mức lương đóng BHXH do cơ quan BHXH chi trả.',
  },
  insurancePolicy: {
    title: 'Bảo hiểm Xã hội bắt buộc và Bảo hiểm Sức khỏe Cao cấp',
    compulsory: 'BHXH: 8%, BHYT: 1.5%, BHTN: 1% trừ vào lương nhân viên; Doanh nghiệp đóng 21.5%.',
    healthCare: 'Gói FWB Care tại Vinmec chi trả 100% nội trú lên tới 120.000.000 đ/năm, và ngoại trú tối đa 15.000.000 đ/năm.',
  },
  taxPolicy: {
    title: 'Biểu thuế Thu nhập Cá nhân (TNCN) Lũy tiến',
    deductions: 'Giảm trừ gia cảnh cho bản thân người nộp thuế: 11.000.000 đ/tháng; Giảm trừ mỗi người phụ thuộc: 4.400.000 đ/tháng.',
    brackets: 'Bậc 1: đến 5tr (5%); Bậc 2: 5tr-10tr (10%); Bậc 3: 10tr-18tr (15%); Bậc 4: 18tr-32tr (20%); Bậc 5: 32tr-52tr (25%); Bậc 6: 52tr-80tr (30%); Bậc 7: trên 80tr (35%).',
  },
  performancePolicy: {
    title: 'Đánh giá Năng lực Ma trận 9-Box Grid & Kế hoạch PIP',
    matrix: 'Đánh giá dựa trên 2 trục: Hiệu suất (Performance) và Tiềm năng (Potential) chia thành 9 nhóm.',
    pipPlan: 'Nhân viên nhóm Cần cải thiện (Điểm KPI < 75) tham gia Kế hoạch Phát triển Hiệu suất 4 tuần cùng Mentor bộ phận.',
  },
};

module.exports = HR_KNOWLEDGE_BASE;
