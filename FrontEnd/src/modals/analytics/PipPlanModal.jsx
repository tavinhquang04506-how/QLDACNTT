import React, { useState, useEffect, useMemo, useCallback } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import Avatar from '../../components/common/Avatar';
import {
  ClipboardList, Target, Plus, Trash2, ArrowLeft, Printer, Loader2, Search, CheckCircle2, XCircle, AlertTriangle,
  CalendarClock, CalendarPlus, ShieldCheck, Send, Save, Info, ChevronRight, BookOpen, Hourglass, Flag, UserCheck, Sparkles,
} from 'lucide-react';
import employeeService from '../../services/employeeService';
import analyticsService from '../../services/analyticsService';
import { useAuth } from '../../context/AuthContext';
import { CELL_META, periodLabel } from '../../utils/nineBox';
import {
  STATUS_META, GOAL_STATUS_META, CLOSE_OPTIONS, CLOSED_STATUSES, DURATION_PRESETS, GOAL_TEMPLATES, PASS_RATIO,
  todayIso, addDays, diffDays, fmtDate, fmtDateTime, isOpenPlan, computeTimeline, goalStats, suggestOutcome,
  buildOutcomeText, summarizePlans, latestReviewByEmployee, isPipCandidate, buildReasonFromReview, checkpointDates,
  validateDraft, cleanGoals, escapeHtml,
} from '../../utils/pip';

/**
 * Modal8C — Kế hoạch cải thiện hiệu suất (PIP), dữ liệu 100% từ /api/analytics/pip.
 * payload:
 *  - pipId?: string          mở thẳng chi tiết một kế hoạch (vd từ thông báo)
 *  - employee?: object       mở form lập / đề xuất PIP cho nhân sự này
 *  - onChanged?/onCreated?   gọi lại sau mỗi thay đổi để trang tải lại dữ liệu
 */
