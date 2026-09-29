import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck, Check, X, Loader2 } from 'lucide-react';
import payrollService from '../../services/payrollService';

export default function Modal7A_PayrollAnomaly({ isOpen, onClose, payload }) {
  const [resolved, setResolved] = useState({});
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(false);

  const periodId = payload?.periodId || payload?.id;
  const periodName = payload?.period || payload?.periodName || 'Kỳ lương hiện tại';

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!isOpen) return;
      if (payload?.anomalies && Array.isArray(payload.anomalies)) {
        setAnomalies(payload.anomalies);
        return;
      }
      if (!periodId) {
        setAnomalies([]);
        return;
      }
      setLoading(true);
      try {
        const res = await payrollService.getAnomalies(periodId);
        const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : (res?.data?.data || []));
        if (isMounted) {
          setAnomalies(list);
        }
      } catch (err) {
        console.warn('Load payroll anomaly notice:', err);
        if (isMounted) setAnomalies([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [isOpen, payload, periodId]);

  const toggleResolved = (index) => {
    setResolved((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const resolvedCount = Object.values(resolved).filter(Boolean).length;
  const allResolved = anomalies.length > 0 && resolvedCount === anomalies.length;

  const handleResolveAll = () => {
    const allState = {};
    anomalies.forEach((_, idx) => {
      allState[idx] = true;
    });
    setResolved(allState);
    setTimeout(() => onClose(), 800);
  };

  const getSeverityStyle = (severity) => {
    switch (severity) {
      case 'Cao':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Trung bình':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  return (
    <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-4xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3.5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              anomalies.length > 0 ? 'bg-amber-50 border border-amber-200 text-amber-600' : 'bg-emerald-50 border border-emerald-200 text-emerald-600'
            }`}>
              {anomalies.length > 0 ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Xử lý và Thẩm định bất thường bảng lương</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  anomalies.length > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}>
                  {anomalies.length > 0 ? `Phát hiện ${anomalies.length} cảnh báo` : 'Hoàn toàn hợp lệ'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Kỳ lương {periodName} • Cần đối soát tính tuân thủ pháp lý trước khi khóa sổ
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

        {/* Loading state */}
        {loading && (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-xs">Đang đối soát dữ liệu kỳ lương từ hệ thống...</span>
          </div>
        )}

        {/* Empty state (No anomalies) */}
        {!loading && anomalies.length === 0 && (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center mx-auto text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">Bảng lương hợp lệ 100%</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Không phát hiện bất thường về giờ làm thêm, tài khoản ngân hàng hoặc chênh lệch dữ liệu chấm công trong kỳ lương này.
            </p>
          </div>
        )}

        {/* Dynamic Anomaly Cards */}
        {!loading && anomalies.length > 0 && (
          <div className="mt-5 space-y-3.5 max-h-[60vh] overflow-y-auto pr-1">
            {anomalies.map((item, idx) => {
              const isResolved = !!resolved[idx];
              return (
                <div
                  key={`${item.employee_id}-${idx}`}
                  className={`p-4 rounded-xl border transition-all ${
                    isResolved ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-amber-200 shadow-xs'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">
                            {item.full_name} ({item.employee_id})
                          </span>
                          <span className={`px-2 py-0.5 border text-[10px] font-bold rounded ${getSeverityStyle(item.severity)}`}>
                            Mức độ: {item.severity}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                          {item.message}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleResolved(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition flex items-center gap-1.5 cursor-pointer ${
                        isResolved
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {isResolved ? <Check className="w-3.5 h-3.5" /> : null}
                      {isResolved ? 'Đã duyệt ngoại lệ' : 'Phê duyệt ngoại lệ'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {anomalies.length > 0 ? (
              <>Trạng thái xử lý: <strong className="text-slate-800">{resolvedCount} / {anomalies.length} cảnh báo</strong></>
            ) : (
              <span className="text-emerald-600 font-semibold">Sẵn sàng phê duyệt và khóa bảng lương</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs transition"
            >
              Đóng
            </button>
            {anomalies.length > 0 && (
              <button
                onClick={handleResolveAll}
                className={`px-5 py-2 rounded-xl text-xs font-bold shadow-sm transition active:scale-95 flex items-center gap-1.5 ${
                  allResolved
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                Chấp thuận toàn bộ và Tiếp tục
              </button>
            )}
          </div>
        </div>
      </div>
    </AppleModal>
  );
}
