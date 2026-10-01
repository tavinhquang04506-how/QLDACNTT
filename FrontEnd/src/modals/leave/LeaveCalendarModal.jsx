import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Filter, Users, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import leaveService from '../../services/leaveService';

export default function Modal6A_LeaveCalendar({ isOpen, onClose, payload }) {
  const { currentRole } = useAuth();
  const [currentView, setCurrentView] = useState('month'); // 'list', 'month', 'gantt'
  const [selectedDept, setSelectedDept] = useState('Tất cả');
  const [dbLeaves, setDbLeaves] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    if (payload?.leaves && Array.isArray(payload.leaves) && payload.leaves.length > 0) {
      setDbLeaves(payload.leaves);
    } else {
      leaveService.getAll().then(res => {
        const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : (res?.data?.data || []));
        setDbLeaves(list);
      }).catch(console.warn);
    }
  }, [isOpen, payload]);

  const isStaff = currentRole?.key === 'EMPLOYEE';
  const isManager = currentRole?.key === 'LINE_MANAGER';
  const isHrOrCeo = currentRole?.key === 'CEO' || currentRole?.key === 'HR_DIRECTOR';

  // Real leaves mapped to calendar events
  const allLeaveEvents = dbLeaves.map(l => {
    const sDate = new Date(l.start_date || Date.now());
    const day = sDate.getDate();
    const isSick = (l.leave_type_name && l.leave_type_name.toLowerCase().includes('ốm')) || (l.leave_type_id === 'LT-SL');
    return {
      day,
      name: l.full_name || l.name || 'Nhân sự',
      department: l.department_name || l.department || 'Phòng Kỹ thuật Phần mềm',
      type: l.leave_type_name || 'Nghỉ phép',
      color: isSick ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-blue-100 text-blue-800 border-blue-200'
    };
  });

  // If staff or manager, only show their department members
  const leaveEvents = (isStaff || isManager)
    ? allLeaveEvents.filter(e => e.department.includes('Phần mềm') || e.department.includes('Kỹ thuật'))
    : selectedDept === 'Tất cả'
    ? allLeaveEvents
    : allLeaveEvents.filter(e => e.department === selectedDept);

  const calendarDays = [];
  // Sep 2026 1st is Tuesday (day of week 2), so 1 blank for Monday
  calendarDays.push({ blank: true });
  for (let i = 1; i <= 30; i++) {
    calendarDays.push({ day: i, events: leaveEvents.filter(e => e.day === i) });
  }

  const dynamicListRecords = dbLeaves.map((l, idx) => {
    const sDate = new Date(l.start_date || Date.now());
    const eDate = new Date(l.end_date || l.start_date || Date.now());
    const isSick = (l.leave_type_name && l.leave_type_name.toLowerCase().includes('ốm')) || (l.leave_type_id === 'LT-SL');
    return {
      id: l.id || `LP-2026-${100 + idx}`,
      name: l.full_name || l.name || 'Nhân sự',
      role: l.job_title || 'Kỹ sư Phần mềm',
      department: l.department_name || 'Kỹ thuật Phần mềm',
      type: l.leave_type_name || 'Nghỉ phép',
      typeColor: isSick ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-blue-50 text-blue-700 border-blue-200',
      barColor: isSick ? 'bg-rose-500' : 'bg-blue-500',
      startDay: sDate.getDate(),
      endDay: eDate.getDate(),
      range: `${sDate.toLocaleDateString('vi-VN')} - ${eDate.toLocaleDateString('vi-VN')} (${l.total_days || 1} ngày)`,
      reason: l.reason || 'Nghỉ phép theo chế độ',
      handover: l.handover_to || 'Đồng nghiệp cùng Squad',
      status: l.stage === 'DA_PHE_DUYET' ? 'Đã duyệt' : l.stage === 'CHO_TRUONG_PHONG_DUYET' ? 'Chờ duyệt' : 'Đang xử lý'
    };
  });

  const leaveListRecords = dynamicListRecords;

  const filteredRecords = (isStaff || isManager)
    ? leaveListRecords.filter(r => r.department.includes('Phần mềm') || r.department.includes('Kỹ thuật'))
    : selectedDept === 'Tất cả'
    ? leaveListRecords
    : leaveListRecords.filter(r => r.department === selectedDept);

  return (
    <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-5xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  {isStaff || isManager ? 'Lịch nghỉ phép bộ phận Kỹ thuật Phần mềm' : 'Lịch nghỉ phép toàn công ty'}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  Tháng 09/2026
                </span>
                {(isStaff || isManager) && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Nội bộ phòng ban
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {isStaff || isManager 
                  ? 'Kế hoạch vắng mặt và phân bổ nguồn lực đội ngũ kỹ thuật'
                  : 'Kế hoạch vắng mặt và phân bổ nguồn lực các phòng ban'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View switcher: 2 modes */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => setCurrentView('month')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                  currentView === 'month' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Lịch tháng
              </button>
              <button
                type="button"
                onClick={() => setCurrentView('list')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                  currentView === 'list' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Danh sách
              </button>
            </div>
          </div>
        </div>

        {/* Legend & Filter Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Bộ phận:</span>
            {isHrOrCeo ? (
              <select
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value)}
                className="bg-white border border-slate-200 px-3 py-1 rounded-lg font-medium text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="Tất cả">Tất cả phòng ban</option>
                <option value="Kỹ thuật Phần mềm">Kỹ thuật Phần mềm</option>
                <option value="Kinh doanh và Tiếp thị">Kinh doanh và Tiếp thị</option>
                <option value="Tài chính Kế toán">Tài chính Kế toán</option>
              </select>
            ) : (
              <span className="bg-white border border-blue-200 text-blue-700 font-bold px-3 py-1 rounded-lg">
                Kỹ thuật Phần mềm
              </span>
            )}
          </div>

          {/* Color Legend */}
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-slate-600">Phép năm</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-slate-600">Ốm đau C65</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-slate-600">Khám sức khỏe</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-slate-600">Việc riêng</span>
            </span>
          </div>
        </div>

        {/* ==================================================== */}
        {/* CHẾ ĐỘ 1: LỊCH THÁNG (GRID TỜ LỊCH BÀN 30 Ô VUÔNG) */}
        {/* ==================================================== */}
        {currentView === 'month' && (
          <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 bg-slate-100 text-slate-700 text-xs font-bold text-center py-2.5 border-b border-slate-200">
              <div>Thứ Hai</div>
              <div>Thứ Ba</div>
              <div>Thứ Tư</div>
              <div>Thứ Năm</div>
              <div>Thứ Sáu</div>
              <div className="text-slate-400">Thứ Bảy</div>
              <div className="text-slate-400">Chủ Nhật</div>
            </div>

            {/* Day Cells */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 bg-white min-h-[360px]">
              {calendarDays.map((cell, idx) => {
                if (cell.blank) {
                  return <div key={`blank-${idx}`} className="bg-slate-50/50 p-2 min-h-[70px]" />;
                }
                const isToday = cell.day === 14;
                const isWeekend = (idx % 7 === 5) || (idx % 7 === 6);
                return (
                  <div
                    key={cell.day}
                    className={`p-2 min-h-[72px] transition ${
                      isToday ? 'bg-blue-50/30' : isWeekend ? 'bg-slate-50/40' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold ${
                          isToday
                            ? 'w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold'
                            : isWeekend
                            ? 'text-slate-400'
                            : 'text-slate-700'
                        }`}
                      >
                        {cell.day}
                      </span>
                      {cell.events.length > 0 && (
                        <span className="text-[10px] font-bold text-slate-400">{cell.events.length}</span>
                      )}
                    </div>

                    {/* Events list */}
                    <div className="mt-1 space-y-1">
                      {cell.events.map((ev, evIdx) => (
                        <div
                          key={evIdx}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold truncate border ${ev.color}`}
                          title={`${ev.name} - ${ev.type}`}
                        >
                          {ev.name}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* CHẾ ĐỘ 2: DANH SÁCH (BẢNG THỐNG KÊ CHI TIẾT CÁC LƯỢT NGHỈ) */}
        {/* ==================================================== */}
        {currentView === 'list' && (
          <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Mã đơn</th>
                  <th className="py-3 px-4">Nhân sự</th>
                  <th className="py-3 px-4">Phòng ban</th>
                  <th className="py-3 px-4">Loại nghỉ phép</th>
                  <th className="py-3 px-4">Thời gian nghỉ</th>
                  <th className="py-3 px-4">Người nhận bàn giao</th>
                  <th className="py-3 px-4 text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Không có lịch nghỉ phép nào được ghi nhận trong danh sách.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-blue-700">
                        {item.id}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{item.name}</div>
                        <div className="text-[11px] text-slate-500">{item.role}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {item.department}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${item.typeColor}`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-800">
                        {item.range}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {item.handover}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200">
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppleModal>
  );
}
