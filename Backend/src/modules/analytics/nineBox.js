// 9-box grid: performance (columns) x potential (rows). Cell 1 = low/low ... cell 9 = high/high.

/** 1 = low (< 60), 2 = medium (60-79.99), 3 = high (>= 80). */
const levelOf = (score) => (score >= 80 ? 3 : score >= 60 ? 2 : 1);

const cellOf = (performance, potential) => (levelOf(potential) - 1) * 3 + levelOf(performance);

const CELLS = [
  { cell: 1, title: 'Cần kế hoạch cải thiện', description: 'Hiệu suất và tiềm năng đều thấp', tag: 'Kế hoạch cải thiện PIP' },
  { cell: 2, title: 'Nhân sự thực thi', description: 'Vận hành quy trình chuẩn xác', tag: 'Định kỳ đánh giá' },
  { cell: 3, title: 'Chuyên gia chuyên môn', description: 'Chuyên môn sâu, hiệu suất cao, ít dư địa phát triển', tag: 'Đãi ngộ chuyên gia' },
  { cell: 4, title: 'Cần hỗ trợ nghiệp vụ', description: 'Cần cải thiện năng lực thực thi', tag: 'Huấn luyện kèm cặp' },
  { cell: 5, title: 'Nhân lực ổn định', description: 'Hoàn thành tốt nhiệm vụ được giao', tag: 'Duy trì động lực' },
  { cell: 6, title: 'Nhân lực cốt lõi', description: 'Đóng góp vượt trội và ổn định', tag: 'Khen thưởng đặc biệt' },
  { cell: 7, title: 'Ngôi sao đang lên', description: 'Nhân tố bứt phá cần trao quyền', tag: 'Cố vấn chuyên môn' },
  { cell: 8, title: 'Tiềm năng phát triển', description: 'Sẵn sàng nhận trách nhiệm lớn hơn', tag: 'Đào tạo quản lý' },
  { cell: 9, title: 'Ngôi sao xuất sắc', description: 'Lãnh đạo tương lai và chuyên gia nòng cốt', tag: 'Quy hoạch kế cận' },
];

module.exports = { levelOf, cellOf, CELLS };
