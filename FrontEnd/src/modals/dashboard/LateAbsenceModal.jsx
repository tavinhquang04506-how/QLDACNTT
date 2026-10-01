import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import Avatar from '../../components/common/Avatar';
import { AVATAR_SEEDS } from '../../utils/avatarUtils';
import { Search, Clock, Send, CheckCircle2, AlertTriangle, User, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import attendanceService from '../../services/attendanceService';

export default function LateAbsenceModal({ isOpen, onClose }) {
  const [lateEmployees, setLateEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [remindedIds, setRemindedIds] = useState([]);

  useEffect(() => {
    let isMounted = true;
    async function loadExceptions() {
      if (!isOpen) return;
      setLoading(true);
      try {
        const res = await attendanceService.getExceptions();
        if (isMounted && res) {
          const rawList = res.late || (Array.isArray(res.data) ? res.data : []);
          const normalized = rawList.map(item => ({
            id: item.employee_id || item.id || 'NV-0000',
            name: item.full_name || item.name || 'Nhân viên',
            department: item.department_name || item.department_id || item.department || 'Nhân sự',
            gate: item.gate || item.check_in_method || 'Cổng A1',
            time: item.check_in_time ? new Date(item.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : (item.time || '08:15 AM'),
            lateMinutes: Number(item.late_minutes ?? item.lateMinutes ?? 0),
            reason: item.reason || (item.late_minutes ? `Đi muộn ${item.late_minutes} phút` : 'Ghi nhận tự động'),
            avatar: item.avatar_url || item.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
          }));
          setLateEmployees(normalized);
        }
      } catch (e) {
        if (isMounted) setLateEmployees([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadExceptions();
    return () => { isMounted = false; };
  }, [isOpen]);

  const handleSendReminder = (id) => {
    setRemindedIds((prev) => [...prev, id]);
    try {
      confetti({ particleCount: 30, spread: 45, origin: { y: 0.6 } });
    } catch (e) {}
  };

  const filteredList = lateEmployees.filter(
    (emp) =>
      emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.department?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Chi tiết Danh sách Đi trễ và Vắng mặt hôm nay"
      subtitle="Khung giờ chuẩn: 08:00 - 08:15 • Ghi nhận tự động từ hệ thống điểm danh cổng"
      badge={
        <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-amber-200">
          {filteredList.length} trường hợp
        </span>
      }
      maxWidth="max-w-3xl"
    >
      <div className="p-6 space-y-4">
        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên, mã NV, phòng ban..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex items-center gap-2 text-xs w-full sm:w-auto justify-end">
            <span className="text-slate-500">
              Đã gửi nhắc nhở: <strong className="text-amber-700">{remindedIds.length} nhân viên</strong>
            </span>
          </div>
        </div>

        {/* List of Late Employees */}
        <div className="space-y-3">
          {loading ? (
            <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              <span className="text-xs">Đang tải danh sách vi phạm chấm công...</span>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="font-bold text-slate-700 text-xs">Không có nhân viên nào đi trễ hoặc vắng mặt</p>
              <p className="text-slate-400 text-[11px]">Toàn bộ nhân sự đều check-in đúng giờ hôm nay.</p>
            </div>
          ) : (
            filteredList.map((emp) => (
            <div
              key={emp.id}
              className={`border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs transition-all ${
                emp.lateMinutes >= 30
                  ? 'bg-rose-50/40 border-rose-200'
                  : 'bg-white border-slate-200/90 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <Avatar
                  src={emp.avatar}
                  name={emp.name}
                  id={emp.id}
                  size="md"
                  shape="circle"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{emp.name}</span>
                    <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {emp.id}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                    <span>{emp.department}</span>
                    <span>•</span>
                    <span className="text-slate-700 font-semibold">{emp.gate}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 justify-between sm:justify-end">
                <div className="text-left sm:text-right">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-amber-700">{emp.time}</span>
                    <span
                      className={`font-bold text-[11px] px-2 py-0.5 rounded-full border ${
                        emp.lateMinutes >= 30
                          ? 'bg-rose-100 text-rose-800 border-rose-200'
                          : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}
                    >
                      Trễ {emp.lateMinutes} phút
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{emp.reason}</div>
                </div>

                <div className="shrink-0">
                  {remindedIds.includes(emp.id) ? (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Đã gửi
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendReminder(emp.id)}
                      className="flex items-center gap-1.5 text-xs bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Gửi nhắc nhở</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )))}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Quy định công ty: Đi trễ &gt; 15 phút sẽ trừ 0.25 công hoặc yêu cầu bù giờ cuối ca.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </AppleModal>
  );
}
