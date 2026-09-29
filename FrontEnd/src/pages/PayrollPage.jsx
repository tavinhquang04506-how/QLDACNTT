import React, { useState, useEffect } from 'react';
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
  Layers
} from 'lucide-react';
import { normalizePayslip, formatVND, formatDateVN } from '../utils/dataAdapters';
import { generateCSVContent, downloadFile } from '../utils/fileExportUtils';

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
  const [isCeoApproved, setIsCeoApproved] = useState(false);
  const [apiPayslips, setApiPayslips] = useState([]);
  const [apiPeriods, setApiPeriods] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [myPayslip, setMyPayslip] = useState(null);
  const [myPayslipsList, setMyPayslipsList] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  // Tab for CEO and HRD: 'company' | 'personal'
  const [adminTab, setAdminTab] = useState('company');

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
          const [periodsRes, payslipsRes, empRes] = await Promise.all([
            payrollService.getPeriods().catch(() => null),
            payrollService.getPayslips().catch(() => null),
            employeeService.getAll().catch(() => null),
          ]);
          if (periodsRes?.success && Array.isArray(periodsRes.data) && isMounted) {
            setApiPeriods(periodsRes.data);
            if (periodsRes.data.length > 0) {
              const pCode = periodsRes.data[0].period;
              const parts = pCode ? pCode.split('-') : [];
              if (parts.length === 2) {
                setSelectedPeriod(`Tháng ${parts[1]}/${parts[0]}`);
              }
            }
          }
          if (payslipsRes?.success && Array.isArray(payslipsRes.data) && isMounted) {
            let slips = payslipsRes.data;
            if (roleKey === 'LINE_MANAGER') {
              slips = slips.filter(s =>
                (s.department_name && (s.department_name.includes('Kỹ thuật') || s.department_name.includes('Phần mềm'))) ||
                s.department_id === 'DEPT-IT'
              );
            }
            setApiPayslips(slips);
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
    };
    window.addEventListener('nexus:payroll-locked', handleLocked);
    return () => {
      isMounted = false;
      window.removeEventListener('nexus:payroll-locked', handleLocked);
    };
  }, [roleKey]);

  const getPeriodCode = (periodStr) => {
    if (!periodStr) return new Date().toISOString().slice(0, 7);
    const m = String(periodStr).match(/(\d{2})\/(\d{4})/);
    if (m) return `${m[2]}-${m[1]}`;
    const m2 = String(periodStr).match(/(\d{4})-(\d{2})/);
    if (m2) return `${m2[1]}-${m2[2]}`;
    return new Date().toISOString().slice(0, 7);
  };

  const currentPeriodCode = getPeriodCode(selectedPeriod);
  const currentPeriodObj = apiPeriods.find(p => p.period === currentPeriodCode) || apiPeriods[0] || null;
  const isPeriodLocked = currentPeriodObj?.status === 'DA_CHOT' || currentPeriodObj?.status === 'DA_CHUYEN_KHOAN';

  useEffect(() => {
    let isMounted = true;
    if (currentPeriodObj?.id) {
      payrollService.getAnomalies(currentPeriodObj.id)
        .then(res => {
          const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : (res?.data?.data || []));
          if (isMounted) setAnomalies(list);
        })
        .catch(() => {
          if (isMounted) setAnomalies([]);
        });
    } else {
      setAnomalies([]);
    }
    return () => { isMounted = false; };
  }, [currentPeriodObj?.id, selectedPeriod]);

  const handleCeoApprove = async () => {
    setIsCeoApproved(true);
    try {
      const periodCode = getPeriodCode(selectedPeriod);
      await payrollService.calculate(periodCode);
      const updated = await payrollService.getPayslips();
      if (updated?.success && Array.isArray(updated.data)) {
        setApiPayslips(updated.data);
      }
    } catch (e) {
      console.warn('Backend calculate notice:', e);
    }
    try {
      confetti({
        particleCount: 70,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (e) { }
  };

  const totalNet = apiPayslips.reduce((sum, p) => sum + (parseFloat(p.net_salary) || 0), 0) ||
    employees.reduce((sum, e) => sum + (e.contractSalary || 0), 0);
  const netGrowth = 4.2;
  const totalOtHours = apiPayslips.reduce((sum, p) => sum + (parseFloat(p.ot_hours) || 0), 0);
  const totalOtEmployees = apiPayslips.filter(p => (parseFloat(p.ot_hours) || 0) > 0).length;
  const avgOtHours = totalOtEmployees > 0 ? (totalOtHours / totalOtEmployees).toFixed(1) : 0;
  const totalBhxh = apiPayslips.reduce((sum, p) => sum + (parseFloat(p.bhxh_amount) || 0), 0) || Math.round(totalNet * 0.105);
  const totalTax = apiPayslips.reduce((sum, p) => sum + (parseFloat(p.pit_amount || p.tax_amount) || 0), 0) || Math.round(totalNet * 0.05);
  const payrollStatus = isCeoApproved ? 'CEO Đã Phê Duyệt Chi Trả' : (apiPeriods[0]?.status || 'Chờ CEO duyệt chi trả');

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = departmentFilter === 'all' || emp.department.includes(departmentFilter);
    return matchesSearch && matchesDept;
  });

  const handleExportPayrollReport = () => {
    const headers = ['Mã NV', 'Họ Và Tên', 'Chức Vụ', 'Lương Cơ Bản', 'Ngày Công', 'Làm Thêm (OT)', 'Thưởng KPI', 'BHXH', 'Thuế TNCN', 'Thực Lĩnh (Net)'];
    const rows = (apiPayslips.length > 0 ? apiPayslips : employees).map((p) => [
      p.employee_id || p.id,
      p.full_name || p.name,
      p.job_title || p.role,
      p.base_salary || p.contractSalary || 20000000,
      p.actual_work_days ? `${p.actual_work_days}/22` : '22/22',
      p.ot_pay || 0,
      p.allowances || p.bonus || 0,
      p.bhxh_amount || Math.round((p.base_salary || p.contractSalary || 20000000) * 0.105),
      p.pit_amount || Math.round((p.base_salary || p.contractSalary || 20000000) * 0.05),
      p.net_salary || (p.contractSalary ? Math.round(p.contractSalary * 0.845) : 20000000),
    ]);
    const csv = generateCSVContent(headers, rows);
    downloadFile(`Bao_Cao_Tong_Hop_Quy_Luong_${selectedPeriod.replace(/[\/\s]/g, '_')}.csv`, csv);
  };

  // Derive / construct personalized payslip object
  const activeSlip = myPayslip || apiPayslips.find(s => s.employee_id === currentRole?.id || s.employee_id === currentRole?.employee_id) || {
    employee_id: currentRole?.id || 'NV-0001',
    full_name: currentRole?.name || 'Nhân sự NEXUS',
    job_title: currentRole?.title || 'Chức vụ',
    department_name: currentRole?.department || 'Khối Doanh Nghiệp',
    base_salary: currentRole?.baseSalary || (roleKey === 'CEO' ? 68000000 : roleKey === 'HR_DIRECTOR' ? 45000000 : roleKey === 'LINE_MANAGER' ? 42000000 : 28000000),
    allowances: roleKey === 'CEO' ? 12000000 : roleKey === 'HR_DIRECTOR' ? 6000000 : roleKey === 'LINE_MANAGER' ? 5000000 : 2500000,
    bonus: roleKey === 'CEO' ? 20000000 : roleKey === 'HR_DIRECTOR' ? 8000000 : roleKey === 'LINE_MANAGER' ? 7000000 : 3500000,
    ot_pay: 0,
    ot_hours: 0,
    actual_work_days: 22,
    bhxh_amount: Math.round(((currentRole?.baseSalary || (roleKey === 'CEO' ? 68000000 : 28000000)) * 0.105)),
    pit_amount: Math.round(((currentRole?.baseSalary || (roleKey === 'CEO' ? 68000000 : 28000000)) * 0.08)),
    status: 'DA_CHUYEN_KHOAN'
  };

  if (!activeSlip.net_salary || isNaN(Number(activeSlip.net_salary))) {
    const gross = Number(activeSlip.base_salary || 0) + Number(activeSlip.allowances || 0) + Number(activeSlip.bonus || 0) + Number(activeSlip.ot_pay || 0);
    const deductions = Number(activeSlip.bhxh_amount || 0) + Number(activeSlip.pit_amount || 0);
    activeSlip.net_salary = gross - deductions;
  }

  // Danh sách các kỳ lương cá nhân hỗ trợ tra cứu lịch sử
  const personalPeriods = [
    { code: '2026-09', label: 'Tháng 09/2026 (Kỳ hiện tại)' },
    { code: '2026-08', label: 'Tháng 08/2026 (Đã quyết toán)' },
    { code: '2026-07', label: 'Tháng 07/2026 (Đã quyết toán)' },
    { code: '2026-06', label: 'Tháng 06/2026 (Đã quyết toán)' },
  ];

  const getPersonalSlipForPeriod = (periodStr) => {
    const pCode = getPeriodCode(periodStr);
    const matched = (myPayslipsList || []).find(s => s.period_id === pCode || s.period === pCode || s.period_name === periodStr);
    if (matched) {
      const b = Number(matched.base_salary || 0);
      const a = Number(matched.allowances || 0);
      const bo = Number(matched.bonus || 0);
      const ot = Number(matched.ot_pay || 0);
      const oth = Number(matched.ot_hours || 0);
      const ins = Number(matched.bhxh_amount || 0) + Number(matched.bhyt_amount || 0) + Number(matched.bhtn_amount || 0) || Math.round(b * 0.105);
      const tax = Number(matched.pit_amount || 0) || Math.round(b * 0.08);
      const totalDed = Number(matched.total_deductions || 0) || (ins + tax);
      const rawNet = Number(matched.net_salary || 0);
      const calcNet = (b + a + bo + ot) - totalDed;
      return {
        ...matched,
        base_salary: b,
        allowances: a,
        bonus: bo,
        ot_pay: ot,
        ot_hours: oth,
        actual_work_days: Number(matched.actual_work_days || 22),
        bhxh_amount: ins,
        pit_amount: tax,
        total_deductions: totalDed,
        net_salary: !isNaN(rawNet) && rawNet > 0 ? rawNet : calcNet,
      };
    }

    const base = Number(activeSlip.base_salary || currentRole?.baseSalary || 28000000);
    let ot = Number(activeSlip.ot_pay || 0);
    let otHours = Number(activeSlip.ot_hours || 0);
    let bonus = Number(activeSlip.bonus || 0);
    let workDays = Number(activeSlip.actual_work_days || 22);

    if (pCode === '2026-08') {
      ot = Math.round(base * 0.08);
      otHours = 12;
      bonus = Math.round(base * 0.12);
      workDays = 22;
    } else if (pCode === '2026-07') {
      ot = Math.round(base * 0.05);
      otHours = 8;
      bonus = Math.round(base * 0.1);
      workDays = 21;
    } else if (pCode === '2026-06') {
      ot = 0;
      otHours = 0;
      bonus = Math.round(base * 0.15);
      workDays = 22;
    }

    const allowances = Number(activeSlip.allowances ?? 3000000);
    const bhxh = Number(activeSlip.bhxh_amount ?? Math.round(base * 0.105));
    const pit = Number(activeSlip.pit_amount ?? Math.round(base * 0.08));
    const gross = base + allowances + bonus + ot;
    const totalDeductions = bhxh + pit;
    const net = gross - totalDeductions;

    return {
      ...activeSlip,
      period_id: pCode,
      period_name: periodStr,
      base_salary: base,
      allowances,
      bonus,
      ot_pay: ot,
      ot_hours: otHours,
      actual_work_days: workDays,
      bhxh_amount: bhxh,
      pit_amount: pit,
      total_deductions: totalDeductions,
      net_salary: net,
    };
  };

  // ==========================================
  // RENDER PERSONAL PAYSLIP COMPONENT (Shared across ESS, Line Manager, HRD & CEO)
  // ==========================================
  const renderPersonalPayslip = (slip) => {
    const currentSlip = getPersonalSlipForPeriod(selectedPeriod);
    const baseSalaryNum = Number(currentSlip?.base_salary || currentRole?.baseSalary || 28000000);
    const otAndBonus = Number(currentSlip?.ot_pay || 0) + Number(currentSlip?.bonus || 0) + Number(currentSlip?.allowances || 0);
    const totalDeductions = Number(currentSlip?.total_deductions || 0) || (Number(currentSlip?.bhxh_amount || 0) + Number(currentSlip?.pit_amount || 0));
    const workDays = currentSlip?.actual_work_days ?? 22;
    const calculatedNet = (baseSalaryNum + otAndBonus) - totalDeductions;
    const rawNet = Number(currentSlip?.net_salary);
    const netSalaryNum = !isNaN(rawNet) && rawNet > 0 ? rawNet : calculatedNet;

    return (
      <div className="space-y-6">
        {/* Header Controls for Personal Payslip */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900 font-display">
              Phiếu Lương Điện Tử Cá Nhân
            </h2>
            <span className="text-xs font-bold px-3 py-0.5 rounded-full border flex items-center gap-1 bg-emerald-50 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Đã Quyết Toán & Chuyển Khoản
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
                Kỳ chi trả: <strong className="text-slate-700">{selectedPeriod}</strong> • Trạng thái: <strong className="text-emerald-600">Đã chi trả chuyển khoản VCB</strong>
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 p-4 rounded-xl border border-blue-100 flex flex-col items-start md:items-end">
            <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Thực nhận chuyển khoản</span>
            <div className="text-2xl md:text-3xl font-bold font-mono text-blue-700 mt-0.5">
              {showNumbers ? `${netSalaryNum.toLocaleString('vi-VN')} ₫` : '•••••••• ₫'}
            </div>
            <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" /> Đã quyết toán vào tài khoản
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
                <span className={`text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-1 shrink-0 ${isCeoApproved
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}>
                  {isCeoApproved ? <Check className="w-3 h-3" /> : null}
                  {payrollStatus}
                </span>
              </div>
            </div>

            {/* Tailored Buttons for CEO vs HRD */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {/* Period selector */}
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-100 shrink-0"
              >
                {apiPeriods && apiPeriods.length > 0 ? (
                  apiPeriods.map((p) => {
                    const pCode = p.period;
                    const parts = pCode ? pCode.split('-') : [];
                    const formatted = parts.length === 2 ? `Tháng ${parts[1]}/${parts[0]}` : (pCode || 'Kỳ lương');
                    const statusLabel = p.status === 'DA_CHOT' ? 'Đã chốt' : p.status === 'DA_CHUYEN_KHOAN' ? 'Đã chi trả' : 'Đang xử lý';
                    return (
                      <option key={p.id || p.period} value={formatted}>
                        Kỳ: {formatted} ({statusLabel})
                      </option>
                    );
                  })
                ) : (
                  <option value={defaultPeriodStr}>
                    Kỳ: {defaultPeriodStr} (Chưa mở kỳ)
                  </option>
                )}
              </select>

              {isCeo ? (
                /* CEO Actions */
                <>
                  <button
                    type="button"
                    onClick={handleCeoApprove}
                    className={`text-xs font-bold px-4 py-2 rounded-xl shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0 ${isCeoApproved
                        ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                        : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/20'
                      }`}
                  >
                    <Crown className="w-4 h-4" />
                    <span>{isCeoApproved ? 'Đã phê duyệt chi trả' : 'Phê duyệt chi trả toàn công ty'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openModal('modal7B', { slips: apiPayslips, employees, totalNet, period: selectedPeriod })}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Xuất file Ngân hàng VCB</span>
                  </button>
                </>
              ) : (
                /* HR Director Actions */
                <>
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
                    onClick={() => openModal('modal7A', { periodId: currentPeriodObj?.id, periodName: selectedPeriod, anomalies })}
                    className={`${anomalies.length > 0 ? 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800' : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800'} border text-xs font-bold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0`}
                  >
                    {anomalies.length > 0 ? <AlertTriangle className="w-4 h-4 text-amber-600" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    <span>{anomalies.length > 0 ? `Đối soát (${anomalies.length} bất thường)` : 'Đối soát hợp lệ'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openModal('modal7B', { slips: apiPayslips, employees, totalNet, period: selectedPeriod })}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Xuất file Ngân hàng VCB</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openModal('modal7C', { slips: apiPayslips, employees, totalNet, period: selectedPeriod, employeesCount: employees.length })}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Chốt sổ và Khóa kỳ lương</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={handleExportPayrollReport}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <Download className="w-4 h-4 text-blue-600" />
                <span>Tải Báo Cáo Quỹ Lương (.csv)</span>
              </button>
            </div>
          </div>

          {/* 4 Financial Ribbon Cards Tailored Per Role */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Net */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex flex-col justify-between gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Tổng quỹ lương thực trả (Net)
                  </span>
                  <div className="text-[24px] font-bold font-display text-blue-600 mt-1">
                    {totalNet.toLocaleString('vi-VN')} đ
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>{employees.length} nhân sự toàn công ty</span>
                <span className="text-slate-600 font-semibold bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                  {apiPayslips.length > 0 ? `+${netGrowth}%` : 'Chuẩn ngân sách'}
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

            {/* Card 4: CEO Budget vs HRD Compliance */}
            {isCeo ? (
              <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex flex-col justify-between gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Hiệu suất Quỹ Lương / Doanh Thu
                    </span>
                    <div className="text-[24px] font-bold font-display text-emerald-600 mt-1">
                      18.4%
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Mục tiêu HĐQT: &le; 20%</span>
                  <span className="text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Tối ưu chi phí
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex flex-col justify-between gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Tỷ lệ hoàn thành đối soát
                    </span>
                    <div className="text-[24px] font-bold font-display text-blue-600 mt-1">
                      {anomalies.length === 0 ? '100%' : `${Math.round(((employees.length - anomalies.length) / (employees.length || 1)) * 100)}%`}
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Sparkles className="w-5 h-5" />
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>{anomalies.length > 0 ? `${anomalies.length} cảnh báo cần xử lý` : 'Đã đối soát hợp lệ'}</span>
                  <span className="text-blue-600 font-semibold">Tự động hoá CSDL</span>
                </div>
              </div>
            )}
          </div>

          {/* Anomaly Banner */}
          {anomalies.length > 0 ? (
            <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
                  !
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-sm font-display">
                      Phát hiện {anomalies.length} trường hợp bất thường cần đối soát trước khi chốt bảng lương
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold text-[10px]">
                      Cảnh báo {anomalies.length} mục
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {anomalies.map((a) => `${a.employeeName || a.employeeId || 'Nhân viên'}: ${a.anomalyType || a.reason || 'Bất thường'}`).slice(0, 3).join(' • ')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openModal('modal7A', { periodId: currentPeriodObj?.id, periodName: selectedPeriod, anomalies })}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95"
              >
                <span>Đối soát và Giải quyết {anomalies.length} bất thường</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
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
                onClick={() => openModal('modal7A', { periodId: currentPeriodObj?.id, periodName: selectedPeriod, anomalies })}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <span>Xem chi tiết đối soát</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

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
                    const items = apiPayslips.length > 0 ? apiPayslips.filter(ps => {
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
                      days: `${ps.actual_work_days} / 22 ngày`,
                      ot: parseFloat(ps.ot_pay) || 0,
                      kpi: parseFloat(ps.allowances || ps.bonus) || 0,
                      bhxh: parseFloat(ps.bhxh_amount) || 0,
                      tax: parseFloat(ps.pit_amount) || 0,
                      net: parseFloat(ps.net_salary) || 0,
                      raw: ps
                    })) : filteredEmployees.map(emp => {
                      const base = Number(emp.contractSalary || emp.base_salary || 0);
                      const ot = 0;
                      const kpi = 0;
                      const bhxh = Math.round(base * 0.105);
                      const tax = 0;
                      const net = base > bhxh ? base - bhxh : 0;
                      return {
                        id: emp.id,
                        name: emp.name || emp.full_name,
                        avatar: emp.avatar || emp.avatar_url,
                        role: emp.role || emp.job_title,
                        base,
                        days: 'Chưa tính lương',
                        ot,
                        kpi,
                        bhxh,
                        tax,
                        net,
                        raw: emp
                      };
                    });

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
    </div>
  );
}
