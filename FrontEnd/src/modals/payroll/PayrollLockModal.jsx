import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { Lock, AlertTriangle, Globe, X, Loader2, AlertCircle, CheckCircle2, FileText } from 'lucide-react';
import confetti from 'canvas-confetti';
import payrollService from '../../services/payrollService';

export default function PayrollLockModal({ isOpen, onClose, payload }) {
  const [anomalies, setAnomalies] = useState([]);
  const [loadingAnomalies, setLoadingAnomalies] = useState(false);
  const [acknowledgeAnomalies, setAcknowledgeAnomalies] = useState(false);
  const [lockNote, setLockNote] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const periodId = payload?.id || payload?.periodId || payload?.period?.id;
  const empCount = payload?.employeesCount ?? payload?.slips?.length ?? payload?.employees?.length ?? 0;
  const periodName = payload?.period?.name || payload?.periodName || payload?.period || payload?.id || 'Kỳ hiện tại';
  const totalAmountStr =
    payload?.totalNet !== undefined && payload?.totalNet !== null
      ? `${Number(payload.totalNet).toLocaleString('vi-VN')} đ`
      : 'Chưa tổng hợp';

  useEffect(() => {
    if (!isOpen) return;
    setAcknowledgeAnomalies(false);
    setLockNote('');
    setErrorMsg('');
    setIsLocked(false);

    const initialList = Array.isArray(payload?.anomalies) ? payload.anomalies : [];
    setAnomalies(initialList);

    if (!periodId) return;
    let isMounted = true;
    setLoadingAnomalies(true);
    payrollService
      .getAnomalies(periodId)
      .then((res) => {
        if (!isMounted) return;
        const list = Array.isArray(res)
          ? res
          : Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.data?.data)
          ? res.data.data
          : [];
        setAnomalies(list);
      })
      .catch((err) => {
        if (!isMounted) return;
        setErrorMsg(err?.message || 'Không thể tải danh sách đối soát bất thường của kỳ lương.');
      })
      .finally(() => {
        if (isMounted) setLoadingAnomalies(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, periodId, payload?.anomalies]);

  const staleItems = anomalies.filter((a) => a.category === 'stale' || a.type === 'PAYROLL_STALE');
  const violations = anomalies.filter((a) => a.category === 'violation');
  const warnings = anomalies.filter((a) => a.category !== 'violation' && a.category !== 'stale' && a.type !== 'PAYROLL_STALE');

  const handleConfirmLock = async () => {
    if (staleItems.length > 0) {
      setErrorMsg('Dữ liệu nguồn tính lương đã thay đổi sau lần tính cuối. Vui lòng tính lại bảng lương trước khi khóa sổ.');
      return;
    }
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      if (!periodId) {
        throw new Error('Không xác định được mã kỳ lương cần khóa sổ');
      }
      const shouldAcknowledge = violations.length > 0 ? Boolean(acknowledgeAnomalies) : false;
      await payrollService.lockPeriod(periodId, shouldAcknowledge, {
        note: lockNote.trim() ? lockNote.trim() : undefined,
      });
      setIsLocked(true);
      window.dispatchEvent(new CustomEvent('nexus:payroll-locked', { detail: { periodId } }));
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {}
      setTimeout(() => {
        setIsLocked(false);
        onClose();
      }, 1500);
    } catch (err) {
      setErrorMsg(err?.message || 'Khóa sổ lương thất bại. Vui lòng kiểm tra bất thường chấm công hoặc trạng thái kỳ lương.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-xl">
      <div className="p-6" data-testid="payroll-lock-modal">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Khóa sổ lương và Phát hành phiếu lương</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-wider">
                  Kiểm soát chốt sổ
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Kỳ lương {periodName} • Quy mô: <strong className="text-slate-800">{empCount} nhân sự</strong> • Quỹ lương: <strong className="text-emerald-700">{totalAmountStr}</strong>
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

        {errorMsg && (
          <div
            data-testid="payroll-lock-error"
            className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {staleItems.length > 0 && (
          <div
            data-testid="payroll-lock-stale-banner"
            className="mt-4 p-3 bg-rose-100/90 border border-rose-300 rounded-xl text-rose-900 text-xs font-semibold flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-700 mt-0.5" />
            <div>
              <span className="font-bold block">
                Phát hiện {staleItems.length} thay đổi dữ liệu nguồn sau lần tính lương cuối (PAYROLL_STALE)
              </span>
              <span className="text-[11px] text-rose-800 block mt-0.5">
                Dữ liệu chấm công, nghỉ phép hưởng lương, lương cơ bản hoặc chính sách đã thay đổi. Vui lòng tính lại bảng lương trước khi khóa sổ (checkbox xác nhận bất thường không thể bỏ qua lỗi này).
              </span>
            </div>
          </div>
        )}

        {/* 1. Actual Anomaly Inspection Before Lock */}
        <div className="mt-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800">Kết quả đối soát bất thường trước khi chốt:</span>
            {loadingAnomalies ? (
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang kiểm tra...
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-slate-600" data-testid="payroll-lock-anomaly-summary">
                {staleItems.length > 0 ? `${staleItems.length} nguồn lỗi thời • ` : ''}
                {violations.length} vi phạm chặn chốt • {warnings.length} cảnh báo
              </span>
            )}
          </div>

          {anomalies.length === 0 && !loadingAnomalies ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Không phát hiện bất thường chấm công hoặc vượt trần OT trong kỳ lương này.</span>
            </div>
          ) : (
            <div
              data-testid="payroll-lock-anomaly-list"
              className="max-h-44 overflow-y-auto space-y-2 pr-1 border border-slate-200 rounded-xl p-2.5 bg-slate-50/70"
            >
              {anomalies.map((item, idx) => {
                const isStale = item.category === 'stale' || item.type === 'PAYROLL_STALE';
                const isViolation = item.category === 'violation' || isStale;
                const empId = item.employee_id || item.employeeId || '';
                const empName = item.full_name || item.name || 'Nhân sự';
                const title = item.title || item.type || 'Bất thường';
                const desc = item.message || item.desc || '';
                return (
                  <div
                    key={item.id || `${empId}-${item.type}-${idx}`}
                    data-testid="payroll-lock-anomaly-item"
                    className={`p-2.5 rounded-lg border text-left ${
                      isViolation
                        ? 'bg-rose-50/90 border-rose-200 text-rose-900'
                        : 'bg-amber-50/90 border-amber-200 text-amber-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">
                        {empName} ({empId}) — {title}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isViolation ? 'bg-rose-200 text-rose-800' : 'bg-amber-200 text-amber-800'
                        }`}
                      >
                        {isStale ? 'Cần tính lại' : isViolation ? 'Chặn chốt' : 'Cảnh báo'}
                      </span>
                    </div>
                    <p className="text-[11px] mt-1 opacity-90">{desc}</p>
                  </div>
                );
              })}
            </div>
          )}

          {violations.length > 0 && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-rose-300 bg-rose-50/60 hover:bg-rose-50 cursor-pointer transition">
              <input
                type="checkbox"
                data-testid="acknowledge-anomalies-checkbox"
                checked={acknowledgeAnomalies}
                onChange={(e) => setAcknowledgeAnomalies(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-rose-600 rounded border-rose-300 focus:ring-rose-500"
              />
              <div className="text-left">
                <span className="font-bold text-rose-900">
                  Tôi đã xem {violations.length} bất thường nghiêm trọng và chủ động xác nhận cho phép khóa sổ theo chính sách
                </span>
                <span className="block text-[11px] text-rose-700 mt-0.5">
                  Nếu không tích chọn xác nhận này, hệ thống sẽ từ chối khóa sổ kỳ lương. Xác nhận được ghi vào nhật ký kiểm toán (Audit Log).
                </span>
              </div>
            </label>
          )}
        </div>

        {/* 2. Actual System Effects of Locking */}
        <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
          <div className="font-bold text-slate-800 flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-blue-600" />
            <span>Trạng thái hệ thống thực tế khi thực hiện khóa sổ:</span>
          </div>
          <ul className="list-disc list-inside text-[11px] text-slate-600 space-y-1">
            <li>
              Chuyển trạng thái kỳ lương sang <strong>DA_CHOT</strong>; đóng băng bất biến toàn bộ phiếu lương và snapshot thông số chính sách của kỳ.
            </li>
            <li>
              Mở quyền tra cứu phiếu lương kỳ <strong>{periodName}</strong> trên Cổng Nhân viên (ESS Portal) cho {empCount} nhân sự.
            </li>
            <li>
              Ghi nhận người khóa sổ, thời điểm, ghi chú và xác nhận bất thường vào bảng <strong>audit_logs</strong>.
            </li>
          </ul>
        </div>

        {/* 3. Audit Note (persisted to Backend audit_logs) */}
        <div className="mt-4 space-y-1 text-xs">
          <label className="font-bold text-slate-800 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Ghi chú khóa sổ (lưu vào nhật ký kiểm toán Audit Log):</span>
          </label>
          <input
            type="text"
            data-testid="payroll-lock-note-input"
            placeholder="Nhập ghi chú đối soát hoặc lý do xác nhận bất thường (tùy chọn)..."
            value={lockNote}
            onChange={(e) => setLockNote(e.target.value)}
            maxLength={500}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
          />
        </div>

        {isLocked && (
          <div
            data-testid="payroll-lock-success"
            className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-center font-bold text-xs"
          >
            ✓ Đã khóa sổ lương {periodName} thành công và mở tra cứu cho {empCount} phiếu lương!
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs transition"
          >
            Hủy thao tác
          </button>
          <button
            data-testid="payroll-lock-submit-btn"
            onClick={handleConfirmLock}
            disabled={isSubmitting || isLocked || loadingAnomalies || staleItems.length > 0}
            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-sm transition active:scale-95 flex items-center gap-1.5"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            {isSubmitting ? 'Đang khóa sổ...' : `Xác nhận Khóa sổ và Phát hành (${empCount} phiếu)`}
          </button>
        </div>
      </div>
    </AppleModal>
  );
}
