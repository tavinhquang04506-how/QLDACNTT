import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/common/Avatar';
import analyticsService from '../services/analyticsService';
import employeeService from '../services/employeeService';
import confetti from 'canvas-confetti';
import { generateCSVContent, downloadFile } from '../utils/fileExportUtils';
import {
  CELL_META, GRID_ORDER, TOP_TALENT_CELLS, NEEDS_IMPROVEMENT_CELLS, CORE_CELLS, PIP_CELLS, LEVEL_LABEL,
  cellOf, levelOf, currentPeriod, previousPeriod, periodLabel, buildPeriodOptions, average,
} from '../utils/nineBox';
import { isOpenPlan } from '../utils/pip';
import {
  Sparkles, BarChart3, TrendingUp, TrendingDown, AlertTriangle, AlertOctagon, Award, Users, Lock, UserSquare2, Target, Edit3,
  CheckCircle2, Calendar, Search, Download, X, Check, Star, RefreshCw, Send, Eye, ClipboardList, Lightbulb, Building2,
  ArrowUpDown, History, Gauge, Loader2, AlertCircle, ChevronRight, Minus,
} from 'lucide-react';

// ==========================================
// Helpers
// ==========================================
const perfTone = (s) => (s >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : s >= 60 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-rose-50 text-rose-700 border-rose-200');
const potTone = (s) => (s >= 80 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : s >= 60 ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-amber-50 text-amber-700 border-amber-200');
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');
const round1 = (n) => Math.round(n * 10) / 10;
const reviewCell = (r) => (r ? Number(r.nine_box_cell) || cellOf(Number(r.performance_score), Number(r.potential_score)) : null);

const QUICK_SCORES = [40, 60, 70, 80, 90];
const COMMENT_CHIPS = [
  'Hoàn thành tốt các mục tiêu được giao trong kỳ.',
  'Chủ động, tinh thần trách nhiệm cao.',
  'Phối hợp nhóm hiệu quả, hỗ trợ đồng nghiệp tích cực.',
  'Cần cải thiện tính đúng hạn của công việc.',
  'Đề xuất tham gia đào tạo nâng cao chuyên môn.',
];

function DeltaBadge({ value, suffix = '' }) {
  if (value == null) return null;
  if (value === 0) {
    return <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-500"><Minus className="w-3 h-3" />0{suffix}</span>;
  }
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? '+' : ''}{value}{suffix}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, unit, tone, footer, onClick, loading, delay = 0 }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      whileHover={onClick ? { y: -3 } : undefined}
      className={`text-left bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex flex-col justify-between gap-3 relative overflow-hidden group ${onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-200' : 'cursor-default'} transition-all`}
    >
      <div className={`absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl opacity-40 ${tone.glow}`} />
      <div className="flex items-start justify-between relative">
        <div>
          <span className="text-xs font-medium text-slate-500">{label}</span>
          {loading ? (
            <div className="h-8 w-24 mt-1 rounded-lg bg-slate-100 animate-pulse" />
          ) : (
            <div className={`text-2xl font-extrabold font-display mt-1 ${tone.text}`}>
              {value}{unit && value !== '—' && <span className="text-sm font-bold text-slate-400 ml-1">{unit}</span>}
            </div>
          )}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone.icon}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 relative min-h-[22px]">
        {footer}
      </div>
    </motion.button>
  );
}

