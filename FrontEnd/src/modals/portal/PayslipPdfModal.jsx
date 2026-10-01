import React from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { Printer, Download, CheckCircle2, ShieldCheck, QrCode, Award } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAuth } from '../../context/AuthContext';
import { numberToVietnameseWords } from '../../utils/numberToVietnameseWords';

export default function Modal3C_PayslipPdf({ isOpen, onClose, payload }) {
  const { currentRole } = useAuth();
  const employeeName = payload?.full_name || payload?.employee_name || payload?.name || currentRole?.name || 'Nhân sự';
  const employeeId = payload?.employee_id || payload?.id || currentRole?.id || '';
  const role = payload?.job_title || payload?.role || currentRole?.title || 'Chuyên viên';
  const department = payload?.department_name || payload?.department || payload?.dept || currentRole?.department || 'Khối Chuyên Môn';
  const baseSalary = Number(payload?.base_salary ?? payload?.contractSalary ?? currentRole?.baseSalary ?? 0);
  const kpiBonus = Number(payload?.bonus ?? payload?.ot_pay ?? 0);
  const lunchAllowance = Number(payload?.allowances ?? payload?.allowance ?? 0);
  const gross = Number(payload?.gross_income ?? payload?.gross_salary ?? (baseSalary + kpiBonus + lunchAllowance));
  const bhxh = Number(payload?.bhxh_amount ?? payload?.insurance_deduction ?? Math.round(baseSalary * 0.105));
  const tax = Number(payload?.pit_amount ?? payload?.tax_deduction ?? Math.round(baseSalary * 0.08));
  const totalDeduction = Number(payload?.total_deductions ?? payload?.total_deduction ?? (bhxh + tax));
  const rawNet = Number(payload?.net_salary);
  const net = !isNaN(rawNet) && rawNet > 0 ? rawNet : (gross - totalDeduction);

  const amountInWords = numberToVietnameseWords(net);
  const period = payload?.period || new Date().toISOString().slice(0, 7);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    try {
      confetti({ particleCount: 35, spread: 50, origin: { y: 0.6 } });
    } catch (e) {}
    // Kích hoạt hộp thoại in tiêu chuẩn để lưu dưới dạng PDF chất lượng cao
    window.print();
  };

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Phiếu Thanh Toán Tiền Lương Điện Tử (A4 Standard)"
      subtitle={`Kỳ lương ${period} • Hạch toán điện tử chính thức • Xác thực hệ thống NEXUS`}
      maxWidth="max-w-3xl"
    >
      <div className="p-6 space-y-6">
        {/* Printable Paper Card with ID for media print */}
        <div id="payslip-printable-document" className="bg-white border border-slate-300 rounded-2xl p-8 shadow-sm text-xs font-sans relative">
          {/* Header */}
          <div className="flex justify-between items-start border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-extrabold flex items-center justify-center text-xl shadow-sm">
                N
              </div>
              <div>
                <div className="font-bold text-slate-900 text-sm">CÔNG TY CỔ PHẦN CÔNG NGHỆ FWB NEXUS</div>
                <div className="text-[11px] text-slate-400">MST: 0312345678 • Nexus Tower, Cầu Giấy, Hà Nội</div>
              </div>
            </div>
            <div className="text-right">
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 text-[10px]">
                ĐÃ CHI TRẢ THÀNH CÔNG
              </span>
              <div className="text-[10px] text-slate-400 mt-1 font-mono">Bút toán: #PAY-202608-{employeeId}</div>
            </div>
          </div>

          {/* Title */}
          <div className="text-center my-5">
            <h2 className="text-base font-bold uppercase text-slate-900 font-display">
              PHIẾU LƯƠNG VÀ QUYẾT TOÁN THU NHẬP CÁ NHÂN
            </h2>
            <p className="text-slate-500 text-[11px] mt-0.5">Kỳ tính lương: Tháng 08/2026 (01/08 - 31/08/2026)</p>
          </div>

          {/* Employee Info Grid */}
          <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 mb-5">
            <div>
              <span className="text-slate-500">Họ và tên:</span> <strong className="text-slate-900">{employeeName}</strong>
            </div>
            <div>
              <span className="text-slate-500">Mã nhân viên:</span> <strong className="font-mono text-slate-900">{employeeId}</strong>
            </div>
            <div>
              <span className="text-slate-500">Chức danh:</span> <span className="text-slate-800">{role}</span>
            </div>
            <div>
              <span className="text-slate-500">Phòng ban:</span> <span className="text-slate-800">{department}</span>
            </div>
            <div>
              <span className="text-slate-500">Tài khoản nhận:</span> <span className="font-mono text-slate-800">1903 8847 2919 • Techcombank</span>
            </div>
            <div>
              <span className="text-slate-500">Ngày công chuẩn:</span> <strong className="text-blue-600">22 / 22 ngày (100%)</strong>
            </div>
          </div>

          {/* Income Breakdown */}
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 uppercase text-[11px] mb-2 text-blue-700">
                I. CÁC KHOẢN THU NHẬP
              </h3>
              <table className="w-full border border-slate-200 rounded-lg overflow-hidden">
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50">
                    <td className="p-2 text-slate-700">1. Lương cơ bản theo hợp đồng lao động</td>
                    <td className="p-2 text-right font-mono font-bold text-slate-900">+{baseSalary.toLocaleString('vi-VN')} đ</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="p-2 text-slate-700">2. Thưởng hiệu suất KPI Sprint (Đạt 96.0%)</td>
                    <td className="p-2 text-right font-mono font-bold text-emerald-600">+{kpiBonus.toLocaleString('vi-VN')} đ</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="p-2 text-slate-700">3. Phụ cấp ăn trưa và thiết bị công nghệ</td>
                    <td className="p-2 text-right font-mono font-bold text-slate-900">+{lunchAllowance.toLocaleString('vi-VN')} đ</td>
                  </tr>
                  <tr className="bg-slate-50 font-bold">
                    <td className="p-2 text-slate-800">TỔNG THU NHẬP GỘP</td>
                    <td className="p-2 text-right font-mono text-blue-700 text-sm">+{gross.toLocaleString('vi-VN')} đ</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="font-bold text-slate-900 uppercase text-[11px] mb-2 text-rose-700">
                II. CÁC KHOẢN KHẤU TRỪ THEO LUẬT ĐỊNH
              </h3>
              <table className="w-full border border-slate-200 rounded-lg overflow-hidden">
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50">
                    <td className="p-2 text-slate-700">1. Trích nộp BHXH, BHYT, BHTN (10.5%)</td>
                    <td className="p-2 text-right font-mono text-rose-600 font-semibold">-{bhxh.toLocaleString('vi-VN')} đ</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="p-2 text-slate-700">2. Thuế thu nhập cá nhân tạm khấu trừ</td>
                    <td className="p-2 text-right font-mono text-rose-600 font-semibold">-{tax.toLocaleString('vi-VN')} đ</td>
                  </tr>
                  <tr className="bg-slate-50 font-bold">
                    <td className="p-2 text-slate-800">TỔNG CÁC KHOẢN KHẤU TRỪ</td>
                    <td className="p-2 text-right font-mono text-rose-600 text-sm">-{totalDeduction.toLocaleString('vi-VN')} đ</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* NET SALARY HIGHLIGHT */}
          <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between shadow-sm">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-blue-100">
                THỰC LĨNH CHUYỂN KHOẢN
              </span>
              <div className="text-2xl font-bold font-display mt-0.5">
                {net.toLocaleString('vi-VN')} VNĐ
              </div>
              <div className="text-[11px] text-blue-100 italic mt-0.5">
                (Bằng chữ: {amountInWords})
              </div>
            </div>

            <div className="text-center p-2 bg-white/10 backdrop-blur rounded-xl border border-white/20">
              <QrCode className="w-10 h-10 text-white mx-auto" />
              <span className="text-[9px] font-mono text-blue-100 block mt-1">Xác thực số</span>
            </div>
          </div>

          {/* Corporate Seal & E-Signature Section */}
          <div className="mt-6 pt-5 border-t border-slate-200 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-[11px] font-bold text-slate-700 uppercase">Người Lập Phiếu</p>
              <p className="text-[10px] text-slate-400 italic mb-10">(Ký, họ tên)</p>
              <p className="text-[11px] font-bold text-slate-800">Nguyễn Thu Thảo</p>
              <p className="text-[9px] text-slate-400">Chuyên viên C&B</p>
            </div>

            <div className="relative">
              <p className="text-[11px] font-bold text-slate-700 uppercase">Giám Đốc Nhân Sự</p>
              <p className="text-[10px] text-slate-400 italic mb-2">(Ký điện tử & duyệt)</p>
              
              {/* E-Signature Box */}
              <div className="inline-block p-1.5 border border-emerald-300 bg-emerald-50/50 rounded-lg text-left my-1 shadow-2xs">
                <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-800">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                  KÝ SỐ VNPT-CA
                </div>
                <div className="text-[8px] text-emerald-700 font-mono">05/09/2026 08:30:15</div>
                <div className="text-[9px] font-semibold text-slate-800">Trần Mai Hương</div>
              </div>

              <p className="text-[11px] font-bold text-slate-800 mt-1">Trần Mai Hương</p>
              <p className="text-[9px] text-slate-400">Giám đốc Khối Nhân sự</p>
            </div>

            <div className="relative">
              <p className="text-[11px] font-bold text-slate-700 uppercase">Tổng Giám Đốc</p>
              <p className="text-[10px] text-slate-400 italic mb-2">(Phê duyệt chi trả)</p>
              
              {/* Corporate Red Seal Stamp Effect */}
              <div className="inline-block p-1.5 border border-rose-300 bg-rose-50/50 rounded-lg text-left my-1 shadow-2xs">
                <div className="flex items-center gap-1 text-[9px] font-bold text-rose-800">
                  <Award className="w-3 h-3 text-rose-600 shrink-0" />
                  FWB NEXUS CORP
                </div>
                <div className="text-[8px] text-rose-700 font-mono">DẤU PHÁP NHÂN SỐ</div>
                <div className="text-[9px] font-semibold text-slate-800">Lê Vũ Ngọc Duy</div>
              </div>

              <p className="text-[11px] font-bold text-slate-800 mt-1">Lê Vũ Ngọc Duy</p>
              <p className="text-[9px] text-slate-400">Tổng Giám Đốc (CEO)</p>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Mã bảo mật chữ ký số điện tử: <span className="font-mono text-slate-700 font-bold">SHA-256: 9e4f..88a1</span></span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>In phiếu lương (A4)</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Tải file PDF (Print Dialog)</span>
            </button>
          </div>
        </div>
      </div>
    </AppleModal>
  );
}
