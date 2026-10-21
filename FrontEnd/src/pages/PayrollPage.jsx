import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/common/Avatar';
import payrollService from '../services/payrollService';
import employeeService from '../services/employeeService';
import confetti from 'canvas-confetti';
import {
  Wallet,
  Clock,
  ShieldCheck,
  Receipt,
  FileSpreadsheet,
  AlertTriangle,
  Lock,
  TrendingUp,
  Search,
  Filter,
  Download,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Crown,
  Printer,
  HelpCircle,
  Building,
  Check,
  CalendarDays,
  User,
  Layers,
  RefreshCw,
  X,
  Loader2
} from 'lucide-react';
import { normalizePayslip, formatVND, formatDateVN } from '../utils/dataAdapters';
import { generateCSVContent, downloadFile } from '../utils/fileExportUtils';
import {
  parsePeriodCode,
  formatPeriodLabel,
  resolveSelectedPeriodObj,
  buildPeriodSelectOptions,
  computePeriodViewState,
  ADJUSTMENT_FIELD_LABELS,
  formatConflictFieldValue,
  getConflictItemKey,
  extractConflictsFromError,
  areAllConflictsResolved,
  buildConflictResolutionPayload,
  reconcileConflictModalState,
} from '../utils/payrollPeriodState';

export default function PayrollPage() {
  const { currentRole } = useAuth();
  const { openModal } = useModal();
  const roleKey = currentRole?.key || 'EMPLOYEE';
  const now = new Date();
  const defaultPeriodStr = `Tháng ${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriodStr);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [showNumbers, setShowNumbers] = useState(false);
  const [apiPayslips, setApiPayslips] = useState([]);
  const [apiPeriods, setApiPeriods] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [myPayslip, setMyPayslip] = useState(null);
  const [myPayslipsList, setMyPayslipsList] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  // R20/R22/R26 period state tracking
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodError, setPeriodError] = useState('');
  const [loadedPeriodCode, setLoadedPeriodCode] = useState(null);
  const [loadedPeriodId, setLoadedPeriodId] = useState(null);
  const [loadedExpectedTotal, setLoadedExpectedTotal] = useState(null);
  const [loadedSnapshotToken, setLoadedSnapshotToken] = useState(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [calculatingPeriod, setCalculatingPeriod] = useState(false);
  const [exportError, setExportError] = useState('');
  const [reconcileSuccessBanner, setReconcileSuccessBanner] = useState('');
  // R24 Adjustment Source Conflict Reconciliation state
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictItems, setConflictItems] = useState([]);
  const [conflictDecisions, setConflictDecisions] = useState({});
  const [conflictModalError, setConflictModalError] = useState('');
  const [conflictStaleNotice, setConflictStaleNotice] = useState('');
  const [conflictSubmitting, setConflictSubmitting] = useState(false);

  const hasInitializedPeriodRef = useRef(false);
  const requestSeqRef = useRef(0);

  // Tab for CEO and HRD: 'company' | 'personal'
  const [adminTab, setAdminTab] = useState('company');

  const getPeriodCode = (periodStr) => parsePeriodCode(periodStr);

  useEffect(() => {
    let isMounted = true;
    async function fetchPayroll() {
      try {
        // Fetch personal payslip for current user
        payrollService.getMyPayslips().then(res => {
          if (res?.success && Array.isArray(res.data) && isMounted) {
            setMyPayslipsList(res.data);
            if (res.data.length > 0) {
              setMyPayslip(res.data[0]);
            }
          }
        }).catch(console.warn);

        // Fetch company-level data for non-employee roles
        if (roleKey !== 'EMPLOYEE') {
          const [periodsRes, empRes] = await Promise.all([
            payrollService.getPeriods().catch(() => null),
            employeeService.getAll().catch(() => null),
          ]);
          if (periodsRes?.success && Array.isArray(periodsRes.data) && isMounted) {
            setApiPeriods(periodsRes.data);
            if (!hasInitializedPeriodRef.current && periodsRes.data.length > 0) {
              hasInitializedPeriodRef.current = true;
              setSelectedPeriod((prevSelected) => {
                const prevCode = getPeriodCode(prevSelected);
                const exists = periodsRes.data.some((p) => p.period === prevCode);
                if (exists) return prevSelected;
                const pCode = periodsRes.data[0].period;
                return formatPeriodLabel(pCode) || prevSelected;
              });
            }
          }
          if (empRes?.success && Array.isArray(empRes.data) && isMounted) {
            let emps = empRes.data;
            if (roleKey === 'LINE_MANAGER') {
              emps = emps.filter(e =>
                (e.department_name && (e.department_name.includes('Kỹ thuật') || e.department_name.includes('Phần mềm'))) ||
                e.department_id === 'DEPT-IT'
              );
            }
            const mapped = emps.map(e => ({
              id: e.id,
              name: e.full_name || e.name,
              department: e.department_name || e.department || 'Kỹ thuật Phần mềm',
              role: e.job_title || e.role || 'Nhân viên',
              contractSalary: Number(e.base_salary || 20000000),
              avatar: e.avatar_url || e.avatar,
              kpiScore: Number(e.kpi_score ?? 95),
            }));
            setEmployees(mapped);
          }
        }
      } catch (err) {
        console.warn('Backend payroll fetch notice:', err);
      }
    }
    fetchPayroll();
    const handleLocked = () => {
      fetchPayroll();
      setReloadTrigger((v) => v + 1);
    };
    window.addEventListener('nexus:payroll-locked', handleLocked);
    return () => {
      isMounted = false;
      window.removeEventListener('nexus:payroll-locked', handleLocked);
    };
  }, [roleKey]);

  const currentPeriodCode = getPeriodCode(selectedPeriod);
  // R20: Strictly match currentPeriodCode — NEVER fall back to apiPeriods[0]
  const currentPeriodObj = resolveSelectedPeriodObj(apiPeriods, currentPeriodCode);
  const periodSelectOptions = React.useMemo(
    () => buildPeriodSelectOptions(apiPeriods, selectedPeriod, defaultPeriodStr),
    [apiPeriods, selectedPeriod, defaultPeriodStr]
  );
  const isPeriodLocked = currentPeriodObj?.status === 'DA_CHOT' || currentPeriodObj?.status === 'DA_CHUYEN_KHOAN';

  useEffect(() => {
    let isMounted = true;
    const reqSeq = ++requestSeqRef.current;

    // R20: Immediately clear previous period's payslips/anomalies/readiness when switching periods
    setApiPayslips([]);
    setAnomalies([]);
    setLoadedPeriodCode(null);
    setLoadedPeriodId(null);
    setLoadedExpectedTotal(null);
    setLoadedSnapshotToken(null);
    setPeriodError('');
    setExportError('');

    if (roleKey === 'EMPLOYEE') {
      setPeriodLoading(false);
      return () => { isMounted = false; };
    }

    if (!currentPeriodObj || !currentPeriodObj.id) {
      setPeriodLoading(false);
      return () => { isMounted = false; };
    }

    setPeriodLoading(true);
    const targetPeriodCode = currentPeriodCode;
    const targetPeriodId = currentPeriodObj.id;

    Promise.all([
      payrollService.getAllPayslipsForPeriod(targetPeriodCode, 500),
      payrollService.getAnomalies(targetPeriodId),
    ])
      .then(([allSlipsRes, anomaliesRes]) => {
        if (!isMounted || reqSeq !== requestSeqRef.current) return;
        if (anomaliesRes && anomaliesRes.success === false) {
          throw new Error(anomaliesRes.message || 'Không thể tải danh sách đối soát bất thường của kỳ lương.');
        }
        let slips = Array.isArray(allSlipsRes?.data) ? allSlipsRes.data : [];
        if (roleKey === 'LINE_MANAGER') {
          slips = slips.filter(sl =>
            (sl.department_name && (sl.department_name.includes('Kỹ thuật') || sl.department_name.includes('Phần mềm'))) ||
            sl.department_id === 'DEPT-IT'
          );
        }
        const anomalyList = Array.isArray(anomaliesRes)
          ? anomaliesRes
          : Array.isArray(anomaliesRes?.data)
          ? anomaliesRes.data
          : anomaliesRes?.data?.data || [];

        setApiPayslips(slips);
        setAnomalies(anomalyList);
        setLoadedPeriodCode(targetPeriodCode);
        setLoadedPeriodId(targetPeriodId);
        setLoadedExpectedTotal(roleKey === 'LINE_MANAGER' ? slips.length : Number(allSlipsRes.total ?? slips.length));
        setLoadedSnapshotToken(allSlipsRes?.snapshotToken || null);
        setPeriodLoading(false);
        setPeriodError('');
      })
      .catch((err) => {
        if (!isMounted || reqSeq !== requestSeqRef.current) return;
        setApiPayslips([]);
        setAnomalies([]);
        setLoadedPeriodCode(null);
        setLoadedPeriodId(null);
        setLoadedExpectedTotal(null);
        setLoadedSnapshotToken(null);
        setPeriodLoading(false);
        setPeriodError(err?.message || 'Không thể tải dữ liệu kỳ lương từ máy chủ.');
      });

    return () => { isMounted = false; };
  }, [currentPeriodCode, currentPeriodObj?.id, roleKey, reloadTrigger]);

  const handleCalculateSelectedPeriod = async () => {
    setCalculatingPeriod(true);
    setPeriodError('');
    setReconcileSuccessBanner('');
    try {
      const periodCode = getPeriodCode(selectedPeriod);
      const calcRes = await payrollService.calculate(periodCode);
      if (!calcRes?.success) {
        throw new Error(calcRes?.message || 'Không thể khởi tạo / tính bảng lương cho kỳ này');
      }
      const periodsRes = await payrollService.getPeriods().catch(() => null);
      if (periodsRes?.success && Array.isArray(periodsRes.data)) {
        setApiPeriods(periodsRes.data);
      }
      setReconcileSuccessBanner(`Đã tính toán và đồng bộ bảng lương kỳ ${periodCode} thành công (trạng thái: Dự thảo).`);
      setReloadTrigger((v) => v + 1);
    } catch (e) {
      const incomingConflicts = extractConflictsFromError(e);
      if ((e?.status === 409 || e?.code === 'ADJUSTMENT_SOURCE_CONFLICT') && incomingConflicts.length > 0) {
        const reconciled = reconcileConflictModalState([], {}, incomingConflicts);
        setConflictItems(reconciled.conflictItems);
        setConflictDecisions(reconciled.decisions);
        setConflictModalError('');
        setConflictStaleNotice('');
        setConflictModalOpen(true);
      } else {
        setPeriodError(e?.message || 'Lỗi khi khởi tạo / tính toán bảng lương.');
      }
    } finally {
      setCalculatingPeriod(false);
    }
  };

  const handleSelectConflictDecision = (empId, field, action) => {
    const key = `${empId}::${field}`;
    setConflictDecisions((prev) => ({
      ...prev,
      [key]: action,
    }));
    setConflictModalError('');
  };

  const handleCancelConflictModal = () => {
    if (conflictSubmitting) return;
    setConflictModalOpen(false);
    setConflictItems([]);
    setConflictDecisions({});
    setConflictModalError('');
    setConflictStaleNotice('');
  };

  const handleSubmitConflictResolutions = async () => {
    if (!areAllConflictsResolved(conflictItems, conflictDecisions)) {
      setConflictModalError(
        'Vui lòng chọn phương án xử lý ("Giữ điều chỉnh" hoặc "Dùng dữ liệu nguồn") cho tất cả các mục xung đột trước khi xác nhận.'
      );
      return;
    }
    setConflictSubmitting(true);
    setConflictModalError('');
    setConflictStaleNotice('');
    try {
      const periodCode = getPeriodCode(selectedPeriod);
      const payload = buildConflictResolutionPayload(conflictItems, conflictDecisions);
      const calcRes = await payrollService.calculate(periodCode, payload);
      if (!calcRes?.success) {
        throw new Error(calcRes?.message || 'Không thể tính lại bảng lương với quyết định đối soát.');
      }
      setConflictModalOpen(false);
      setConflictItems([]);
      setConflictDecisions({});
      setConflictModalError('');
      setConflictStaleNotice('');
      const periodsRes = await payrollService.getPeriods().catch(() => null);
      if (periodsRes?.success && Array.isArray(periodsRes.data)) {
        setApiPeriods(periodsRes.data);
      }
      setReconcileSuccessBanner(
        `Đã đối soát xung đột điều chỉnh thủ công và tính lại bảng lương kỳ ${periodCode} thành công!`
      );
      setReloadTrigger((v) => v + 1);
    } catch (e) {
      const incomingConflicts = extractConflictsFromError(e);
      const isStaleRejected =
        Boolean(e?.details?.staleDecisionRejected || e?.response?.data?.details?.staleDecisionRejected) ||
        incomingConflicts.some((c) => Boolean(c.staleDecisionRejected));
      if ((e?.status === 409 || e?.code === 'ADJUSTMENT_SOURCE_CONFLICT') && incomingConflicts.length > 0) {
        const reconciled = reconcileConflictModalState(conflictItems, conflictDecisions, incomingConflicts);
        setConflictItems(reconciled.conflictItems);
        setConflictDecisions(reconciled.decisions);
        if (isStaleRejected || reconciled.invalidatedKeys.length > 0) {
          setConflictStaleNotice(
            'Dữ liệu nguồn tính lương vừa thay đổi thêm trong lúc bạn đang đối soát. Hệ thống đã cập nhật giá trị nguồn mới nhất và yêu cầu bạn chọn lại phương án cho mục vừa thay đổi.'
          );
        }
        setConflictModalError(
          e?.message || 'Phát hiện xung đột mới giữa dữ liệu nguồn và giá trị điều chỉnh tay. Vui lòng kiểm tra và xác nhận lại.'
        );
      } else {
        setConflictModalError(e?.message || 'Lỗi máy chủ khi gửi quyết định đối soát điều chỉnh lương.');
      }
    } finally {
      setConflictSubmitting(false);
    }
  };

  const {
    isPeriodExists,
    isPeriodDataReady,
    canActOnPeriod,
    periodPayslips,
    safeAnomalies,
    totalNet,
    totalOtHours,
    totalBhxh,
    totalTax,
    payrollStatus,
  } = React.useMemo(
    () =>
      computePeriodViewState({
        currentPeriodCode,
        currentPeriodObj,
        loadedPeriodCode,
        loadedPeriodId,
        loadedExpectedTotal,
        periodLoading,
        periodError,
        apiPayslips,
        anomalies,
      }),
    [
      currentPeriodCode,
      currentPeriodObj,
      loadedPeriodCode,
      loadedPeriodId,
      loadedExpectedTotal,
      periodLoading,
      periodError,
      apiPayslips,
      anomalies,
    ]
  );

  const totalOtEmployees = periodPayslips.filter(p => (parseFloat(p.ot_hours) || 0) > 0).length;
  const avgOtHours = totalOtEmployees > 0 ? (totalOtHours / totalOtEmployees).toFixed(1) : 0;

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = departmentFilter === 'all' || emp.department.includes(departmentFilter);
    return matchesSearch && matchesDept;
  });

  const handleExportPayrollReport = async () => {
    setExportError('');
    if (!canActOnPeriod || !currentPeriodObj?.id || periodPayslips.length === 0) {
      setExportError('Kỳ lương chưa tải xong dữ liệu hợp lệ hoặc chưa có phiếu lương để xuất báo cáo.');
      return;
    }
    try {
      // R22 & R26: Re-fetch/verify all pages of the selected period with duplicate key, metadata, and snapshot consistency checks
      const verified = await payrollService.getAllPayslipsForPeriod(currentPeriodCode, 500, {
        expectedSnapshotToken: loadedSnapshotToken,
        expectedTotalNet: totalNet,
      });
      const exportSlips = verified.data || [];
      if (loadedExpectedTotal != null && exportSlips.length !== Number(loadedExpectedTotal)) {
        throw new Error(
          `Số lượng phiếu lương kết xuất (${exportSlips.length}) không khớp tổng số bản ghi kỳ ${currentPeriodCode} (${loadedExpectedTotal}).`
        );
      }
      const headers = ['Mã NV', 'Họ Và Tên', 'Chức Vụ', 'Lương Cơ Bản', 'Ngày Công', 'Làm Thêm (OT)', 'Thưởng KPI & Phụ Cấp', 'BHXH', 'Thuế TNCN', 'Thực Lĩnh (Net)'];
      const rows = exportSlips.map((p) => [
        p.employee_id || p.id,
        p.full_name || p.name,
        p.job_title || p.role,
        Number(p.base_salary ?? 0),
        `${Number(p.actual_work_days ?? 0)}/${Number(p.standard_work_days ?? 22)}`,
        Number(p.ot_pay ?? 0),
        Number(p.allowances ?? 0) + Number(p.bonus ?? 0),
        Number(p.bhxh_amount ?? 0) + Number(p.bhyt_amount ?? 0) + Number(p.bhtn_amount ?? 0),
        Number(p.pit_amount ?? 0),
        Number(p.net_salary ?? 0),
      ]);
      const csv = generateCSVContent(headers, rows);
      downloadFile(`Bao_Cao_Tong_Hop_Quy_Luong_${selectedPeriod.replace(/[\/\s]/g, '_')}.csv`, csv);
    } catch (err) {
      setExportError(err?.message || 'Lỗi khi kết xuất báo cáo quỹ lương CSV.');
    }
  };

  // Derive personalized payslip object strictly from API payslips (no fabricated salary numbers)
  const actorEmpId = currentRole?.id || currentRole?.employee_id || '';
  const activeSlip =
    myPayslip ||
    periodPayslips.find((s) => s.employee_id === actorEmpId) ||
    apiPayslips.find((s) => s.employee_id === actorEmpId) ||
    null;

  // Danh sách các kỳ lương cá nhân từ dữ liệu thực
  const personalPeriods = React.useMemo(() => {
    if (Array.isArray(myPayslipsList) && myPayslipsList.length > 0) {
      return myPayslipsList.map((s) => {
        const pCode = s.period || String(s.period_id || '');
        const parts = pCode.split('-');
        const label = parts.length === 2
          ? `Tháng ${parts[1]}/${parts[0]} (${s.status === 'DA_CHOT' || s.status === 'DA_CHUYEN_KHOAN' ? 'Đã quyết toán' : 'Dự thảo'})`
          : pCode;
        return { code: pCode, label };
      });
    }
    if (Array.isArray(apiPeriods) && apiPeriods.length > 0) {
      return apiPeriods.map((p) => {
        const parts = (p.period || '').split('-');
        const label = parts.length === 2
          ? `Tháng ${parts[1]}/${parts[0]} (${p.status === 'DA_CHOT' ? 'Đã quyết toán' : 'Dự thảo'})`
          : p.period;
        return { code: p.period, label };
      });
    }
    const curCode = getPeriodCode(selectedPeriod);
    return [{ code: curCode, label: `${selectedPeriod} (Chưa phát hành)` }];
  }, [myPayslipsList, apiPeriods, selectedPeriod]);

  const getPersonalSlipForPeriod = (periodStr) => {
    const pCode = getPeriodCode(periodStr);
    const matched =
      (myPayslipsList || []).find((s) => s.period === pCode || String(s.period_id) === pCode || s.period_name === periodStr) ||
      (periodPayslips || []).find((s) => s.employee_id === actorEmpId && s.period === pCode) ||
      (myPayslip && myPayslip.period === pCode ? myPayslip : null) ||
      null;

    if (matched) {
      const b = Number(matched.base_salary ?? 0);
      const a = Number(matched.allowances ?? 0);
      const bo = Number(matched.bonus ?? 0);
      const ot = Number(matched.ot_pay ?? 0);
      const oth = Number(matched.ot_hours ?? 0);
      const ins = Number(matched.bhxh_amount ?? 0) + Number(matched.bhyt_amount ?? 0) + Number(matched.bhtn_amount ?? 0);
      const tax = Number(matched.pit_amount ?? 0);
      const totalDed = matched.total_deductions != null ? Number(matched.total_deductions) : (ins + tax);
      const rawNet = matched.net_salary != null ? Number(matched.net_salary) : ((b + a + bo + ot) - totalDed);
      return {
        ...matched,
        hasData: true,
        base_salary: b,
        allowances: a,
        bonus: bo,
        ot_pay: ot,
        ot_hours: oth,
        actual_work_days: Number(matched.actual_work_days ?? 0),
        bhxh_amount: ins,
        pit_amount: tax,
        total_deductions: totalDed,
        net_salary: !Number.isNaN(rawNet) ? rawNet : 0,
      };
    }

    return {
      hasData: false,
      employee_id: actorEmpId,
      full_name: currentRole?.name || 'Nhân sự',
      job_title: currentRole?.title || 'Nhân viên',
      department_name: currentRole?.department || 'Chưa phân bổ',
      period: pCode,
      period_name: periodStr,
      base_salary: Number(currentRole?.baseSalary ?? 0),
      allowances: 0,
      bonus: 0,
      ot_pay: 0,
      ot_hours: 0,
      actual_work_days: 0,
      bhxh_amount: 0,
      pit_amount: 0,
      total_deductions: 0,
      net_salary: 0,
      status: 'CHUA_PHAT_HANH',
    };
  };

  // ==========================================
  // RENDER PERSONAL PAYSLIP COMPONENT (Shared across ESS, Line Manager, HRD & CEO)
  // ==========================================
  const renderPersonalPayslip = () => {
    const currentSlip = getPersonalSlipForPeriod(selectedPeriod);
    const baseSalaryNum = Number(currentSlip?.base_salary ?? 0);
    const otAndBonus = Number(currentSlip?.ot_pay ?? 0) + Number(currentSlip?.bonus ?? 0) + Number(currentSlip?.allowances ?? 0);
    const totalDeductions = Number(currentSlip?.total_deductions ?? 0);
    const workDays = currentSlip?.actual_work_days ?? 0;
    const netSalaryNum = Number(currentSlip?.net_salary ?? 0);
    const slipStatus = currentSlip?.status || 'CHUA_PHAT_HANH';
    const personalStatusLabel =
      slipStatus === 'DA_CHUYEN_KHOAN'
        ? 'Đã Quyết Toán & Chuyển Khoản'
        : slipStatus === 'DA_CHOT'
        ? 'Đã Chốt Sổ Lương'
        : slipStatus === 'DU_THAO'
        ? 'Bản Dự Thảo (Chưa Khóa Sổ)'
        : 'Chưa Phát Hành';
    const personalStatusSubtext =
      slipStatus === 'DA_CHUYEN_KHOAN'
        ? 'Đã chi trả chuyển khoản'
        : slipStatus === 'DA_CHOT'
        ? 'Đã chốt sổ (chờ chi trả)'
        : slipStatus === 'DU_THAO'
        ? 'Đang ở trạng thái dự thảo'
        : 'Chưa phát hành cho kỳ này';

    return (
      <div className="space-y-6">
        {/* Header Controls for Personal Payslip */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900 font-display">
              Phiếu Lương Điện Tử Cá Nhân
            </h2>
            <span
              data-testid="personal-payslip-status-badge"
              className={`text-xs font-bold px-3 py-0.5 rounded-full border flex items-center gap-1 ${
                slipStatus === 'DA_CHUYEN_KHOAN' || slipStatus === 'DA_CHOT'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {personalStatusLabel}
            </span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Lịch sử kỳ lương (Month History Selector for Employee) */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
              <CalendarDays className="w-4 h-4 text-slate-500 shrink-0" />
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 cursor-pointer focus:outline-none"
                title="Chọn tháng để tra cứu lịch sử phiếu lương"
              >
                {personalPeriods.map((p) => {
                  const val = `Tháng ${p.code.split('-')[1]}/${p.code.split('-')[0]}`;
                  return (
                    <option key={p.code} value={val}>
                      {p.label}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Nút Xem bảng công tháng này */}
            <button
              type="button"
              onClick={() => openModal('modal5B', { 
                employeeId: currentRole?.id, 
                employeeName: currentRole?.name,
                period: selectedPeriod, 
                month: selectedPeriod 
              })}
              className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
              title="Xem bảng chấm công và đối soát ngày công tháng này"
            >
              <CalendarDays className="w-4 h-4 text-indigo-600" />
              <span>Xem bảng công tháng này</span>
            </button>

            <button
              type="button"
              onClick={() => setShowNumbers(!showNumbers)}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-2 transition-all cursor-pointer"
            >
              {showNumbers ? <EyeOff className="w-4 h-4 text-slate-500" /> : <Eye className="w-4 h-4 text-slate-500" />}
              <span>{showNumbers ? 'Ẩn số tiền' : 'Hiện số tiền'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                try {
                  confetti({ particleCount: 35, spread: 50, origin: { y: 0.6 } });
                } catch (e) { }
                openModal('modal3C', currentSlip?.raw || currentSlip);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
              title="Xem và in phiếu lương PDF có chữ ký số điện tử"
            >
              <Download className="w-4 h-4" />
              <span>Xem & In PDF Phiếu Lương</span>
            </button>
          </div>
        </div>

        {/* Identity Card */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Avatar
              src={currentRole?.avatar}
              name={currentRole?.name}
              id={currentRole?.id}
              size="xl"
              shape="rounded"
              statusBadge="online"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-slate-900 font-display">
                  {currentRole?.name}
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-mono text-xs font-bold border border-blue-200">
                  {currentRole?.id}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">
                  {currentRole?.level || 'Cấp 3'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {currentRole?.title} - {currentRole?.department}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Kỳ chi trả: <strong className="text-slate-700">{selectedPeriod}</strong> • Trạng thái: <strong className="text-emerald-600">{personalStatusSubtext}</strong>
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 p-4 rounded-xl border border-blue-100 flex flex-col items-start md:items-end">
            <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Thực nhận (Net)</span>
            <div className="text-2xl md:text-3xl font-bold font-mono text-blue-700 mt-0.5">
              {showNumbers ? `${netSalaryNum.toLocaleString('vi-VN')} ₫` : '•••••••• ₫'}
            </div>
            <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" /> {personalStatusLabel}
            </span>
          </div>
        </div>

        {/* 4 Financial Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs">
            <span className="text-xs text-slate-500 font-medium">Lương thỏa thuận hợp đồng</span>
            <div className="text-xl font-bold font-mono text-slate-900 mt-1">
              {showNumbers ? `${baseSalaryNum.toLocaleString('vi-VN')} ₫` : '•••••••• ₫'}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Căn cứ trích đóng bảo hiểm</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs">
            <span className="text-xs text-slate-500 font-medium">Làm thêm giờ & Phụ cấp</span>
            <div className="text-xl font-bold font-mono text-emerald-600 mt-1">
              {showNumbers ? `+${otAndBonus.toLocaleString('vi-VN')} ₫` : '•••••••• ₫'}
            </div>
            <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">{currentSlip.ot_hours || 0}h OT + Thưởng KPI / Phụ cấp</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs">
            <span className="text-xs text-slate-500 font-medium">Các khoản trích trừ</span>
            <div className="text-xl font-bold font-mono text-rose-600 mt-1">
              {showNumbers ? `-${totalDeductions.toLocaleString('vi-VN')} ₫` : '•••••••• ₫'}
            </div>
            <p className="text-[11px] text-rose-600 font-semibold mt-0.5">BHXH (10.5%) & Thuế TNCN</p>
          </div>

          {/* Card Ngày công thực tế - Bấm để mở bảng công đối soát */}
          <div 
            onClick={() => openModal('modal5B', { 
              employeeId: currentRole?.id, 
              employeeName: currentRole?.name,
              period: selectedPeriod, 
              month: selectedPeriod 
            })}
            className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
            title="Bấm để đối soát bảng công 30 ngày của tháng này"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Ngày công thực tế</span>
              <span className="text-[10px] text-indigo-600 font-bold group-hover:underline flex items-center gap-0.5">
                Xem bảng công <ArrowRight className="w-3 h-3" />
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-blue-600 mt-1">
              {workDays} / 22 Công
            </div>
            <p className="text-[11px] text-blue-600 font-semibold mt-0.5">100% Ngày công • Bấm để đối soát</p>
          </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Earnings Table */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-600" />
                Các Khoản Thu Nhập
              </h3>
              <span className="text-xs font-bold text-emerald-600">
                {showNumbers ? `+${(baseSalaryNum + otAndBonus).toLocaleString('vi-VN')} ₫` : '••••••••'}
              </span>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">Lương cơ bản theo hợp đồng:</span>
                <span className="font-mono font-bold text-slate-900">{showNumbers ? `${baseSalaryNum.toLocaleString('vi-VN')} ₫` : '••••••••'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">Phụ cấp chức vụ / ăn trưa:</span>
                <span className="font-mono font-bold text-slate-900">{showNumbers ? `${Number(currentSlip.allowances || 0).toLocaleString('vi-VN')} ₫` : '••••••••'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">Lương làm thêm giờ (OT):</span>
                <span className="font-mono font-bold text-emerald-600">{showNumbers ? `${Number(currentSlip.ot_pay || 0).toLocaleString('vi-VN')} ₫` : '••••••••'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-600">Thưởng hiệu suất / KPI:</span>
                <span className="font-mono font-bold text-emerald-600">{showNumbers ? `${Number(currentSlip.bonus || 0).toLocaleString('vi-VN')} ₫` : '••••••••'}</span>
              </div>
            </div>
          </div>

          {/* Deductions Table */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-rose-600" />
                Các Khoản Trích Trừ
              </h3>
              <span className="text-xs font-bold text-rose-600">
                {showNumbers ? `-${totalDeductions.toLocaleString('vi-VN')} ₫` : '••••••••'}
              </span>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">Bảo hiểm xã hội, y tế, thất nghiệp (10.5%):</span>
                <span className="font-mono font-bold text-rose-600">{showNumbers ? `-${Number(currentSlip.bhxh_amount || 0).toLocaleString('vi-VN')} ₫` : '••••••••'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-600">Thuế thu nhập cá nhân (PIT):</span>
                <span className="font-mono font-bold text-rose-600">{showNumbers ? `-${Number(currentSlip.pit_amount || 0).toLocaleString('vi-VN')} ₫` : '••••••••'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Support Note */}
        <div className="flex items-center justify-end text-xs text-slate-500 pt-1">
          <button
            type="button"
            onClick={() => openModal('modal3B', {
              title: 'Quy trình Tiếp nhận & Xử lý Khiếu nại Tiền lương',
              date: new Date().toLocaleDateString('vi-VN'),
              type: 'QUY_CHE',
              badge: 'Chế độ & Tiền lương',
              author: 'Phòng Nhân sự & Tiền Lương (C&B)',
              summary: 'Hướng dẫn CBNV gửi yêu cầu đối soát bảng lương, công chấm và mức trích nộp thuế/bảo hiểm.',
              content: 'Kính gửi toàn thể CBNV,\n\nNếu phát hiện bất kỳ sai sót nào liên quan đến:\n1. Số ngày công thực tế hoặc giờ tăng ca (OT);\n2. Mức trích đóng BHXH, BHYT, BHTN;\n3. Thuế thu nhập cá nhân (TNCN) hoặc các khoản phụ cấp;\n\nCBNV vui lòng gửi phản hồi về địa chỉ email chuyên trách: hr-payroll@fwbnexus.vn hoặc gặp trực tiếp chuyên viên C&B tại Phòng Nhân Sự (Tầng 3) trước ngày 05 hàng tháng để được hỗ trợ điều chỉnh kịp thời.\n\nTrân trọng cảm ơn!'
            })}
            className="text-blue-600 hover:text-blue-800 font-semibold hover:underline cursor-pointer"
          >
            Khiếu nại / Thắc mắc về lương?
          </button>
        </div>
      </div>
    );
  };

  // ==========================================
  // VIEW FOR EMPLOYEE & LINE MANAGER: IDENTICAL PERSONAL PAYSLIP
  // ==========================================
  if (roleKey === 'EMPLOYEE' || roleKey === 'LINE_MANAGER') {
    return (
      <div className="w-full min-h-full p-6">
        {renderPersonalPayslip(activeSlip)}
      </div>
    );
  }

  // ==========================================
  // VIEW FOR CEO & HR DIRECTOR: ADMIN VIEW + PERSONAL TAB SWITCHER
  // ==========================================
  const isCeo = roleKey === 'CEO';
  const pageTitle = isCeo ? 'Phê Duyệt Quỹ Lương Toàn Công Ty' : 'Xử Lý Tiền Lương Và Quyết Toán';

  return (
    <div className="w-full min-h-full p-6 space-y-6">
      {/* Tab Switcher for CEO & HR Director */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAdminTab('company')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              adminTab === 'company'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>Quản trị Bảng Lương Công Ty</span>
          </button>

          <button
            type="button"
            onClick={() => setAdminTab('personal')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              adminTab === 'personal'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Phiếu Lương Cá Nhân Của Tôi</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Tài khoản quản trị: <strong className="text-slate-800">{currentRole?.name}</strong> ({currentRole?.title})
        </div>
      </div>

      {adminTab === 'personal' ? (
        /* Render personal payslip for CEO or HR Director */
        renderPersonalPayslip(activeSlip)
      ) : (
        /* Company Payroll View */
        <>
          {/* Header & Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900 font-display whitespace-nowrap">
                  {pageTitle}
                </h1>
                <span
                  data-testid="payroll-period-status-badge"
                  className={`text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-1 shrink-0 ${
                    periodError
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : !isPeriodExists
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : isPeriodLocked
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}
                >
                  {isPeriodLocked ? <Check className="w-3 h-3" /> : null}
                  {payrollStatus}
                </span>
              </div>
            </div>

            {/* Unified Operational Controls for HR Director & CEO (R25: No fake approval buttons) */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {/* Period selector */}
              <select
                data-testid="payroll-period-select"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-100 shrink-0"
              >
                {periodSelectOptions.map((opt) => (
                  <option key={opt.code} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {isPeriodExists && !isPeriodLocked && (
                <button
                  type="button"
                  data-testid="recalculate-payroll-btn"
                  disabled={periodLoading || calculatingPeriod}
                  onClick={handleCalculateSelectedPeriod}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0"
                  title="Tính lại bảng lương kỳ dự thảo từ dữ liệu chấm công, nghỉ phép, nhân sự và chính sách mới nhất"
                >
                  <RefreshCw className={`w-4 h-4 ${calculatingPeriod ? 'animate-spin' : ''}`} />
                  <span>{calculatingPeriod ? 'Đang tính lại...' : 'Tính lại bảng lương (Dự thảo)'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => openModal('modal5B')}
                className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-xs font-bold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                title="Rà soát đối soát chi tiết bảng chấm công 30 ngày của nhân sự toàn công ty"
              >
                <CalendarDays className="w-4 h-4 text-indigo-600" />
                <span>Bảng Công Tháng (Đối soát)</span>
              </button>

              <button
                type="button"
                data-testid="open-anomalies-modal-btn"
                disabled={!canActOnPeriod}
                onClick={() => {
                  if (!canActOnPeriod || !currentPeriodObj?.id) return;
                  openModal('modal7A', {
                    periodId: currentPeriodObj.id,
                    periodName: selectedPeriod,
                    anomalies: safeAnomalies,
                  });
                }}
                className={`${safeAnomalies.length > 0 ? 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800' : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800'} disabled:opacity-50 disabled:cursor-not-allowed border text-xs font-bold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0`}
              >
                {safeAnomalies.length > 0 ? <AlertTriangle className="w-4 h-4 text-amber-600" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                <span>{safeAnomalies.length > 0 ? `Đối soát (${safeAnomalies.length} bất thường)` : 'Đối soát hợp lệ'}</span>
              </button>

              <button
                type="button"
                data-testid="open-bank-transfer-modal-btn"
                disabled={!canActOnPeriod}
                onClick={() => {
                  if (!canActOnPeriod || !currentPeriodObj?.id) return;
                  openModal('modal7B', {
                    periodId: currentPeriodObj.id,
                    periodCode: currentPeriodCode,
                    expectedTotal: loadedExpectedTotal,
                    expectedSnapshotToken: loadedSnapshotToken,
                    expectedTotalNet: totalNet,
                    slips: periodPayslips,
                    employees,
                    totalNet,
                    period: selectedPeriod,
                  });
                }}
                className="bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Xuất file Ngân hàng VCB</span>
              </button>

              <button
                type="button"
                data-testid="open-payroll-lock-modal-btn"
                disabled={!canActOnPeriod || isPeriodLocked}
                onClick={() => {
                  if (!canActOnPeriod || !currentPeriodObj?.id || isPeriodLocked) return;
                  openModal('modal7C', {
                    periodId: currentPeriodObj.id,
                    periodCode: currentPeriodCode,
                    slips: periodPayslips,
                    employees,
                    totalNet,
                    period: selectedPeriod,
                    employeesCount: periodPayslips.length,
                    anomalies: safeAnomalies,
                  });
                }}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0"
              >
                <Lock className="w-4 h-4" />
                <span>Chốt sổ và Khóa kỳ lương</span>
              </button>

              <button
                type="button"
                data-testid="export-payroll-csv-btn"
                disabled={!canActOnPeriod || periodPayslips.length === 0}
                onClick={handleExportPayrollReport}
                className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <Download className="w-4 h-4 text-blue-600" />
                <span>Tải Báo Cáo Quỹ Lương (.csv)</span>
              </button>
            </div>
          </div>

          {reconcileSuccessBanner && (
            <div
              data-testid="payroll-reconcile-success-banner"
              className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-xs font-semibold text-emerald-800 flex items-center justify-between gap-3"
            >
              <span>✓ {reconcileSuccessBanner}</span>
              <button
                type="button"
                onClick={() => setReconcileSuccessBanner('')}
                className="text-emerald-700 hover:text-emerald-900 font-bold"
              >
                Đóng
              </button>
            </div>
          )}

          {/* R20 Banners for Uncreated / Loading / Error / Export Error states */}
          {periodLoading && (
            <div
              data-testid="payroll-period-loading-banner"
              className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between gap-4 text-xs text-blue-800 font-semibold"
            >
              <span>Đang tải dữ liệu bảng lương cho kỳ {selectedPeriod} ({currentPeriodCode})... Các thao tác chốt sổ, chuyển khoản và xuất báo cáo tạm khóa cho đến khi dữ liệu kỳ mới tải xong.</span>
            </div>
          )}

          {!periodLoading && periodError && (
            <div
              data-testid="payroll-period-error-banner"
              className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="text-xs text-rose-800">
                <strong className="block font-bold text-sm">Không thể tải dữ liệu kỳ lương {selectedPeriod} ({currentPeriodCode})</strong>
                <span>{periodError} — Đã khóa các thao tác chốt sổ, chuyển khoản và xuất CSV để không thao tác nhầm trên kỳ lương cũ.</span>
              </div>
              <button
                type="button"
                data-testid="payroll-period-retry-btn"
                onClick={() => setReloadTrigger((v) => v + 1)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0 cursor-pointer"
              >
                Tải lại kỳ lương
              </button>
            </div>
          )}

          {!periodLoading && !periodError && !isPeriodExists && (
            <div
              data-testid="payroll-uncreated-period-banner"
              className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="text-xs text-amber-900">
                <strong className="block font-bold text-sm">
                  Kỳ lương {selectedPeriod} ({currentPeriodCode}) chưa được khởi tạo
                </strong>
                <span>
                  Hệ thống không tự động dùng dữ liệu của kỳ lương khác. Các nút chốt sổ, chuyển khoản và xuất CSV đang được khóa cho đến khi kỳ lương {currentPeriodCode} được tính toán.
                </span>
              </div>
              <button
                type="button"
                data-testid="calculate-payroll-btn"
                disabled={calculatingPeriod}
                onClick={handleCalculateSelectedPeriod}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs shrink-0 cursor-pointer"
              >
                {calculatingPeriod ? 'Đang khởi tạo kỳ lương...' : `Khởi tạo & Tính bảng lương kỳ ${currentPeriodCode}`}
              </button>
            </div>
          )}

          {exportError && (
            <div
              data-testid="payroll-export-error-banner"
              className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 text-xs font-semibold text-rose-800"
            >
              {exportError}
            </div>
          )}

          {/* 4 Financial Ribbon Cards Tailored Per Role */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Net */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex flex-col justify-between gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Tổng quỹ lương thực trả (Net)
                  </span>
                  <div data-testid="payroll-total-net-value" className="text-[24px] font-bold font-display text-blue-600 mt-1">
                    {totalNet.toLocaleString('vi-VN')} đ
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>{isPeriodDataReady ? periodPayslips.length : 0} nhân sự</span>
                <span className="text-slate-600 font-semibold bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                  {!isPeriodExists
                    ? 'Chưa mở kỳ'
                    : currentPeriodObj?.status === 'DA_CHOT'
                    ? 'Đã chốt'
                    : currentPeriodObj?.status === 'DA_CHUYEN_KHOAN'
                    ? 'Đã chi trả'
                    : 'Dự thảo'}
                </span>
              </div>
            </div>

            {/* Card 2: Strategic for CEO vs OT for HRD */}
            {isCeo ? (
              <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex flex-col justify-between gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Tổng Thuế TNCN Nộp NSNN
                    </span>
                    <div className="text-[24px] font-bold font-display text-purple-600 mt-1">
                      {totalTax.toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                    <Receipt className="w-5 h-5" />
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Đã trừ giảm trừ gia cảnh</span>
                  <span className="text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                    100% Khấu trừ
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex flex-col justify-between gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Tổng giờ làm thêm (OT)
                    </span>
                    <div className="text-[24px] font-bold font-display text-amber-600 mt-1">
                      {totalOtHours} giờ
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Clock className="w-5 h-5" />
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>{totalOtEmployees} nhân viên phát sinh OT</span>
                  <span className="text-slate-700 font-medium">TB {avgOtHours}h/người</span>
                </div>
              </div>
            )}

            {/* Card 3: BHXH */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex flex-col justify-between gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Trích nộp BHXH (10.5%)
                  </span>
                  <div className="text-[24px] font-bold font-display text-slate-900 mt-1">
                    {totalBhxh.toLocaleString('vi-VN')} đ
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Bao gồm BHXH, BHYT và BHTN</span>
                <span className="text-emerald-700 font-bold">Chuẩn luật định</span>
              </div>
            </div>

            {/* Card 4: CEO / HRD Compliance */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex flex-col justify-between gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Tỷ lệ hoàn thành đối soát
                  </span>
                  <div className="text-[24px] font-bold font-display text-blue-600 mt-1">
                    {!isPeriodDataReady
                      ? '—'
                      : safeAnomalies.length === 0
                      ? '100%'
                      : `${Math.round(((Math.max(1, periodPayslips.length) - safeAnomalies.length) / Math.max(1, periodPayslips.length)) * 100)}%`}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {!isPeriodDataReady
                    ? 'Chưa có dữ liệu kỳ này'
                    : safeAnomalies.length > 0
                    ? `${safeAnomalies.length} cảnh báo cần xử lý`
                    : 'Đã đối soát hợp lệ'}
                </span>
                <span className="text-blue-600 font-semibold">Đồng bộ CSDL</span>
              </div>
            </div>
          </div>

          {/* Anomaly Banner (only when period data is ready) */}
          {isPeriodDataReady && safeAnomalies.length > 0 ? (
            <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
                  !
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-sm font-display">
                      Phát hiện {safeAnomalies.length} trường hợp bất thường cần đối soát trước khi chốt bảng lương
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold text-[10px]">
                      Cảnh báo {safeAnomalies.length} mục
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {safeAnomalies.map((a) => `${a.employeeName || a.employeeId || 'Nhân viên'}: ${a.anomalyType || a.reason || 'Bất thường'}`).slice(0, 3).join(' • ')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openModal('modal7A', { periodId: currentPeriodObj?.id, periodName: selectedPeriod, anomalies: safeAnomalies })}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95"
              >
                <span>Đối soát và Giải quyết {safeAnomalies.length} bất thường</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : isPeriodDataReady ? (
            <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
                  ✓
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-sm font-display">
                      Bảng lương hợp lệ 100% — Không có bất thường nào
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">
                      Đã kiểm tra tự động
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Mọi khoản lương, thuế TNCN, BHXH và ngày công đều tuân thủ đúng chính sách nội bộ và luật định.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openModal('modal7A', { periodId: currentPeriodObj?.id, periodName: selectedPeriod, anomalies: safeAnomalies })}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <span>Xem chi tiết đối soát</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : null}

          {/* Table Toolbar */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm theo tên nhân viên, mã NV (NV-1001)..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
              >
                <option value="all">Tất cả phòng ban</option>
                <option value="Kỹ thuật">Kỹ thuật Phần mềm</option>
                <option value="Marketing">Marketing và Truyền thông</option>
                <option value="Nhân sự">Nhân sự và Vận hành</option>
              </select>
            </div>
          </div>

          {/* Payroll Table */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Nhân viên</th>
                    <th className="py-3 px-4">Mã NV</th>
                    <th className="py-3 px-4">Lương cơ bản</th>
                    <th className="py-3 px-4">Ngày công</th>
                    <th className="py-3 px-4">Làm thêm (OT)</th>
                    <th className="py-3 px-4">Thưởng KPI</th>
                    <th className="py-3 px-4">Trích BHXH</th>
                    <th className="py-3 px-4">Thuế TNCN</th>
                    <th className="py-3 px-4 font-bold text-blue-700">Thực lĩnh (Net)</th>
                    <th className="py-3 px-4 text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {(() => {
                    if (periodLoading) {
                      return (
                        <tr>
                          <td colSpan={10} className="py-12 text-center text-slate-500">
                            Đang tải danh sách phiếu lương kỳ {selectedPeriod}...
                          </td>
                        </tr>
                      );
                    }
                    if (periodError) {
                      return (
                        <tr>
                          <td colSpan={10} className="py-12 text-center text-rose-600 font-semibold">
                            Không thể hiển thị bảng lương do lỗi tải dữ liệu kỳ {selectedPeriod}.
                          </td>
                        </tr>
                      );
                    }
                    if (!isPeriodExists || !isPeriodDataReady) {
                      return (
                        <tr>
                          <td colSpan={10} className="py-12 text-center text-slate-400">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <Receipt className="w-8 h-8 text-slate-300" />
                              <p className="text-sm font-medium">
                                Kỳ lương {selectedPeriod} ({currentPeriodCode}) chưa được khởi tạo hoặc chưa có phiếu lương
                              </p>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    const items = periodPayslips.filter(ps => {
                      const matchesSearch =
                        (ps.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (ps.employee_id || '').toLowerCase().includes(searchTerm.toLowerCase());
                      const matchesDept = departmentFilter === 'all' || (ps.department_name || '').includes(departmentFilter);
                      return matchesSearch && matchesDept;
                    }).map(ps => ({
                      id: ps.employee_id,
                      name: ps.full_name,
                      avatar: ps.avatar_url,
                      role: ps.job_title,
                      base: parseFloat(ps.base_salary) || 0,
                      days: `${ps.actual_work_days ?? 0} / ${ps.standard_work_days ?? 22} ngày`,
                      ot: parseFloat(ps.ot_pay) || 0,
                      kpi: (parseFloat(ps.allowances) || 0) + (parseFloat(ps.bonus) || 0),
                      bhxh: (parseFloat(ps.bhxh_amount) || 0) + (parseFloat(ps.bhyt_amount) || 0) + (parseFloat(ps.bhtn_amount) || 0),
                      tax: parseFloat(ps.pit_amount) || 0,
                      net: parseFloat(ps.net_salary) || 0,
                      raw: ps
                    }));

                    if (items.length === 0) {
                      return (
                        <tr>
                          <td colSpan={10} className="py-12 text-center text-slate-400">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <Receipt className="w-8 h-8 text-slate-300" />
                              <p className="text-sm font-medium">Chưa có dữ liệu bảng lương hoặc nhân sự phù hợp</p>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <Avatar
                            src={item.avatar}
                            name={item.name}
                            id={item.id}
                            size="sm"
                            shape="circle"
                          />
                          <div>
                            <div className="font-bold text-slate-900">{item.name}</div>
                            <div className="text-[10px] text-slate-400">{item.role}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-600">
                        {item.id}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-700 font-semibold">
                        {item.base.toLocaleString('vi-VN')} đ
                      </td>

                      <td className="py-3 px-4 font-bold text-slate-800">
                        {item.days}
                      </td>

                      <td className="py-3 px-4 font-mono font-semibold text-amber-600">
                        +{item.ot.toLocaleString('vi-VN')} đ
                      </td>

                      <td className="py-3 px-4 font-mono font-semibold text-emerald-600">
                        +{item.kpi.toLocaleString('vi-VN')} đ
                      </td>

                      <td className="py-3 px-4 font-mono text-rose-600">
                        -{item.bhxh.toLocaleString('vi-VN')} đ
                      </td>

                      <td className="py-3 px-4 font-mono text-rose-600">
                        -{item.tax.toLocaleString('vi-VN')} đ
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-blue-600 text-[13px]">
                        {item.net.toLocaleString('vi-VN')} đ
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!isPeriodLocked && (
                            <button
                              type="button"
                              onClick={() => openModal('payrollAdjust', { payslip: item.raw || item, isLocked: isPeriodLocked })}
                              className="px-2.5 py-1 text-xs rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold cursor-pointer transition-colors"
                              title="Điều chỉnh thu nhập thủ công cho nhân viên"
                            >
                              Điều chỉnh
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openModal('modal3C', item.raw)}
                            className="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                          >
                            Xem phiếu
                          </button>
                        </div>
                      </td>
                    </tr>
                  ));
                })()}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* R24: Adjustment Source Conflict Reconciliation Modal */}
      {conflictModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          data-testid="adjustment-conflict-modal"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-slate-900 font-display">
                      Đối Soát Xung Đột Điều Chỉnh Thủ Công & Dữ Liệu Nguồn
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 uppercase">
                      {conflictItems.length} xung đột cần quyết định
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Kỳ lương <strong>{selectedPeriod} ({currentPeriodCode})</strong> có dữ liệu nguồn thay đổi sau khi HR chỉnh tay. Vui lòng chọn rõ phương án xử lý cho từng mục (không tự động chọn mặc định).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelConflictModal}
                disabled={conflictSubmitting}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {conflictStaleNotice && (
                <div
                  data-testid="conflict-stale-notice"
                  className="p-3.5 bg-amber-100 border border-amber-300 rounded-xl text-amber-900 text-xs font-semibold flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>{conflictStaleNotice}</span>
                </div>
              )}

              {conflictModalError && (
                <div
                  data-testid="conflict-modal-error"
                  className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-start gap-2.5"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{conflictModalError}</span>
                </div>
              )}

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      <th className="py-3 px-3.5">Nhân viên</th>
                      <th className="py-3 px-3.5">Trường dữ liệu</th>
                      <th className="py-3 px-3.5">Nguồn lần tính trước</th>
                      <th className="py-3 px-3.5">Nguồn hiện tại (Mới)</th>
                      <th className="py-3 px-3.5">Giá trị HR chỉnh tay</th>
                      <th className="py-3 px-3.5 text-right">Quyết định đối soát</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {conflictItems.map((item) => {
                      const key = getConflictItemKey(item);
                      const selectedAction = conflictDecisions[key] || null;
                      const fieldLabel = item.fieldLabel || ADJUSTMENT_FIELD_LABELS[item.field] || item.field;
                      return (
                        <tr
                          key={key}
                          data-testid="conflict-item-row"
                          data-conflict-key={key}
                          className="hover:bg-slate-50/80 transition"
                        >
                          <td className="py-3 px-3.5">
                            <div className="font-bold text-slate-900">{item.employeeName || item.employeeId}</div>
                            <div className="font-mono text-[11px] text-slate-500">{item.employeeId}</div>
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="font-semibold text-slate-800">{fieldLabel}</div>
                            <div className="font-mono text-[10px] text-slate-400">{item.field}</div>
                          </td>
                          <td
                            className="py-3 px-3.5 font-mono text-slate-600"
                            data-testid={`conflict-prev-source-${item.employeeId}-${item.field}`}
                          >
                            {formatConflictFieldValue(item.field, item.previousSourceValue)}
                          </td>
                          <td
                            className="py-3 px-3.5 font-mono font-bold text-blue-700 bg-blue-50/40"
                            data-testid={`conflict-curr-source-${item.employeeId}-${item.field}`}
                          >
                            {formatConflictFieldValue(item.field, item.currentSourceValue)}
                          </td>
                          <td
                            className="py-3 px-3.5 font-mono font-bold text-indigo-700 bg-indigo-50/40"
                            data-testid={`conflict-manual-val-${item.employeeId}-${item.field}`}
                          >
                            {formatConflictFieldValue(item.field, item.manualValue)}
                          </td>
                          <td className="py-3 px-3.5 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                data-testid={`conflict-keep-manual-${item.employeeId}-${item.field}`}
                                disabled={conflictSubmitting}
                                onClick={() => handleSelectConflictDecision(item.employeeId, item.field, 'KEEP_MANUAL')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                                  selectedAction === 'KEEP_MANUAL'
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50 hover:border-indigo-200'
                                }`}
                              >
                                Giữ điều chỉnh
                              </button>
                              <button
                                type="button"
                                data-testid={`conflict-use-source-${item.employeeId}-${item.field}`}
                                disabled={conflictSubmitting}
                                onClick={() => handleSelectConflictDecision(item.employeeId, item.field, 'USE_SOURCE')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                                  selectedAction === 'USE_SOURCE'
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50 hover:border-blue-200'
                                }`}
                              >
                                Dùng dữ liệu nguồn
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-4">
              <div className="text-xs text-slate-600">
                Đã chọn:{' '}
                <strong className="text-slate-900">
                  {conflictItems.filter((item) => {
                    const act = conflictDecisions[getConflictItemKey(item)];
                    return act === 'KEEP_MANUAL' || act === 'USE_SOURCE';
                  }).length}
                  /{conflictItems.length}
                </strong>{' '}
                xung đột
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  data-testid="conflict-cancel-btn"
                  disabled={conflictSubmitting}
                  onClick={handleCancelConflictModal}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs transition cursor-pointer"
                >
                  Hủy bỏ (Không ghi dữ liệu)
                </button>
                <button
                  type="button"
                  data-testid="conflict-submit-btn"
                  disabled={conflictSubmitting}
                  onClick={handleSubmitConflictResolutions}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition cursor-pointer"
                >
                  {conflictSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Xác nhận đối soát & Tính lại bảng lương</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
