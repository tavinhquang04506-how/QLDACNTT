import React, { useState, useEffect, useMemo } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import Avatar from '../../components/common/Avatar';
import {
  AlertOctagon, AlertTriangle, ShieldCheck, Search, ChevronRight, ChevronLeft, Users,
  DollarSign, Clock, Target, TrendingDown, UserX, AlarmClock, Loader2, X, Download,
  Star, ClipboardList, Edit3, UserSquare2, Info, Building2, ExternalLink
} from 'lucide-react';
import analyticsService from '../../services/analyticsService';
import { generateCSVContent, downloadFile } from '../../utils/fileExportUtils';
import {
  LEVEL_CONFIG,
  SIGNAL_DEFINITIONS,
  computeRiskStats,
  filterRiskList,
  isTopTalentAtRisk,
} from '../../utils/turnoverRisk';

// ───────── Signal icon mapping ─────────
const SIGNAL_ICONS = {
  PAY_GAP: DollarSign,
  OT_LOAD: Clock,
  OT_TREND: Clock,
  STAGNATION: Target,
  LOW_PERFORMANCE: TrendingDown,
  PERFORMANCE_DROP: TrendingDown,
  UNPAID_ABSENCE: UserX,
  FREQUENT_LATE: AlarmClock,
};

const SIGNAL_TONE = {
  PAY_GAP: 'text-rose-600 bg-rose-50 border-rose-200',
  OT_LOAD: 'text-amber-600 bg-amber-50 border-amber-200',
  OT_TREND: 'text-amber-600 bg-amber-50 border-amber-200',
  STAGNATION: 'text-blue-600 bg-blue-50 border-blue-200',
  LOW_PERFORMANCE: 'text-rose-600 bg-rose-50 border-rose-200',
  PERFORMANCE_DROP: 'text-rose-600 bg-rose-50 border-rose-200',
  UNPAID_ABSENCE: 'text-purple-600 bg-purple-50 border-purple-200',
  FREQUENT_LATE: 'text-orange-600 bg-orange-50 border-orange-200',
};

function ScoreGauge({ score, size = 'md' }) {
  const level = score >= 60 ? 'Cao' : score >= 30 ? 'Trung bình' : 'Thấp';
  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG['Thấp'];
  const dims = size === 'lg' ? 'w-16 h-16 text-lg' : 'w-10 h-10 text-xs';
  return (
    <div className={`${dims} rounded-full ${cfg.bg} ${cfg.border} border-2 flex items-center justify-center font-black ${cfg.text} shrink-0 shadow-2xs`}>
      {score}
    </div>
  );
}

