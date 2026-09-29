import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { 
  DollarSign, 
  Clock, 
  Calendar, 
  FileText, 
  Save, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  User, 
  Calculator,
  X,
  FileSpreadsheet,
  HelpCircle,
  ShieldCheck,
  Building,
  Briefcase,
  ChevronRight
} from 'lucide-react';
import payrollService from '../../services/payrollService';
import { formatVND } from '../../utils/dataAdapters';
import { useModal } from '../../context/ModalContext';
import confetti from 'canvas-confetti';

export default function PayrollAdjustModal({ isOpen, onClose, payload, onAdjustSuccess }) {
  const { openModal } = useModal();
  const payslip = payload?.payslip || payload;
  const isPeriodLocked = payload?.isLocked || payslip?.period_status === 'DA_CHOT' || payslip?.status === 'DA_CHOT';

  // Base contract details
  const [baseSalary, setBaseSalary] = useState(20000000);
  
  // Work days breakdown (C&B standard)
  const standardWorkDays = 22; // 22 ngày công chuẩn tháng 09/2026
  const [actualWorkDays, setActualWorkDays] = useState(22);
  const [paidLeaveDays, setPaidLeaveDays] = useState(0);
  const [unpaidLeaveDays, setUnpaidLeaveDays] = useState(0);

  // Other compensations
  const [otHours, setOtHours] = useState(0);
  const [bonus, setBonus] = useState(0);
  const [allowances, setAllowances] = useState(1500000);
  const [note, setNote] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (payslip) {
      setBaseSalary(Number(payslip.base_salary || payslip.contractSalary || 20000000));
      const rawDays = Number(payslip.actual_work_days ?? 22);
      setActualWorkDays(rawDays);
      setPaidLeaveDays(0);
      setUnpaidLeaveDays(Math.max(0, 22 - rawDays));
      setOtHours(Number(payslip.ot_hours ?? 0));
      setBonus(Number(payslip.bonus ?? 0));
      setAllowances(Number(payslip.allowances ?? 1500000));
      setNote(payslip.note || '');
      setErrorMsg('');
      setSuccessMsg('');
    }
  }, [payslip, isOpen]);

  // C&B Computation:
  // Ngày công tính lương = Ngày làm việc thực tế + Ngày nghỉ phép hưởng lương
  const totalPaidDays = Math.min(Math.max(Number(actualWorkDays) + Number(paidLeaveDays), 0), standardWorkDays);
  
  // Lương thời gian = (Lương hợp đồng / Ngày công chuẩn) * Ngày công tính lương
  const salaryByDays = Math.round((baseSalary / standardWorkDays) * totalPaidDays);
  
  // Đơn giá 1 giờ chuẩn = Lương hợp đồng / (22 ngày * 8 giờ)
  const hourlyRate = baseSalary / standardWorkDays / 8;
  const otPay = Math.round((Number(otHours) || 0) * hourlyRate * 1.5);
  
  // Tổng thu nhập trước thuế (Gross)
  const grossIncome = salaryByDays + otPay + (Number(allowances) || 0) + (Number(bonus) || 0);
  
  // Trích nộp Bảo hiểm bắt buộc (NLĐ đóng 10.5%)
  const bhxhCeiling = 46800000; // 20 x 2.34M
  const bhtnCeiling = 99200000;
  const bhxh = Math.round(Math.min(baseSalary, bhxhCeiling) * 0.08);
  const bhyt = Math.round(Math.min(baseSalary, bhxhCeiling) * 0.015);
  const bhtn = Math.round(Math.min(baseSalary, bhtnCeiling) * 0.01);
  const insuranceTotal = bhxh + bhyt + bhtn;

  // Thuế TNCN lũy tiến 7 bậc
  const personalDeduction = 11000000; // Giảm trừ bản thân
  const taxable = Math.max(0, grossIncome - insuranceTotal - personalDeduction);

  const computePit = (t) => {
    if (t <= 0) return 0;
    const brackets = [
      [5000000, 0.05],
      [10000000, 0.1],
      [18000000, 0.15],
      [32000000, 0.2],
      [52000000, 0.25],
      [80000000, 0.3],
      [Infinity, 0.35],
    ];
    let tax = 0;
    let lower = 0;
    for (const [upper, rate] of brackets) {
      if (t <= lower) break;
      tax += (Math.min(t, upper) - lower) * rate;
      lower = upper;
    }
    return Math.round(tax);
  };

  const pitAmount = computePit(taxable);
  const totalDeductions = insuranceTotal + pitAmount;
  const estimatedNet = grossIncome - totalDeductions;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!payslip?.id) {
      setErrorMsg('Không tìm thấy mã phiếu lương để cập nhật');
      return;
    }
    if (isPeriodLocked) {
      setErrorMsg('Kỳ lương này đã được chốt, không thể chỉnh sửa.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await payrollService.updatePayslip(payslip.id, {
        baseSalary: Number(baseSalary),
        actualWorkDays: totalPaidDays,
        otHours: Number(otHours),
        allowances: Number(allowances),
        bonus: Number(bonus),
        note: note.trim() || undefined,
      });

      if (res && (res.success || res.status === 200 || res.data)) {
        setSuccessMsg('Đã cập nhật phiếu lương và đồng bộ tổng quỹ lương thành công!');
        try {
          confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
        } catch (e) { }

        if (onAdjustSuccess) onAdjustSuccess();
        window.dispatchEvent(new CustomEvent('nexus:payroll-locked'));

        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setErrorMsg(res?.message || 'Có lỗi khi cập nhật bảng lương.');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Lỗi kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenTimesheetCheck = () => {
    openModal('modal5B');
  };

  return (
    <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-4xl">
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 font-display">
                  Hiệu Chỉnh Thu Nhập & Ngày Công Nhân Viên
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                  Nghiệp vụ C&B
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Rà soát chấm công thực tế, đối soát hợp đồng lao động và tính toán thuế TNCN/BHXH trước khi chốt lương.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Employee Baseline Card */}
        <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold font-mono text-xs shrink-0">
              {payslip?.employee_id || payslip?.id || 'NV'}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-bold text-slate-900 text-sm">
                  {payslip?.full_name || payslip?.name || 'Nhân sự'}
                </h4>
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-xs font-mono font-semibold">
                  {payslip?.employee_id || payslip?.id}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-xs font-medium">
                  {payslip?.job_title || payslip?.role || 'Nhân viên chính thức'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span>{payslip?.department_name || payslip?.department || 'Khối Phát triển'}</span>
                <span>•</span>
                <span>Kỳ lương: <strong>Tháng 09/2026</strong></span>
                <span>•</span>
                <span>Lương HĐ gốc: <strong className="text-slate-700">{formatVND(baseSalary)}</strong></span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenTimesheetCheck}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-2xs flex items-center gap-1.5 transition cursor-pointer shrink-0"
            title="Mở Bảng Chấm Công Tháng để đối soát chéo từng ngày"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Đối soát Bảng Công</span>
          </button>
        </div>

        {/* Lock warning if locked */}
        {isPeriodLocked && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Kỳ lương này đã được <strong>Khóa sổ chi trả</strong>. Bạn chỉ có thể xem chi tiết mà không thể chỉnh sửa.</span>
          </div>
        )}

        {/* Error / Success messages */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Main 2-Column Grid: Left inputs + Right financial breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            
            {/* Left Column: Form Controls (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              
              {/* Section 1: Ngày Công Tính Lương (Cốt lõi nghiệp vụ HR) */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span>Cơ sở Ngày Công Tính Lương</span>
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    Công chuẩn: {standardWorkDays} ngày
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Công thực tế (đi làm)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="31"
                        disabled={isPeriodLocked}
                        value={actualWorkDays}
                        onChange={(e) => setActualWorkDays(e.target.value)}
                        className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                        required
                      />
                      <span className="absolute right-2.5 top-2.5 text-xs text-slate-400">ngày</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Nghỉ phép hưởng lương
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="12"
                        disabled={isPeriodLocked}
                        value={paidLeaveDays}
                        onChange={(e) => setPaidLeaveDays(e.target.value)}
                        className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-blue-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                      <span className="absolute right-2.5 top-2.5 text-xs text-slate-400">ngày</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Nghỉ không lương (trừ)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="31"
                        disabled={isPeriodLocked}
                        value={unpaidLeaveDays}
                        onChange={(e) => setUnpaidLeaveDays(e.target.value)}
                        className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-rose-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                      />
                      <span className="absolute right-2.5 top-2.5 text-xs text-slate-400">ngày</span>
                    </div>
                  </div>
                </div>

                {/* Formula Highlight Banner */}
                <div className="bg-indigo-50/70 border border-indigo-200/70 rounded-xl p-3 text-xs text-indigo-950 flex flex-col gap-1">
                  <div className="flex items-center justify-between font-bold">
                    <span>Tổng ngày công tính lương:</span>
                    <span className="text-indigo-700 font-mono text-sm">{totalPaidDays} / {standardWorkDays} ngày</span>
                  </div>
                  <div className="text-[11px] text-indigo-800 flex items-center justify-between pt-1 border-t border-indigo-100">
                    <span>Công thức lương thời gian:</span>
                    <span className="font-mono">({formatVND(baseSalary)} / 22) × {totalPaidDays} = <strong>{formatVND(salaryByDays)}</strong></span>
                  </div>
                </div>
              </div>

              {/* Section 2: Lương Cơ Bản Hợp Đồng & Phụ Cấp */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3.5">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>Thu Nhập & Phụ Cấp Hợp Đồng</span>
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Lương cơ bản hợp đồng (đóng BH)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="100000"
                        min="0"
                        disabled={isPeriodLocked}
                        value={baseSalary}
                        onChange={(e) => setBaseSalary(Number(e.target.value))}
                        className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
                        required
                      />
                      <span className="absolute right-2.5 top-2.5 text-xs text-slate-400">₫</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Phụ cấp theo chính sách (ăn trưa, xe)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="50000"
                        min="0"
                        disabled={isPeriodLocked}
                        value={allowances}
                        onChange={(e) => setAllowances(Number(e.target.value))}
                        className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      />
                      <span className="absolute right-2.5 top-2.5 text-xs text-slate-400">₫</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Số giờ làm thêm OT (hệ số 150%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        disabled={isPeriodLocked}
                        value={otHours}
                        onChange={(e) => setOtHours(Number(e.target.value))}
                        className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-amber-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-100"
                      />
                      <span className="absolute right-2.5 top-2.5 text-xs text-slate-400">giờ</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">Tiền OT: +{formatVND(otPay)}</span>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Thưởng nóng / Thưởng KPI tháng
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="100000"
                        min="0"
                        disabled={isPeriodLocked}
                        value={bonus}
                        onChange={(e) => setBonus(Number(e.target.value))}
                        className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-emerald-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      />
                      <span className="absolute right-2.5 top-2.5 text-xs text-slate-400">₫</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Lý do & Căn cứ điều chỉnh của HR */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-2">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-purple-600" />
                  <span>Căn Cứ & Lý Do Hiệu Chỉnh Của HR (Audit Log)</span>
                </label>
                <textarea
                  rows="2"
                  disabled={isPeriodLocked}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ví dụ: Bổ sung 1 ngày công tác ngày 14/09 theo email phê duyệt của Trưởng bộ phận..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-100"
                ></textarea>
                <span className="text-[11px] text-slate-400 italic block">
                  * Ghi chú này sẽ được lưu vào biên bản kiểm toán tài chính để Ban Giám Đốc đối soát khi phê duyệt chi trả.
                </span>
              </div>
            </div>

            {/* Right Column: Live Financial & PIT Breakdown Card (5 cols) */}
            <div className="lg:col-span-5 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Bảng Quyết Toán Tài Chính
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
                  Tự động tính thuế
                </span>
              </div>

              {/* Breakdown lines */}
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center text-slate-300">
                  <span>Lương theo ngày công ({totalPaidDays}/22d):</span>
                  <span className="font-mono font-semibold">{formatVND(salaryByDays)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-300">
                  <span>Lương làm thêm OT ({otHours}h × 150%):</span>
                  <span className="font-mono font-semibold text-amber-400">+{formatVND(otPay)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-300">
                  <span>Phụ cấp & Thưởng KPI:</span>
                  <span className="font-mono font-semibold text-emerald-400">+{formatVND(Number(allowances) + Number(bonus))}</span>
                </div>

                <div className="pt-2 border-t border-slate-800 flex justify-between items-center font-bold text-white text-sm">
                  <span>Tổng thu nhập Gross:</span>
                  <span className="font-mono text-emerald-400">{formatVND(grossIncome)}</span>
                </div>

                <div className="flex justify-between items-center text-rose-300 text-[11px] pt-1">
                  <span>Trích BHXH, BHYT, BHTN (10.5%):</span>
                  <span className="font-mono">-{formatVND(insuranceTotal)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-400 text-[11px]">
                  <span>Giảm trừ gia cảnh bản thân:</span>
                  <span className="font-mono">-11.000.000 ₫</span>
                </div>

                <div className="flex justify-between items-center text-rose-300 text-[11px]">
                  <span>Thuế TNCN tạm tính (7 bậc):</span>
                  <span className="font-mono">-{formatVND(pitAmount)}</span>
                </div>
              </div>

              {/* Net Pay Final Display */}
              <div className="pt-4 border-t border-slate-800 bg-white/5 rounded-xl p-3.5 border border-white/10 text-center space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300 block">
                  Lương Thực Nhận (Net Pay)
                </span>
                <div className="text-2xl sm:text-3xl font-bold font-mono text-emerald-400">
                  {formatVND(estimatedNet)}
                </div>
                <span className="text-[10px] text-slate-400 block">
                  Đã khấu trừ bảo hiểm bắt buộc và thuế thu nhập cá nhân
                </span>
              </div>

              {/* Actions inside card */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                {!isPeriodLocked && (
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>{loading ? 'Đang lưu...' : 'Lưu Thay Đổi'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </AppleModal>
  );
}
