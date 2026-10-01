import React, { useState } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { Calendar, MapPin, Building, CheckCircle2, ShieldCheck, HeartPulse, Bell, FileText } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function Modal3B_NoticeDetail({ isOpen, onClose, payload }) {
  const [confirmed, setConfirmed] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState('slot1');

  const handleConfirm = () => {
    setConfirmed(true);
    try {
      confetti({ particleCount: 40, spread: 50, origin: { y: 0.6 } });
    } catch (e) {}
  };

  const title = payload?.title || 'Thông báo Doanh nghiệp Toàn công ty';
  const author = payload?.author || payload?.created_by || 'Phòng Nhân sự và Vận hành';
  const publishDate = payload?.date || payload?.published_at || payload?.created_at
    ? new Date(payload.date || payload.published_at || payload.created_at).toLocaleDateString('vi-VN')
    : new Date().toLocaleDateString('vi-VN');
  const isHealthNotice = title.toLowerCase().includes('khám') || title.toLowerCase().includes('sức khỏe') || payload?.category === 'health';

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={`Thông báo Doanh nghiệp • Ngày ban hành: ${publishDate} bởi ${author}`}
      badge={
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
          isHealthNotice
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-blue-50 text-blue-700 border-blue-200'
        }`}>
          {isHealthNotice ? <HeartPulse className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
          {payload?.category_label || (isHealthNotice ? 'Y tế và Sức khỏe' : 'Quy chế và Vận hành')}
        </span>
      }
      maxWidth="max-w-2xl"
    >
      <div className="p-6 space-y-4 text-xs text-slate-700">
        {/* Dynamic Notice Body if generic notice */}
        {!isHealthNotice && (
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs leading-relaxed space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Nội dung chi tiết thông báo</span>
              </div>
              <div className="text-slate-600 whitespace-pre-line leading-relaxed">
                {payload?.content || payload?.body || payload?.description || (
                  'Thông báo chính thức từ Ban Lãnh đạo và Khối Quản trị Nguồn nhân lực FWB NEXUS. Mọi nhân viên và cấp quản lý trực tiếp có trách nhiệm nắm rõ và nghiêm túc thực hiện đúng theo các điều khoản ban hành.'
                )}
              </div>
            </div>

            <div className="bg-blue-50/50 border border-blue-200/80 rounded-xl p-3 flex items-start gap-2.5 text-blue-900 text-xs">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Hiệu lực văn bản</span>
                <span className="text-[11px] text-blue-800">
                  Văn bản có hiệu lực kể từ ngày công bố ({publishDate}). Mọi thắc mắc xin vui lòng gửi phản hồi về hòm thư công vụ của Ban Điều Hành.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Specialized UI if this is a Health Check notice */}
        {isHealthNotice && (
          <>
            <div className="bg-gradient-to-r from-blue-50 via-blue-50/40 to-indigo-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white border border-blue-200 flex items-center justify-center shrink-0 text-blue-600 shadow-2xs">
                <Building className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Cơ sở y tế liên kết: Vinmec International Hospital</span>
                  <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">
                    Đạt chuẩn JCI
                  </span>
                </div>
                <p className="text-xs text-blue-900 mt-0.5">
                  Gói khám sức khỏe <strong className="text-blue-700 font-bold">Platinum toàn diện</strong> do NEXUS HR tài trợ 100% cho toàn thể cán bộ nhân viên chính thức.
                </p>
              </div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 space-y-2.5">
              <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                1. Thời gian và Địa điểm tổ chức
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-start gap-2.5">
                  <Calendar className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Thời gian tổ chức</div>
                    <div className="font-bold text-slate-900 mt-0.5">Đợt 1 trong tháng hiện tại</div>
                    <div className="text-[11px] text-slate-500">Từ 07:30 đến 11:30 sáng</div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Địa điểm khám</div>
                    <div className="font-bold text-slate-900 mt-0.5">Khoa Khám bệnh - Bệnh viện liên kết</div>
                    <div className="text-[11px] text-slate-500">Khu phức hợp công nghệ cao NEXUS</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
              <label className="font-bold text-slate-800 block text-xs">
                Chọn khung giờ khám phù hợp với lịch làm việc của bạn:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all ${selectedSlot === 'slot1' ? 'bg-blue-600 text-white border-blue-600 shadow-2xs font-bold' : 'bg-white border-slate-200 text-slate-700'}`}>
                  <input type="radio" name="slot" value="slot1" checked={selectedSlot === 'slot1'} onChange={() => setSelectedSlot('slot1')} className="sr-only" />
                  <div className="text-xs">Ca sáng sớm</div>
                  <div className="text-[10px] opacity-80">07:30 - 09:30</div>
                </label>
                <label className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all ${selectedSlot === 'slot2' ? 'bg-blue-600 text-white border-blue-600 shadow-2xs font-bold' : 'bg-white border-slate-200 text-slate-700'}`}>
                  <input type="radio" name="slot" value="slot2" checked={selectedSlot === 'slot2'} onChange={() => setSelectedSlot('slot2')} className="sr-only" />
                  <div className="text-xs">Ca giữa buổi</div>
                  <div className="text-[10px] opacity-80">09:30 - 11:30</div>
                </label>
                <label className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all ${selectedSlot === 'slot3' ? 'bg-blue-600 text-white border-blue-600 shadow-2xs font-bold' : 'bg-white border-slate-200 text-slate-700'}`}>
                  <input type="radio" name="slot" value="slot3" checked={selectedSlot === 'slot3'} onChange={() => setSelectedSlot('slot3')} className="sr-only" />
                  <div className="text-xs">Ca chiều</div>
                  <div className="text-[10px] opacity-80">13:30 - 15:30</div>
                </label>
              </div>
            </div>
          </>
        )}

        {/* Footer Actions */}
        <div className="pt-2 flex items-center justify-between border-t border-slate-100">
          <span className="text-slate-400 text-[11px]">Xác nhận điện tử nội bộ</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold transition-colors cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              {confirmed ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>Đã ghi nhận phản hồi!</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isHealthNotice ? 'Đăng ký ca khám' : 'Đã hiểu và xác nhận'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </AppleModal>
  );
}
