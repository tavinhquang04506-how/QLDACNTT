import React, { useState } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { 
  BookOpen, 
  ShieldCheck, 
  HeartHandshake, 
  Coins, 
  Palmtree, 
  Clock, 
  FileText, 
  CheckCircle2, 
  Download,
  AlertCircle
} from 'lucide-react';

export default function Modal3D_Handbook({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('work');

  const tabs = [
    { id: 'work', label: 'Thời Gian & Chấm Công', icon: Clock },
    { id: 'insurance', label: 'Bảo Hiểm & Sức Khỏe', icon: ShieldCheck },
    { id: 'allowance', label: 'Phụ Cấp & Đãi Ngộ', icon: Coins },
    { id: 'benefits', label: 'Nghỉ Dưỡng & Hoạt Động', icon: Palmtree },
  ];

  return (
    <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-4xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 font-display">
                Cẩm Nang Quy Chế và Chế Độ Đãi Ngộ Nhân Sự
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Quy chuẩn văn hóa làm việc, chính sách phúc lợi toàn diện tập đoàn NEXUS
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 mt-4 overflow-x-auto pb-1 text-xs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 shadow-2xs border border-blue-200'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Contents */}
        <div className="mt-4 max-h-[60vh] overflow-y-auto pr-1 text-xs space-y-4">
          {activeTab === 'work' && (
            <div className="space-y-3">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  1. Khung Giờ Làm Việc Tiêu Chuẩn
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  Toàn thể nhân sự làm việc từ <strong>Thứ Hai đến hết Thứ Sáu</strong> hàng tuần (nghỉ Thứ Bảy và Chủ Nhật).
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-700 font-medium">
                  <li>Buổi sáng: 08:00 - 12:00 (Nghỉ trưa 12:00 - 13:30)</li>
                  <li>Buổi chiều: 13:30 - 17:30</li>
                  <li>Dung sai chấm công: Được phép trễ tối đa 15 phút đầu giờ (08:01 - 08:15) không quá 3 lần/tháng.</li>
                </ul>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  2. Phương Thức Chấm Công và Điểm Danh
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  Nhân sự thực hiện xác thực điểm danh tại cổng chính bằng camera nhận diện khuôn mặt AI hoặc xác thực qua ứng dụng nội bộ khi kết nối mạng WiFi văn phòng.
                </p>
                <div className="p-3 bg-white rounded-lg border border-slate-200 text-slate-600">
                  <strong>Trường hợp quên chấm công:</strong> Vui lòng gửi đơn giải trình trực tiếp trên cổng Bàn làm việc của tôi trong vòng 24 giờ để Trưởng phòng xác nhận.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'insurance' && (
            <div className="space-y-3">
              <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-200 space-y-2">
                <h4 className="font-bold text-blue-900 text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  1. Bảo Hiểm Sức Khỏe Cao Cấp (Bảo Việt / PTI Gold)
                </h4>
                <p className="text-slate-700 leading-relaxed">
                  Ngoài bảo hiểm y tế bắt buộc theo Luật Lao động, công ty cấp thẻ Bảo hiểm sức khỏe quốc tế miễn phí cho nhân sự chính thức:
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1 font-semibold text-slate-800">
                  <div className="p-2.5 bg-white rounded-lg border border-blue-100">
                    Hạn mức điều trị nội trú: <strong className="text-blue-600">60.000.000 đ/năm</strong>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-blue-100">
                    Nha khoa và Ngoại trú: <strong className="text-blue-600">10.000.000 đ/năm</strong>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-600" />
                  2. Chế Độ Nghỉ Ốm Hưởng Trợ Cấp BHXH (Mẫu C65)
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  Khi nghỉ ốm có chỉ định của cơ sở khám chữa bệnh, nhân sự đính kèm ảnh chụp chứng nhận C65 trên cổng nghỉ phép. Cơ quan BHXH sẽ chi trả trợ cấp bằng <strong>75% mức tiền lương đóng BHXH</strong>.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'allowance' && (
            <div className="space-y-3">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Coins className="w-4 h-4 text-emerald-600" />
                  1. Danh Mục Phụ Cấp Hàng Tháng
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-slate-800">
                  <div className="p-3 bg-white rounded-xl border border-slate-200 text-center">
                    <span className="text-slate-400 block text-[11px]">Phụ cấp ăn trưa</span>
                    <strong className="text-sm text-slate-900 mt-0.5 block">730.000 đ</strong>
                    <span className="text-[10px] text-emerald-600">Miễn thuế TNCN</span>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200 text-center">
                    <span className="text-slate-400 block text-[11px]">Điện thoại & Internet</span>
                    <strong className="text-sm text-slate-900 mt-0.5 block">500.000 đ</strong>
                    <span className="text-[10px] text-slate-500">Tùy theo chức danh</span>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200 text-center">
                    <span className="text-slate-400 block text-[11px]">Xăng xe & Đi lại</span>
                    <strong className="text-sm text-slate-900 mt-0.5 block">600.000 đ</strong>
                    <span className="text-[10px] text-slate-500">Hỗ trợ di chuyển</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-600" />
                  2. Thưởng Hiệu Quả Công Việc (KPI) và Tháng 13
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  Đánh giá định kỳ hàng quý: Xếp loại A (Thưởng 1.5 tháng lương), Xếp loại B (Thưởng 1.0 tháng lương), Xếp loại C (Thưởng 0.5 tháng lương). Lương tháng 13 được chi trả trước Tết Nguyên Đán.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'benefits' && (
            <div className="space-y-3">
              <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-200 space-y-2">
                <h4 className="font-bold text-purple-900 text-sm flex items-center gap-2">
                  <Palmtree className="w-4 h-4 text-purple-600" />
                  1. Chế Độ Nghỉ Mát Hàng Năm
                </h4>
                <p className="text-slate-700 leading-relaxed">
                  Công ty đài thọ 100% chuyến du lịch nghỉ dưỡng 4 ngày 3 đêm tiêu chuẩn 4-5 sao cho toàn thể nhân sự chính thức và hỗ trợ 50% chi phí cho người thân.
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <HeartHandshake className="w-4 h-4 text-rose-600" />
                  2. Chăm Sóc Đời Sống & Quà Tặng Sự Kiện
                </h4>
                <ul className="list-disc list-inside space-y-1 text-slate-700 font-medium">
                  <li>Sinh nhật nhân viên: Quà tặng và 500.000 đ tiền mặt</li>
                  <li>Hiếu hỷ, thai sản, ốm đau nằm viện: Thăm hỏi từ 1.000.000 đ - 3.000.000 đ</li>
                  <li>Khám sức khỏe tổng quát định kỳ: 1 lần/năm tại Bệnh viện Quốc tế</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Cập nhật lần cuối: Kỳ Quý III/2026 • Ban Quản Trị Nhân Sự
          </span>
        </div>
      </div>
    </AppleModal>
  );
}