// ───────── Main Modal ─────────
export default function Modal8A_TurnoverRisk({ isOpen, onClose, payload }) {
  const [riskList, setRiskList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState(payload?.selectedDept || 'all');
  const [onlyTalents, setOnlyTalents] = useState(false);
  const [sortBy, setSortBy] = useState('score_desc');
  const [selected, setSelected] = useState(null); // drill-down employee
  const [showFormulaInfo, setShowFormulaInfo] = useState(false);

  const talentIds = payload?.talentIds || [];
  const activePipEmployeeIds = payload?.activePipEmployeeIds || [];

  // ───── Load data (lấy đầy đủ limit 200) ─────
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      setSelected(null);
      setSearch('');
      setLevelFilter('all');
      setDeptFilter(payload?.selectedDept || 'all');
      setOnlyTalents(false);
      try {
        const res = await analyticsService.getTurnoverRisk({ limit: 200 });
        if (alive) {
          const list = Array.isArray(res?.data) ? res.data : [];
          setRiskList(list);
        }
      } catch (err) {
        if (alive) setError(err?.message || 'Không thể tải dữ liệu nguy cơ biến động.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [isOpen, payload?.selectedDept]);

  // ───── If opened with a specific employee ─────
  useEffect(() => {
    if (!isOpen || !payload?.employeeId || riskList.length === 0) return;
    const found = riskList.find((r) => r.employee_id === payload.employeeId);
    if (found) setSelected(found);
  }, [isOpen, payload?.employeeId, riskList]);

  // ───── Departments list ─────
  const departments = useMemo(() => {
    if (payload?.departments && Array.isArray(payload.departments) && payload.departments.length > 0) {
      return payload.departments;
    }
    const map = new Map();
    riskList.forEach((r) => {
      if (!r.department_id) return;
      if (!map.has(r.department_id)) {
        map.set(r.department_id, { id: r.department_id, name: r.department_name || r.department_id });
      }
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [payload?.departments, riskList]);

  // ───── Derived Stats ─────
  const stats = useMemo(() => computeRiskStats(riskList, talentIds), [riskList, talentIds]);

  // ───── Filtered List ─────
  const filtered = useMemo(() => filterRiskList(riskList, {
    search,
    levelFilter,
    deptFilter,
    talentIds,
    onlyTalentsAtRisk: onlyTalents,
    sortBy,
  }), [riskList, search, levelFilter, deptFilter, talentIds, onlyTalents, sortBy]);

  // ───── Export CSV ─────
  const handleExportCSV = () => {
    if (!filtered.length) return;
    const headers = [
      'Mã NV',
      'Họ Và Tên',
      'Chức Vụ',
      'Phòng Ban',
      'Điểm Rủi Ro (0-100)',
      'Mức Nguy Cơ',
      'Nhân Tài Nòng Cốt',
      'Số Tín Hiệu Cảnh Báo',
      'Chi Tiết Tín Hiệu',
    ];
    const rows = filtered.map((emp) => {
      const isTalent = talentIds.includes(emp.employee_id);
      const signalDetails = (emp.signals || []).map((s) => `[+${s.points}đ] ${s.title}: ${s.detail}`).join(' | ');
      return [
        emp.employee_id,
        emp.full_name || '',
        emp.job_title || '',
        emp.department_name || '',
        emp.score,
        emp.level,
        isTalent ? 'Có (9-Box)' : 'Không',
        emp.signals?.length || 0,
        signalDetails,
      ];
    });
    downloadFile(`Bao_Cao_Nguy_Co_Bien_Dong_Nhan_Su_${new Date().toISOString().slice(0, 10)}.csv`, generateCSVContent(headers, rows));
  };

  // ───── Action Handlers ─────
  const handleReviewAction = (emp) => {
    onClose();
    if (typeof payload?.onReview === 'function') {
      payload.onReview(emp.employee_id);
    }
  };

  const handlePipAction = (emp) => {
    onClose();
    if (typeof payload?.onOpenPip === 'function') {
      payload.onOpenPip({
        id: emp.employee_id,
        full_name: emp.full_name,
        job_title: emp.job_title,
        department_name: emp.department_name,
        department_id: emp.department_id,
      });
    }
  };

  const handleProfileAction = (emp) => {
    onClose();
    if (typeof payload?.onOpenProfile === 'function') {
      payload.onOpenProfile({
        id: emp.employee_id,
        full_name: emp.full_name,
        job_title: emp.job_title,
        department_name: emp.department_name,
        department_id: emp.department_id,
      });
    }
  };

  const handleTimesheetAction = (emp) => {
    onClose();
    if (typeof payload?.onOpenTimesheet === 'function') {
      payload.onOpenTimesheet(emp);
    }
  };

  // ───────── Detail View ─────────
  if (selected) {
    const cfg = LEVEL_CONFIG[selected.level] || LEVEL_CONFIG['Thấp'];
    const isTalent = talentIds.includes(selected.employee_id);
    const hasActivePip = activePipEmployeeIds.includes(selected.employee_id);
    const hasPerfSignal = (selected.signals || []).some((s) => s.code === 'LOW_PERFORMANCE' || s.code === 'PERFORMANCE_DROP');
    const hasAttendanceSignal = (selected.signals || []).some((s) => ['OT_LOAD', 'OT_TREND', 'UNPAID_ABSENCE', 'FREQUENT_LATE'].includes(s.code));

    return (
      <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-2xl">
        <div className="p-6 space-y-5">
          {/* Back + Header */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" /> Quay lại danh sách tổng quan
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Employee card */}
          <div className="flex items-center gap-4 p-4 bg-slate-50/80 border border-slate-200/90 rounded-2xl relative overflow-hidden">
            <Avatar src={selected.avatar_url} name={selected.full_name} id={selected.employee_id} size="xl" shape="rounded" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-slate-900 truncate">{selected.full_name}</h3>
                <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">{selected.employee_id}</span>
                {isTalent && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
                    <Star className="w-3 h-3 text-purple-600 fill-purple-600" /> Nhân tài nòng cốt (9-Box)
                  </span>
                )}
                {hasActivePip && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    <ClipboardList className="w-3 h-3 text-amber-600" /> Đang có PIP
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1">{selected.job_title || '—'} • <strong className="text-slate-700">{selected.department_name || '—'}</strong></p>
            </div>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <ScoreGauge score={selected.score} size="lg" />
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${cfg.badge}`}>{selected.level}</span>
            </div>
          </div>

          {/* Signals Detected */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                {selected.signals?.length || 0} Tín hiệu rủi ro được phát hiện
              </h4>
              <span className="text-[11px] text-slate-400">Dữ liệu thực tế từ hệ thống chấm công, đánh giá & đãi ngộ</span>
            </div>
            {selected.signals && selected.signals.length > 0 ? (
              <div className="space-y-2">
                {selected.signals.map((sig, i) => {
                  const SigIcon = SIGNAL_ICONS[sig.code] || AlertTriangle;
                  const tone = SIGNAL_TONE[sig.code] || 'text-slate-600 bg-slate-50 border-slate-200';
                  return (
                    <div key={i} className={`p-3 rounded-xl border ${tone} flex items-start gap-3 transition-all hover:shadow-2xs`}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/90 border border-current/10 shadow-2xs">
                        <SigIcon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold">{sig.title}</span>
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-white/90 border border-current/10 shrink-0">+{sig.points} điểm</span>
                        </div>
                        <p className="text-[11px] opacity-85 mt-0.5 leading-relaxed">{sig.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-400 text-center py-6 bg-slate-50 rounded-2xl border border-slate-200/80">
                <ShieldCheck className="w-8 h-8 mx-auto mb-1 text-emerald-500" />
                Nhân sự có chỉ số ổn định, không ghi nhận tín hiệu bất thường.
              </div>
            )}
          </div>

          {/* Score breakdown progress */}
          <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 font-semibold">Thang điểm rủi ro biến động</span>
              <span className={`font-black text-sm ${cfg.text}`}>{selected.score}/100</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  selected.score >= 60 ? 'bg-rose-500' : selected.score >= 30 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${selected.score}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold pt-1">
              <span>0 — Ổn định</span>
              <span>30 — Ngưỡng rà soát</span>
              <span>60 — Nguy cơ cao</span>
              <span>100</span>
            </div>
          </div>

          {/* Action Ribbon: Retention Actions */}
          <div className="pt-2 border-t border-slate-200/80">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5 text-indigo-500" /> Hành động can thiệp & Giữ chân nhân tài
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {payload?.onReview && (
                <button
                  type="button"
                  onClick={() => handleReviewAction(selected)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Đánh giá hiệu suất
                </button>
              )}

              {payload?.onOpenPip && (
                <button
                  type="button"
                  onClick={() => handlePipAction(selected)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
                >
                  <ClipboardList className="w-3.5 h-3.5" /> {hasActivePip ? 'Xem kế hoạch PIP' : 'Lập kế hoạch PIP'}
                </button>
              )}

              {payload?.onOpenTimesheet && hasAttendanceSignal && (
                <button
                  type="button"
                  onClick={() => handleTimesheetAction(selected)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-600" /> Kiểm tra bảng công
                </button>
              )}

              {payload?.onOpenProfile && (
                <button
                  type="button"
                  onClick={() => handleProfileAction(selected)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                >
                  <UserSquare2 className="w-3.5 h-3.5 text-blue-600" /> Xem hồ sơ 360
                </button>
              )}
            </div>
          </div>
        </div>
      </AppleModal>
    );
  }

  // ───────── List View ─────────
  return (
    <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-3xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-2xs">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Phân Tích Nguy Cơ Biến Động Nhân Sự</h3>
                <button
                  type="button"
                  onClick={() => setShowFormulaInfo(!showFormulaInfo)}
                  className="text-slate-400 hover:text-indigo-600 transition cursor-pointer p-0.5"
                  title="Xem tiêu chí và công thức tính điểm rủi ro"
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500">Mô hình AI phát hiện sớm tín hiệu bất thường về lương, OT, thâm niên, hiệu suất và chấm công</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filtered.length === 0}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
              title="Xuất file báo cáo danh sách rủi ro biến động"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" /> Xuất CSV
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Collapsible Info Card */}
        {showFormulaInfo && (
          <div className="mt-3 p-4 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl text-xs space-y-2">
            <div className="font-bold text-indigo-950 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-indigo-600" /> Tiêu chí đánh giá & 8 tín hiệu xác định điểm nguy cơ (0 - 100đ):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-700">
              {Object.entries(SIGNAL_DEFINITIONS).map(([code, def]) => (
                <div key={code} className="p-2 bg-white/80 rounded-xl border border-indigo-100">
                  <strong className="text-slate-900 block">{def.title}</strong>
                  <span className="text-slate-500 text-[10px] leading-tight block mt-0.5">{def.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-indigo-700 italic">
              * Điểm số là chỉ số định lượng khách quan hỗ trợ người quản lý nhận diện sớm để can thiệp kịp thời, không mang tính phán xét cá nhân.
            </p>
          </div>
        )}

        {/* Stats ribbon */}
        {!loading && !error && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { label: 'Tổng nhân sự', value: stats.total, icon: Users, tone: 'text-slate-700 bg-slate-50 border-slate-200', click: () => { setLevelFilter('all'); setOnlyTalents(false); } },
              { label: 'Nguy cơ Cao (≥60)', value: stats.high, icon: AlertOctagon, tone: 'text-rose-700 bg-rose-50 border-rose-200', click: () => { setLevelFilter('Cao'); setOnlyTalents(false); } },
              { label: 'Trung bình (30-59)', value: stats.mid, icon: AlertTriangle, tone: 'text-amber-700 bg-amber-50 border-amber-200', click: () => { setLevelFilter('Trung bình'); setOnlyTalents(false); } },
              { label: 'Thấp (<30)', value: stats.low, icon: ShieldCheck, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', click: () => { setLevelFilter('Thấp'); setOnlyTalents(false); } },
              { label: 'Nhân tài có nguy cơ', value: stats.talentsAtRisk, icon: Star, tone: 'text-purple-700 bg-purple-50 border-purple-200', click: () => setOnlyTalents(true) },
            ].map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={s.click}
                className={`p-2.5 rounded-xl border ${s.tone} text-center transition hover:shadow-sm cursor-pointer group`}
              >
                <s.icon className="w-4 h-4 mx-auto mb-1 opacity-70 group-hover:scale-110 transition-transform" />
                <div className="text-base font-black">{s.value}</div>
                <div className="text-[10px] font-medium opacity-80 truncate">{s.label}</div>
              </button>
            ))}
          </div>
        )}

        {/* Toolbar */}
        {!loading && !error && riskList.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[160px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên, mã NV, chức vụ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
              />
            </div>

            {/* Department Filter (nếu có nhiều hơn 1 phòng ban) */}
            {departments.length > 1 && (
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-xl bg-white font-semibold cursor-pointer focus:outline-none"
              >
                <option value="all">Tất cả phòng ban</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}

            <select
              value={levelFilter}
              onChange={(e) => { setLevelFilter(e.target.value); setOnlyTalents(false); }}
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-xl bg-white font-semibold cursor-pointer focus:outline-none"
            >
              <option value="all">Mọi mức độ</option>
              <option value="Cao">🔴 Cao (≥60)</option>
              <option value="Trung bình">🟡 Trung bình (30-59)</option>
              <option value="Thấp">🟢 Thấp (&lt;30)</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-xl bg-white font-semibold cursor-pointer focus:outline-none"
            >
              <option value="score_desc">Điểm cao → thấp</option>
              <option value="score_asc">Điểm thấp → cao</option>
              <option value="name">Tên A → Z</option>
            </select>

            {talentIds.length > 0 && (
              <button
                type="button"
                onClick={() => setOnlyTalents(!onlyTalents)}
                className={`px-2.5 py-1.5 text-xs rounded-xl font-bold border transition flex items-center gap-1 cursor-pointer ${
                  onlyTalents
                    ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                    : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                }`}
              >
                <Star className="w-3 h-3" /> Chỉ nhân tài
              </button>
            )}
          </div>
        )}

        {/* Content list */}
        <div className="mt-3.5 max-h-[48vh] overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-500" />
              <span className="text-xs font-medium">Đang phân tích các chỉ số biến động nhân sự...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs text-center">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
              <p className="text-xs font-medium">
                {riskList.length === 0 ? 'Chưa có dữ liệu nhân sự để phân tích.' : 'Không tìm thấy nhân sự phù hợp với bộ lọc.'}
              </p>
            </div>
          ) : (
            filtered.map((emp) => {
              const cfg = LEVEL_CONFIG[emp.level] || LEVEL_CONFIG['Thấp'];
              const topSignals = (emp.signals || []).slice(0, 3);
              const isTalent = talentIds.includes(emp.employee_id);
              const hasActivePip = activePipEmployeeIds.includes(emp.employee_id);

              return (
                <button
                  key={emp.employee_id}
                  type="button"
                  onClick={() => setSelected(emp)}
                  className={`w-full text-left p-3.5 rounded-xl border ${cfg.border} ${cfg.bg} hover:shadow-md transition-all group cursor-pointer relative`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar src={emp.avatar_url} name={emp.full_name} id={emp.employee_id} size="md" shape="rounded" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">{emp.full_name}</span>
                        <span className="font-mono text-[10px] font-bold px-1 rounded bg-white/80 border border-slate-200/80 text-slate-500">{emp.employee_id}</span>
                        <span className={`text-[9px] font-black px-1.5 py-0.2 rounded-full border ${cfg.badge} uppercase`}>{emp.level}</span>
                        {isTalent && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                            <Star className="w-2.5 h-2.5 text-purple-600 fill-purple-600" /> Nhân tài
                          </span>
                        )}
                        {hasActivePip && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            PIP
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{emp.job_title || '—'} • {emp.department_name || '—'}</p>
                      {topSignals.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {topSignals.map((sig, j) => (
                            <span key={j} className="inline-flex items-center gap-1 text-[9px] font-medium bg-white/80 border border-slate-200/80 rounded-md px-1.5 py-0.5 text-slate-600 shadow-2xs">
                              {sig.title} <span className="text-[8px] font-black opacity-75">+{sig.points}đ</span>
                            </span>
                          ))}
                          {emp.signals.length > 3 && (
                            <span className="text-[9px] text-slate-400 font-semibold self-center">+{emp.signals.length - 3} khác</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ScoreGauge score={emp.score} />
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition" />
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>
            Hiển thị <strong>{filtered.length}</strong> / <strong>{riskList.length}</strong> nhân sự theo bộ lọc
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold rounded-xl text-xs transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </AppleModal>
  );
}
