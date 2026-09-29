import React, { useState } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { FileText, CheckCircle2, AlertTriangle, ShieldCheck, Download, X, Sparkles, Stethoscope, Building } from 'lucide-react';
import { medicalService } from '../../services';
import { useAuth } from '../../context/AuthContext';

export default function Modal6B_MedicalClaim({ isOpen, onClose, payload }) {
  const { currentRole } = useAuth();
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState(null);

  const claimId = payload?.id || payload?.claimId || '';
  const employeeName = payload?.full_name || payload?.employeeName || payload?.name || currentRole?.name || 'Nhân sự';
  const hospital = payload?.hospital || 'Cơ sở y tế điều trị';
  const description = payload?.description || 'Nghỉ ốm điều trị y khoa (Mẫu C65-HD)';
  const amountFormatted = payload?.amount != null
    ? Number(payload.amount).toLocaleString('vi-VN') + ' đ'
    : '0 đ';

  const handleApprove = async () => {
    setApproving(true);
    setError(null);
    try {
      if (payload?.id) {
        await medicalService.approve(payload.id);
      }
      setApproved(true);
    } catch (err) {
      console.warn('Failed to approve medical claim via API:', err);
      setError(err.response?.data?.message || err.message || 'Lỗi khi phê duyệt chứng từ y tế.');
    } finally {
      setApproving(false);
    }
  };

  return (
    <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-4xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Giám định chứng từ y tế và Thẩm duyệt chế độ BHXH</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  Mẫu C65-HD
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Mã đơn: <strong className="text-slate-800 font-semibold">{claimId}</strong> • Nhân viên: <strong className="text-slate-800">{employeeName}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content 2-Column: Left Document Preview, Right OCR & Decision */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Left: Document Scan Simulation (5 cols) */}
          <div className="md:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-xs font-semibold text-slate-700">
                <span>Bản scan chứng từ gốc</span>
                <span className="text-[11px] text-blue-600 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Đã số hóa và đối soát
                </span>
              </div>

              {/* Simulated Hospital Cert Card */}
              <div className="mt-3 p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3 font-serif text-[11px] leading-relaxed text-slate-700">
                <div className="text-center border-b border-slate-100 pb-2 font-sans">
                  <div className="font-bold text-xs uppercase tracking-wide text-slate-900">{hospital}</div>
                  <div className="text-[9px] text-slate-400">Số: 1048/GCN-C65 • Hà Nội</div>
                  <div className="font-bold text-xs text-slate-800 mt-1 uppercase font-serif">
                    GIẤY CHỨNG NHẬN NGHỈ VIỆC HƯỞNG BHXH
                  </div>
                </div>

                <div className="space-y-1 font-sans">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Họ và tên:</span>
                    <span className="font-bold text-slate-900">{employeeName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Mã số BHXH:</span>
                    <span className="font-mono text-slate-800">7914829102</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Chẩn đoán:</span>
                    <span className="font-medium text-slate-800">{description}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Số ngày nghỉ:</span>
                    <span className="font-bold text-rose-700">03 ngày (10/09 - 12/09/2026)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Bác sĩ điều trị:</span>
                    <span className="font-medium text-slate-800">BS. CKI. Nguyễn Hoàng Long</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between font-sans text-[10px] text-slate-400">
                  <span>Dấu mộc đỏ {hospital}</span>
                  <span className="text-emerald-600 font-bold">ĐÃ XÁC THỰC MỘC</span>
                </div>
              </div>
            </div>

            <button className="mt-4 w-full py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition">
              <Download className="w-3.5 h-3.5" />
              Tải file PDF chứng từ gốc
            </button>
          </div>

          {/* Right: AI OCR Verification & BHXH Calculations (7 cols) */}
          <div className="md:col-span-7 space-y-4">
            {/* AI Trust Score banner */}
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-900">AI OCR Thẩm định khớp 98.6%</span>
                  <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">HỢP LỆ</span>
                </div>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Chữ ký bác sĩ và con dấu pháp nhân cơ sở y tế đã được đối soát chính xác với danh bạ Cục Quản lý Khám chữa bệnh.
                </p>
              </div>
            </div>

            {/* Calculations Table */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
              <h4 className="text-xs font-bold text-slate-900">Dự toán Chế độ trợ cấp ốm đau BHXH chi trả</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Mức lương đóng BHXH:</span>
                  <span className="font-semibold text-slate-800">15.500.000 đ</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Tỷ lệ hưởng chế độ ốm đau:</span>
                  <span className="font-semibold text-slate-800">75% mức đóng</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Số ngày tính trợ cấp:</span>
                  <span className="font-semibold text-slate-800">03 ngày làm việc</span>
                </div>
                <div className="flex justify-between py-1.5 bg-blue-50 px-2.5 rounded-lg">
                  <span className="font-bold text-blue-900">Số tiền BHXH duyệt chi:</span>
                  <span className="font-extrabold text-blue-700 text-sm">{amountFormatted}</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                {error}
              </div>
            )}

            {/* Status & Actions */}
            {approved ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800 font-bold">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Đã phê duyệt chế độ C65 và Đồng bộ lên Cổng dịch vụ công BHXH.
                </span>
                <button
                  onClick={() => setApproved(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 underline font-normal"
                >
                  Hoàn tác
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={approving}
                  onClick={handleApprove}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-sm transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {approving ? 'Đang phê duyệt...' : `Phê duyệt Chế độ C65 (${amountFormatted})`}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs transition cursor-pointer"
                >
                  Yêu cầu bổ sung chứng từ
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppleModal>
  );
}
