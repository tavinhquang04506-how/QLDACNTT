import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Shield, 
  Clock, 
  Check, 
  Save, 
  Building,
  Lock,
  Percent,
  MapPin,
  ShieldCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function SettingsPage() {
  const { currentRole } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('attendance');
  const [saved, setSaved] = useState(false);

  // Settings values
  const [autoApproveOT, setAutoApproveOT] = useState(false);
  const [lateGraceMinutes, setLateGraceMinutes] = useState(15);
  const [maxOtPerMonth, setMaxOtPerMonth] = useState(40);
  const [faceConfidenceThreshold, setFaceConfidenceThreshold] = useState(98);
  const [gpsRadiusMeters, setGpsRadiusMeters] = useState(250);
  const [personalIncomeTaxDeduction, setPersonalIncomeTaxDeduction] = useState(11000000);
  const [dependentDeduction, setDependentDeduction] = useState(4400000);

  const canEditSettings = currentRole.key === 'CEO' || currentRole.key === 'HR_DIRECTOR';

  const handleSave = () => {
    if (!canEditSettings) return;
    setSaved(true);
    try {
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
    } catch (e) {}
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="w-full min-h-full p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 font-display">
              Cài Đặt & Cấu Hình Hệ Thống
            </h1>
            <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full border border-blue-200">
              Nexus Config Enterprise
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Quản trị quy tắc chấm công ca làm, chính sách thuế & BHXH, và định vị văn phòng check-in
          </p>
        </div>

        {canEditSettings ? (
          <button
            type="button"
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{saved ? 'Đã lưu cấu hình thành công!' : 'Lưu Thay Đổi Cấu Hình'}</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>Chế độ chỉ đọc ({currentRole?.title || 'Nhân sự'})</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'attendance'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Ca Làm & Điểm Danh</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tax_bhxh')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'tax_bhxh'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Percent className="w-4 h-4" />
          <span>Thuế TNCN & BHXH</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('biometrics')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'biometrics'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Bán Kính GPS & Check-in</span>
        </button>
      </div>

      {/* Tab 1: Ca Làm & Điểm Danh */}
      {activeTab === 'attendance' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Clock className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm font-display">
                  Quy Định Giờ Làm & Đi Muộn
                </h3>
              </div>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Chuẩn Hành Chính
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Thời gian ân hạn đi trễ buổi sáng (Grace Period)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={lateGraceMinutes}
                    onChange={(e) => setLateGraceMinutes(Number(e.target.value))}
                    disabled={!canEditSettings}
                    className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs outline-none focus:bg-white focus:border-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                  <span className="text-slate-500">phút (Sau 08:15 sẽ tính là đi muộn vào ca)</span>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Khung giờ làm việc chuẩn (Standard Shift)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Ca Sáng:</span>
                    <strong className="text-slate-900">08:00 - 12:00 (4.0 giờ)</strong>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Ca Chiều:</span>
                    <strong className="text-slate-900">13:30 - 17:30 (4.0 giờ)</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm font-display">
                  Chính Sách Làm Thêm Giờ (OT)
                </h3>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Điều 107 BLLĐ
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Giới hạn số giờ làm thêm tối đa / tháng
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={maxOtPerMonth}
                    onChange={(e) => setMaxOtPerMonth(Number(e.target.value))}
                    disabled={!canEditSettings}
                    className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs outline-none focus:bg-white focus:border-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                  <span className="text-slate-500">giờ / tháng (Cảnh báo khi vượt ngưỡng 40h)</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className={`inline-flex items-center gap-3 ${canEditSettings ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'}`}>
                  <input
                    type="checkbox"
                    checked={autoApproveOT}
                    onChange={(e) => setAutoApproveOT(e.target.checked)}
                    disabled={!canEditSettings}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 disabled:opacity-75"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Tự động duyệt OT dưới 2 giờ vào ngày thường</span>
                    <span className="text-slate-400 block mt-0.5">Hệ thống ghi nhận hệ số 150% theo dữ liệu quẹt thẻ ra về</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Thuế TNCN & BHXH */}
      {activeTab === 'tax_bhxh' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Percent className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-slate-900 text-sm font-display">
                  Mức Giảm Trừ Gia Cảnh Thuế TNCN
                </h3>
              </div>
              <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                Nghị Quyết 954/2020
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Mức giảm trừ bản thân người nộp thuế
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={personalIncomeTaxDeduction.toLocaleString('vi-VN') + ' đ / tháng'}
                    disabled
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-900 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Mức giảm trừ cho mỗi người phụ thuộc
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={dependentDeduction.toLocaleString('vi-VN') + ' đ / người / tháng'}
                    disabled
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-900 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Building className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm font-display">
                  Tỷ Lệ Đóng Bảo Hiểm Xã Hội Bắt Buộc
                </h3>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Luật BHXH 2024
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-600">Trích trừ từ lương Người lao động:</span>
                <strong className="text-rose-600 font-mono">10.5% (8% BHXH + 1.5% BHYT + 1% BHTN)</strong>
              </div>
              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-600">Doanh nghiệp chi trả thêm:</span>
                <strong className="text-blue-600 font-mono">21.5% (17.5% BHXH + 3% BHYT + 1% BHTN)</strong>
              </div>
              <div className="flex justify-between p-2.5 bg-blue-50/50 rounded-xl border border-blue-200">
                <span className="text-blue-900 font-bold">Tổng mức trích nộp cơ quan BHXH:</span>
                <strong className="text-blue-700 font-mono">32.0% Lương Hợp Đồng</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Bán Kính GPS & Check-in */}
      {activeTab === 'biometrics' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <MapPin className="w-5 h-5 text-rose-600" />
                <h3 className="font-bold text-slate-900 text-sm font-display">
                  Định Vị Tọa Độ Trụ Sở & Bán Kính Check-in
                </h3>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                GPS Active
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Bán kính hợp lệ cho phép nhân viên Check-in
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={gpsRadiusMeters}
                    onChange={(e) => setGpsRadiusMeters(Number(e.target.value))}
                    disabled={!canEditSettings}
                    className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs outline-none focus:bg-white focus:border-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                  <span className="text-slate-500">mét tính từ tâm tòa nhà trụ sở chính</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800 block">Tọa độ trụ sở chính:</span>
                <p className="text-[11px] text-slate-600 font-mono">
                  10.7769° N, 106.7009° E (Tòa nhà NEXUS Tower, Quận 1, TP. Hồ Chí Minh)
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Shield className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm font-display">
                  Ngưỡng Nhận Diện Khuôn Mặt Kiosk Cổng
                </h3>
              </div>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                AI Liveness
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-bold text-slate-700">
                    Ngưỡng độ tin cậy nhận diện khuôn mặt (Face Match)
                  </label>
                  <span className="font-bold text-blue-600">{faceConfidenceThreshold}%</span>
                </div>
                <input
                  type="range"
                  min="90"
                  max="99"
                  value={faceConfidenceThreshold}
                  onChange={(e) => setFaceConfidenceThreshold(Number(e.target.value))}
                  disabled={!canEditSettings}
                  className="w-full accent-blue-600 disabled:opacity-75 disabled:cursor-not-allowed"
                />
                <span className="text-slate-400 text-[11px] block mt-1">
                  Khuyến nghị: 98% để đảm bảo chính xác tuyệt đối và chống giả mạo ảnh chụp.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
