import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/common/Avatar';
import { 
  Clock, 
  Calendar, 
  FileText, 
  Sparkles, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  Download, 
  Bell, 
  BookOpen, 
  CalendarPlus,
  ArrowRight,
  Briefcase,
  CalendarCheck,
  Stethoscope,
  Laptop,
  Megaphone,
  Plus,
  Pin,
  SlidersHorizontal,
  Paperclip
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { attendanceService, leaveService, payrollService, noticeService, projectService, notificationService } from '../services';

export default function EmployeePortalPage() {
  const { openModal } = useModal();
  const { currentRole } = useAuth();
  const navigate = useNavigate();
  const [showSalary, setShowSalary] = useState(true);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState('--:--:--');
  const [clockLoading, setClockLoading] = useState(false);
  const [punchMessage, setPunchMessage] = useState('');

  // Live data states
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [myPayslips, setMyPayslips] = useState([]);
  const [companyNotices, setCompanyNotices] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [loadingPortal, setLoadingPortal] = useState(true);

  const empName = currentRole?.name || 'Nhân viên';
  const empId = currentRole?.id || '';
  const rawTitle = currentRole?.title || 'Chuyên viên';
  const empTitle = rawTitle.replace(/\s*\([^)]*\)/g, '').trim();
  const empDepartment = currentRole?.department || 'Phòng ban';
  const empAvatar = currentRole?.avatar || null;
  const roleKey = currentRole?.key || currentRole?.roleCode || 'EMPLOYEE';
  const canManageNotice = roleKey === 'HR_DIRECTOR' || roleKey === 'CEO' || currentRole?.isHR || currentRole?.isCEO;

  useEffect(() => {
    let isMounted = true;
    const fetchPortalData = async () => {
      setLoadingPortal(true);
      try {
        const [attRes, balRes, payRes, notRes, projRes] = await Promise.allSettled([
          attendanceService.getMyToday(),
          leaveService.getBalances('me'),
          payrollService.getMyPayslips(),
          noticeService.getAll({ limit: 5 }),
          projectService.getAll()
        ]);

        if (!isMounted) return;

        if (attRes.status === 'fulfilled' && attRes.value?.success) {
          const att = attRes.value;
          setTodayAttendance(att.data);
          const hasIn = Boolean(att.checkedIn || att.data?.check_in_time);
          setIsClockedIn(hasIn);
          if (att.data?.check_in_time) {
            try {
              const dt = new Date(att.data.check_in_time);
              setClockInTime(dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            } catch (e) {}
          }
        }

        if (balRes.status === 'fulfilled') {
          const bals = balRes.value?.data || (Array.isArray(balRes.value) ? balRes.value : []);
          setLeaveBalances(bals);
        }

        if (payRes.status === 'fulfilled') {
          const slips = payRes.value?.data || (Array.isArray(payRes.value) ? payRes.value : []);
          setMyPayslips(slips);
        }

        if (notRes.status === 'fulfilled') {
          const notices = notRes.value?.data || (Array.isArray(notRes.value) ? notRes.value : []);
          setCompanyNotices(notices);
        }

        if (projRes.status === 'fulfilled' && projRes.value?.success && Array.isArray(projRes.value.data)) {
          const projs = projRes.value.data;
          const taskPromises = projs.map(p => projectService.getTasks(p.id).catch(() => null));
          const taskResponses = await Promise.allSettled(taskPromises);
          const collected = [];
          taskResponses.forEach((tRes, pIdx) => {
            if (tRes.status === 'fulfilled' && tRes.value?.success && Array.isArray(tRes.value.data)) {
              tRes.value.data.forEach(t => {
                collected.push({
                  ...t,
                  projectName: projs[pIdx]?.name || 'Dự án',
                  projectCode: projs[pIdx]?.code || 'PRJ',
                });
              });
            }
          });
          const targetId = currentRole?.id;
          const assigned = targetId ? collected.filter(t => t.assignee_id === targetId) : [];
          setMyTasks(assigned.length > 0 ? assigned : (currentRole?.isStaff ? [] : collected.slice(0, 3)));
        }
      } catch (err) {
        console.warn('Error loading employee portal data:', err);
      } finally {
        if (isMounted) setLoadingPortal(false);
      }
    };

    fetchPortalData();
    const handleNotifUpdate = () => fetchPortalData();
    window.addEventListener('nexus:notifications-updated', handleNotifUpdate);
    window.addEventListener('nexus:notices-updated', handleNotifUpdate);
    return () => { 
      isMounted = false; 
      window.removeEventListener('nexus:notifications-updated', handleNotifUpdate);
      window.removeEventListener('nexus:notices-updated', handleNotifUpdate);
    };
  }, [currentRole.id]);

  // Tailored personal salary per role (bound to live DB payslips)
  const getSalaryData = () => {
    if (myPayslips && myPayslips.length > 0) {
      const p = myPayslips[0];
      return {
        net: `${Number(p.net_salary || 0).toLocaleString('vi-VN')} VNĐ`,
        base: `+${Number(p.base_salary || 0).toLocaleString('vi-VN')} đ`,
        bonus: `+${Number(p.bonus || 0).toLocaleString('vi-VN')} đ (Thưởng KPI)`,
        allowance: `+${Number((p.allowances || 0) + (p.ot_pay || 0)).toLocaleString('vi-VN')} đ (Phụ cấp + OT)`,
        insurance: `-${Number(p.bhxh_amount || 0).toLocaleString('vi-VN')} đ (BHXH 10.5%)`,
        tax: `-${Number(p.pit_amount || 0).toLocaleString('vi-VN')} đ (Thuế TNCN)`,
        bank: p.bank_name ? `${p.bank_name} (${p.period_id || 'Kỳ hiện tại'})` : 'Tài khoản ngân hàng liên kết'
      };
    }
    const baseSalary = currentRole?.baseSalary || 0;
    return {
      net: 'Chờ quyết toán',
      base: baseSalary > 0 ? `+${Number(baseSalary).toLocaleString('vi-VN')} đ (Lương HĐ)` : '0 đ',
      bonus: '+0 đ',
      allowance: '+0 đ',
      insurance: baseSalary > 0 ? `-${Number(Math.round(baseSalary * 0.105)).toLocaleString('vi-VN')} đ (Dự kiến)` : '0 đ',
      tax: '0 đ',
      bank: 'Chưa có phiếu lương được chốt'
    };
  };

  const salaryData = getSalaryData();

  const handleClockToggle = async () => {
    setClockLoading(true);
    setPunchMessage('');
    try {
      if (!isClockedIn) {
        await attendanceService.checkIn({ method: 'manual' });
        const now = new Date();
        setClockInTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setIsClockedIn(true);
        setPunchMessage('Đã chấm công vào ca thành công!');
        try {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.7 }
          });
        } catch (e) {}
      } else {
        await attendanceService.checkOut({ method: 'manual' });
        setIsClockedIn(false);
        setPunchMessage('Đã chấm công ra ca thành công!');
      }
    } catch (err) {
      console.warn('Attendance punch API fallback:', err);
      if (!isClockedIn) {
        const now = new Date();
        setClockInTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setIsClockedIn(true);
        setPunchMessage('Đã chấm công vào ca!');
        try {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.7 }
          });
        } catch (e) {}
      } else {
        setIsClockedIn(false);
        setPunchMessage('Đã chấm công ra ca!');
      }
    } finally {
      setClockLoading(false);
      setTimeout(() => setPunchMessage(''), 4000);
    }
  };

  // Compute live leave stats
  const annualLeave = Array.isArray(leaveBalances)
    ? (leaveBalances.find(b => b.leave_type_code === 'PHEP_NAM' || b.leave_type_code === 'AL') || leaveBalances[0])
    : null;
  const totalLeaveDays = Number(annualLeave?.entitled_days ?? annualLeave?.total_days ?? 12);
  const usedLeaveDays = Number(annualLeave?.used_days ?? 0);
  const remainingLeaveDays = Number(annualLeave?.remaining_days ?? Math.max(0, totalLeaveDays - usedLeaveDays));
  const usedPercent = totalLeaveDays > 0 ? ((usedLeaveDays / totalLeaveDays) * 100).toFixed(1) : '0';
  const remainingPercent = totalLeaveDays > 0 ? ((remainingLeaveDays / totalLeaveDays) * 100).toFixed(1) : '100';
  const donutDash = `${remainingPercent}, 100`;

  // Compute live calendar dates
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const todayDate = now.getDate();
  const monthNamesVN = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
  ];
  const currentMonthLabel = `${monthNamesVN[currentMonth]} / ${currentYear}`;
  const currentMonthCode = `T${String(currentMonth + 1).padStart(2, '0')} / ${currentYear}`;
  const todayVNStr = now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0
  const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();

  const calendarCells = [];
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    calendarCells.push({
      dayNum: prevMonthDays - i,
      isCurrentMonth: false,
      isWeekend: false,
      isToday: false
    });
  }
  for (let d = 1; d <= totalDaysInMonth; d++) {
    const dayOfWeek = (startDayOfWeek + d - 1) % 7;
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
    const isToday = d === todayDate;
    calendarCells.push({
      dayNum: d,
      isCurrentMonth: true,
      isWeekend,
      isToday
    });
  }
  const trailingCells = (7 - (calendarCells.length % 7)) % 7;
  for (let d = 1; d <= trailingCells; d++) {
    calendarCells.push({
      dayNum: d,
      isCurrentMonth: false,
      isWeekend: false,
      isToday: false
    });
  }

  return (
    <div className="w-full min-h-full p-6 space-y-6">
      {/* Employee Greeting & Fast Clock-In Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Avatar
            src={empAvatar}
            name={empName}
            id={empId}
            size="xl"
            shape="rounded"
            statusBadge={isClockedIn ? "online" : "offline"}
          />

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 font-display">
                Xin chào, {empName}
              </h1>
              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-mono text-xs font-bold border border-blue-200">
                {empId}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {empTitle} - {empDepartment}
            </p>
            <div className={`flex items-center gap-2 mt-2 text-xs font-semibold ${isClockedIn ? 'text-emerald-600' : 'text-slate-400'}`}>
              <span className={`w-2 h-2 rounded-full ${isClockedIn ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              <span>
                {isClockedIn
                  ? `Đã chấm công vào ca lúc ${clockInTime}`
                  : 'Chưa chấm công vào ca hôm nay'}
              </span>
            </div>
          </div>
        </div>


      </div>

      {/* 4 Fast Action Shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: OT Register */}
        <div 
          onClick={() => openModal('modal3A')}
          className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group flex items-center gap-3.5"
        >
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[13px] font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
              Đăng ký làm thêm (OT)
            </h3>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">Tạo phiếu tăng ca ngoài giờ</p>
          </div>
        </div>

        {/* Card 2: Payslip PDF */}
        <div 
          onClick={() => openModal('modal3C', myPayslips[0] || { name: empName, id: empId, role: empTitle, department: empDepartment })}
          className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer group flex items-center gap-3.5"
        >
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[13px] font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
              Phiếu lương điện tử
            </h3>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">Xem & tải quyết toán thu nhập</p>
          </div>
        </div>

        {/* Card 3: Quick Leave Request */}
        <div 
          onClick={() => openModal('modal6D')}
          className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-amber-300 transition-all cursor-pointer group flex items-center gap-3.5"
        >
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
            <CalendarPlus className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[13px] font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
              Tạo đơn xin nghỉ phép
            </h3>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">Nghỉ phép năm, nghỉ ốm, việc riêng</p>
          </div>
        </div>

        {/* Card 4: Handbook & Policies */}
        <div 
          onClick={() => openModal('modal3D')}
          className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-purple-300 transition-all cursor-pointer group flex items-center gap-3.5"
        >
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[13px] font-bold text-slate-900 group-hover:text-purple-600 transition-colors">
              Quy chế và Đãi ngộ
            </h3>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">Cẩm nang phúc lợi nhân sự</p>
          </div>
        </div>
      </div>

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN: Leave Balance & Attendance Calendar */}
        <div className="flex flex-col gap-6">
          {/* Card 1: Leave Balance */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-[16px] font-bold text-slate-900 tracking-tight">
                  Số dư ngày phép năm {currentYear}
                </h2>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Chu kỳ tích lũy 01/01/{currentYear} - 31/12/{currentYear}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
              {/* Doughnut ring */}
              <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-100"
                    strokeWidth="3.8"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-blue-600 transition-all duration-1000 ease-out"
                    strokeDasharray={donutDash}
                    strokeLinecap="round"
                    strokeWidth="3.8"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xl font-black text-slate-900 leading-none">{remainingLeaveDays}</span>
                  <span className="text-[10px] font-semibold text-slate-400 mt-0.5">ngày còn</span>
                </div>
              </div>

              {/* Stats 3 columns */}
              <div className="grid grid-cols-3 gap-3 w-full text-center">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[11px] text-slate-500 font-medium block">Tổng cộng</span>
                  <span className="text-sm font-bold text-slate-900 mt-0.5 block">{totalLeaveDays} ngày</span>
                  <span className="text-[10px] text-slate-400">Hạn 31/12</span>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50/50 border border-amber-200">
                  <span className="text-[11px] text-slate-500 font-medium block">Đã sử dụng</span>
                  <span className="text-sm font-bold text-amber-600 mt-0.5 block">{usedLeaveDays} ngày</span>
                  <span className="text-[10px] text-amber-600">{usedPercent}%</span>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-50/50 border border-blue-200">
                  <span className="text-[11px] text-blue-600 font-bold block">Khả dụng</span>
                  <span className="text-sm font-bold text-blue-700 mt-0.5 block">{remainingLeaveDays} ngày</span>
                  <span className="text-[10px] text-blue-600 font-semibold">Sẵn sàng</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Working Calendar Month (Dynamic theo thời gian thực) */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-[16px] font-bold text-slate-900 tracking-tight">
                  Lịch làm việc và Chuyên cần {currentMonthLabel}
                </h2>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Đồng bộ tự động từ hệ thống chấm công • Hôm nay: {todayVNStr}
                </p>
              </div>
              <span className="text-xs font-bold text-slate-700 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg">
                {currentMonthCode}
              </span>
            </div>

            {/* Calendar Table */}
            <div className="w-full">
              {/* Header: HAI, BA, TƯ, NĂM, SÁU, BẢY, C.N */}
              <div className="grid grid-cols-7 text-center text-xs font-bold pb-2.5 border-b border-slate-100">
                <span className="text-slate-600">HAI</span>
                <span className="text-slate-600">BA</span>
                <span className="text-slate-600">TƯ</span>
                <span className="text-slate-600">NĂM</span>
                <span className="text-slate-600">SÁU</span>
                <span className="text-rose-500">BẢY</span>
                <span className="text-rose-500">C.N</span>
              </div>

              {/* Dynamic Grid */}
              <div className="grid grid-cols-7 gap-y-1.5 gap-x-1 pt-2 text-center">
                {calendarCells.map((cell, idx) => {
                  if (!cell.isCurrentMonth) {
                    return (
                      <div key={idx} className="py-2 px-1 rounded-xl opacity-30 text-slate-400">
                        <div className="text-xs font-normal">{cell.dayNum}</div>
                      </div>
                    );
                  }

                  if (cell.isToday) {
                    return (
                      <div
                        key={idx}
                        className={`py-1.5 px-1 rounded-xl border transition-all ${
                          isClockedIn
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-800 shadow-2xs'
                            : 'bg-blue-50 border-blue-400 text-blue-800 shadow-2xs ring-2 ring-blue-100'
                        }`}
                      >
                        <div className="text-sm font-black">{cell.dayNum}</div>
                        <div className="text-[9px] font-bold truncate">
                          {isClockedIn ? 'Đã vào ca' : 'Hôm nay'}
                        </div>
                      </div>
                    );
                  }

                  if (cell.isWeekend) {
                    return (
                      <div
                        key={idx}
                        className="py-1.5 px-1 rounded-xl bg-slate-50/70 border border-slate-100 hover:bg-rose-50/40 transition-colors"
                      >
                        <div className="text-sm font-semibold text-rose-500">{cell.dayNum}</div>
                        <div className="text-[9px] text-rose-400 font-medium">Nghỉ</div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={idx}
                      className="py-1.5 px-1 rounded-xl bg-slate-50/50 border border-slate-100 hover:bg-slate-100 transition-colors"
                    >
                      <div className="text-sm font-medium text-slate-700">{cell.dayNum}</div>
                      <div className="text-[9px] text-slate-400">-</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chú thích màu sắc các ô lịch làm việc */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-[11px] text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shrink-0" />
                <span>Đã chấm công</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block shrink-0 ring-2 ring-blue-200" />
                <span>Hôm nay ({todayDate}/{String(currentMonth + 1).padStart(2, '0')})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shrink-0" />
                <span>Nghỉ phép</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shrink-0" />
                <span>Cuối tuần / Nghỉ lễ</span>
              </div>
            </div>

            {/* Attendance Summary */}
            <div className="mt-2.5 pt-2.5 border-t border-dashed border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>Đã làm: <strong className="text-emerald-700 font-bold">{isClockedIn ? '1 ngày' : '0 ngày'}</strong></span>
              <span>Đúng giờ: <strong className="text-emerald-700 font-bold">{isClockedIn ? '100%' : '0%'}</strong></span>
              <span>Giờ công: <strong className="text-slate-900 font-bold">{isClockedIn ? (todayAttendance?.working_hours ? `${todayAttendance.working_hours} giờ` : '8.0 giờ') : '0.0 giờ'}</strong></span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Daily Tasks & Company News (Bảo mật tuyệt đối, không để lộ tiền lương) */}
        <div className="flex flex-col gap-6">
          {/* Card 3: Kế hoạch & Trọng tâm công việc hôm nay */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="font-display text-[16px] font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-blue-600" />
                  <span>Kế hoạch và Trọng tâm công việc hôm nay</span>
                </h2>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} - Nhiệm vụ dự án được phân công
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/tasks')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
              >
                <span>Xem tất cả task</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {myTasks.length > 0 ? (
                myTasks.map((task, idx) => (
                  <div 
                    key={task.id || idx}
                    onClick={() => navigate('/tasks')}
                    className="p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-200 flex items-start gap-3 cursor-pointer transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                      {String(idx + 1).padStart(2, '0')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 truncate">{task.title}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold shrink-0 ${
                          task.priority === 'Cao' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {task.priority || 'Tiêu chuẩn'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">
                        {task.description || `${task.projectName || 'Dự án'} • Hạn chót: ${task.deadline ? new Date(task.deadline).toLocaleDateString('vi-VN') : 'Trong sprint'}`}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-blue-600 h-1.5 rounded-full transition-all" 
                            style={{ width: `${task.progress || (task.stage === 'done' ? 100 : task.stage === 'review' ? 85 : 30)}%` }} 
                          />
                        </div>
                        <span className="text-[10px] font-bold text-blue-700 font-mono">
                          {task.progress || (task.stage === 'done' ? 100 : task.stage === 'review' ? 85 : 30)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-slate-400 space-y-1.5">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-80" />
                  <p className="text-xs font-semibold text-slate-600">Hiện bạn không có công việc nào đang chờ thực hiện</p>
                  <p className="text-[11px] text-slate-400">Tất cả nhiệm vụ được giao đã hoàn tất hoặc chưa có nhiệm vụ mới</p>
                </div>
              )}
            </div>
          </div>

          {/* Card 4: Bảng tin nội bộ */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
              <div>
                <h2 className="font-display text-[16px] font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-blue-600" />
                  <span>Bảng tin và Thông báo công ty</span>
                </h2>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Đồng bộ trực tiếp từ trung tâm thông báo doanh nghiệp
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center">
                {canManageNotice && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openModal('modalNoticeManagement')}
                      className="text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1.5 rounded-xl flex items-center gap-1 cursor-pointer transition shadow-2xs"
                      title="Quản lý và thống kê toàn bộ thông báo"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Quản lý</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openModal('modalCreateNotice', { mode: 'create' })}
                      className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                      title="Đăng thông báo mới cho toàn doanh nghiệp"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Đăng thông báo</span>
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => openModal('modalNotificationCenter')}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer px-2.5 py-1.5 rounded-xl hover:bg-blue-50 transition"
                  title="Mở toàn bộ trung tâm thông báo doanh nghiệp"
                >
                  <span>Xem tất cả</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {companyNotices.length > 0 ? (
                companyNotices.slice(0, 4).map((notice, idx) => {
                  const isUrgent = notice.is_urgent || notice.priority === 'high' || (notice.title && (notice.title.includes('KHEN THƯỞNG') || notice.title.includes('QUYẾT ĐỊNH') || notice.title.includes('KHẨN')));
                  const isPinned = Boolean(notice.is_pinned);
                  const pubDate = notice.published_at 
                    ? new Date(notice.published_at).toLocaleDateString('vi-VN') 
                    : new Date().toLocaleDateString('vi-VN');
                  let noticeAttachments = [];
                  if (Array.isArray(notice.attachments)) {
                    noticeAttachments = notice.attachments;
                  } else if (typeof notice.attachments === 'string') {
                    try { noticeAttachments = JSON.parse(notice.attachments); } catch (e) {}
                  }

                  return (
                    <div 
                      key={notice.id || idx}
                      onClick={() => {
                        openModal('modalNotificationDetail', {
                          id: notice.id,
                          title: notice.title,
                          content: notice.content,
                          category: notice.category,
                          priority: notice.priority,
                          attachments: noticeAttachments,
                          date: pubDate,
                          signer: notice.author_name ? `${notice.author_name} - Ban Giám Đốc` : 'Ban Lãnh Đạo NEXUS',
                          docNumber: `Số: ${notice.id}/2026/TB-NEXUS`
                        });
                        if (notice.id) {
                          notificationService.markAsRead(`NOTIF-${notice.id}`).catch(() => null);
                          notificationService.markAsRead(notice.id).catch(() => null);
                          window.dispatchEvent(new CustomEvent('nexus:notifications-updated'));
                        }
                      }}
                      className={`p-3.5 rounded-xl transition-all cursor-pointer border relative group ${
                        isUrgent 
                          ? 'bg-rose-50/50 hover:bg-rose-50 border-rose-200/90 shadow-2xs hover:border-rose-300' 
                          : isPinned
                            ? 'bg-amber-50/40 hover:bg-amber-50/70 border-amber-200/90 shadow-2xs'
                            : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200/80 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          {isPinned && (
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Pin className="w-2.5 h-2.5 fill-amber-700 text-amber-700" />
                              GHIM
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase tracking-wide shrink-0 ${
                            isUrgent
                              ? 'bg-rose-100 text-rose-700 border border-rose-300'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {isUrgent ? 'QUAN TRỌNG / KHẨN' : (notice.category === 'policy' ? 'QUY ĐỊNH' : notice.category === 'benefit' ? 'ĐÃI NGỘ' : notice.category === 'event' ? 'SỰ KIỆN' : 'THÔNG BÁO')}
                          </span>
                          {noticeAttachments.length > 0 && (
                            <span className="bg-indigo-50 text-indigo-700 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-indigo-200/80 flex items-center gap-1 shrink-0" title={`${noticeAttachments.length} tệp tài liệu đính kèm`}>
                              <Paperclip className="w-2.5 h-2.5" />
                              <span>{noticeAttachments.length} tệp</span>
                            </span>
                          )}
                          <span className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                            {notice.title}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                          {pubDate}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                        {notice.summary || notice.content}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center text-slate-400 text-xs">
                  Chưa có thông báo mới từ ban quản trị.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
