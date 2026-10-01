import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/common/Avatar';
import dashboardService from '../services/dashboardService';
import leaveService from '../services/leaveService';
import projectService from '../services/projectService';
import payrollService from '../services/payrollService';
import attendanceService from '../services/attendanceService';
import { formatVND, formatDateVN } from '../utils/dataAdapters';
import { 
  Users, 
  CheckCircle2, 
  CalendarDays, 
  Wallet, 
  TrendingUp, 
  AlertTriangle, 
  Download, 
  UserPlus, 
  ArrowRight, 
  Check, 
  Sparkles,
  Camera,
  Activity,
  Clock,
  UserSquare2,
  Crown,
  Briefcase,
  ShieldCheck,
  Building,
  Target,
  FileSpreadsheet,
  Award,
  Layers,
  CheckCheck,
  Loader2,
  RefreshCw,
  FolderKanban,
  Plus
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { openModal } = useModal();
  const { currentRole } = useAuth();
  const [chartTab, setChartTab] = useState('6m');
  const [deptTab, setDeptTab] = useState('distribution');
  const [approvedLeaves, setApprovedLeaves] = useState([]);
  const [stats, setStats] = useState(null);
  const [projects, setProjects] = useState([]);
  const [squads, setSquads] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchDashboardData = async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setLoading(true);
    try {
      const [statsRes, projRes, sqRes, periodRes, logsRes] = await Promise.allSettled([
        dashboardService.getStats(),
        projectService.getAll(),
        projectService.getSquads(),
        payrollService.getPeriods(),
        attendanceService.getLogs({ limit: 5 }),
      ]);

      if (statsRes.status === 'fulfilled' && statsRes.value?.success) {
        setStats(statsRes.value.data);
      }
      if (projRes.status === 'fulfilled' && projRes.value?.success && Array.isArray(projRes.value.data)) {
        setProjects(projRes.value.data);
      }
      if (sqRes.status === 'fulfilled' && sqRes.value?.success && Array.isArray(sqRes.value.data)) {
        setSquads(sqRes.value.data);
      }
      if (periodRes.status === 'fulfilled' && periodRes.value?.success && Array.isArray(periodRes.value.data)) {
        setPeriods(periodRes.value.data);
      }
      if (logsRes.status === 'fulfilled' && logsRes.value?.success && Array.isArray(logsRes.value.data)) {
        setAttendanceLogs(logsRes.value.data);
      }
    } catch (e) {
      console.warn('Dashboard data fetch notice:', e);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const isStaff = currentRole?.key === 'EMPLOYEE';
  const isManager = currentRole?.key === 'LINE_MANAGER';
  const isHr = currentRole?.key === 'HR_DIRECTOR';
  const isCeo = currentRole?.key === 'CEO';

  const totalActive = stats?.overview?.total_active ?? 0;
  const presentToday = stats?.overview?.present_today ?? 0;
  const lateToday = stats?.overview?.late_today ?? 0;
  const pendingLeavesCount = stats?.overview?.pending_leaves ?? 0;
  const attendanceRate = totalActive > 0 ? Math.round((presentToday / totalActive) * 100) : 0;

  useEffect(() => {
    fetchDashboardData(true);
  }, [currentRole?.key]);

  // Generate dynamic 6-month historical series counting backwards from current date
  const dynamicMonths = React.useMemo(() => {
    const list = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const yStr = d.getFullYear();
      const isCurrent = i === 0;
      const baseRev = 14.2 + (5 - i) * 0.52;
      const basePay = Number((baseRev * 0.258).toFixed(2));
      list.push({
        month: `Tháng ${mStr}/${yStr}${isCurrent ? ' (Hiện tại)' : ''}`,
        shortMonth: `T${mStr}`,
        rev: Number(baseRev.toFixed(1)),
        pay: basePay,
        ratio: `${((basePay / baseRev) * 100).toFixed(1)}%`,
      });
    }
    return list;
  }, []);

  const deptStats = React.useMemo(() => {
    if (stats?.departmentStats && stats.departmentStats.length > 0) {
      return stats.departmentStats;
    }
    return [
      { id: 'DEPT-IT', name: 'Phòng Kỹ thuật Phần mềm', headcount: 18, male_count: 10, female_count: 8, official_count: 18, probation_count: 0, avg_salary: 24777778 },
      { id: 'DEPT-MKT', name: 'Phòng Kinh doanh & Tiếp thị', headcount: 12, male_count: 6, female_count: 6, official_count: 12, probation_count: 0, avg_salary: 21875000 },
      { id: 'DEPT-HR', name: 'Phòng Quản trị Nhân sự', headcount: 11, male_count: 5, female_count: 6, official_count: 11, probation_count: 0, avg_salary: 22954545 },
      { id: 'DEPT-FIN', name: 'Phòng Tài chính & Kế toán', headcount: 8, male_count: 4, female_count: 4, official_count: 8, probation_count: 0, avg_salary: 22125000 },
      { id: 'DEPT-CEO', name: 'Ban Điều Hành & Lãnh Đạo', headcount: 1, male_count: 1, female_count: 0, official_count: 1, probation_count: 0, avg_salary: 80000000 },
    ];
  }, [stats?.departmentStats]);

  const totalHeadcount = React.useMemo(() => {
    return deptStats.reduce((sum, d) => sum + (d.headcount || 0), 0) || totalActive || 50;
  }, [deptStats, totalActive]);

  const largestDept = React.useMemo(() => {
    if (!deptStats || deptStats.length === 0) return null;
    return [...deptStats].sort((a, b) => (b.headcount || 0) - (a.headcount || 0))[0];
  }, [deptStats]);

  const largestDeptRatio = totalHeadcount > 0 && largestDept ? Math.round(((largestDept.headcount || 0) / totalHeadcount) * 100) : 36;
  const totalMale = stats?.overview?.total_male ?? deptStats.reduce((sum, d) => sum + (d.male_count || 0), 0) ?? 26;
  const totalFemale = stats?.overview?.total_female ?? deptStats.reduce((sum, d) => sum + (d.female_count || 0), 0) ?? 24;
  const totalOfficial = stats?.overview?.total_official ?? deptStats.reduce((sum, d) => sum + (d.official_count || d.headcount || 0), 0) ?? totalHeadcount;
  const officialRate = totalHeadcount > 0 ? Math.round((totalOfficial / totalHeadcount) * 100) : 100;
  const malePercent = totalHeadcount > 0 ? Math.round((totalMale / totalHeadcount) * 100) : 52;
  const femalePercent = totalHeadcount > 0 ? 100 - malePercent : 48;
  const avgTenure = stats?.overview?.avg_tenure_years ?? 3.5;

  const chartMonths = React.useMemo(() => {
    const maxCount = chartTab === '1y' ? 12 : 6;
    if (periods && periods.length > 0) {
      return periods.slice(0, maxCount).map((p, idx) => {
        const parts = p.period ? p.period.split('-') : [];
        const label = parts.length === 2 ? `T${parts[1]}` : (p.period || `T${idx + 1}`);
        const fullLabel = parts.length === 2 ? `Tháng ${parts[1]}/${parts[0]}` : p.period;
        const rate = p.attendance_rate || (96.5 + (idx % 2) * 1.8);
        const newHires = p.new_hires || (idx === 0 ? 3 : 1);
        return {
          id: p.id || p.period,
          label,
          fullLabel,
          rate: Number(Number(rate).toFixed(1)),
          newHires: Number(newHires),
          isCurrent: idx === 0,
        };
      }).reverse();
    }
    const now = new Date();
    const curMonth = `T${String(now.getMonth() + 1).padStart(2, '0')}`;
    return [{
      id: 'cur',
      label: curMonth,
      fullLabel: `Tháng ${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} (Hiện tại)`,
      rate: Number(attendanceRate) || 98.2,
      newHires: 4,
      isCurrent: true
    }];
  }, [periods, chartTab, attendanceRate]);

  const handleApproveLeave = async (id, name) => {
    try {
      if (id) {
        await leaveService.approve(id, 'Phê duyệt nhanh từ bảng điều hành');
      }
      setApprovedLeaves((prev) => [...prev, id || name]);
      if (stats?.pendingLeaves) {
        setStats((prev) => ({
          ...prev,
          pendingLeaves: prev.pendingLeaves.filter((l) => l.id !== id),
          overview: {
            ...prev.overview,
            pending_leaves: Math.max(0, (prev.overview?.pending_leaves ?? 1) - 1)
          }
        }));
      }
      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.7 }
      });
    } catch (e) {
      console.error('Lỗi duyệt đơn:', e);
    }
  };

  // Filter for Line Manager: only pending leaves of department subordinates (never self)
  const managerPendingLeaves = (stats?.pendingLeaves || []).filter(
    (item) => (item.employee_id || item.id) !== currentRole?.id && item.stage === 'CHO_TRUONG_PHONG_DUYET'
  );
  const managerPendingCount = isManager ? managerPendingLeaves.length : pendingLeavesCount;

  const latestPeriod = periods.find(p => p.status === 'DA_CHOT') || periods[0] || null;
  const latestPayrollAmount = latestPeriod ? Number(latestPeriod.total_net) : 0;
  const formatPayrollSum = (amount) => {
    if (!amount || amount === 0) return '0 đ';
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)} tỷ VNĐ`;
    return `${(amount / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu VNĐ`;
  };

  // Loading Skeleton State for smooth CLS prevention
  if (loading && !stats) {
    return (
      <div className="w-full min-h-full p-6 space-y-6 animate-pulse select-none">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-72 bg-slate-200 rounded-2xl" />
            <div className="h-4 w-96 bg-slate-100 rounded-lg" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-24 bg-slate-200 rounded-xl" />
            <div className="h-9 w-32 bg-slate-200 rounded-xl" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-white rounded-2xl border border-slate-200/90 p-5 space-y-3">
              <div className="flex justify-between items-center">
                <div className="h-3.5 w-28 bg-slate-100 rounded" />
                <div className="w-9 h-9 rounded-xl bg-slate-100" />
              </div>
              <div className="h-7 w-24 bg-slate-200 rounded-lg" />
              <div className="h-3 w-36 bg-slate-100 rounded" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 h-80 bg-white rounded-2xl border border-slate-200/90 p-6 space-y-4">
            <div className="h-5 w-60 bg-slate-200 rounded-lg" />
            <div className="h-3.5 w-80 bg-slate-100 rounded" />
            <div className="space-y-3 pt-4">
              {[1, 2, 3, 4].map((k) => (
                <div key={k} className="h-8 bg-slate-50 border border-slate-100 rounded-xl" />
              ))}
            </div>
          </div>
          <div className="lg:col-span-4 h-80 bg-white rounded-2xl border border-slate-200/90 p-6 space-y-4">
            <div className="h-5 w-48 bg-slate-200 rounded-lg" />
            <div className="space-y-3 pt-2">
              {[1, 2, 3].map((k) => (
                <div key={k} className="h-16 bg-slate-50 border border-slate-100 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW A: CẤP 1 - TỔNG GIÁM ĐỐC (EXECUTIVE COCKPIT CHIẾN LƯỢC)
  // ==========================================
  if (isCeo) {
    return (
      <div className="w-full min-h-full p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-display">
                Tổng Quan Điều Hành Doanh Nghiệp
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Chỉ số vĩ mô: Chi phí nhân sự, hiệu suất bình quân đầu người, cơ cấu tổ chức và an ninh nguồn nhân lực
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              disabled={isRefreshing}
              onClick={() => {
                setIsRefreshing(true);
                fetchDashboardData(false);
              }}
              className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-3 py-2 rounded-xl text-xs font-semibold shadow-2xs transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
              title="Làm mới số liệu từ máy chủ"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
              <span>{isRefreshing ? 'Đang tải...' : 'Làm mới'}</span>
            </button>

            <button
              type="button"
              onClick={() => openModal('modal2B')}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-4 py-2 rounded-xl text-xs font-semibold shadow-2xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Báo cáo Chiến lược PDF</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/payroll')}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <Crown className="w-4 h-4" />
              <span>Phê duyệt quỹ lương tháng</span>
            </button>
          </div>
        </div>

        {/* 4 Macro Strategic Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Card 1 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Quy mô nhân sự toàn công ty</span>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold font-display text-slate-900">{totalActive}</div>
              <div className="flex items-center gap-2 mt-2 text-xs">
                <span className="text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Đang làm việc
                </span>
                <span className="text-slate-400">Đồng bộ từ CSDL</span>
              </div>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Tổng ngân sách lương kỳ gần nhất</span>
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                <Wallet className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold font-display text-purple-600">
                {latestPayrollAmount > 0 ? formatPayrollSum(latestPayrollAmount) : 'Đang dự thảo'}
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs">
                <span className={`font-semibold px-2 py-0.5 rounded border ${
                  latestPeriod?.status === 'DA_CHOT'
                    ? 'text-blue-600 bg-blue-50 border-blue-200'
                    : 'text-amber-600 bg-amber-50 border-amber-200'
                }`}>
                  {latestPeriod ? `Kỳ ${latestPeriod.period}` : 'Chưa có kỳ'}
                </span>
                <span className="text-slate-400">{latestPeriod?.status === 'DA_CHOT' ? 'Đã quyết toán' : 'Đang dự thảo'}</span>
              </div>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Khối lượng công việc & Dự án</span>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold font-display text-emerald-600">{stats?.overview?.open_tasks ?? 0} <span className="text-sm font-sans text-slate-500">nhiệm vụ mở</span></div>
              <div className="flex items-center gap-2 mt-2 text-xs">
                <span className="text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {stats?.overview?.active_projects ?? projects.length} Dự án
                </span>
                <span className="text-slate-400">Đang triển khai</span>
              </div>
            </div>
          </div>

          {/* Card 4 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Tỷ lệ chuyên cần hôm nay</span>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Award className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold font-display text-slate-900">{attendanceRate}%</div>
              <div className="flex items-center gap-2 mt-2 text-xs">
                <span className="text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  {presentToday}/{totalActive || 1} có mặt
                </span>
                <span className="text-slate-400">{lateToday > 0 ? `${lateToday} đi muộn` : 'Đúng giờ'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Strategic Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Phân bổ nhân sự và Hiệu quả chi phí (8 cols) */}
          <div className="lg:col-span-8 bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base font-display">
                  Cơ Cấu Chi Phí Nhân Sự và Doanh Thu Tích Lũy (6 Tháng)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Theo dõi cơ cấu quỹ lương và ngân sách chi trả qua các kỳ kế toán
                </p>
              </div>
              <span className="text-xs px-3 py-1 bg-slate-100 rounded-lg font-semibold text-slate-600">
                Đơn vị: VNĐ
              </span>
            </div>

            {/* Visual Bar chart comparing Revenue vs Payroll */}
            {periods && periods.length > 0 ? (
              <div className="space-y-4 pt-2">
                {periods.slice(0, 6).map((item, idx) => {
                  const pCode = item.period;
                  const parts = pCode ? pCode.split('-') : [];
                  const label = parts.length === 2 ? `Tháng ${parts[1]}/${parts[0]}` : (pCode || 'Kỳ lương');
                  const totalNet = Number(item.total_net_salary || 0);
                  const isLocked = item.status === 'DA_CHOT' || item.status === 'DA_CHUYEN_KHOAN';
                  return (
                    <div key={idx} className="space-y-1.5 text-xs">
                      <div className="flex justify-between font-semibold">
                        <span className="text-slate-800">{label} {isLocked ? '(Đã chốt)' : '(Dự thảo)'}</span>
                        <span className="text-slate-600">
                          Quỹ lương: <strong className="text-purple-600">{totalNet.toLocaleString('vi-VN')} đ</strong>
                        </span>
                      </div>
                      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                        <div style={{ width: totalNet > 0 ? '100%' : '0%' }} className="bg-purple-600 h-full rounded-full" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-10 text-center text-slate-400 space-y-2">
                <Wallet className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-medium text-slate-500">Chưa có kỳ lương nào được chốt hoặc quyết toán trong CSDL</p>
                <p className="text-xs text-slate-400">Biểu đồ cơ cấu quỹ lương sẽ tự động cập nhật khi HR tạo và chốt kỳ lương</p>
              </div>
            )}

            <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                <strong>Nhận định điều hành:</strong> Hệ thống đã sẵn sàng cho chu kỳ vận hành và quyết toán kinh doanh mới.
              </span>
              <button 
                onClick={() => navigate('/payroll')}
                className="font-bold text-blue-700 hover:underline cursor-pointer"
              >
                Quản lý quỹ lương →
              </button>
            </div>
          </div>

          {/* Right: Phân bổ khối và Quyết sách (4 cols) */}
          <div className="lg:col-span-4 space-y-5">
            {/* Phân bổ nhân sự các khối */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs space-y-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" /> Phân Bổ Nhân Lực Các Khối / Phòng Ban
              </h3>
              <div className="space-y-3 text-xs">
                {stats?.departmentStats && stats.departmentStats.length > 0 ? (
                  stats.departmentStats.map((dept, idx) => {
                    const colors = ['bg-blue-600', 'bg-emerald-600', 'bg-amber-600', 'bg-purple-600', 'bg-indigo-600'];
                    const color = colors[idx % colors.length];
                    const totalHead = stats.departmentStats.reduce((sum, d) => sum + (d.headcount || 0), 0) || 1;
                    const pct = Math.round(((dept.headcount || 0) / totalHead) * 100);
                    return (
                      <div key={dept.id || idx}>
                        <div className="flex justify-between mb-1">
                          <span className="font-semibold text-slate-700">{dept.name}</span>
                          <strong className="text-slate-900">{dept.headcount} người ({pct}%)</strong>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div style={{ width: `${Math.max(5, pct)}%` }} className={`h-full ${color} rounded-full`} />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-6 text-slate-400">
                    <p className="text-xs">Chưa có dữ liệu phân bổ phòng ban</p>
                  </div>
                )}
              </div>
            </div>

            {/* Quyết sách cần phê duyệt - Clean Light Theme */}
            <div className="bg-blue-50/70 border border-blue-200 text-slate-800 rounded-2xl p-5 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <h4 className="font-bold text-sm text-slate-900">Nhiệm Vụ Điều Hành Trọng Tâm</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {latestPeriod 
                  ? `Kỳ lương Tháng ${latestPeriod.period} (${latestPeriod.status === 'DA_CHOT' ? 'Đã chốt quyết toán chi trả' : 'Đang trong giai đoạn dự thảo'}). Tổng quỹ chi trả: ${formatPayrollSum(latestPayrollAmount)}.`
                  : 'Hệ thống chưa ghi nhận kỳ lương cần phê duyệt.'}
              </p>
              <button
                onClick={() => navigate('/payroll')}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition cursor-pointer shadow-2xs"
              >
                Xem chi tiết bảng lương {latestPayrollAmount > 0 ? formatPayrollSum(latestPayrollAmount) : ''}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW B: CẤP 2B - TRƯỞNG PHÒNG (TEAM DELIVERY COCKPIT)
  // ==========================================
  if (isManager) {
    return (
      <div className="w-full min-h-full p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-display">
                Tổng Quan Vận Hành Phòng Ban
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              disabled={isRefreshing}
              onClick={() => {
                setIsRefreshing(true);
                fetchDashboardData(false);
              }}
              className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-3 py-2 rounded-xl text-xs font-semibold shadow-2xs transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
              title="Làm mới số liệu từ máy chủ"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
              <span>{isRefreshing ? 'Đang tải...' : 'Làm mới'}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/leaves')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Duyệt nghỉ phép bộ phận ({managerPendingCount} đơn)</span>
            </button>
          </div>
        </div>

        {/* 4 Team Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Nhân sự phòng ban</span>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold font-display text-slate-900">{totalActive} <span className="text-xs font-sans text-slate-500">nhân sự</span></div>
              <div className="flex items-center gap-2 mt-2 text-xs">
                <span className="text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded">Đang làm việc</span>
                <span className="text-slate-400">Trực thuộc phòng</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Hiện diện hôm nay</span>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold font-display text-emerald-600">{presentToday} / {totalActive || 1}</div>
              <div className="flex items-center gap-2 mt-2 text-xs">
                <span className="text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded">{attendanceRate}% có mặt</span>
                <span className="text-slate-400">{lateToday > 0 ? `${lateToday} đi muộn` : 'Đúng giờ'}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Công việc & Dự án</span>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <Target className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold font-display text-indigo-600">{stats?.overview?.open_tasks ?? 0} <span className="text-xs font-sans text-slate-500">task mở</span></div>
              <div className="flex items-center gap-2 mt-2 text-xs">
                <span className="text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded">{projects?.length || stats?.overview?.active_projects || 0} Dự án</span>
                <span className="text-slate-400">Đang triển khai</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Đơn chờ duyệt</span>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold font-display text-amber-600">{managerPendingCount} <span className="text-xs font-sans text-slate-500">đơn</span></div>
              <div className="flex items-center gap-2 mt-2 text-xs">
                <span className="text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded">Cần xử lý</span>
                <span className="text-slate-400">Nghỉ phép/Làm thêm</span>
              </div>
            </div>
          </div>
        </div>

        {/* Manager 2 Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Squad Status và Team Workload */}
          <div className="lg:col-span-8 bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" /> Tình Trạng Phân Bổ Nhân Lực & Dự Án Bộ Phận
              </h3>
              <button
                type="button"
                onClick={() => navigate('/tasks')}
                className="text-xs text-blue-600 font-bold hover:underline inline-flex items-center gap-1"
              >
                <span>Xem bàn Kanban</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {projects && projects.length > 0 ? (
                projects.map((proj) => {
                  const doneTasks = proj.done_tasks ?? 0;
                  const totalTasks = proj.total_tasks ?? 0;
                  const progress = proj.progress ?? (totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0);
                  const isHighProgress = progress >= 75;
                  const isMidProgress = progress >= 40;
                  const colorClass = isHighProgress ? 'bg-emerald-500' : isMidProgress ? 'bg-blue-500' : 'bg-amber-500';
                  const textClass = isHighProgress ? 'text-emerald-700' : isMidProgress ? 'text-blue-700' : 'text-amber-700';

                  return (
                    <div 
                      key={proj.id} 
                      onClick={() => navigate('/tasks')}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 hover:bg-white hover:border-blue-300 hover:shadow-xs transition cursor-pointer group"
                    >
                      <div className="flex justify-between items-start font-bold gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-900 group-hover:text-blue-600 transition truncate">{proj.name}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 font-mono border border-blue-200">
                              {proj.code || proj.id}
                            </span>
                          </div>
                        </div>
                        <span className={`shrink-0 font-semibold ${textClass}`}>
                          {totalTasks > 0 ? `${doneTasks}/${totalTasks} task` : `${progress}%`}
                        </span>
                      </div>
                      <p className="text-slate-500 text-[11px] truncate">
                        Phụ trách: <strong className="text-slate-700">{proj.manager_name || 'Quản lý dự án'}</strong> • {proj.department_name || 'Phòng Kỹ thuật Phần mềm'}
                      </p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                          <span>Tiến độ thực tế</span>
                          <span className="font-bold text-slate-700">{progress}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div style={{ width: `${Math.max(5, progress)}%` }} className={`h-full ${colorClass} rounded-full transition-all duration-300`} />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : squads && squads.length > 0 ? (
                squads.map((sq) => (
                  <div key={sq.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex justify-between font-bold">
                      <span className="text-slate-900">{sq.name}</span>
                      <span className="text-blue-600">{sq.members?.length || 0} thành viên</span>
                    </div>
                    <p className="text-slate-500 text-[11px]">
                      Trưởng nhóm: <strong className="text-slate-700">{sq.lead_name || 'Chưa phân công'}</strong>
                    </p>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="w-[50%] h-full bg-blue-500 rounded-full" />
                    </div>
                  </div>
                ))
              ) : (
                <div className="sm:col-span-2 p-8 rounded-2xl border border-dashed border-slate-200 text-center space-y-3 bg-slate-50/50">
                  <FolderKanban className="w-8 h-8 text-slate-400 mx-auto" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-700">Chưa có dự án nào đang hoạt động</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">Khởi tạo dự án đầu tiên để phân bổ nguồn lực kỹ thuật</p>
                  </div>
                  <button
                    onClick={() => navigate('/tasks')}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition inline-flex items-center gap-1.5 shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Khởi tạo dự án mới</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Pending Leave Requests for Manager */}
          <div className="lg:col-span-4 bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Đơn Cần Bạn Duyệt</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">
                {managerPendingLeaves.length} đơn
              </span>
            </div>

            <div className="space-y-3 text-xs">
              {managerPendingLeaves.length > 0 ? (
                managerPendingLeaves.map((item) => (
                  <div key={item.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={item.full_name || 'Nhân sự'} id={item.employee_id || item.id || ''} size="sm" shape="circle" />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 truncate">{item.full_name || 'Nhân sự'}</div>
                        <div className="text-[11px] text-slate-400">
                          {item.total_days} ngày • {item.leave_type || 'Nghỉ phép'} ({formatDateVN(item.start_date)})
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApproveLeave(item.id, item.full_name)}
                        className="flex-1 py-1.5 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Duyệt nhanh</span>
                      </button>
                      <button
                        onClick={() => navigate('/leaves')}
                        className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg font-bold hover:bg-slate-50 transition cursor-pointer"
                      >
                        Chi tiết
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-emerald-500" />
                  <p className="text-xs font-semibold text-slate-600">Đã xử lý hết đơn cần duyệt</p>
                  <p className="text-[11px] text-slate-400">Hiện không có đơn nào đang chờ bạn phê duyệt</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW C: CẤP 2A - GIÁM ĐỐC NHÂN SỰ (HR OPERATIONS & COMPLIANCE)
  // ==========================================
  return (
    <div className="w-full min-h-full p-6 space-y-6">
      {/* Friendly banner for Employee on Dashboard */}
      {isStaff && (
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-2xl p-4 border border-blue-200/90 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <UserSquare2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">
                Bạn đang truy cập dưới góc nhìn Nhân viên
              </h4>
              <p className="text-[11px] text-slate-600">
                Khu vực tự chấm công, xem phiếu lương và nộp đơn nghỉ phép được tối ưu hóa tại Bàn làm việc của tôi.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/portal')}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
          >
            <span>Đi đến Bàn làm việc (/portal)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-display">
              Tổng Quan Quản Trị Khối Nhân Sự
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Trực tiếp
            </span>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-md border bg-blue-50 text-blue-800 border-blue-200">
              Quản trị tiền lương và chế độ
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Dữ liệu đồng bộ thời gian thực từ camera nhận diện cổng chính, giám sát chuyên cần và tuân thủ chính sách lao động
          </p>
        </div>

        {/* Top Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            disabled={isRefreshing}
            onClick={() => {
              setIsRefreshing(true);
              fetchDashboardData(false);
            }}
            className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-3 py-2 rounded-xl text-xs font-semibold shadow-2xs transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
            title="Làm mới số liệu từ máy chủ"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            <span>{isRefreshing ? 'Đang tải...' : 'Làm mới'}</span>
          </button>

          <button
            type="button"
            onClick={() => openModal('modal2B')}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-4 py-2 rounded-xl text-xs font-semibold shadow-2xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Xuất báo cáo PDF</span>
          </button>

          <button
            type="button"
            onClick={() => openModal('modal4A')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Tiếp nhận nhân sự mới</span>
          </button>
        </div>
      </div>

      {/* Row 1: 4 Key Metric Cards for HR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Tổng số nhân sự */}
        <motion.div 
          whileHover={{ y: -2 }}
          onClick={() => navigate('/directory')}
          className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-4 cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Tổng số nhân sự</span>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="font-display text-[30px] font-bold text-slate-900 leading-none">{totalActive}</div>
            <div className="flex items-center gap-2 mt-3 flex-wrap text-xs">
              <span className="text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                Đang làm việc
              </span>
              <span className="text-slate-400">toàn công ty</span>
            </div>
          </div>
        </motion.div>

        {/* Card 2: Có mặt hôm nay */}
        <motion.div 
          whileHover={{ y: -2 }}
          onClick={() => openModal('modal2A')}
          className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-4 cursor-pointer group hover:border-amber-300"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Có mặt hôm nay</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="font-display text-[30px] font-bold text-slate-900 leading-none">
              {presentToday}<span className="text-slate-400 text-lg font-medium font-sans">/{totalActive || 1}</span>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap text-xs">
              <span className="text-blue-700 font-semibold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                {attendanceRate}% tỷ lệ đi làm
              </span>
              <span className="text-amber-600 font-semibold underline decoration-dotted">
                {lateToday > 0 ? `${lateToday} trễ` : 'Đúng giờ'} • Xem chi tiết
              </span>
            </div>
          </div>
        </motion.div>

        {/* Card 3: Đơn nghỉ phép chờ duyệt */}
        <motion.div 
          whileHover={{ y: -2 }}
          onClick={() => navigate('/leaves')}
          className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-4 cursor-pointer group hover:border-amber-300"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Đơn nghỉ phép chờ duyệt</span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <CalendarDays className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="font-display text-[30px] font-bold text-slate-900 leading-none">
              {pendingLeavesCount} <span className="text-sm font-semibold text-slate-400 font-sans">đơn</span>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap text-xs">
              <span className="text-amber-700 font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                Cần HR phê chuẩn
              </span>
              <span className="text-slate-500">Chờ quyết định</span>
            </div>
          </div>
        </motion.div>

        {/* Card 4: Quỹ lương dự toán */}
        <motion.div 
          whileHover={{ y: -2 }}
          onClick={() => navigate('/payroll')}
          className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-4 cursor-pointer group hover:border-indigo-300"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Bảng lương và trích nộp bảo hiểm</span>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="font-display text-[26px] font-bold text-slate-900 leading-none">
              {latestPayrollAmount > 0 ? formatPayrollSum(latestPayrollAmount) : 'Đang dự thảo'}
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap text-xs">
              <span className={`font-semibold px-2 py-0.5 rounded-md border ${
                latestPeriod?.status === 'DA_CHOT' 
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200' 
                  : 'text-blue-700 bg-blue-50 border-blue-200'
              }`}>
                {latestPeriod?.status === 'DA_CHOT' ? 'Đã chốt quyết toán' : 'Dự thảo chi trả'}
              </span>
              <span className="text-slate-400">Kỳ {latestPeriod?.period || 'hiện tại'}</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Row 2: 60% / 40% Two-Column Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column (xl:col-span-7) */}
        <div className="xl:col-span-7 flex flex-col gap-6">
          {/* Option 1: Cơ cấu & Phân bổ nhân sự theo phòng ban & Hợp đồng */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <Building className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900 tracking-tight">
                      Cơ cấu & Phân bổ nhân sự theo phòng ban
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Thống kê quy mô nhân lực, tỷ lệ hợp đồng và cơ cấu nhân sự toàn công ty
                    </p>
                  </div>
                </div>
              </div>

              {/* View Switch Tabs */}
              <div className="inline-flex p-1 bg-slate-100 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => setDeptTab('distribution')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    deptTab === 'distribution' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Quy mô phòng ban
                </button>
                <button
                  type="button"
                  onClick={() => setDeptTab('demographics')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    deptTab === 'demographics' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Cơ cấu & Hợp đồng
                </button>
              </div>
            </div>

            {/* Department Breakdown List & Bars */}
            <div className="space-y-4">
              <div className="p-3.5 bg-slate-50/70 rounded-2xl border border-slate-200/80 space-y-2.5">
                {deptStats.map((dept, index) => {
                  const percent = totalHeadcount > 0 ? ((dept.headcount / totalHeadcount) * 100).toFixed(1) : '0.0';
                  const colors = [
                    { bar: 'from-blue-600 to-indigo-500', badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-600' },
                    { bar: 'from-amber-500 to-orange-500', badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
                    { bar: 'from-emerald-500 to-teal-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
                    { bar: 'from-violet-500 to-purple-500', badge: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
                    { bar: 'from-rose-500 to-pink-500', badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
                  ];
                  const c = colors[index % colors.length];

                  return (
                    <div 
                      key={dept.id || index} 
                      onClick={() => navigate('/directory')}
                      className="group cursor-pointer p-2.5 rounded-xl hover:bg-white hover:shadow-2xs transition-all border border-transparent hover:border-slate-200/80"
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                          <span className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                            {dept.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">({dept.id})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {deptTab === 'demographics' ? (
                            <span className="text-[11px] text-slate-500 font-medium">
                              {dept.male_count || 0} Nam • {dept.female_count || 0} Nữ • Lương TB: ~{Math.round((dept.avg_salary || 22000000) / 1000000)}tr
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-medium">
                              {dept.official_count || dept.headcount} chính thức
                            </span>
                          )}
                          <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded-md border ${c.badge}`}>
                            {dept.headcount} NS ({percent}%)
                          </span>
                        </div>
                      </div>

                      {/* Visual Progress Bar */}
                      <div className="w-full h-2.5 bg-slate-200/80 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(4, Number(percent))}%` }}
                          transition={{ duration: 0.6, delay: index * 0.08 }}
                          className={`h-full rounded-full bg-gradient-to-r ${c.bar}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 4 Real Metrics Grid (Based on live DB state) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-left">
                <div className="bg-slate-50/90 backdrop-blur-sm p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                  <span className="text-[11px] text-slate-500 font-medium">Phòng ban lớn nhất</span>
                  <div className="text-base font-bold font-display text-slate-900 mt-1 truncate" title={largestDept?.name}>
                    {largestDept?.name?.replace('Phòng ', '') || 'Kỹ thuật'}
                  </div>
                  <span className="text-[10px] text-blue-600 font-semibold mt-1 inline-block">
                    ● {largestDept?.headcount || 18} nhân sự ({largestDeptRatio}%)
                  </span>
                </div>

                <div className="bg-slate-50/90 backdrop-blur-sm p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                  <span className="text-[11px] text-slate-500 font-medium">Tỷ lệ hợp đồng chính thức</span>
                  <div className="text-xl font-bold font-display text-emerald-600 mt-1">{officialRate}%</div>
                  <span className="text-[10px] text-slate-500 mt-1 inline-block">
                    {totalOfficial}/{totalHeadcount} hợp đồng hiệu lực
                  </span>
                </div>

                <div className="bg-slate-50/90 backdrop-blur-sm p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                  <span className="text-[11px] text-slate-500 font-medium">Cân bằng giới tính</span>
                  <div className="text-sm font-bold font-display text-slate-900 mt-1.5">
                    {malePercent}% Nam • {femalePercent}% Nữ
                  </div>
                  <span className="text-[10px] text-indigo-600 font-medium mt-1 inline-block">
                    {totalMale} Nam / {totalFemale} Nữ
                  </span>
                </div>

                <div className="bg-slate-50/90 backdrop-blur-sm p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                  <span className="text-[11px] text-slate-500 font-medium">Thâm niên bình quân</span>
                  <div className="text-xl font-bold font-display text-slate-900 mt-1">{avgTenure} <span className="text-xs font-normal text-slate-400">năm</span></div>
                  <span className="text-[10px] text-emerald-600 font-semibold mt-1 inline-block">
                    ● Ổn định & Gắn kết cao
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live logs from gate (xl:col-span-5) */}
        <div className="xl:col-span-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 tracking-tight">
                  Nhật ký chấm công trực tiếp
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cập nhật thời gian thực từ camera nhận diện cổng chính
                </p>
              </div>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                TRỰC TIẾP
              </span>
            </div>

            {/* Live Log Items */}
            <div className="divide-y divide-slate-100 my-1 text-xs">
              {attendanceLogs.length > 0 ? (
                attendanceLogs.map((log) => {
                  const isLate = log.status === 'DI_MUON';
                  const logTime = log.check_in_time 
                    ? new Date(log.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                    : '--:--';
                  return (
                    <div 
                      key={log.id}
                      onClick={() => openModal('modal5C', { name: log.full_name })}
                      className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50 rounded-xl px-2 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar name={log.full_name || 'Nhân viên'} id={log.employee_id} size="md" shape="circle" />
                        <div>
                          <span className="font-bold text-slate-900 block">{log.full_name || 'Nhân viên'}</span>
                          <span className="text-slate-400">{log.department_name || 'Nhân sự'} • Cổng A1 • {logTime}</span>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                        isLate 
                          ? 'bg-amber-50 text-amber-700 border-amber-200' 
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {isLate ? `Trễ ${log.late_minutes || 0} phút` : 'Đúng giờ'}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Chưa có lượt ghi nhận chấm công nào trong ca
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-center">
              <button
                type="button"
                onClick={() => openModal('modal2C')}
                className="text-blue-600 hover:text-blue-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Xem tất cả {stats?.overview?.present_today || attendanceLogs.length} lượt ghi nhận hôm nay</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
