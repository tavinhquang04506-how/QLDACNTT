import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { 
  Clock, 
  Calendar, 
  Save, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  User, 
  FileEdit,
  X
} from 'lucide-react';
import attendanceService from '../../services/attendanceService';
import employeeService from '../../services/employeeService';
import confetti from 'canvas-confetti';

export default function AttendanceAdjustModal({ isOpen, onClose, payload, onAdjustSuccess }) {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0]);
  const [checkInTime, setCheckInTime] = useState('08:00');
  const [checkOutTime, setCheckOutTime] = useState('17:00');
  const [status, setStatus] = useState('DUNG_GIO');
  const [note, setNote] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function loadEmployees() {
      try {
        const res = await employeeService.getAll();
        if (res && res.success && Array.isArray(res.data) && isMounted) {
          setEmployees(res.data);
          if (!employeeId && res.data.length > 0) {
            setEmployeeId(payload?.employee_id || payload?.employeeId || res.data[0].id);
          }
        }
      } catch (e) {
        console.warn('Load employees notice:', e);
      }
    }
    if (isOpen) {
      loadEmployees();
      if (payload?.employee_id || payload?.employeeId) {
        setEmployeeId(payload.employee_id || payload.employeeId);
      }
      if (payload?.date || payload?.work_date) {
        setWorkDate(payload.date || payload.work_date);
      }
      setErrorMsg('');
      setSuccessMsg('');
    }
    return () => { isMounted = false; };
  }, [isOpen, payload]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!employeeId) {
      setErrorMsg('Vui lòng chọn nhân viên cần điều chỉnh công');
      return;
    }
    if (!workDate) {
      setErrorMsg('Vui lòng chọn ngày làm việc');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const checkInIso = checkInTime ? `${workDate}T${checkInTime}:00+07:00` : null;
      const checkOutIso = checkOutTime ? `${workDate}T${checkOutTime}:00+07:00` : null;

      const data = {
        employeeId,
        workDate,
        checkIn: checkInIso,
        checkOut: checkOutIso,
        status,
        note: note.trim() || 'HR điều chỉnh công thủ công',
      };

      const res = await attendanceService.adjust(data);
      if (res && (res.success || res.data)) {
        setSuccessMsg('Đã điều chỉnh dữ liệu chấm công thành công!');
        try {
          confetti({
            particleCount: 40,
            spread: 60,
            origin: { y: 0.6 }
          });
        } catch (e) {}

        if (onAdjustSuccess) {
          onAdjustSuccess(res.data);
        }
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        setErrorMsg(res?.message || 'Không thể điều chỉnh công');
      }
    } catch (err) {
      console.warn('Attendance adjust error:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Lỗi khi cập nhật dữ liệu chấm công');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-xl">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <FileEdit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 font-display">
                Điều Chỉnh Chấm Công Thủ Công
              </h3>
              <p className="text-xs text-slate-500">
                Dành cho HR & Quản lý: Hiệu chỉnh giờ vào, giờ ra và trạng thái công của nhân viên
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nhân viên */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Chọn nhân viên:</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full h-10 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-600 outline-none transition"
              required
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name || emp.name} ({emp.id}) • {emp.job_title || emp.department_name || 'Nhân sự'}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Ngày công */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Ngày làm việc:</label>
              <input
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="w-full h-10 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-600 outline-none transition"
                required
              />
            </div>

            {/* Trạng thái */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Trạng thái công:</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full h-10 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-600 outline-none transition"
              >
                <option value="DUNG_GIO">Đúng giờ (Hợp lệ)</option>
                <option value="DI_MUON">Đi muộn</option>
                <option value="VE_SOM">Về sớm</option>
                <option value="NGHI_PHEP">Nghỉ phép có lương</option>
                <option value="CONG_TAC">Đi công tác ngoài</option>
                <option value="VANG_MAT">Vắng mặt không lương</option>
              </select>
            </div>

            {/* Giờ vào ca */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Giờ vào ca (Check-in):</label>
              <input
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                className="w-full h-10 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-600 outline-none transition"
              />
            </div>

            {/* Giờ ra ca */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Giờ ra ca (Check-out):</label>
              <input
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                className="w-full h-10 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-600 outline-none transition"
              />
            </div>
          </div>

          {/* Ghi chú lý do */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Lý do điều chỉnh:</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: Nhân viên đi công tác đối tác theo lệnh điều động, quên quét FaceID tại cổng..."
              className="w-full p-2.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-600 outline-none transition"
              required
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{loading ? 'Đang lưu...' : 'Lưu Điều Chỉnh Chấm Công'}</span>
            </button>
          </div>
        </form>
      </div>
    </AppleModal>
  );
}