export default function Modal8C_PipPlan({ isOpen, onClose, payload }) {
  const { currentRole, user } = useAuth();
  const roleKey = currentRole?.key;
  const isExec = roleKey === 'CEO' || roleKey === 'HR_DIRECTOR';
  const isManager = roleKey === 'LINE_MANAGER';
  const canCreate = isExec || isManager;
  const myId = user?.employeeId || currentRole?.id;
  const today = todayIso();

  const [view, setView] = useState('list');
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('active');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detailOverride, setDetailOverride] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [createSeed, setCreateSeed] = useState(null);
  const [toast, setToast] = useState(null);

  const notifyChanged = useCallback(() => {
    if (typeof payload?.onChanged === 'function') payload.onChanged();
    if (typeof payload?.onCreated === 'function') payload.onCreated();
  }, [payload]);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await analyticsService.getPip({ limit: 200 });
      const list = Array.isArray(res?.data) ? res.data : [];
      setPlans(list);
      return list;
    } catch (err) {
      setLoadError(err?.message || 'Không tải được danh sách PIP');
      setPlans([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    let alive = true;
    setSearch('');
    setToast(null);
    setDetailOverride(null);
    setDetailError('');
    const seed = payload?.employee || null;
    if (payload?.pipId) { setSelectedId(payload.pipId); setView('detail'); }
    else if (seed && canCreate) { setCreateSeed(seed); setView('create'); }
    else { setSelectedId(null); setView('list'); }

    loadPlans().then((list) => {
      if (!alive) return;
      const s = summarizePlans(list, todayIso());
      setTab(isExec && s.proposed > 0 ? 'proposed' : s.active > 0 || s.proposed === 0 ? 'active' : 'proposed');
      if (!payload?.pipId && seed && canCreate) {
        const open = list.find((p) => p.employee_id === seed.id && isOpenPlan(p));
        if (open) { setSelectedId(open.id); setView('detail'); }
      }
    });
    return () => { alive = false; };
  }, [isOpen, payload]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedId) || (detailOverride?.id === selectedId ? detailOverride : null),
    [plans, selectedId, detailOverride]
  );

  // Kế hoạch không nằm trong danh sách (vd mở từ thông báo) → tải riêng theo mã.
  useEffect(() => {
    if (!isOpen || view !== 'detail' || !selectedId || loading || selectedPlan) return;
    let alive = true;
    setDetailError('');
    analyticsService.getPipById(selectedId)
      .then((res) => { if (alive && res?.data) setDetailOverride(res.data); })
      .catch((err) => { if (alive) setDetailError(err?.message || 'Không tìm thấy kế hoạch PIP'); });
    return () => { alive = false; };
  }, [isOpen, view, selectedId, loading, selectedPlan]);

  const handleSaved = async (updated, message) => {
    if (updated?.id) { setDetailOverride(updated); setSelectedId(updated.id); setView('detail'); }
    setToast({ type: 'success', text: message || 'Đã lưu thay đổi' });
    await loadPlans();
    notifyChanged();
  };

  const openDetail = (id) => { setSelectedId(id); setDetailError(''); setView('detail'); };
  const openCreate = (seed = null) => { setCreateSeed(seed); setView('create'); };

  const counts = useMemo(() => summarizePlans(plans, today), [plans, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inTab = (p) => {
      if (tab === 'all') return true;
      if (tab === 'closed') return CLOSED_STATUSES.includes(p.status);
      if (tab === 'overdue') return computeTimeline(p, today).overdue;
      return p.status === tab;
    };
    const list = plans.filter(inTab).filter((p) => !q
      || (p.full_name || '').toLowerCase().includes(q)
      || (p.employee_id || '').toLowerCase().includes(q)
      || (p.id || '').toLowerCase().includes(q)
      || (p.department_name || '').toLowerCase().includes(q));
    const sorters = {
      proposed: (a, b) => String(a.created_at).localeCompare(String(b.created_at)), // chờ lâu nhất lên trước
      active: (a, b) => String(a.end_date).localeCompare(String(b.end_date)), // sắp đến hạn nghiệm thu lên trước
      overdue: (a, b) => String(a.end_date).localeCompare(String(b.end_date)),
      closed: (a, b) => String(b.closed_at || b.updated_at).localeCompare(String(a.closed_at || a.updated_at)),
    };
    return sorters[tab] ? [...list].sort(sorters[tab]) : list;
  }, [plans, tab, search, today]);

  const subtitle = isExec
    ? 'Phê duyệt đề xuất, theo dõi tiến độ và nghiệm thu PIP theo quy trình chuẩn'
    : isManager
    ? 'Đề xuất PIP cho nhân sự phòng ban, theo dõi và cập nhật kết quả từng mục tiêu'
    : 'Kế hoạch cải thiện hiệu suất của bạn';

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-5xl"
      title="Kế hoạch cải thiện hiệu suất (PIP)"
      subtitle={subtitle}
      badge={counts.proposed > 0 && isExec ? (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">{counts.proposed} chờ duyệt</span>
      ) : null}
    >
      <div className="p-6 relative">
        {toast && (
          <div className={`mb-4 px-3.5 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {toast.text}
          </div>
        )}

        {view === 'list' && (
          <ListView
            plans={filtered}
            allCount={plans.length}
            counts={counts}
            tab={tab}
            setTab={setTab}
            search={search}
            setSearch={setSearch}
            loading={loading}
            loadError={loadError}
            onReload={loadPlans}
            onOpen={openDetail}
            canCreate={canCreate}
            isExec={isExec}
            onCreate={() => openCreate(null)}
            onGuide={() => setView('guide')}
            today={today}
          />
        )}

        {view === 'create' && (
          <CreateView
            seed={createSeed}
            plans={plans}
            myId={myId}
            isExec={isExec}
            onCancel={() => setView('list')}
            onOpenPlan={openDetail}
            onCreated={handleSaved}
          />
        )}

        {view === 'detail' && (
          selectedPlan ? (
            <DetailView
              key={selectedPlan.id}
              plan={selectedPlan}
              isExec={isExec}
              isManager={isManager}
              myId={myId}
              onBack={() => setView('list')}
              onSaved={handleSaved}
              onError={(text) => setToast({ type: 'error', text })}
            />
          ) : (
            <div className="py-16 text-center text-xs text-slate-500">
              {detailError ? (
                <div className="space-y-3">
                  <div className="text-rose-600 font-semibold flex items-center justify-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {detailError}</div>
                  <button type="button" onClick={() => setView('list')} className="px-3.5 py-2 rounded-xl border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">Về danh sách</button>
                </div>
              ) : (
                <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-blue-600" /> Đang tải kế hoạch...</span>
              )}
            </div>
          )
        )}

        {view === 'guide' && <GuideView onBack={() => setView('list')} />}
      </div>
    </AppleModal>
  );
}

// ============================================================
// Shared bits
// ============================================================
function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.active;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} /> {meta.label}
    </span>
  );
}

function TimelineBar({ plan, today }) {
  const tl = computeTimeline(plan, today);
  const meta = STATUS_META[plan.status] || STATUS_META.active;
  const label = plan.status !== 'active'
    ? `${tl.totalDays} ngày`
    : tl.notStarted
    ? `Bắt đầu sau ${diffDays(today, plan.start_date)} ngày`
    : tl.overdue
    ? `Quá hạn nghiệm thu ${-tl.remainingDays} ngày`
    : `Còn ${tl.remainingDays} ngày`;
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 mb-1">
        <span>{fmtDate(plan.start_date)} → {fmtDate(plan.end_date)}</span>
        <span className={tl.overdue ? 'text-rose-600' : tl.dueSoon ? 'text-amber-600' : ''}>{label}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${tl.overdue ? 'bg-rose-500' : meta.bar}`} style={{ width: `${plan.status === 'active' ? tl.percent : 100}%` }} />
      </div>
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, hint, tone, active, onClick }) {
  const tones = {
    amber: 'text-amber-600 bg-amber-50 border-amber-100',
    blue: 'text-blue-600 bg-blue-50 border-blue-100',
    rose: 'text-rose-600 bg-rose-50 border-rose-100',
    emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3.5 rounded-2xl border bg-white transition cursor-pointer hover:shadow-sm ${active ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
        <span className={`w-7 h-7 rounded-lg border flex items-center justify-center ${tones[tone]}`}><Icon className="w-3.5 h-3.5" /></span>
      </div>
      <div className="mt-1.5 text-2xl font-extrabold text-slate-900 font-display">{value}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
    </button>
  );
}

// ============================================================
// List
// ============================================================
function ListView({ plans, allCount, counts, tab, setTab, search, setSearch, loading, loadError, onReload, onOpen, canCreate, isExec, onCreate, onGuide, today }) {
  const tabs = [
    { key: 'proposed', label: 'Chờ phê duyệt', count: counts.proposed },
    { key: 'active', label: 'Đang thực hiện', count: counts.active },
    { key: 'overdue', label: 'Quá hạn nghiệm thu', count: counts.overdue },
    { key: 'closed', label: 'Đã kết thúc', count: counts.closed },
    { key: 'all', label: 'Tất cả', count: counts.total },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile icon={Hourglass} tone="amber" label="Chờ phê duyệt" value={counts.proposed} hint={isExec ? 'Đề xuất của Trưởng phòng cần HR xử lý' : 'Đề xuất đã gửi HR'} active={tab === 'proposed'} onClick={() => setTab('proposed')} />
        <KpiTile icon={Target} tone="blue" label="Đang thực hiện" value={counts.active} hint="PIP đang có hiệu lực" active={tab === 'active'} onClick={() => setTab('active')} />
        <KpiTile icon={AlertTriangle} tone="rose" label="Quá hạn nghiệm thu" value={counts.overdue} hint="Đã hết thời hạn, chưa đóng PIP" active={tab === 'overdue'} onClick={() => setTab('overdue')} />
        <KpiTile icon={Flag} tone="emerald" label="Đã kết thúc" value={counts.closed} hint={counts.successRate == null ? 'Chưa có PIP nghiệm thu' : `Tỷ lệ đạt ${counts.successRate}% (${counts.completed}/${counts.completed + counts.failed})`} active={tab === 'closed'} onClick={() => setTab('closed')} />
      </div>

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${tab === t.key ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {t.label} <span className="ml-0.5 text-slate-400">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="pip-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm nhân sự, mã PIP, phòng ban..."
              className="pl-8 pr-3 py-2 w-full xl:w-56 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
          </div>
          <button type="button" onClick={onGuide} className="shrink-0 whitespace-nowrap px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer" title="Quy trình và phân quyền PIP">
            <BookOpen className="w-3.5 h-3.5 text-indigo-600" /> Quy trình
          </button>
          {canCreate && (
            <button id="pip-create-btn" type="button" onClick={onCreate} className="shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-blue-500/20 transition active:scale-95 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> {isExec ? 'Lập PIP' : 'Đề xuất PIP'}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-14 text-center text-xs text-slate-400 flex flex-col items-center gap-2"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /> Đang tải danh sách PIP...</div>
      ) : loadError ? (
        <div className="py-10 text-center text-xs text-rose-600 space-y-2">
          <div className="flex items-center justify-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {loadError}</div>
          <button type="button" onClick={onReload} className="underline font-bold cursor-pointer">Thử lại</button>
        </div>
      ) : plans.length === 0 ? (
        <div className="py-12 px-6 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60">
          <ClipboardList className="w-8 h-8 text-slate-300 mx-auto" />
          <div className="mt-2 text-sm font-bold text-slate-700">
            {allCount === 0 ? 'Chưa có kế hoạch PIP nào' : search ? 'Không có kế hoạch phù hợp từ khóa' : 'Không có kế hoạch ở mục này'}
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            PIP dành cho nhân sự thuộc nhóm cần cải thiện (ô 1, 2, 4 của ma trận 9-Box) hoặc có vấn đề hiệu suất được ghi nhận cụ thể.
          </p>
          {canCreate && allCount === 0 && (
            <button type="button" onClick={onCreate} className="mt-4 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> {isExec ? 'Lập PIP đầu tiên' : 'Đề xuất PIP đầu tiên'}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {plans.map((p) => <PlanCard key={p.id} plan={p} today={today} onOpen={() => onOpen(p.id)} />)}
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, today, onOpen }) {
  const tl = computeTimeline(plan, today);
  const gs = goalStats(plan.goals);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left p-4 rounded-2xl border bg-white hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group ${tl.overdue ? 'border-rose-200' : 'border-slate-200 hover:border-blue-200'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar src={plan.avatar_url} name={plan.full_name} id={plan.employee_id} size="sm" shape="rounded" />
          <div className="min-w-0">
            <div className="font-bold text-sm text-slate-900 truncate group-hover:text-blue-700">{plan.full_name}</div>
            <div className="text-[10px] text-slate-500 truncate">{[plan.job_title, plan.department_name].filter(Boolean).join(' • ') || plan.employee_id}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadge status={plan.status} />
          <span className="text-[10px] font-mono text-slate-400">{plan.id}</span>
        </div>
      </div>
      <div className="mt-3"><TimelineBar plan={plan} today={today} /></div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <Target className="w-3 h-3 text-blue-500" />
          {gs.total} mục tiêu
          {gs.evaluated > 0 && <> • <span className="text-emerald-600 font-bold">{gs.achieved} đạt</span>{gs.missed > 0 && <span className="text-rose-600 font-bold"> / {gs.missed} không đạt</span>}</>}
        </span>
        <span className="flex items-center gap-1 truncate">
          {plan.status === 'proposed' ? 'Đề xuất bởi' : 'Lập bởi'} <strong className="text-slate-700 truncate">{plan.created_by_name || '—'}</strong>
          <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-blue-500" />
        </span>
      </div>
    </button>
  );
}

// ============================================================
// Create / propose
// ============================================================
const emptyGoal = () => ({ title: '', metric: '', target: '', dueDate: '' });

function CreateView({ seed, plans, myId, isExec, onCancel, onOpenPlan, onCreated }) {
  const today = todayIso();
  const [employees, setEmployees] = useState([]);
  const [reviewMap, setReviewMap] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [employeeId, setEmployeeId] = useState(seed?.id || '');
  const [selectedReview, setSelectedReview] = useState(null);
  const [reason, setReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [duration, setDuration] = useState(30);
  const [endDate, setEndDate] = useState(addDays(today, 30));
  const [goals, setGoals] = useState([emptyGoal()]);
  const [errors, setErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.allSettled([employeeService.getAll({ limit: 200 }), analyticsService.getReviews({ limit: 200 })]).then(([empRes, revRes]) => {
      if (!alive) return;
      if (empRes.status === 'rejected') setLoadError(empRes.reason?.message || 'Không tải được danh sách nhân sự');
      setEmployees(empRes.status === 'fulfilled' && Array.isArray(empRes.value?.data) ? empRes.value.data : []);
      setReviewMap(latestReviewByEmployee(revRes.status === 'fulfilled' ? revRes.value?.data : []));
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // Đánh giá gần nhất của nhân sự được chọn (truy vấn riêng để chính xác, không phụ thuộc giới hạn trang).
  useEffect(() => {
    if (!employeeId) { setSelectedReview(null); return undefined; }
    let alive = true;
    analyticsService.getReviews({ employeeId, limit: 20 })
      .then((res) => { if (alive) setSelectedReview(latestReviewByEmployee(res?.data).get(employeeId) || null); })
      .catch(() => { if (alive) setSelectedReview(null); });
    return () => { alive = false; };
  }, [employeeId]);

  useEffect(() => {
    if (!reasonTouched) setReason(buildReasonFromReview(selectedReview));
  }, [selectedReview]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPlanByEmp = useMemo(() => new Map(plans.filter(isOpenPlan).map((p) => [p.employee_id, p])), [plans]);
  const pool = useMemo(() => employees.filter((e) => e.id !== myId && e.status !== 'DA_NGHI_VIEC'), [employees, myId]);
  const flaggedCount = useMemo(() => pool.filter((e) => isPipCandidate(reviewMap.get(e.id))).length, [pool, reviewMap]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool
      .filter((e) => showAll || isPipCandidate(reviewMap.get(e.id)) || e.id === employeeId)
      .filter((e) => !q || (e.full_name || '').toLowerCase().includes(q) || (e.id || '').toLowerCase().includes(q) || (e.department_name || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const fa = isPipCandidate(reviewMap.get(a.id)) ? 0 : 1;
        const fb = isPipCandidate(reviewMap.get(b.id)) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        const pa = Number(reviewMap.get(a.id)?.performance_score ?? 101);
        const pb = Number(reviewMap.get(b.id)?.performance_score ?? 101);
        return pa - pb || (a.full_name || '').localeCompare(b.full_name || '', 'vi');
      });
  }, [pool, reviewMap, showAll, query, employeeId]);

  const selectedEmp = pool.find((e) => e.id === employeeId) || (seed?.id === employeeId ? seed : null);
  const blockingPlan = employeeId ? openPlanByEmp.get(employeeId) : null;

  const changeStart = (value) => {
    setStartDate(value);
    if (duration) setEndDate(addDays(value, duration));
  };
  const choosePreset = (days) => { setDuration(days); setEndDate(addDays(startDate, days)); };
  const updateGoal = (i, field, value) => setGoals((gs) => gs.map((g, idx) => (idx === i ? { ...g, [field]: value } : g)));
  const addGoal = (tpl) => setGoals((gs) => {
    const base = gs.length === 1 && !gs[0].title.trim() ? [] : gs;
    return [...base, { ...emptyGoal(), ...(tpl || {}) }].slice(0, 20);
  });
  const removeGoal = (i) => setGoals((gs) => (gs.length > 1 ? gs.filter((_, idx) => idx !== i) : [emptyGoal()]));
  const spreadDueDates = () => {
    const dates = checkpointDates(startDate, endDate, goals.length);
    setGoals((gs) => gs.map((g, i) => ({ ...g, dueDate: dates[i] || g.dueDate })));
  };

  const submit = async () => {
    const draft = { employeeId, reason, startDate, endDate, goals };
    const errs = validateDraft(draft);
    if (blockingPlan) errs.unshift(`Nhân sự đang có kế hoạch ${blockingPlan.id} (${STATUS_META[blockingPlan.status].label}).`);
    setErrors(errs);
    if (errs.length) return;
    setSubmitting(true);
    try {
      const res = await analyticsService.createPip({ employeeId, startDate, endDate, reason: reason.trim(), goals: cleanGoals(goals) });
      await onCreated(res?.data, res?.message);
    } catch (err) {
      setErrors([err?.message || 'Không lưu được kế hoạch PIP']);
    } finally {
      setSubmitting(false);
    }
  };

  const span = diffDays(startDate, endDate);
  const reviewCellMeta = selectedReview ? CELL_META[Number(selectedReview.nine_box_cell)] : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onCancel} className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> Danh sách PIP
        </button>
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${isExec ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
          {isExec ? 'Lập PIP — có hiệu lực ngay' : 'Đề xuất PIP — cần HR phê duyệt'}
        </span>
      </div>

      {/* Bước 1: nhân sự */}
      <section className="rounded-2xl border border-slate-200 p-4">
        <SectionTitle step={1} title="Chọn nhân sự" hint="Ưu tiên nhân sự thuộc ô 1, 2, 4 ở kỳ đánh giá gần nhất" />
        {loading ? (
          <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-blue-600" /> Đang tải nhân sự và kết quả đánh giá...</div>
        ) : loadError ? (
          <div className="py-4 text-xs text-rose-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {loadError}</div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input id="pip-employee-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo tên, mã NV, phòng ban..." className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
              </div>
              <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 cursor-pointer select-none">
                <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-blue-600" />
                Hiển thị tất cả nhân sự ({pool.length})
              </label>
            </div>
            <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-100">
              {visible.length === 0 ? (
                <div className="p-5 text-center text-xs text-slate-500">
                  {flaggedCount === 0 && !showAll
                    ? <>Không có nhân sự nào thuộc nhóm cần cải thiện ở kỳ đánh giá gần nhất. <button type="button" onClick={() => setShowAll(true)} className="underline font-bold text-blue-600 cursor-pointer">Hiển thị tất cả</button> nếu có vấn đề hiệu suất được ghi nhận cụ thể.</>
                    : 'Không có nhân sự phù hợp.'}
                </div>
              ) : visible.map((e) => {
                const rv = reviewMap.get(e.id);
                const cm = rv ? CELL_META[Number(rv.nine_box_cell)] : null;
                const open = openPlanByEmp.get(e.id);
                const selected = e.id === employeeId;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => { setEmployeeId(e.id); setErrors([]); }}
                    className={`w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left transition cursor-pointer ${selected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Avatar src={e.avatar_url} name={e.full_name} id={e.id} size="xs" shape="rounded" />
                      <span className="min-w-0">
                        <span className={`block text-xs font-bold truncate ${selected ? 'text-blue-700' : 'text-slate-800'}`}>{e.full_name} <span className="font-mono font-normal text-slate-400">{e.id}</span></span>
                        <span className="block text-[10px] text-slate-500 truncate">{[e.job_title, e.department_name].filter(Boolean).join(' • ')}</span>
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {open && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">{open.status === 'proposed' ? 'Đang chờ duyệt PIP' : 'Đang có PIP'}</span>}
                      {cm ? (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${cm.badge}`} title={`${periodLabel(rv.period)} • HS ${Number(rv.performance_score)} / TN ${Number(rv.potential_score)}`}>Ô {rv.nine_box_cell}</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500 border border-slate-200">Chưa đánh giá</span>
                      )}
                      {selected && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {selectedEmp && (
          <div className={`mt-3 p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${blockingPlan ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center gap-2.5">
              <Avatar src={selectedEmp.avatar_url} name={selectedEmp.full_name} id={selectedEmp.id} size="sm" shape="rounded" />
              <div>
                <div className="font-bold text-slate-900">{selectedEmp.full_name}</div>
                <div className="text-[10px] text-slate-500">{[selectedEmp.job_title, selectedEmp.department_name].filter(Boolean).join(' • ')}</div>
              </div>
            </div>
            {blockingPlan ? (
              <div className="text-rose-700 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Đang có kế hoạch {blockingPlan.id} ({STATUS_META[blockingPlan.status].label})
                <button type="button" onClick={() => onOpenPlan(blockingPlan.id)} className="underline cursor-pointer">Xem</button>
              </div>
            ) : selectedReview ? (
              <div className="text-[11px] text-slate-600">
                {periodLabel(selectedReview.period)}: HS <strong>{Number(selectedReview.performance_score)}</strong> • TN <strong>{Number(selectedReview.potential_score)}</strong>
                {reviewCellMeta && <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold border ${reviewCellMeta.badge}`}>Ô {selectedReview.nine_box_cell} – {reviewCellMeta.title}</span>}
              </div>
            ) : (
              <div className="text-[11px] text-amber-700 font-semibold">Chưa có kết quả đánh giá — cần nêu rõ căn cứ cụ thể.</div>
            )}
          </div>
        )}
      </section>

      {/* Bước 2: căn cứ + thời gian */}
      <section className="rounded-2xl border border-slate-200 p-4 space-y-4">
        <SectionTitle step={2} title="Căn cứ và thời gian thực hiện" hint="Căn cứ phải dựa trên dữ liệu đánh giá / sự việc cụ thể" />
        <div>
          <label htmlFor="pip-reason" className="text-[11px] font-bold text-slate-700">Căn cứ lập PIP <span className="text-rose-500">*</span></label>
          <textarea
            id="pip-reason"
            rows={4}
            value={reason}
            onChange={(e) => { setReason(e.target.value); setReasonTouched(true); }}
            placeholder="VD: Kết quả đánh giá Quý 4: hiệu suất 45/100; trễ hạn 6/10 task trong tháng; khách hàng phản ánh 2 lần về chất lượng..."
            className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
            <span>{selectedReview && !reasonTouched ? 'Đã điền sẵn từ kết quả đánh giá gần nhất — bổ sung sự việc cụ thể nếu có.' : ''}</span>
            <span>{reason.trim().length}/2000</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label htmlFor="pip-start" className="text-[11px] font-bold text-slate-700">Ngày bắt đầu</label>
            <input id="pip-start" type="date" value={startDate} onChange={(e) => changeStart(e.target.value)} className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-700">Thời hạn</span>
            <div className="mt-1 flex items-center gap-1.5">
              {DURATION_PRESETS.map((d) => (
                <button key={d} type="button" onClick={() => choosePreset(d)} className={`flex-1 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${duration === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>{d} ngày</button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="pip-end" className="text-[11px] font-bold text-slate-700">Ngày nghiệm thu</label>
            <input id="pip-end" type="date" value={endDate} min={startDate} onChange={(e) => { setEndDate(e.target.value); setDuration(null); }} className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        {!Number.isNaN(span) && span >= 0 && (span < 30 || span > 90) && (
          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> Thời hạn {span} ngày. Thông lệ PIP là 30–90 ngày để nhân sự đủ thời gian cải thiện và có dữ liệu đánh giá.
          </div>
        )}
      </section>

      {/* Bước 3: mục tiêu */}
      <section className="rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <SectionTitle step={3} title="Mục tiêu cải thiện (SMART)" hint="3–5 mục tiêu đo lường được, có chỉ tiêu và hạn hoàn thành" />
          <div className="flex items-center gap-2">
            <select
              value=""
              onChange={(e) => { const tpl = GOAL_TEMPLATES[Number(e.target.value)]; if (tpl) addGoal(tpl); }}
              className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 cursor-pointer focus:outline-none"
              aria-label="Thêm mục tiêu từ mẫu gợi ý"
            >
              <option value="">+ Mẫu gợi ý...</option>
              {GOAL_TEMPLATES.map((t, i) => <option key={t.title} value={i}>{t.title}</option>)}
            </select>
            <button type="button" onClick={spreadDueDates} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1 cursor-pointer" title="Chia hạn các mục tiêu đều theo các mốc trong kỳ PIP">
              <CalendarClock className="w-3.5 h-3.5 text-indigo-600" /> Chia hạn đều
            </button>
          </div>
        </div>
        <div className="mt-3 space-y-2.5">
          {goals.map((g, i) => (
            <div key={i} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <input value={g.title} onChange={(e) => updateGoal(i, 'title', e.target.value)} placeholder="Tên mục tiêu (bắt buộc)" maxLength={300} className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button type="button" onClick={() => removeGoal(i)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer" title="Xóa mục tiêu"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 pl-8">
                <input value={g.metric} onChange={(e) => updateGoal(i, 'metric', e.target.value)} placeholder="Chỉ số đo lường" maxLength={200} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input value={g.target} onChange={(e) => updateGoal(i, 'target', e.target.value)} placeholder="Chỉ tiêu cần đạt" maxLength={200} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="date" value={g.dueDate} min={startDate} max={endDate} onChange={(e) => updateGoal(i, 'dueDate', e.target.value)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label={`Hạn mục tiêu ${i + 1}`} />
              </div>
            </div>
          ))}
          {goals.length < 20 && (
            <button type="button" onClick={() => addGoal()} className="w-full py-2 rounded-xl border border-dashed border-slate-300 text-xs font-semibold text-slate-500 hover:text-blue-600 hover:border-blue-300 flex items-center justify-center gap-1.5 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Thêm mục tiêu
            </button>
          )}
        </div>
      </section>

      {errors.length > 0 && (
        <ul className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700 space-y-1">
          {errors.map((e) => <li key={e} className="flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {e}</li>)}
        </ul>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
        <p className="text-[11px] text-slate-500 flex items-start gap-1.5 max-w-xl">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" />
          {isExec
            ? 'PIP có hiệu lực ngay khi lưu; Trưởng phòng của nhân sự nhận thông báo để theo dõi. Hãy in bản cam kết và trao đổi trực tiếp với nhân sự.'
            : 'Đề xuất được gửi tới HR. PIP chỉ có hiệu lực sau khi HR phê duyệt; bạn sẽ nhận thông báo kết quả.'}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">Hủy</button>
          <button
            id="pip-submit-btn"
            type="button"
            onClick={submit}
            disabled={submitting || loading || Boolean(blockingPlan)}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-blue-500/20 transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isExec ? <ShieldCheck className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
            {isExec ? 'Kích hoạt PIP' : 'Gửi đề xuất tới HR'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ step, title, hint }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center">{step}</span>
      <div>
        <div className="text-xs font-bold text-slate-900">{title}</div>
        {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
      </div>
    </div>
  );
}

// ============================================================
// Detail: approve / reject, track goals, extend, close, print
// ============================================================
const goalDraftOf = (plan) => (Array.isArray(plan.goals) ? plan.goals : []).map((g) => ({ status: g.status || 'pending', note: g.note || '' }));

function DetailView({ plan, isExec, isManager, myId, onBack, onSaved, onError }) {
  const today = todayIso();
  const tl = computeTimeline(plan, today);
  const goals = Array.isArray(plan.goals) ? plan.goals : [];
  const stats = goalStats(goals);
  const isSelf = plan.employee_id === myId;
  const canTrack = plan.status === 'active' && (isExec || isManager) && !isSelf;
  const canDecide = plan.status === 'proposed' && isExec && !isSelf;
  const canManageActive = plan.status === 'active' && isExec && !isSelf;

  const [draft, setDraft] = useState(() => goalDraftOf(plan));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [decStart, setDecStart] = useState(plan.start_date);
  const [decEnd, setDecEnd] = useState(plan.end_date);
  const [decNote, setDecNote] = useState('');
  const [panel, setPanel] = useState(null); // 'extend' | 'close'
  const [newEnd, setNewEnd] = useState(addDays(plan.end_date, 14));
  const [closeStatus, setCloseStatus] = useState('completed');
  const [outcome, setOutcome] = useState('');

  useEffect(() => {
    setDraft(goalDraftOf(plan));
    setDecStart(plan.start_date);
    setDecEnd(plan.end_date);
    setNewEnd(addDays(plan.end_date, 14));
  }, [plan.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = draft.some((d, i) => d.status !== (goals[i]?.status || 'pending') || d.note.trim() !== (goals[i]?.note || ''));
  const draftStats = goalStats(draft);
  const suggested = suggestOutcome(goals);

  const run = async (key, fn) => {
    setBusy(key);
    setError('');
    try {
      const res = await fn();
      await onSaved(res?.data, res?.message);
      setPanel(null);
    } catch (err) {
      setError(err?.message || 'Thao tác không thành công');
    } finally {
      setBusy('');
    }
  };

  const saveProgress = () => run('progress', () => analyticsService.updatePipProgress(plan.id, draft.map((d, i) => {
    const note = d.note.trim();
    return { status: d.status, ...(note !== (goals[i]?.note || '') ? { note } : {}) };
  })));

  const approve = () => run('approve', () => analyticsService.decidePip(plan.id, {
    decision: 'approve',
    ...(decStart !== plan.start_date ? { startDate: decStart } : {}),
    ...(decEnd !== plan.end_date ? { endDate: decEnd } : {}),
    ...(decNote.trim() ? { note: decNote.trim() } : {}),
  }));

  const reject = () => {
    if (decNote.trim().length < 5) { setError('Nhập lý do từ chối (tối thiểu 5 ký tự) để Trưởng phòng nắm được.'); return; }
    run('reject', () => analyticsService.decidePip(plan.id, { decision: 'reject', note: decNote.trim() }));
  };

  const extend = () => {
    if (diffDays(plan.end_date, newEnd) <= 0) { setError('Ngày nghiệm thu mới phải sau ngày hiện tại của kế hoạch.'); return; }
    run('extend', () => analyticsService.updatePip(plan.id, { endDate: newEnd }));
  };

  const openClose = () => {
    const status = suggested || 'completed';
    setCloseStatus(status);
    setOutcome(buildOutcomeText(goals, status));
    setError('');
    setPanel('close');
  };

  const close = () => {
    if (!outcome.trim()) { setError('Nhập kết luận nghiệm thu.'); return; }
    run('close', () => analyticsService.updatePip(plan.id, { status: closeStatus, outcome: outcome.trim() }));
  };

  const print = () => {
    const ok = printCommitment(plan);
    if (!ok) onError('Trình duyệt đã chặn cửa sổ in. Hãy cho phép pop-up rồi thử lại.');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> Danh sách PIP
        </button>
        <button type="button" onClick={print} className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer" title="In / lưu PDF bản cam kết có chữ ký ba bên">
          <Printer className="w-3.5 h-3.5 text-slate-600" /> In bản cam kết
        </button>
      </div>

      {/* Header */}
      <div className="p-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar src={plan.avatar_url} name={plan.full_name} id={plan.employee_id} size="md" shape="rounded" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-slate-900">{plan.full_name}</h4>
              <StatusBadge status={plan.status} />
              {tl.overdue && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white">Quá hạn nghiệm thu</span>}
            </div>
            <div className="text-[11px] text-slate-500">{[plan.employee_id, plan.job_title, plan.department_name].filter(Boolean).join(' • ')}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 text-[11px]">
          <Meta label="Mã kế hoạch" value={plan.id} mono />
          <Meta label={plan.status === 'proposed' ? 'Đề xuất bởi' : 'Lập bởi'} value={plan.created_by_name || '—'} sub={fmtDateTime(plan.created_at)} />
          <Meta
            label={plan.status === 'rejected' ? 'Từ chối bởi' : 'Phê duyệt'}
            value={plan.status === 'proposed' ? 'Chờ HR phê duyệt' : plan.approved_by_name || '—'}
            sub={plan.approved_at ? fmtDateTime(plan.approved_at) : ''}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 p-4 rounded-2xl border border-slate-200">
          <TimelineBar plan={plan} today={today} />
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <MiniStat label="Thời hạn" value={`${tl.totalDays} ngày`} />
            <MiniStat label="Đã qua" value={plan.status === 'active' ? `${tl.elapsedDays} ngày` : '—'} />
            <MiniStat label="Mục tiêu đạt" value={`${stats.achieved}/${stats.total}`} tone={stats.missed > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          </div>
        </div>
        <div className="p-4 rounded-2xl border border-slate-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Căn cứ lập PIP</div>
          <p className="mt-1.5 text-xs text-slate-700 whitespace-pre-line leading-relaxed max-h-28 overflow-y-auto">{plan.reason || 'Kế hoạch được tạo trước khi hệ thống yêu cầu ghi căn cứ.'}</p>
        </div>
      </div>

      {/* Goals */}
      <section className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5"><Target className="w-4 h-4 text-blue-600" /> Mục tiêu và kết quả</div>
          {canTrack && (
            <span className="text-[10px] text-slate-500">Đánh giá từng mục tiêu sau mỗi buổi 1-on-1 • Đã đánh giá {draftStats.evaluated}/{draftStats.total}</span>
          )}
        </div>
        <div className="divide-y divide-slate-100">
          {goals.length === 0 && <div className="p-4 text-xs text-slate-400">Kế hoạch chưa có mục tiêu.</div>}
          {goals.map((g, i) => {
            const d = draft[i] || { status: 'pending', note: '' };
            const due = g.dueDate && plan.status === 'active' && d.status === 'pending' && diffDays(g.dueDate, today) > 0;
            return (
              <div key={i} className="p-4 flex flex-col lg:flex-row lg:items-start gap-3">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900">{g.title}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500 flex flex-wrap gap-x-3">
                      {g.metric && <span>Chỉ số: <strong className="text-slate-700">{g.metric}</strong></span>}
                      {g.target && <span>Chỉ tiêu: <strong className="text-slate-700">{g.target}</strong></span>}
                      {g.dueDate && <span className={due ? 'text-rose-600 font-semibold' : ''}>Hạn: {fmtDate(g.dueDate)}{due ? ' (đã qua hạn, chưa đánh giá)' : ''}</span>}
                    </div>
                    {!canTrack && g.note && <div className="mt-1 text-[11px] text-slate-600 italic">“{g.note}”</div>}
                    {g.checkedAt && <div className="mt-0.5 text-[10px] text-slate-400">Cập nhật {fmtDate(g.checkedAt)}</div>}
                  </div>
                </div>
                {canTrack ? (
                  <div className="lg:w-80 space-y-1.5 shrink-0">
                    <div className="flex items-center gap-1">
                      {Object.entries(GOAL_STATUS_META).map(([key, m]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setDraft((ds) => ds.map((x, idx) => (idx === i ? { ...x, status: key } : x)))}
                          className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition cursor-pointer ${d.status === key ? m.badge + ' ring-1 ring-offset-1 ring-current' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <input
                      value={d.note}
                      onChange={(e) => setDraft((ds) => ds.map((x, idx) => (idx === i ? { ...x, note: e.target.value } : x)))}
                      maxLength={500}
                      placeholder="Ghi chú minh chứng (số liệu, sự việc...)"
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>
                ) : (
                  <span className={`self-start px-2 py-0.5 rounded-full text-[10px] font-bold border ${GOAL_STATUS_META[g.status || 'pending'].badge}`}>{GOAL_STATUS_META[g.status || 'pending'].label}</span>
                )}
              </div>
            );
          })}
        </div>
        {canTrack && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
            {dirty && <span className="text-[10px] text-amber-700 font-semibold mr-auto">Có thay đổi chưa lưu</span>}
            <button type="button" onClick={() => setDraft(goalDraftOf(plan))} disabled={!dirty || Boolean(busy)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-white disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">Hoàn tác</button>
            <button id="pip-save-progress" type="button" onClick={saveProgress} disabled={!dirty || Boolean(busy)} className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
              {busy === 'progress' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Lưu kết quả mục tiêu
            </button>
          </div>
        )}
      </section>

      {error && (
        <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</div>
      )}

      {/* Proposed */}
      {plan.status === 'proposed' && (canDecide ? (
        <section className="p-4 rounded-2xl border border-amber-200 bg-amber-50/50 space-y-3">
          <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Phê duyệt đề xuất của {plan.created_by_name || 'Trưởng phòng'}</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-[11px] font-bold text-slate-700">Ngày bắt đầu
              <input type="date" value={decStart} onChange={(e) => setDecStart(e.target.value)} className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-normal focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </label>
            <label className="text-[11px] font-bold text-slate-700">Ngày nghiệm thu
              <input type="date" value={decEnd} min={decStart} onChange={(e) => setDecEnd(e.target.value)} className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-normal focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </label>
            <label className="text-[11px] font-bold text-slate-700">Ghi chú / lý do từ chối
              <input value={decNote} onChange={(e) => setDecNote(e.target.value)} maxLength={2000} placeholder="Bắt buộc khi từ chối" className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-normal focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </label>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button id="pip-reject-btn" type="button" onClick={reject} disabled={Boolean(busy)} className="px-4 py-2 rounded-xl border border-rose-200 bg-white text-rose-700 text-xs font-bold hover:bg-rose-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              {busy === 'reject' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Từ chối
            </button>
            <button id="pip-approve-btn" type="button" onClick={approve} disabled={Boolean(busy)} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              {busy === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Phê duyệt & kích hoạt
            </button>
          </div>
        </section>
      ) : (
        <div className="p-3.5 rounded-2xl border border-amber-200 bg-amber-50 text-xs text-amber-800 flex items-center gap-2">
          <Hourglass className="w-4 h-4" /> Đề xuất đang chờ HR phê duyệt. Kế hoạch chỉ có hiệu lực và được theo dõi sau khi HR duyệt.
        </div>
      ))}

      {/* Active: extend / close */}
      {canManageActive && (
        <section className="p-4 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5"><UserCheck className="w-4 h-4 text-indigo-600" /> Điều phối của HR</div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setError(''); setPanel(panel === 'extend' ? null : 'extend'); }} className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer ${panel === 'extend' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                <CalendarPlus className="w-3.5 h-3.5" /> Gia hạn
              </button>
              <button id="pip-close-btn" type="button" onClick={() => (panel === 'close' ? setPanel(null) : openClose())} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer ${panel === 'close' ? 'bg-slate-900 text-white' : 'bg-slate-800 hover:bg-slate-900 text-white'}`}>
                <Flag className="w-3.5 h-3.5" /> Nghiệm thu & đóng PIP
              </button>
            </div>
          </div>

          {panel === 'extend' && (
            <div className="p-3 rounded-xl bg-indigo-50/50 border border-indigo-100 flex flex-col sm:flex-row sm:items-end gap-3">
              <label className="text-[11px] font-bold text-slate-700 flex-1">Ngày nghiệm thu mới (hiện tại {fmtDate(plan.end_date)})
                <input type="date" value={newEnd} min={addDays(plan.end_date, 1)} onChange={(e) => setNewEnd(e.target.value)} className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-normal focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
              <button type="button" onClick={extend} disabled={Boolean(busy)} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                {busy === 'extend' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarPlus className="w-3.5 h-3.5" />} Xác nhận gia hạn
              </button>
            </div>
          )}

          {panel === 'close' && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              {(stats.pending > 0 || tl.remainingDays > 0 || dirty) && (
                <ul className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-0.5">
                  {dirty && <li>• Có kết quả mục tiêu chưa lưu — hãy lưu trước khi nghiệm thu.</li>}
                  {stats.pending > 0 && <li>• Còn {stats.pending} mục tiêu chưa được đánh giá.</li>}
                  {tl.remainingDays > 0 && <li>• Kế hoạch còn {tl.remainingDays} ngày mới đến hạn nghiệm thu ({fmtDate(plan.end_date)}).</li>}
                </ul>
              )}
              {suggested && (
                <div className="text-[11px] text-slate-600 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  Gợi ý theo kết quả mục tiêu (ngưỡng đạt {Math.round(PASS_RATIO * 100)}%): <strong>{STATUS_META[suggested].label}</strong>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {CLOSE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => { setCloseStatus(o.value); setOutcome(buildOutcomeText(goals, o.value) || outcome); }}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${closeStatus === o.value ? STATUS_META[o.value].badge + ' ring-2 ring-offset-1 ring-current' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="text-xs font-bold">{o.label}</div>
                    <div className="text-[10px] opacity-80 mt-0.5">{o.hint}</div>
                  </button>
                ))}
              </div>
              <label className="block text-[11px] font-bold text-slate-700">Kết luận nghiệm thu <span className="text-rose-500">*</span>
                <textarea rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} maxLength={2000} className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-normal leading-relaxed focus:outline-none focus:ring-2 focus:ring-slate-400" />
              </label>
              <div className="flex justify-end">
                <button type="button" onClick={close} disabled={Boolean(busy) || dirty} className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  {busy === 'close' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Xác nhận nghiệm thu
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {plan.status === 'active' && isManager && !isExec && !isSelf && (
        <div className="p-3 rounded-xl border border-blue-100 bg-blue-50/60 text-[11px] text-blue-800 flex items-center gap-2">
          <Info className="w-4 h-4" /> Trưởng phòng cập nhật kết quả từng mục tiêu; HR là người gia hạn và nghiệm thu đóng PIP.
        </div>
      )}

      {/* Closed */}
      {CLOSED_STATUSES.includes(plan.status) && (
        <section className={`p-4 rounded-2xl border ${STATUS_META[plan.status].badge}`}>
          <div className="text-xs font-bold flex items-center gap-1.5">
            {plan.status === 'completed' ? <CheckCircle2 className="w-4 h-4" /> : plan.status === 'failed' ? <XCircle className="w-4 h-4" /> : <Flag className="w-4 h-4" />}
            {plan.status === 'rejected' ? 'Lý do từ chối' : 'Kết luận nghiệm thu'} • {STATUS_META[plan.status].label}
          </div>
          <p className="mt-1.5 text-xs whitespace-pre-line leading-relaxed">{plan.outcome || '—'}</p>
          <div className="mt-1 text-[10px] opacity-75">{plan.closed_at ? `Đóng lúc ${fmtDateTime(plan.closed_at)}` : `Cập nhật ${fmtDateTime(plan.updated_at)}`}</div>
        </section>
      )}
    </div>
  );
}

function Meta({ label, value, sub, mono }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`font-bold text-slate-800 truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 truncate">{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value, tone = 'text-slate-900' }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-sm font-extrabold ${tone}`}>{value}</div>
    </div>
  );
}

// ============================================================
// Guide: quy trình & phân quyền
// ============================================================
function GuideView({ onBack }) {
  const steps = [
    { icon: Search, title: 'Xác định nhân sự', body: 'Nhân sự thuộc ô 1, 2, 4 của ma trận 9-Box ở kỳ gần nhất, hoặc có vấn đề hiệu suất được ghi nhận bằng dữ liệu cụ thể. Đã được kèm cặp nhưng chưa cải thiện.' },
    { icon: ClipboardList, title: 'Lập kế hoạch', body: 'Nêu căn cứ, đặt 3–5 mục tiêu SMART (chỉ số, chỉ tiêu, hạn) và thời hạn 30/60/90 ngày.' },
    { icon: ShieldCheck, title: 'Phê duyệt', body: 'Trưởng phòng gửi đề xuất → HR phê duyệt (có thể điều chỉnh thời gian) hoặc từ chối kèm lý do. HR/CEO lập trực tiếp thì có hiệu lực ngay.' },
    { icon: Printer, title: 'Trao đổi & ký cam kết', body: 'In bản cam kết, họp 1-1 với nhân sự để thống nhất mục tiêu; nhân sự, quản lý trực tiếp và HR cùng ký.' },
    { icon: Target, title: 'Theo dõi định kỳ', body: 'Họp 1-on-1 hằng tuần; Trưởng phòng cập nhật kết quả từng mục tiêu (Đạt / Không đạt) kèm minh chứng.' },
    { icon: Flag, title: 'Nghiệm thu', body: `HR đóng PIP khi đến hạn: Đạt (≥ ${Math.round(PASS_RATIO * 100)}% mục tiêu, gợi ý) → quay lại chu kỳ thường; Không đạt → xem xét phương án theo quy định; hoặc Hủy vì lý do khách quan. Có thể gia hạn nếu cần thêm dữ liệu.` },
  ];
  const matrix = [
    ['Xem PIP', 'Của bản thân', 'Phòng ban mình', 'Toàn công ty'],
    ['Lập PIP', '—', 'Gửi đề xuất', 'Kích hoạt ngay'],
    ['Phê duyệt / từ chối đề xuất', '—', '—', '✓'],
    ['Cập nhật kết quả mục tiêu', '—', '✓ (phòng ban mình)', '✓'],
    ['Gia hạn / nghiệm thu đóng PIP', '—', '—', '✓'],
  ];
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5" /> Danh sách PIP
      </button>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {steps.map((s, i) => (
          <div key={s.title} className="p-4 rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center"><s.icon className="w-3.5 h-3.5" /></span>
              <span className="text-[10px] font-bold text-slate-400">BƯỚC {i + 1}</span>
            </div>
            <div className="mt-2 text-xs font-bold text-slate-900">{s.title}</div>
            <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="text-left py-2.5 px-4">Hành động</th>
              <th className="py-2.5 px-3">Nhân viên</th>
              <th className="py-2.5 px-3">Trưởng phòng</th>
              <th className="py-2.5 px-3">HR / CEO</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {matrix.map(([action, ...cols]) => (
              <tr key={action}>
                <td className="py-2.5 px-4 font-semibold text-slate-800">{action}</td>
                {cols.map((c, i) => <td key={i} className={`py-2.5 px-3 text-center ${c === '—' ? 'text-slate-300' : 'text-slate-700'}`}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 mt-0.5 text-blue-500 shrink-0" />
        Mỗi nhân sự chỉ có tối đa một PIP đang mở (chờ duyệt hoặc đang thực hiện). Không ai được tự lập hay tự duyệt PIP cho chính mình. Mọi thao tác đều được ghi nhật ký kiểm toán.
      </p>
    </div>
  );
}

// ============================================================
// In bản cam kết (cửa sổ riêng, nội dung đã escape)
// ============================================================
function printCommitment(plan) {
  const w = window.open('', '_blank', 'width=900,height=1100');
  if (!w) return false;
  const e = escapeHtml;
  const goals = Array.isArray(plan.goals) ? plan.goals : [];
  const rows = goals.map((g, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${e(g.title)}</td>
      <td>${e(g.metric || '')}</td>
      <td>${e(g.target || '')}</td>
      <td class="c">${e(g.dueDate ? fmtDate(g.dueDate) : '')}</td>
      <td class="c">${e(plan.status === 'proposed' ? '' : GOAL_STATUS_META[g.status || 'pending'].label)}</td>
    </tr>`).join('');
  const span = computeTimeline(plan).totalDays;
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Ban cam ket PIP ${e(plan.id)}</title>
  <style>
    body{font-family:'Times New Roman',serif;color:#111;margin:40px 56px;font-size:14px;line-height:1.5}
    h1{text-align:center;font-size:18px;margin:4px 0 2px;text-transform:uppercase}
    .sub{text-align:center;font-style:italic;margin-bottom:18px}
    .head{display:flex;justify-content:space-between;font-size:13px;margin-bottom:18px}
    table{width:100%;border-collapse:collapse;margin:8px 0 14px}
    th,td{border:1px solid #444;padding:6px 8px;vertical-align:top;font-size:13px}
    th{background:#f1f1f1}
    .c{text-align:center}
    .info td{border:none;padding:2px 0}
    h2{font-size:14px;margin:16px 0 4px;text-transform:uppercase}
    .sign{display:flex;justify-content:space-between;margin-top:36px;text-align:center}
    .sign div{width:30%}
    .sign small{display:block;font-style:italic;margin-bottom:70px}
    @media print{body{margin:18mm}}
  </style></head><body>
  <div class="head"><div><strong>NEXUS HR</strong><br/>Mã kế hoạch: ${e(plan.id)}</div><div style="text-align:right"><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br/>Độc lập – Tự do – Hạnh phúc</div></div>
  <h1>Bản cam kết kế hoạch cải thiện hiệu suất (PIP)</h1>
  <div class="sub">Trạng thái: ${e(STATUS_META[plan.status]?.label || plan.status)}</div>
  <table class="info">
    <tr><td style="width:32%">Họ và tên nhân sự:</td><td><strong>${e(plan.full_name)}</strong> (${e(plan.employee_id)})</td></tr>
    <tr><td>Chức danh / Phòng ban:</td><td>${e([plan.job_title, plan.department_name].filter(Boolean).join(' – '))}</td></tr>
    <tr><td>Thời gian thực hiện:</td><td>Từ ${e(fmtDate(plan.start_date))} đến ${e(fmtDate(plan.end_date))} (${span} ngày)</td></tr>
    <tr><td>Người lập / đề xuất:</td><td>${e(plan.created_by_name || '')}</td></tr>
    <tr><td>Người phê duyệt:</td><td>${e(plan.status === 'proposed' ? 'Chờ HR phê duyệt' : plan.approved_by_name || '')}</td></tr>
  </table>
  <h2>I. Căn cứ lập kế hoạch</h2>
  <div style="white-space:pre-line">${e(plan.reason || '')}</div>
  <h2>II. Mục tiêu cải thiện</h2>
  <table><thead><tr><th class="c" style="width:5%">STT</th><th>Mục tiêu</th><th style="width:18%">Chỉ số đo lường</th><th style="width:16%">Chỉ tiêu</th><th class="c" style="width:12%">Hạn</th><th class="c" style="width:12%">Kết quả</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="6" class="c">Chưa có mục tiêu</td></tr>'}</tbody></table>
  <h2>III. Cam kết</h2>
  <div>1. Nhân sự cam kết nỗ lực hoàn thành các mục tiêu trên trong thời hạn kế hoạch và chủ động báo cáo tiến độ.<br/>
  2. Quản lý trực tiếp có trách nhiệm hướng dẫn, cung cấp nguồn lực và họp đánh giá định kỳ hằng tuần.<br/>
  3. Khi kết thúc kế hoạch, HR cùng quản lý trực tiếp nghiệm thu kết quả và thông báo kết luận bằng văn bản cho nhân sự.</div>
  ${CLOSED_STATUSES.includes(plan.status) ? `<h2>IV. Kết luận</h2><div style="white-space:pre-line"><strong>${e(STATUS_META[plan.status].label)}:</strong> ${e(plan.outcome || '')}</div>` : ''}
  <p style="text-align:right;margin-top:24px;font-style:italic">Ngày ..... tháng ..... năm ..........</p>
  <div class="sign">
    <div><strong>NHÂN SỰ</strong><small>(Ký, ghi rõ họ tên)</small>${e(plan.full_name)}</div>
    <div><strong>QUẢN LÝ TRỰC TIẾP</strong><small>(Ký, ghi rõ họ tên)</small></div>
    <div><strong>PHÒNG NHÂN SỰ</strong><small>(Ký, ghi rõ họ tên)</small>${e(plan.approved_by_name || '')}</div>
  </div>
  <script>window.onload=function(){window.focus();window.print();}<\/script>
  </body></html>`);
  w.document.close();
  return true;
}
