import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import Avatar from '../../components/common/Avatar';
import { Calendar, Search, FileSpreadsheet, User, Edit3, CheckCircle2, Clock } from 'lucide-react';
import employeeService from '../../services/employeeService';
import attendanceService from '../../services/attendanceService';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { generateCSVContent, downloadFile } from '../../utils/fileExportUtils';

export default function TimesheetMatrixModal({ isOpen, onClose }) {
  const { currentRole, user } = useAuth();
  const { openModal } = useModal();
  const [employees, setEmployees] = useState([]);
  const [timesheetData, setTimesheetData] = useState(null);
  const [selectedDept, setSelectedDept] = useState('Tất cả');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentMonthStr = String(currentMonth + 1).padStart(2, '0');
  const currentMonthCode = `${currentYear}-${currentMonthStr}`;
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  // Công chuẩn = số ngày làm việc T2–T6 thực tế của tháng hiện tại
  const standardWorkDays = daysArray.filter((d) => {
    const wd = new Date(currentYear, currentMonth, d).getDay();
    return wd !== 0 && wd !== 6;
  }).length;

  // Chỉ HR và CEO được xem bảng công của nhân viên khác.
  // Nhân viên và Trưởng phòng chỉ xem bảng công của chính mình.
  const isHrOrCeo = currentRole?.key === 'CEO' || currentRole?.key === 'HR_DIRECTOR';
  const isPersonalView = !isHrOrCeo;
  const myId = user?.employeeId || currentRole?.id || '';

  const loadData = async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const [empRes, tsRes] = await Promise.all([
        employeeService.getAll().catch(() => null),
        attendanceService.getTimesheet({ month: currentMonthCode }).catch(() => null),
      ]);

      if (empRes?.success && Array.isArray(empRes.data)) {
        const normalized = empRes.data.map(e => ({
          id: e.id,
          name: e.full_name || e.name || 'Nhân viên',
          department: e.department_name || e.department || '—',
          role: e.job_title || e.role || 'Nhân viên',
          avatar: e.avatar_url || e.avatar,
        }));
        setEmployees(normalized);
      }

      if (tsRes?.success && tsRes.data) {
        setTimesheetData(tsRes.data);
      }
    } catch (e) {
      console.warn('Error loading timesheet matrix:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener('nexus:attendance-updated', handleUpdate);
    return () => window.removeEventListener('nexus:attendance-updated', handleUpdate);
  }, [isOpen]);

  // Index timesheet rows by employee ID
  const timesheetByEmp = React.useMemo(() => {
    const map = new Map();
    if (timesheetData?.rows && Array.isArray(timesheetData.rows)) {
      timesheetData.rows.forEach(r => map.set(r.employee_id, r));
    }
    return map;
  }, [timesheetData]);

  // Status mapping for individual cells
  const getDayStatus = (day, empId) => {
    const dateStr = `${currentYear}-${currentMonthStr}-${String(day).padStart(2, '0')}`;
    const dateObj = new Date(currentYear, currentMonth, day);
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

    const row = timesheetByEmp.get(empId);
    const status = row?.cells?.[dateStr];

    if (status === 'DUNG_GIO' || status === 'CO_MAT') {
      return { code: '8.0', color: 'bg-emerald-50 text-emerald-700 font-semibold' };
    }
    if (status === 'DI_MUON') {
      return { code: 'L', color: 'bg-amber-100 text-amber-800 font-bold' };
    }
    if (status === 'NGHI_PHEP') {
      return { code: 'P', color: 'bg-blue-100 text-blue-800 font-bold' };
    }
    if (status === 'CONG_TAC') {
      return { code: 'CT', color: 'bg-indigo-100 text-indigo-800 font-bold' };
    }
    if (status === 'VANG_KHONG_PHEP') {
      return { code: 'V', color: 'bg-rose-100 text-rose-800 font-bold' };
    }
    if (status === 'VE_SOM') {
      return { code: 'VS', color: 'bg-amber-100 text-amber-800 font-bold' };
    }

    if (isWeekend) {
      return { code: '-', color: 'bg-slate-100 text-slate-400' };
    }

    // Default when no attendance record has been clocked
    return { code: '-', color: 'bg-slate-50 text-slate-300' };
  };

  // Build employee list based on role
  const me = employees.find(e => e.id === myId) || {
    id: myId,
    name: user?.fullName || user?.full_name || currentRole?.name || 'Tôi',
    department: currentRole?.department || '—',
    role: currentRole?.title || '',
    avatar: currentRole?.avatar,
  };
  const baseList = isPersonalView
    ? [me]
    : [
        ...employees.filter(e => e.id === myId),
        ...employees.filter(e => e.id !== myId),
      ];

  // Danh sách phòng ban lấy từ dữ liệu nhân sự thật
  const departmentOptions = React.useMemo(
    () => [...new Set(employees.map(e => e.department).filter(d => d && d !== '—'))].sort((a, b) => a.localeCompare(b, 'vi')),
    [employees]
  );

  const filteredList = baseList.filter(emp => {
    if (isPersonalView) return true;
    const q = searchQuery.toLowerCase();
    const matchesDept = selectedDept === 'Tất cả' || emp.department === selectedDept;
    const matchesSearch = (emp.name || '').toLowerCase().includes(q) || (emp.id || '').toLowerCase().includes(q);
    return matchesDept && matchesSearch;
  });

  const myTotals = timesheetByEmp.get(myId)?.totals;

  const handleExportCSV = () => {
    const headers = ['Mã NV', 'Họ Và Tên', 'Phòng Ban', 'Tổng Ngày Công', 'Công Chuẩn', 'Số Lần Đi Muộn', 'Nghỉ Phép', 'Số Giờ OT'];
    const rows = filteredList.map(emp => {
      const tsRow = timesheetByEmp.get(emp.id);
      return [
        emp.id,
        emp.name,
        emp.department,
        tsRow?.totals?.work_days ?? 0,
        standardWorkDays,
        tsRow?.totals?.late_days ?? 0,
        tsRow?.totals?.leave_days ?? 0,
        tsRow?.totals?.ot_hours ?? 0,
      ];
    });
    const csv = generateCSVContent(headers, rows);
    const suffix = isPersonalView ? `_${myId || 'ca_nhan'}` : '';
    downloadFile(`Bang_Cham_Cong_Thang_${currentMonthStr}_${currentYear}${suffix}.csv`, csv);
  };

  return (
    <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-6xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-100 gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  {isPersonalView 
                    ? 'Bảng chấm công chi tiết của tôi' 
                    : currentRole?.key === 'HR_DIRECTOR'
                    ? 'Bảng chấm công nhân viên'
                    : 'Bảng chấm công tổng hợp toàn công ty'}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  Tháng {currentMonthStr}/{currentYear}
                </span>
                {isPersonalView ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Cá nhân
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                    {filteredList.length} nhân sự
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Chu kỳ: 01/{currentMonthStr}/{currentYear} - {daysInMonth}/{currentMonthStr}/{currentYear}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Xuất Bảng Công (.csv)</span>
            </button>
          </div>
        </div>

        {/* Filter and stats ribbon (HR / CEO only) */}
        {!isPersonalView ? (
          <div className="mt-4 flex flex-col lg:flex-row items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <div className="flex items-center gap-2 w-full lg:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm nhân viên, mã NV..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <select
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value)}
                className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="Tất cả">Tất cả phòng ban</option>
                {departmentOptions.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              <span className="flex items-center gap-1">
                <span className="w-3.5 h-3.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold flex items-center justify-center">8</span>
                Đủ công (8h)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3.5 h-3.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold flex items-center justify-center">L</span>
                Đi muộn
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3.5 h-3.5 rounded bg-blue-100 text-blue-800 text-[9px] font-bold flex items-center justify-center">P</span>
                Nghỉ phép
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3.5 h-3.5 rounded bg-indigo-100 text-indigo-800 text-[9px] font-bold flex items-center justify-center">CT</span>
                Công tác
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3.5 h-3.5 rounded bg-slate-200 text-slate-600 text-[9px] font-bold flex items-center justify-center">-</span>
                Nghỉ tuần
              </span>
            </div>
          </div>
        ) : (
          /* Personal summary bar (Nhân viên & Trưởng phòng) */
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-blue-50/50 p-3 rounded-xl border border-blue-100 text-xs">
            <div>
              <span className="text-slate-500 block">Số công thực tế:</span>
              <strong className="text-blue-700 text-sm">{myTotals?.work_days ?? 0}.0 / {standardWorkDays} ngày</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Số lần đi muộn:</span>
              <strong className="text-emerald-700 text-sm">{myTotals?.late_days ?? 0} lần</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Tổng giờ làm thêm OT:</span>
              <strong className="text-purple-700 text-sm">{myTotals?.ot_hours ?? 0} giờ</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Trạng thái kỳ công:</span>
              <span className={`inline-block mt-0.5 px-2 py-0.5 rounded font-bold text-[11px] ${
                (myTotals?.work_days ?? 0) > 0
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-600'
              }`}>
                {(myTotals?.work_days ?? 0) > 0 ? 'Đang ghi nhận công' : 'Chưa có công ghi nhận'}
              </span>
            </div>
          </div>
        )}

        {/* Matrix Table with horizontal scroll */}
        <div className="mt-4 border border-slate-200 rounded-xl overflow-x-auto max-h-[50vh] custom-scrollbar shadow-xs">
          <table className="w-full text-left text-xs border-collapse min-w-[1300px]">
            <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-20 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 sticky left-0 bg-slate-100 z-30 min-w-[190px] shadow-sm">Nhân viên</th>
                <th className="py-2.5 px-2 text-center min-w-[110px]">Phòng ban</th>
                <th className="py-2.5 px-2 text-center bg-blue-50/50 font-bold text-blue-900">Tổng công</th>
                <th className="py-2.5 px-2 text-center bg-amber-50/50 font-bold text-amber-900">Muộn</th>
                <th className="py-2.5 px-2 text-center bg-purple-50/50 font-bold text-purple-900">Phép</th>
                <th className="py-2.5 px-2 text-center bg-emerald-50/50 font-bold text-emerald-900">OT (h)</th>
                {isHrOrCeo && <th className="py-2.5 px-2 text-center bg-indigo-50/50 font-bold text-indigo-900 min-w-[80px]">Thao tác</th>}
                {daysArray.map(day => (
                  <th key={day} className="py-2 px-1 text-center min-w-[28px] text-[11px] font-mono">
                    {day < 10 ? `0${day}` : day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={7 + daysInMonth} className="py-12 text-center text-slate-400">
                    Chưa có dữ liệu nhân sự hoặc bảng chấm công phù hợp
                  </td>
                </tr>
              ) : (
                filteredList.map((emp, index) => {
                  const isMe = emp.id === myId;
                  const tsRow = timesheetByEmp.get(emp.id);
                  const workDays = tsRow?.totals?.work_days ?? 0;
                  const lateDays = tsRow?.totals?.late_days ?? 0;
                  const leaveDays = tsRow?.totals?.leave_days ?? 0;
                  const otHours = tsRow?.totals?.ot_hours ?? 0;

                return (
                  <tr 
                    key={emp.id || index} 
                    className={`transition ${isMe ? 'bg-blue-50/60 font-semibold' : 'hover:bg-slate-50/80'}`}
                  >
                    <td className={`py-2 px-3 sticky left-0 z-10 shadow-sm flex items-center gap-2 ${isMe ? 'bg-blue-50/90' : 'bg-white'}`}>
                      <Avatar src={emp.avatar} name={emp.name} id={emp.id} size="xs" shape="circle" />
                      <div className="truncate">
                        <div className="font-bold truncate text-[11px] flex items-center gap-1">
                          <span>{emp.name}</span>
                          {isMe && (
                            <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.2 rounded font-bold">
                              Tôi
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">{emp.id}</div>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center text-[10px] text-slate-500 whitespace-nowrap">{emp.department}</td>
                    <td className="py-2 px-2 text-center font-bold text-blue-700 bg-blue-50/20">{workDays}.0 / {standardWorkDays}</td>
                    <td className="py-2 px-2 text-center font-semibold text-amber-700 bg-amber-50/20">{lateDays}</td>
                    <td className="py-2 px-2 text-center font-semibold text-purple-700 bg-purple-50/20">{leaveDays}</td>
                    <td className="py-2 px-2 text-center font-semibold text-emerald-700 bg-emerald-50/20">{otHours}</td>
                    
                    {isHrOrCeo && (
                      <td className="py-2 px-2 text-center bg-indigo-50/20">
                        <button
                          type="button"
                          onClick={() => openModal('attendanceAdjust', { employee: emp })}
                          className="px-2 py-0.5 text-[10px] rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold cursor-pointer border border-indigo-200 transition"
                          title="Hiệu chỉnh công cho nhân viên này"
                        >
                          Sửa công
                        </button>
                      </td>
                    )}

                    {daysArray.map(day => {
                      const st = getDayStatus(day, emp.id || '');
                      return (
                        <td key={day} className="py-1 px-0.5 text-center">
                          <span className={`inline-block w-6 py-0.5 rounded text-[10px] ${st.color}`}>
                            {st.code}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            {isPersonalView 
              ? 'Bảng chấm công cá nhân của bạn được đối soát tự động từ hệ thống'
              : `Hiển thị ${filteredList.length} nhân sự • Dữ liệu chấm công đồng bộ từ PostgreSQL`}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </AppleModal>
  );
}