export default function AiAnalyticsPage() {
  const { openModal } = useModal();
  const { currentRole, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tableRef = useRef(null);

  const roleKey = currentRole?.key;
  const isStaff = roleKey === 'EMPLOYEE';
  const isManager = roleKey === 'LINE_MANAGER';
  const isHr = roleKey === 'HR_DIRECTOR';
  const isCeo = roleKey === 'CEO';
  const isExec = isHr || isCeo;
  const myId = user?.employeeId || currentRole?.id;

  // ----- Period -----
  const periodOptions = useMemo(() => buildPeriodOptions(), []);
  const nowPeriod = useMemo(() => currentPeriod(), []);
  const [period, setPeriod] = useState(nowPeriod);
  const prevPeriod = previousPeriod(period);

  // ----- Data (100% từ API / PostgreSQL) -----
  const [employees, setEmployees] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [prevReviews, setPrevReviews] = useState([]);
  const [activePips, setActivePips] = useState([]);
  const [atRiskCount, setAtRiskCount] = useState(null);
  const [turnoverRisks, setTurnoverRisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // ----- Filters -----
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusTab, setStatusTab] = useState('all');
  const [cellFilter, setCellFilter] = useState('all');
  const [sortBy, setSortBy] = useState('status');
  const [search, setSearch] = useState('');

  // ----- Review form -----
  const [reviewingEmp, setReviewingEmp] = useState(null);
  const [perfScore, setPerfScore] = useState(70);
  const [potScore, setPotScore] = useState(70);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [empHistory, setEmpHistory] = useState({ loading: false, items: [], error: '' });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (isStaff) return undefined;
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError('');
      const [empRes, revRes, prevRes, pipRes, sumRes, riskRes] = await Promise.allSettled([
        employeeService.getAll({ limit: 200 }),
        analyticsService.getReviews({ period, limit: 200 }),
        prevPeriod ? analyticsService.getReviews({ period: prevPeriod, limit: 200 }) : Promise.resolve({ data: [] }),
        analyticsService.getPip({ limit: 200 }),
        (isExec || isManager) ? analyticsService.getSummary() : Promise.resolve(null),
        (isExec || isManager) ? analyticsService.getTurnoverRisk({ limit: 200 }) : Promise.resolve({ data: [] }),
      ]);
      if (!alive) return;
      const val = (r) => (r.status === 'fulfilled' ? r.value : null);
      const errors = [empRes, revRes].filter((r) => r.status === 'rejected').map((r) => r.reason?.message).filter(Boolean);
      if (errors.length) setLoadError(errors[0]);
      setEmployees(Array.isArray(val(empRes)?.data) ? val(empRes).data : []);
      setReviews(Array.isArray(val(revRes)?.data) ? val(revRes).data : []);
      setPrevReviews(Array.isArray(val(prevRes)?.data) ? val(prevRes).data : []);
      // PIP đang mở = chờ HR duyệt hoặc đang thực hiện (mỗi nhân sự tối đa một kế hoạch mở).
      setActivePips(Array.isArray(val(pipRes)?.data) ? val(pipRes).data.filter(isOpenPlan) : []);
      setAtRiskCount(val(sumRes)?.data?.atRiskCount ?? null);
      setTurnoverRisks(Array.isArray(val(riskRes)?.data) ? val(riskRes).data : []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [period, prevPeriod, reloadKey, isStaff, isExec, isManager]);

  // ==========================================
  // Derived data
  // ==========================================
  const reviewMap = useMemo(() => new Map(reviews.map((r) => [r.employee_id, r])), [reviews]);
  const prevMap = useMemo(() => new Map(prevReviews.map((r) => [r.employee_id, r])), [prevReviews]);
  const activePipIds = useMemo(() => activePips.map((p) => p.employee_id), [activePips]);
  const pipStatusByEmp = useMemo(() => new Map(activePips.map((p) => [p.employee_id, p.status])), [activePips]);
  const proposedPipCount = useMemo(() => activePips.filter((p) => p.status === 'proposed').length, [activePips]);
  const highRiskEmpIds = useMemo(() => new Set(
    turnoverRisks.filter((r) => r.level === 'Cao' || r.score >= 60).map((r) => r.employee_id)
  ), [turnoverRisks]);

  /** Nhân sự thuộc phạm vi đánh giá: không gồm bản thân và người đã nghỉ việc. */
  const population = useMemo(
    () => employees
      .filter((e) => e.id !== myId && e.status !== 'DA_NGHI_VIEC')
      .map((e) => {
        const review = reviewMap.get(e.id) || null;
        const prev = prevMap.get(e.id) || null;
        return {
          ...e,
          review,
          prev,
          cell: reviewCell(review),
          delta: review && prev ? round1(Number(review.performance_score) - Number(prev.performance_score)) : null,
        };
      }),
    [employees, reviewMap, prevMap, myId]
  );

  const departments = useMemo(() => {
    const map = new Map();
    population.forEach((e) => {
      if (!e.department_id) return;
      const d = map.get(e.department_id) || { id: e.department_id, name: e.department_name || e.department_id, members: [] };
      d.members.push(e);
      map.set(e.department_id, d);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [population]);

  const scoped = useMemo(
    () => (isExec && deptFilter !== 'all' ? population.filter((e) => e.department_id === deptFilter) : population),
    [population, deptFilter, isExec]
  );

  const stats = useMemo(() => {
    const reviewed = scoped.filter((e) => e.review);
    const total = scoped.length;
    const counts = {};
    GRID_ORDER.forEach((c) => { counts[c] = 0; });
    reviewed.forEach((e) => { counts[e.cell] = (counts[e.cell] || 0) + 1; });
    const sum = (cells) => cells.reduce((s, c) => s + (counts[c] || 0), 0);
    const avgPerf = average(reviewed.map((e) => e.review.performance_score));
    const avgPot = average(reviewed.map((e) => e.review.potential_score));
    const prevAvg = average(scoped.filter((e) => e.prev).map((e) => e.prev.performance_score));
    return {
      reviewed,
      total,
      reviewedCount: reviewed.length,
      pending: total - reviewed.length,
      completion: total ? Math.round((reviewed.length / total) * 100) : 0,
      counts,
      top: sum(TOP_TALENT_CELLS),
      core: sum(CORE_CELLS),
      risk: sum(NEEDS_IMPROVEMENT_CELLS),
      avgPerf,
      avgPot,
      prevAvg,
      delta: avgPerf != null && prevAvg != null ? round1(avgPerf - prevAvg) : null,
      avgKpi: average(scoped.map((e) => e.kpi_score).filter((v) => v != null)),
      pipsInScope: scoped.filter((e) => activePipIds.includes(e.id)).length,
    };
  }, [scoped, activePipIds]);

  const deptName = isManager ? (population[0]?.department_name || '') : '';

  const tableRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = scoped;
    if (statusTab === 'pending') list = list.filter((e) => !e.review);
    if (statusTab === 'done') list = list.filter((e) => e.review);
    if (cellFilter === 'top') list = list.filter((e) => TOP_TALENT_CELLS.includes(e.cell));
    else if (cellFilter === 'risk') list = list.filter((e) => NEEDS_IMPROVEMENT_CELLS.includes(e.cell));
    else if (cellFilter !== 'all') list = list.filter((e) => e.cell === Number(cellFilter));
    if (q) {
      list = list.filter((e) => (e.full_name || '').toLowerCase().includes(q)
        || (e.id || '').toLowerCase().includes(q)
        || (e.job_title || '').toLowerCase().includes(q)
        || (e.department_name || '').toLowerCase().includes(q));
    }
    const byName = (a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'vi');
    const perf = (e) => (e.review ? Number(e.review.performance_score) : -1);
    const sorters = {
      status: (a, b) => (a.review ? 1 : 0) - (b.review ? 1 : 0) || byName(a, b),
      perf_desc: (a, b) => perf(b) - perf(a) || byName(a, b),
      perf_asc: (a, b) => (perf(a) === -1 ? 999 : perf(a)) - (perf(b) === -1 ? 999 : perf(b)) || byName(a, b),
      kpi_desc: (a, b) => Number(b.kpi_score ?? -1) - Number(a.kpi_score ?? -1) || byName(a, b),
      name: byName,
    };
    return [...list].sort(sorters[sortBy]);
  }, [scoped, statusTab, cellFilter, search, sortBy]);

  // ==========================================
  // Review form
  // ==========================================
  const openReview = useCallback((emp) => {
    if (!emp) return;
    const existing = emp.review || reviewMap.get(emp.id);
    setReviewingEmp(emp);
    setFormError('');
    if (existing) {
      setPerfScore(Math.round(Number(existing.performance_score)));
      setPotScore(Math.round(Number(existing.potential_score)));
      setComment(existing.comments || '');
    } else {
      setPerfScore(emp.kpi_score != null ? Math.round(Math.min(Number(emp.kpi_score), 100)) : 70);
      setPotScore(70);
      setComment('');
    }
    setEmpHistory({ loading: true, items: [], error: '' });
    analyticsService.getReviews({ employeeId: emp.id, limit: 20 })
      .then((res) => setEmpHistory({ loading: false, items: Array.isArray(res?.data) ? res.data : [], error: '' }))
      .catch((err) => setEmpHistory({ loading: false, items: [], error: err?.message || 'Không tải được lịch sử' }));
  }, [reviewMap]);

  const openReviewById = useCallback((id) => {
    const emp = population.find((e) => e.id === id);
    if (emp) openReview(emp);
  }, [population, openReview]);

  // Mở form đánh giá khi điều hướng từ nơi khác: /ai-analytics?review=NV-xxxx
  useEffect(() => {
    const target = searchParams.get('review');
    if (!target || loading) return;
    openReviewById(target);
    const next = new URLSearchParams(searchParams);
    next.delete('review');
    setSearchParams(next, { replace: true });
  }, [searchParams, loading, openReviewById, setSearchParams]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3200);
  };

  const handleSaveReview = async (e) => {
    e.preventDefault();
    if (!reviewingEmp) return;
    const text = comment.trim();
    if (text.length < 10) { setFormError('Vui lòng nhập nhận xét tối thiểu 10 ký tự.'); return; }
    const existing = reviewMap.get(reviewingEmp.id);
    const body = { performanceScore: Number(perfScore), potentialScore: Number(potScore), comments: text };
    try {
      setSaving(true);
      setFormError('');
      if (existing) await analyticsService.updateReview(existing.id, body);
      else await analyticsService.createReview({ employeeId: reviewingEmp.id, period, ...body });
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.65 } });
      showToast(`${existing ? 'Đã cập nhật' : 'Đã lưu'} đánh giá ${periodLabel(period)} cho ${reviewingEmp.full_name}.`);
      setReviewingEmp(null);
      reload();
    } catch (err) {
      setFormError(err?.message || 'Không thể lưu đánh giá. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const reviewNextPending = () => {
    const next = scoped.filter((e) => !e.review).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'vi'))[0];
    if (next) openReview(next);
  };

  // ==========================================
  // Matrix / modal actions
  // ==========================================
  const openCell = (cell) => {
    const members = stats.reviewed.filter((e) => e.cell === cell).map((e) => ({
      ...e,
      performance_score: Number(e.review.performance_score),
      potential_score: Number(e.review.potential_score),
      comments: e.review.comments,
      reviewer_name: e.review.reviewer_name,
      updated_at: e.review.updated_at,
    }));
    openModal('modal8D', {
      cell,
      period,
      employees: members,
      canPip: isExec || isManager,
      activePipEmployeeIds: activePipIds,
      onReview: openReviewById,
      onChanged: reload,
    });
  };

  const openPip = (emp) => {
    openModal('modal8C', {
      employee: emp,
      onChanged: reload,
    });
  };

  const openTurnoverRisk = useCallback((empId = null) => {
    openModal('modal8A', {
      employeeId: empId,
      onReview: openReviewById,
      onOpenPip: openPip,
      onOpenProfile: (emp) => openModal('modal4B', emp),
      onOpenTimesheet: (emp) => openModal('modal5B', emp),
      activePipEmployeeIds: activePipIds,
      talentIds: stats.reviewed.filter((e) => TOP_TALENT_CELLS.includes(e.cell)).map((e) => e.id),
      departments: departments,
      selectedDept: deptFilter,
    });
  }, [openModal, openReviewById, activePipIds, stats.reviewed, departments, deptFilter]);

  const focusTable = (tab = 'all', cell = 'all') => {
    setStatusTab(tab);
    setCellFilter(cell);
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleExport = () => {
    const headers = ['Mã NV', 'Họ Và Tên', 'Chức Vụ', 'Phòng Ban', 'KPI Hệ Thống', 'Điểm Hiệu Suất', 'Điểm Tiềm Năng', 'Ô 9-Box', 'Xếp Loại', 'Chênh Lệch Kỳ Trước', 'Nhận Xét', 'Người Đánh Giá', 'Kỳ Đánh Giá'];
    const rows = tableRows.map((e) => [
      e.id,
      e.full_name || '',
      e.job_title || '',
      e.department_name || '',
      e.kpi_score ?? '',
      e.review ? Number(e.review.performance_score) : '',
      e.review ? Number(e.review.potential_score) : '',
      e.cell ?? '',
      e.cell ? CELL_META[e.cell].title : 'Chưa đánh giá',
      e.delta ?? '',
      e.review?.comments || '',
      e.review?.reviewer_name || '',
      period,
    ]);
    downloadFile(`Bao_Cao_Danh_Gia_Hieu_Suat_${period}.csv`, generateCSVContent(headers, rows));
  };

  // ==========================================
  // Insights (sinh từ dữ liệu thật)
  // ==========================================
  const insights = useMemo(() => {
    const list = [];
    if (stats.total === 0) return list;

    // Phân tích đối chiếu: Nhân tài nòng cốt (ô 6, 8, 9) có nguy cơ biến động
    const talentsAtRiskList = stats.reviewed
      .filter((e) => TOP_TALENT_CELLS.includes(e.cell) && turnoverRisks.some((r) => r.employee_id === e.id && (r.level === 'Cao' || r.level === 'Trung bình' || r.score >= 30)));
    if (talentsAtRiskList.length > 0) {
      list.push({
        key: 'talent_turnover_risk', tone: 'rose', icon: AlertOctagon,
        title: `${talentsAtRiskList.length} nhân tài nòng cốt có nguy cơ biến động`,
        body: `${talentsAtRiskList.slice(0, 3).map((e) => e.full_name).join(', ')}${talentsAtRiskList.length > 3 ? '…' : ''} có tín hiệu rủi ro (lương/OT/thâm niên) — ưu tiên rà soát giữ chân.`,
        action: { label: 'Xem phân tích nguy cơ', run: () => openTurnoverRisk() },
      });
    }

    if (stats.pending > 0) {
      list.push({
        key: 'pending', tone: 'blue', icon: ClipboardList,
        title: `Còn ${stats.pending}/${stats.total} nhân sự chưa được đánh giá`,
        body: `Hoàn tất đánh giá ${periodLabel(period)} để ma trận 9-Box phản ánh đầy đủ đội ngũ.`,
        action: { label: 'Xem danh sách chưa đánh giá', run: () => focusTable('pending') },
      });
    } else {
      list.push({ key: 'done', tone: 'emerald', icon: CheckCircle2, title: 'Đã hoàn thành 100% đánh giá kỳ này', body: `Toàn bộ ${stats.total} nhân sự đã có kết quả ${periodLabel(period)}.` });
    }
    const tops = stats.reviewed.filter((e) => TOP_TALENT_CELLS.includes(e.cell)).sort((a, b) => b.review.performance_score - a.review.performance_score);
    if (tops.length) {
      list.push({
        key: 'top', tone: 'purple', icon: Award,
        title: `${tops.length} nhân tài nòng cốt cần giữ chân`,
        body: `${tops.slice(0, 3).map((e) => e.full_name).join(', ')}${tops.length > 3 ? ` và ${tops.length - 3} người khác` : ''} — cân nhắc quy hoạch kế cận và đãi ngộ.`,
        action: { label: 'Lọc nhóm nhân tài', run: () => focusTable('done', 'top') },
      });
    }
    const risks = stats.reviewed.filter((e) => NEEDS_IMPROVEMENT_CELLS.includes(e.cell));
    if (risks.length) {
      const noPip = risks.filter((e) => !activePipIds.includes(e.id)).length;
      list.push({
        key: 'risk', tone: 'amber', icon: AlertTriangle,
        title: `${risks.length} nhân sự cần kèm cặp / cải thiện`,
        body: `${risks.slice(0, 3).map((e) => e.full_name).join(', ')}${risks.length > 3 ? '…' : ''}. ${noPip > 0 ? `${noPip} người chưa có PIP.` : 'Tất cả đã có PIP đang mở.'}`,
        action: { label: 'Lọc nhóm cần cải thiện', run: () => focusTable('done', 'risk') },
      });
    }
    const drops = stats.reviewed.filter((e) => e.delta != null && e.delta <= -10).sort((a, b) => a.delta - b.delta);
    if (drops.length) {
      list.push({
        key: 'drop', tone: 'rose', icon: TrendingDown,
        title: `${drops.length} nhân sự giảm hiệu suất mạnh so với ${periodLabel(prevPeriod)}`,
        body: drops.slice(0, 3).map((e) => `${e.full_name} (${e.delta})`).join(', '),
      });
    }
    return list;
  }, [stats, period, prevPeriod, activePipIds, turnoverRisks, openTurnoverRisk]);

  const deptStats = useMemo(() => departments.map((d) => {
    const reviewed = d.members.filter((m) => m.review);
    return { ...d, total: d.members.length, reviewed: reviewed.length, avg: average(reviewed.map((m) => m.review.performance_score)) };
  }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1)), [departments]);

  // ==========================================
  // VIEW FOR EMPLOYEE (ESS): RESTRICTED
  // ==========================================
  if (isStaff) {
    return (
      <div className="w-full min-h-full p-6 space-y-6 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200/90 shadow-lg text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto border border-purple-200 shadow-inner">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <span className="bg-purple-100 text-purple-700 text-xs font-bold px-3 py-1 rounded-full border border-purple-200 inline-block">
              Giới hạn quyền truy cập
            </span>
            <h2 className="text-xl font-bold text-slate-900 font-display">Khu Vực Đánh Giá Hiệu Suất Quản Lý</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Dữ liệu ma trận 9-Box đánh giá tiềm năng là thông tin mật cấp quản lý, chỉ dành cho <strong>Ban Giám Đốc</strong> và <strong>Cấp Quản lý</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/portal')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-3 rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <UserSquare2 className="w-4 h-4" />
            <span>Đi đến Bàn làm việc của tôi</span>
          </button>
        </div>
      </div>
    );
  }

  const pageTitle = isCeo
    ? 'Trung Tâm Hiệu Suất và Nhân Tài Doanh Nghiệp'
    : isHr
    ? 'Đánh Giá Hiệu Suất và Phát Triển Nhân Tài'
    : `Đánh Giá Hiệu Suất ${deptName || 'Phòng Ban'}`;
  const pageSubtitle = isManager
    ? null
    : 'Theo dõi tiến độ đánh giá, phân loại năng lực 9-Box và điều phối kế hoạch phát triển nhân tài toàn công ty';

  const modalCell = cellOf(perfScore, potScore);
  const modalMeta = CELL_META[modalCell];
  const existingForModal = reviewingEmp ? reviewMap.get(reviewingEmp.id) : null;

  return (
    <div className="w-full min-h-full p-6 space-y-6">
      {/* ================= HERO ================= */}
      <motion.section
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-blue-50/90 via-indigo-50/60 to-white p-6 sm:p-7 shadow-xs"
      >
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-200/40 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-28 -left-16 w-80 h-80 bg-sky-200/40 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight font-display text-slate-900">{pageTitle}</h1>
            {pageSubtitle && (
              <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-3xl">{pageSubtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <label className="flex items-center gap-2 bg-white/90 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 shadow-2xs">
              <Calendar className="w-4 h-4 text-indigo-500" />
              <span className="text-slate-500">Kỳ</span>
              <select
                id="review-period-select"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="bg-transparent font-extrabold text-indigo-700 focus:outline-none cursor-pointer"
              >
                {periodOptions.map((p) => (
                  <option key={p} value={p}>{periodLabel(p)}{p === nowPeriod ? ' • hiện tại' : ''}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={reload}
              className="w-9 h-9 rounded-xl bg-white/90 border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 flex items-center justify-center shadow-2xs transition cursor-pointer"
              title="Tải lại dữ liệu"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              id="open-pip-center"
              type="button"
              onClick={() => openModal('modal8C', { onChanged: reload })}
              className="px-3.5 py-2 bg-white/90 hover:bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1.5 transition cursor-pointer"
              title="Quản lý kế hoạch cải thiện hiệu suất (PIP)"
            >
              <ClipboardList className="w-4 h-4 text-amber-600" /> PIP
              <span className="px-1.5 rounded-md bg-amber-100 text-amber-800 text-[10px]" title="PIP đang mở (chờ duyệt + đang thực hiện)">{activePips.length}</span>
              {isExec && proposedPipCount > 0 && (
                <span className="px-1.5 rounded-md bg-rose-600 text-white text-[10px]" title="Đề xuất chờ HR phê duyệt">{proposedPipCount} chờ duyệt</span>
              )}
            </button>
            {(isExec || isManager) && (
              <button
                id="open-turnover-risk-center"
                type="button"
                onClick={() => openTurnoverRisk()}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                title="Phân tích và theo dõi nguy cơ biến động nhân sự"
              >
                <AlertOctagon className="w-4 h-4 text-rose-600" /> Nguy cơ biến động
                {atRiskCount != null && (
                  <span className={`px-1.5 rounded-md text-[10px] font-black ${atRiskCount > 0 ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`} title="Số nhân sự có nguy cơ biến động cao">
                    {atRiskCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Progress ribbon */}
        <div className="relative z-10 mt-5 p-4 rounded-2xl bg-white/80 border border-white backdrop-blur flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/30">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">Tiến độ đánh giá {periodLabel(period)}</div>
              <div className="text-sm font-extrabold text-slate-900">
                {loading ? '…' : `${stats.reviewedCount}/${stats.total} nhân sự`} <span className="text-indigo-600">({loading ? 0 : stats.completion}%)</span>
              </div>
            </div>
          </div>
          <div className="flex-1">
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-blue-500 to-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: `${loading ? 0 : stats.completion}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span>Đã đánh giá: <strong className="text-emerald-700">{stats.reviewedCount}</strong></span>
              <span>Chưa đánh giá: <strong className="text-amber-700">{stats.pending}</strong></span>
            </div>
          </div>
          {stats.pending > 0 && !loading && (
            <button
              type="button"
              onClick={reviewNextPending}
              className="shrink-0 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" /> Đánh giá người tiếp theo <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </motion.section>

      {loadError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> Không tải được dữ liệu: {loadError}
          <button type="button" onClick={reload} className="ml-auto font-bold underline cursor-pointer">Thử lại</button>
        </div>
      )}

      {/* ================= KPI CARDS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp}
          label="Điểm hiệu suất trung bình"
          value={stats.avgPerf ?? '—'}
          unit="/100"
          loading={loading}
          tone={{ text: 'text-blue-600', icon: 'bg-blue-50 text-blue-600', glow: 'bg-blue-300' }}
          footer={stats.delta != null
            ? <><span>So với {periodLabel(prevPeriod)}</span><DeltaBadge value={stats.delta} /></>
            : <span>{stats.prevAvg == null ? `Chưa có dữ liệu ${periodLabel(prevPeriod)}` : 'Chưa có dữ liệu kỳ này'}</span>}
        />
        <StatCard
          icon={Sparkles}
          label="Điểm tiềm năng trung bình"
          value={stats.avgPot ?? '—'}
          unit="/100"
          loading={loading}
          delay={0.05}
          tone={{ text: 'text-indigo-600', icon: 'bg-indigo-50 text-indigo-600', glow: 'bg-indigo-300' }}
          footer={<><span>KPI hệ thống trung bình</span><strong className="text-slate-700">{stats.avgKpi ?? '—'}</strong></>}
        />
        <StatCard
          icon={Award}
          label="Nhân tài nòng cốt (ô 6 • 8 • 9)"
          value={stats.top}
          unit="nhân sự"
          loading={loading}
          delay={0.1}
          onClick={stats.top > 0 ? () => focusTable('done', 'top') : undefined}
          tone={{ text: 'text-emerald-600', icon: 'bg-emerald-50 text-emerald-600', glow: 'bg-emerald-300' }}
          footer={<><span>Tỷ lệ trên số đã đánh giá</span><strong className="text-emerald-700">{stats.reviewedCount ? Math.round((stats.top / stats.reviewedCount) * 100) : 0}%</strong></>}
        />
        <StatCard
          icon={AlertTriangle}
          label="Cần cải thiện (ô 1 • 2 • 4)"
          value={stats.risk}
          unit="nhân sự"
          loading={loading}
          delay={0.15}
          onClick={stats.risk > 0 ? () => focusTable('done', 'risk') : undefined}
          tone={{ text: 'text-amber-600', icon: 'bg-amber-50 text-amber-600', glow: 'bg-amber-300' }}
          footer={<><span>PIP đang mở</span><strong className="text-amber-700">{stats.pipsInScope}</strong></>}
        />
      </div>

      {/* ================= MATRIX + INSIGHTS ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-white rounded-3xl p-6 border border-slate-200/90 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600" /> Ma trận Phân loại Năng lực (9-Box Talent Matrix)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Giao thoa giữa Hiệu suất thực tế và Tiềm năng phát triển • Bấm vào từng ô để xem và thao tác</p>
            </div>
            {isExec ? (
              <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 shrink-0">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="bg-transparent focus:outline-none cursor-pointer">
                  <option value="all">Toàn công ty ({population.length})</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.members.length})</option>)}
                </select>
              </label>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold shrink-0 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> {deptName || 'Phòng ban'} ({population.length})
              </span>
            )}
          </div>

          {!loading && stats.reviewedCount === 0 && (
            <div className="mb-4 p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 text-indigo-800 text-xs flex items-center gap-2">
              <Lightbulb className="w-4 h-4 shrink-0 text-indigo-500" />
              Chưa có đánh giá nào trong {periodLabel(period)}. Hãy bắt đầu đánh giá từ danh sách bên dưới — ma trận sẽ cập nhật ngay sau khi lưu.
            </div>
          )}

          <div className="flex gap-3">
            {/* Y axis */}
            <div className="flex flex-col items-center justify-between py-1 w-6 shrink-0">
              <span className="text-[10px] font-bold text-slate-400">{LEVEL_LABEL[3]}</span>
              <span className="text-[10px] font-extrabold text-indigo-600 tracking-[0.2em] [writing-mode:vertical-rl] rotate-180">TIỀM NĂNG</span>
              <span className="text-[10px] font-bold text-slate-400">{LEVEL_LABEL[1]}</span>
            </div>
            <div className="flex-1">
              <div className="grid grid-cols-3 gap-3">
                {GRID_ORDER.map((cell, idx) => {
                  const m = CELL_META[cell];
                  const members = stats.reviewed.filter((e) => e.cell === cell);
                  const pct = stats.reviewedCount ? Math.round((members.length / stats.reviewedCount) * 100) : 0;
                  return (
                    <motion.button
                      type="button"
                      key={cell}
                      id={`nine-box-cell-${cell}`}
                      onClick={() => openCell(cell)}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.03 }}
                      whileHover={{ y: -2 }}
                      className={`text-left p-3.5 rounded-2xl border bg-gradient-to-br ${m.card} flex flex-col justify-between min-h-[136px] transition-all hover:shadow-md cursor-pointer group`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-xs text-slate-900 leading-tight group-hover:text-indigo-700 transition-colors">{m.title}</span>
                          <span className="text-sm font-extrabold font-display text-slate-900 bg-white/90 border border-slate-200 rounded-lg px-2 leading-6 shrink-0">
                            {loading ? '·' : members.length}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-snug">{m.desc}</p>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex -space-x-2">
                          {members.slice(0, 4).map((e) => (
                            <span key={e.id} className="ring-2 ring-white rounded-full" title={e.full_name}>
                              <Avatar src={e.avatar_url} name={e.full_name} id={e.id} size="xs" shape="circle" />
                            </span>
                          ))}
                          {members.length > 4 && (
                            <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">+{members.length - 4}</span>
                          )}
                          {members.length === 0 && <span className="text-[10px] text-slate-400 italic">Chưa có nhân sự</span>}
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">{pct}%</span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-600">
                        <span className="font-semibold truncate">{m.tag}</span>
                        <span className="text-indigo-600 font-bold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                          Chi tiết <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
              {/* X axis */}
              <div className="mt-2 grid grid-cols-3 text-center text-[10px] font-bold text-slate-400">
                <span>{LEVEL_LABEL[1]}</span><span>{LEVEL_LABEL[2]}</span><span>{LEVEL_LABEL[3]}</span>
              </div>
              <div className="text-center text-[10px] font-extrabold text-blue-600 tracking-[0.2em] mt-0.5">HIỆU SUẤT →</div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-4 space-y-4">
          {/* Distribution */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-indigo-600" /> Phân bổ nhóm năng lực</h3>
            {stats.reviewedCount === 0 ? (
              <p className="mt-3 text-xs text-slate-400">Chưa có dữ liệu đánh giá để phân bổ.</p>
            ) : (
              <>
                <div className="mt-3 h-3 rounded-full overflow-hidden flex bg-slate-100">
                  {[['top', stats.top, 'bg-emerald-500'], ['core', stats.core, 'bg-blue-500'], ['risk', stats.risk, 'bg-amber-500']].map(([k, v, cls]) => (
                    <motion.div key={k} className={cls} initial={{ width: 0 }} animate={{ width: `${(v / stats.reviewedCount) * 100}%` }} transition={{ duration: 0.7 }} />
                  ))}
                </div>
                <div className="mt-3 space-y-1.5 text-xs">
                  {[
                    ['Nhân tài nòng cốt', stats.top, 'bg-emerald-500'],
                    ['Ổn định / chuyên gia', stats.core, 'bg-blue-500'],
                    ['Cần cải thiện', stats.risk, 'bg-amber-500'],
                  ].map(([label, v, dot]) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-slate-600"><span className={`w-2.5 h-2.5 rounded-full ${dot}`} />{label}</span>
                      <span className="font-bold text-slate-900">{v} <span className="text-slate-400 font-medium">({Math.round((v / stats.reviewedCount) * 100)}%)</span></span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Insights */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs space-y-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" /> Khuyến nghị hành động</h3>
            {loading ? (
              <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div>
            ) : insights.length === 0 ? (
              <p className="text-xs text-slate-400">Chưa có nhân sự thuộc phạm vi đánh giá.</p>
            ) : insights.map((it) => {
              const tones = {
                blue: 'bg-blue-50/70 border-blue-200 text-blue-900',
                emerald: 'bg-emerald-50/70 border-emerald-200 text-emerald-900',
                purple: 'bg-purple-50/70 border-purple-200 text-purple-900',
                amber: 'bg-amber-50/70 border-amber-200 text-amber-900',
                rose: 'bg-rose-50/70 border-rose-200 text-rose-900',
              };
              const Icon = it.icon;
              return (
                <div key={it.key} className={`p-3.5 rounded-2xl border text-xs ${tones[it.tone]}`}>
                  <div className="font-bold flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 shrink-0" />{it.title}</div>
                  <p className="mt-1 leading-relaxed opacity-90">{it.body}</p>
                  {it.action && (
                    <button type="button" onClick={it.action.run} className="mt-1.5 font-bold hover:underline flex items-center gap-0.5 cursor-pointer">
                      {it.action.label} <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Department scores (CEO / HR) */}
          {isExec && (
            <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-blue-600" /> Hiệu suất theo phòng ban</h3>
              <div className="mt-3 space-y-3">
                {deptStats.length === 0 ? (
                  <p className="text-xs text-slate-400">Chưa có dữ liệu phòng ban.</p>
                ) : deptStats.map((d) => (
                  <button key={d.id} type="button" onClick={() => setDeptFilter(d.id)} className={`w-full text-left text-xs group cursor-pointer ${deptFilter === d.id ? 'opacity-100' : 'opacity-90 hover:opacity-100'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold truncate ${deptFilter === d.id ? 'text-indigo-700' : 'text-slate-700'}`}>{d.name}</span>
                      <span className="font-bold text-slate-900">{d.avg ?? '—'} <span className="text-slate-400 font-medium">• {d.reviewed}/{d.total}</span></span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <motion.div className={`h-full rounded-full ${d.avg == null ? 'bg-slate-200' : d.avg >= 80 ? 'bg-emerald-500' : d.avg >= 60 ? 'bg-blue-500' : 'bg-rose-500'}`} initial={{ width: 0 }} animate={{ width: `${d.avg ?? 0}%` }} transition={{ duration: 0.7 }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= REVIEW TABLE ================= */}
      <section ref={tableRef} className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-2xs space-y-4 scroll-mt-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><Users className="w-5 h-5" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-display">Danh sách đánh giá nhân sự</h2>
              <p className="text-xs text-slate-500">Chấm điểm hiệu suất, tiềm năng và ghi nhận xét {periodLabel(period)} cho từng nhân sự</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex p-1 bg-slate-100 rounded-xl text-xs">
              {[['all', 'Tất cả', stats.total], ['pending', 'Chưa đánh giá', stats.pending], ['done', 'Đã đánh giá', stats.reviewedCount]].map(([k, label, n]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStatusTab(k)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${statusTab === k ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {label} <span className={`px-1.5 rounded-md text-[10px] ${statusTab === k ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>{n}</span>
                </button>
              ))}
            </div>
            <select value={cellFilter} onChange={(e) => setCellFilter(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer">
              <option value="all">Mọi xếp loại</option>
              <option value="top">Nhân tài nòng cốt (6•8•9)</option>
              <option value="risk">Cần cải thiện (1•2•4)</option>
              {GRID_ORDER.map((c) => <option key={c} value={c}>Ô {c} — {CELL_META[c].title}</option>)}
            </select>
            <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="bg-transparent font-semibold text-slate-700 focus:outline-none cursor-pointer">
                <option value="status">Chưa đánh giá trước</option>
                <option value="perf_desc">Hiệu suất cao → thấp</option>
                <option value="perf_asc">Hiệu suất thấp → cao</option>
                <option value="kpi_desc">KPI hệ thống cao → thấp</option>
                <option value="name">Tên A → Z</option>
              </select>
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="review-search-input"
                type="text"
                placeholder="Tìm tên, mã NV, chức danh..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none w-56 transition-all"
              />
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={tableRows.length === 0}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" /> Xuất báo cáo
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-200/80 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Nhân sự</th>
                <th className="py-3 px-3 text-center">KPI hệ thống</th>
                <th className="py-3 px-3 text-center">Hiệu suất</th>
                <th className="py-3 px-3 text-center">Tiềm năng</th>
                <th className="py-3 px-3 text-center">Xếp loại 9-Box</th>
                <th className="py-3 px-4">Nhận xét ({periodLabel(period)})</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                [0, 1, 2, 3].map((i) => (
                  <tr key={i}><td colSpan={7} className="py-3 px-4"><div className="h-9 rounded-xl bg-slate-100 animate-pulse" /></td></tr>
                ))
              ) : tableRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    {population.length === 0 ? 'Chưa có nhân sự thuộc phạm vi đánh giá của bạn.' : 'Không có nhân sự phù hợp bộ lọc hiện tại.'}
                  </td>
                </tr>
              ) : tableRows.map((emp) => {
                const r = emp.review;
                const m = emp.cell ? CELL_META[emp.cell] : null;
                const canPipRow = (isExec || isManager) && emp.cell && PIP_CELLS.includes(emp.cell) && !activePipIds.includes(emp.id);
                const pipStatus = pipStatusByEmp.get(emp.id);
                return (
                  <tr key={emp.id} className="hover:bg-indigo-50/30 transition-colors group">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar src={emp.avatar_url} name={emp.full_name} id={emp.id} size="md" shape="rounded" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">{emp.full_name}</span>
                            <span className="px-1.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-500 border border-slate-200">{emp.id}</span>
                            {pipStatus && (
                              <button
                                type="button"
                                onClick={() => openPip(emp)}
                                className={`px-1.5 rounded text-[9px] font-bold border cursor-pointer ${pipStatus === 'proposed' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}
                                title="Xem kế hoạch PIP"
                              >
                                {pipStatus === 'proposed' ? 'PIP chờ duyệt' : 'PIP'}
                              </button>
                            )}
                            {highRiskEmpIds.has(emp.id) && (
                              <button
                                type="button"
                                onClick={() => openTurnoverRisk(emp.id)}
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-0.5 cursor-pointer hover:bg-rose-100 transition shadow-2xs"
                                title="Nhân sự có nguy cơ biến động cao (≥60đ). Bấm để xem chi tiết tín hiệu."
                              >
                                <AlertOctagon className="w-2.5 h-2.5 text-rose-600" /> Nguy cơ cao
                              </button>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 block truncate max-w-[260px]">
                            {[emp.job_title, isExec ? emp.department_name : null].filter(Boolean).join(' • ') || '—'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {emp.kpi_score != null ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="font-extrabold text-slate-900">{Number(emp.kpi_score).toFixed(1)}</span>
                          <div className="w-14 bg-slate-100 rounded-full h-1 mt-1 overflow-hidden">
                            <div className="bg-indigo-500 h-1 rounded-full" style={{ width: `${Math.min(Number(emp.kpi_score), 100)}%` }} />
                          </div>
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {r ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className={`inline-block px-2.5 py-0.5 rounded-lg font-extrabold border ${perfTone(Number(r.performance_score))}`}>{Number(r.performance_score)}</span>
                          <DeltaBadge value={emp.delta} />
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {r ? <span className={`inline-block px-2.5 py-0.5 rounded-lg font-extrabold border ${potTone(Number(r.potential_score))}`}>{Number(r.potential_score)}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {m ? (
                        <button type="button" onClick={() => openCell(emp.cell)} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer hover:shadow-sm transition ${m.badge}`}>
                          <Star className="w-3 h-3" /> {m.title}
                        </button>
                      ) : (
                        <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-50 text-slate-400 border border-dashed border-slate-200">Chưa xếp loại</span>
                      )}
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      {r ? (
                        <div className="space-y-0.5">
                          <p className="text-slate-800 text-[11px] line-clamp-2 leading-relaxed" title={r.comments || ''}>{r.comments ? `“${r.comments}”` : <span className="italic text-slate-400">Không có nhận xét</span>}</p>
                          <span className="text-[10px] text-slate-400 block">Bởi <strong>{r.reviewer_name || '—'}</strong> • {fmtDate(r.updated_at)}</span>
                        </div>
                      ) : (
                        <span className="text-amber-600 text-[11px] font-semibold">Chờ đánh giá</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openReview(emp)}
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all inline-flex items-center gap-1.5 cursor-pointer active:scale-95 ${r
                            ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                            : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-md shadow-indigo-500/20'}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" /> {r ? 'Cập nhật' : 'Đánh giá'}
                        </button>
                        {canPipRow && (
                          <button type="button" onClick={() => openPip(emp)} className="p-1.5 rounded-lg text-rose-600 border border-rose-200 hover:bg-rose-50 transition cursor-pointer" title={isExec ? 'Lập PIP' : 'Đề xuất PIP gửi HR phê duyệt'}>
                            <Target className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button type="button" onClick={() => openModal('modal4B', emp)} className="p-1.5 rounded-lg text-slate-500 border border-slate-200 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer" title="Xem Hồ sơ 360">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && tableRows.length > 0 && (
          <div className="text-[11px] text-slate-400 text-right">Hiển thị {tableRows.length}/{stats.total} nhân sự</div>
        )}
      </section>

      {/* ================= REVIEW MODAL ================= */}
      <AnimatePresence>
        {reviewingEmp && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !saving && setReviewingEmp(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="relative overflow-hidden p-6 pb-5 border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-blue-50 to-white rounded-t-3xl">
                <div className="absolute -top-16 -right-10 w-56 h-56 bg-indigo-200/40 rounded-full blur-3xl pointer-events-none" />
                <div className="relative flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <Avatar src={reviewingEmp.avatar_url} name={reviewingEmp.full_name} id={reviewingEmp.id} size="lg" shape="rounded" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-extrabold text-slate-900 font-display">{reviewingEmp.full_name}</h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white text-slate-600 border border-slate-200">{reviewingEmp.id}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${existingForModal ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                          {existingForModal ? 'Cập nhật đánh giá' : 'Đánh giá mới'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{[reviewingEmp.job_title, reviewingEmp.department_name].filter(Boolean).join(' • ')} • Kỳ <strong className="text-indigo-700">{periodLabel(period)}</strong></p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setReviewingEmp(null)} disabled={saving} className="w-9 h-9 rounded-full hover:bg-white flex items-center justify-center text-slate-400 hover:text-slate-600 transition cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveReview} className="p-6 grid grid-cols-1 lg:grid-cols-5 gap-6 text-xs">
                {/* Left: scores + comment */}
                <div className="lg:col-span-3 space-y-4">
                  {[
                    { key: 'perf', label: 'Điểm hiệu suất công việc', hint: 'Kết quả thực tế so với mục tiêu kỳ', value: perfScore, set: setPerfScore, tone: perfTone, accent: 'accent-blue-600', level: (v) => (v >= 80 ? 'Xuất sắc' : v >= 60 ? 'Đạt yêu cầu' : 'Cần cải thiện') },
                    { key: 'pot', label: 'Điểm tiềm năng phát triển', hint: 'Khả năng đảm nhận vai trò lớn hơn', value: potScore, set: setPotScore, tone: potTone, accent: 'accent-indigo-600', level: (v) => (v >= 80 ? 'Tiềm năng cao' : v >= 60 ? 'Trung bình' : 'Hạn chế') },
                  ].map((s) => (
                    <div key={s.key} className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-800">{s.label}</div>
                          <div className="text-[10px] text-slate-400">{s.hint}</div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-xl text-sm font-extrabold border ${s.tone(s.value)}`}>
                          {s.value}<span className="text-[10px] font-bold opacity-70">/100 • {s.level(s.value)}</span>
                        </span>
                      </div>
                      <input type="range" min="0" max="100" step="1" value={s.value} onChange={(e) => s.set(Number(e.target.value))} className={`w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer ${s.accent}`} />
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {QUICK_SCORES.map((q) => (
                          <button key={q} type="button" onClick={() => s.set(q)} className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${s.value === q ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>{q}</button>
                        ))}
                        {s.key === 'perf' && reviewingEmp.kpi_score != null && (
                          <button type="button" onClick={() => s.set(Math.round(Math.min(Number(reviewingEmp.kpi_score), 100)))} className="ml-auto px-2 py-0.5 rounded-md text-[10px] font-bold border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition cursor-pointer">
                            Dùng KPI hệ thống ({Number(reviewingEmp.kpi_score).toFixed(1)})
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="review-comment" className="font-bold text-slate-700">Nhận xét và đánh giá chi tiết</label>
                      <span className={`text-[10px] ${comment.length > 2000 ? 'text-rose-600' : 'text-slate-400'}`}>{comment.length}/2000</span>
                    </div>
                    <textarea
                      id="review-comment"
                      rows={4}
                      maxLength={2000}
                      placeholder="Nhận xét cụ thể về kết quả công việc, tinh thần trách nhiệm, kỹ năng chuyên môn, làm việc nhóm và định hướng phát triển..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-xs leading-relaxed"
                    />
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {COMMENT_CHIPS.map((c) => (
                        <button key={c} type="button" onClick={() => setComment((prev) => (prev.trim() ? `${prev.trim()} ${c}` : c))} className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200 hover:border-indigo-300 hover:text-indigo-700 transition cursor-pointer">
                          + {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right: live 9-box preview + history */}
                <div className="lg:col-span-2 space-y-4">
                  <div className={`p-4 rounded-2xl border bg-gradient-to-br ${modalMeta.card}`}>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Xếp loại dự kiến</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`w-8 h-8 rounded-xl border flex items-center justify-center font-extrabold font-display ${modalMeta.badge}`}>{modalCell}</span>
                      <div>
                        <div className="font-extrabold text-slate-900 text-sm">{modalMeta.title}</div>
                        <div className="text-[11px] text-slate-500">{modalMeta.tag}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1.5">
                      {GRID_ORDER.map((c) => (
                        <motion.div
                          key={c}
                          layout
                          className={`h-9 rounded-lg border text-[10px] font-bold flex items-center justify-center transition-colors ${c === modalCell ? `${CELL_META[c].badge} ring-2 ring-offset-1 ring-indigo-400` : 'bg-white/70 text-slate-300 border-slate-200'}`}
                        >
                          {c}
                        </motion.div>
                      ))}
                    </div>
                    <div className="mt-1.5 flex justify-between text-[9px] text-slate-400 font-bold">
                      <span>HS {LEVEL_LABEL[levelOf(perfScore)]}</span><span>TN {LEVEL_LABEL[levelOf(potScore)]}</span>
                    </div>
                    <ul className="mt-3 space-y-1">
                      {modalMeta.actions.slice(0, 2).map((a) => (
                        <li key={a} className="text-[11px] text-slate-700 flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />{a}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-200 bg-white">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5"><History className="w-3.5 h-3.5 text-indigo-600" /> Lịch sử đánh giá</div>
                    <div className="mt-2 space-y-1.5 max-h-44 overflow-y-auto pr-1">
                      {empHistory.loading ? (
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải...</div>
                      ) : empHistory.error ? (
                        <div className="text-[11px] text-rose-600">{empHistory.error}</div>
                      ) : empHistory.items.length === 0 ? (
                        <div className="text-[11px] text-slate-400">Đây là lần đánh giá đầu tiên của nhân sự này.</div>
                      ) : empHistory.items.map((h) => (
                        <div key={h.id} className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 border text-[11px] ${h.period === period ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-100 bg-slate-50/60'}`}>
                          <span className="font-bold text-slate-700">{periodLabel(h.period)}</span>
                          <span className="text-slate-600">HS <strong>{Number(h.performance_score)}</strong> • TN <strong>{Number(h.potential_score)}</strong></span>
                          <span className={`px-1.5 rounded border text-[10px] font-bold ${CELL_META[h.nine_box_cell]?.badge || ''}`}>Ô {h.nine_box_cell}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {formError && (
                  <div className="lg:col-span-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {formError}
                  </div>
                )}

                <div className="lg:col-span-5 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button type="button" onClick={() => setReviewingEmp(null)} disabled={saving} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition cursor-pointer">
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold shadow-md shadow-indigo-500/25 flex items-center gap-2 transition active:scale-95 disabled:opacity-60 cursor-pointer"
                  >
                    {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {existingForModal ? 'Cập nhật đánh giá' : 'Lưu đánh giá'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-2xl bg-slate-900 text-white text-xs font-semibold shadow-2xl flex items-center gap-2"
          >
            <Check className="w-4 h-4 text-emerald-400" /> {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
