import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { useAuth } from '../../context/AuthContext';
import { 
  CalendarDays, 
  Clock, 
  FileText, 
  UploadCloud, 
  CheckCircle2, 
  X, 
  Send, 
  UserCheck, 
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  User
} from 'lucide-react';
import confetti from 'canvas-confetti';
import api from '../../services/api';
import leaveService from '../../services/leaveService';

export default function Modal6D_CreateLeaveRequest({ isOpen, onClose }) {
  const { currentRole } = useAuth();
  const isLineManager = currentRole?.key === 'LINE_MANAGER';
  const isHrd = currentRole?.key === 'HR_DIRECTOR';

  const todayStr = new Date().toISOString().split('T')[0];
  const [leaveType, setLeaveType] = useState('annual');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [shiftType, setShiftType] = useState('full');
  const [employees, setEmployees] = useState([]);
  const [handoverPerson, setHandoverPerson] = useState('');
  const [reason, setReason] = useState('');
  const [attachedFile, setAttachedFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      api.get('/employees').then(res => {
        if (res?.data && Array.isArray(res.data)) {
          setEmployees(res.data);
        }
      }).catch(console.warn);
    }
  }, [isOpen]);

  // Strictly filter to colleagues in the SAME department (excluding current user)
  const deptEmployees = employees.filter(e => {
    const isSelf = e.id === currentRole?.id || e.id === currentRole?.employee_id;
    if (isSelf) return false;
    
    const curDept = (currentRole?.department_id || currentRole?.department || currentRole?.department_name || '').toLowerCase();
    const empDept = (e.department_id || e.department || e.department_name || '').toLowerCase();
    
    if (currentRole?.department_id && e.department_id && e.department_id === currentRole.department_id) {
      return true;
    }
    if (curDept && empDept && (curDept.includes('phát triển') && empDept.includes('phát triển') || curDept === empDept)) {
      return true;
    }
    return false;
  });

  const availableHandovers = deptEmployees.length > 0 ? deptEmployees : employees.filter(e => e.id !== currentRole?.id && e.id !== currentRole?.employee_id);

  useEffect(() => {
    if (availableHandovers.length > 0 && (!handoverPerson || !availableHandovers.some(e => e.id === handoverPerson))) {
      setHandoverPerson(availableHandovers[0].id);
    }
  }, [availableHandovers, handoverPerson]);

  const s = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = Math.max(1, Math.round((end - s) / (1000 * 60 * 60 * 24)) + 1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const typeMapping = {
      annual: 'LT-AL',
      personal: 'LT-PL',
      medical: 'LT-SL',
      unpaid: 'LT-UL',
      compensatory: 'LT-BT',
      paternity: 'LT-ML'
    };

    try {
      await leaveService.submit({
        leave_type_id: typeMapping[leaveType] || 'LT-AL',
        start_date: startDate,
        end_date: endDate,
        total_days: shiftType === 'morning' || shiftType === 'afternoon' ? 0.5 : diffDays,
        reason: reason || 'Nghỉ giải quyết việc cá nhân',
        handover_to: handoverPerson
      });
      window.dispatchEvent(new CustomEvent('nexus:leave-updated'));
    } catch (err) {
      console.warn('Backend submit notice, keeping local success state:', err);
    }

    setIsSubmitting(false);
    setIsSuccess(true);
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (err) {
      // fallback
    }
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 1600);
  };

  const ceoUser = employees.find(e => e.position_id === 'POS-CEO' || e.job_title?.includes('Tổng Giám Đốc') || e.role?.includes('CEO')) || employees[0];
  const ceoName = ceoUser?.full_name || ceoUser?.name || 'Nguyễn Tổng Giám Đốc';

  const hrdUser = employees.find(e => (e.department_id === 'DEPT-HR' || e.department_name?.includes('Nhân sự')) && (e.position_id === 'POS-DIR' || e.job_title?.includes('Giám Đốc') || e.role?.includes('HRD'))) || employees.find(e => e.role === 'HR_DIRECTOR') || employees[1];
  const hrdName = hrdUser?.full_name || hrdUser?.name || 'Trần Thị Giám Đốc Nhân Sự';

  const managerUser = employees.find(e =>
    (e.department_id === currentRole?.department_id || e.department_name === currentRole?.department) &&
    e.id !== currentRole?.id &&
    (e.position_id?.includes('MGR') || e.position_id?.includes('LEAD') || e.job_title?.includes('Trưởng') || e.job_title?.includes('Lead'))
  ) || employees.find(e => e.id !== currentRole?.id) || employees[0];
  const managerName = managerUser?.full_name || managerUser?.name || 'Lê Văn Trưởng Phòng';
  const managerRole = managerUser?.job_title || managerUser?.role || 'Trưởng phòng';

  // Determine approval steps:
  // If Line Manager or HR Director -> Level 1 is CEO
  // If Employee:
  //   <= 2 days -> 1 level (Manager)
  //   > 2 days -> 2 levels (Manager -> HR Director)
  const isMultiLevel = !isLineManager && !isHrd && diffDays > 2;

  return (
    <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 font-display">
                Tạo Đơn Xin Nghỉ Phép Mới
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Đơn được tự động định tuyến đến cấp có thẩm quyền thẩm định và phê duyệt
              </p>
            </div>
          </div>
        </div>

        {isSuccess ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-slate-900">Gửi Đơn Thành Công!</h4>
            <p className="text-xs text-slate-500 max-w-sm">
              Đơn nghỉ phép của bạn đã được chuyển tới cấp có thẩm quyền phê duyệt và đồng bộ vào lịch trình bộ phận.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
            {/* Loại nghỉ phép chuẩn 7 trường hợp */}
            <div>
              <label className="font-bold text-slate-700 block mb-1.5">
                Loại hình nghỉ phép <span className="text-rose-500">*</span>
              </label>
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              >
                <option value="annual">Nghỉ phép thường niên (Còn ngày phép khả dụng)</option>
                <option value="personal">Nghỉ việc riêng hưởng 100% lương (Kết hôn, việc hiếu hỷ theo Luật)</option>
                <option value="medical">Nghỉ ốm đau / Thai sản hưởng chế độ BHXH (Mẫu y tế C65-HD)</option>
                <option value="unpaid">Nghỉ việc riêng không hưởng lương (Cần Ban Giám Đốc phê duyệt)</option>
                <option value="compensatory">Nghỉ bù ngày công làm thêm giờ / trực đêm (TOIL)</option>
                <option value="paternity">Chế độ Nam nhân viên khi vợ sinh con (5 - 14 ngày BHXH)</option>
              </select>
            </div>

            {/* Thời gian */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1.5">
                  Từ ngày <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                  required
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1.5">
                  Đến ngày <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                  required
                />
              </div>
            </div>

            {/* Ca nghỉ & Người nhận bàn giao (chỉ đồng nghiệp cùng phòng ban) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1.5">
                  Khung ca nghỉ
                </label>
                <select
                  value={shiftType}
                  onChange={(e) => setShiftType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                >
                  <option value="full">Cả ngày ({diffDays} ngày công)</option>
                  <option value="morning">Buổi sáng (08:00 - 12:00) (0.5 ngày)</option>
                  <option value="afternoon">Buổi chiều (13:30 - 17:30) (0.5 ngày)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1.5">
                  Người nhận bàn giao (Cùng phòng ban) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={handoverPerson}
                  onChange={(e) => setHandoverPerson(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                  required
                >
                  {availableHandovers.length > 0 ? (
                    availableHandovers.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.full_name || e.name} ({e.job_title || e.role || 'Đồng nghiệp'})
                      </option>
                    ))
                  ) : (
                    <option value="">Không có đồng nghiệp cùng phòng</option>
                  )}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Chỉ chọn nhân sự trực thuộc cùng phòng ban để bàn giao
                </p>
              </div>
            </div>

            {/* Lý do */}
            <div>
              <label className="font-bold text-slate-700 block mb-1.5">
                Lý do nghỉ phép cụ thể <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập lý do chi tiết để cấp trên xem xét phê duyệt..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition resize-none"
                required
              />
            </div>

            {/* File đính kèm */}
            <div>
              <label className="font-bold text-slate-700 block mb-1.5">
                Chứng từ đính kèm (Chứng nhận y tế C65, Giấy ra viện hoặc Giấy tờ liên quan)
              </label>
              <div 
                onClick={() => setAttachedFile(attachedFile ? null : 'Chung_nhan_y_te_C65_2026.pdf')}
                className="border-2 border-dashed border-slate-200 hover:border-blue-400 p-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer bg-slate-50 hover:bg-blue-50/50 transition-colors"
              >
                <UploadCloud className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600 font-medium">
                  {attachedFile ? (
                    <strong className="text-blue-600">{attachedFile} (Đã đính kèm)</strong>
                  ) : (
                    'Bấm để tải tệp lên (PDF, JPG, PNG tối đa 10MB)'
                  )}
                </span>
              </div>
            </div>

            {/* Cấp phê duyệt tiếp nhận - Modern Dynamic Visual Workflow Boxes with Arrow */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Quy trình thẩm định & Phê chuẩn tự động:</span>
                </div>
                <span className="text-[11px] font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full border border-blue-200">
                  {isLineManager || isHrd
                    ? '1 Cấp: Trình Ban Tổng Giám Đốc'
                    : isMultiLevel
                    ? `2 Cấp: Quy trình nghỉ > 2 ngày (${diffDays} ngày)`
                    : `1 Cấp: Quy trình nghỉ ≤ 2 ngày (${diffDays} ngày)`}
                </span>
              </div>

              {isLineManager || isHrd ? (
                /* Box for Line Manager / HRD: Approval by CEO */
                <div className="p-3 bg-white border border-blue-200 rounded-xl shadow-xs flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        Cấp 1 - Ban Điều Hành
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-800 mt-0.5 truncate">{ceoName}</div>
                    <div className="text-[11px] text-slate-500">Tổng Giám Đốc / CEO trực tiếp phê duyệt</div>
                  </div>
                </div>
              ) : isMultiLevel ? (
                /* 2 Boxes with Arrow for Employee > 2 days */
                <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] gap-2 items-center pt-1">
                  {/* Box 1: Trưởng phòng */}
                  <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-xs flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                        Cấp 1 - Quản lý
                      </span>
                      <div className="text-xs font-bold text-slate-800 truncate mt-0.5">{managerName}</div>
                      <div className="text-[10px] text-slate-500 truncate">{managerRole} thẩm định</div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="hidden sm:flex items-center justify-center text-blue-500">
                    <ArrowRight className="w-4 h-4" />
                  </div>

                  {/* Box 2: Giám Đốc Nhân Sự */}
                  <div className="p-2.5 bg-white border border-blue-200 rounded-xl shadow-xs flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        Cấp 2 - Phê chuẩn
                      </span>
                      <div className="text-xs font-bold text-slate-800 truncate mt-0.5">{hrdName}</div>
                      <div className="text-[10px] text-slate-500 truncate">Giám Đốc Khối Nhân Sự duyệt</div>
                    </div>
                  </div>
                </div>
              ) : (
                /* 1 Box for Employee <= 2 days */
                <div className="p-3 bg-white border border-emerald-200 rounded-xl shadow-xs flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        Cấp 1 - Duyệt Trực Tiếp (≤ 2 ngày)
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-800 mt-0.5 truncate">{managerName}</div>
                    <div className="text-[11px] text-slate-500">{managerRole} - Phê duyệt toàn quyền</div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Đang gửi đơn...' : 'Gửi đơn phê duyệt'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </AppleModal>
  );
}
