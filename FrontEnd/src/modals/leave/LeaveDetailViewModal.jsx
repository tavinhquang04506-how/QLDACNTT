import React, { useState } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import Avatar from '../../components/common/Avatar';
import { 
  CalendarDays, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  FileText, 
  UserCheck, 
  AlertTriangle, 
  ShieldCheck, 
  Download, 
  Eye, 
  Send, 
  CheckCheck,
  Building2,
  ArrowRight,
  Printer
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAuth } from '../../context/AuthContext';

export default function LeaveDetailViewModal({ isOpen, onClose, payload, onApprove, onReject }) {
  const { currentRole } = useAuth();
  const isStaff = currentRole?.key === 'EMPLOYEE';
  const isApprover = currentRole?.key === 'LINE_MANAGER' || currentRole?.key === 'HR_DIRECTOR' || currentRole?.key === 'CEO';

  const [managerNote, setManagerNote] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionDone, setActionDone] = useState(null); // 'approved' | 'rejected'
  const [showDocPreview, setShowDocPreview] = useState(false);

  // Safe defaults if payload is empty
  const item = payload || {
    id: '',
    employeeName: '',
    employeeId: '',
    employeeRole: '',
    employeeDept: '',
    leaveType: '',
    category: 'personal',
    range: '',
    shiftType: '',
    daysCount: 0,
    reason: '',
    handoverPerson: '',
    handoverNote: '',
    submittedAt: '',
    remainingQuota: 0,
    status: 'pending',
    statusLabel: '',
    approvalType: 'one_level',
    approver: '',
    attachedFile: '',
    conflictWarning: '',
    timeline: []
  };

  const handleApproveAction = () => {
    setActionDone('approved');
    try {
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
    } catch (e) {}
    onApprove?.(item.id, managerNote);
    setTimeout(() => {
      onClose();
      setActionDone(null);
    }, 1200);
  };

  const handleRejectAction = () => {
    if (!rejectReason.trim()) return;
    setActionDone('rejected');
    onReject?.(item.id, rejectReason);
    setTimeout(() => {
      onClose();
      setActionDone(null);
      setIsRejecting(false);
    }, 1200);
  };

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Hồ Sơ Đơn Nghỉ Phép: ${item.id}`}
      subtitle={`Chi tiết đơn xin nghỉ phép, minh chứng đính kèm và tiến trình phê duyệt`}
      badge={
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
          item.status === 'approved' || actionDone === 'approved'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : item.status === 'rejected' || actionDone === 'rejected'
            ? 'bg-rose-50 text-rose-700 border-rose-200'
            : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          {actionDone === 'approved'
            ? 'Đã duyệt thành công'
            : actionDone === 'rejected'
            ? 'Đã từ chối đơn'
            : item.statusLabel || (item.status === 'approved' ? 'Đã phê duyệt' : 'Chờ phê duyệt')}
        </span>
      }
      maxWidth="max-w-4xl"
    >
      <div className="p-6 space-y-5 text-xs text-slate-800">
        {/* Banner người làm đơn */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Avatar
              src={item.employeeAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
              name={item.employeeName || 'Nhân viên'}
              id={item.employeeId || 'NV-0000'}
              size="lg"
              shape="rounded"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900 font-display">
                  {item.employeeName}
                </h3>
                <span className="font-mono font-bold text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {item.employeeId}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {item.employeeDept || 'Phòng Phát triển Phần mềm'}
                </span>
              </div>
              <p className="text-slate-600 mt-0.5 text-xs">
                {item.employeeRole || 'Kỹ sư Phần mềm'}
              </p>
              <div className="flex items-center gap-3 text-slate-400 text-[11px] mt-1">
                <span>Nộp đơn lúc: <strong className="text-slate-700">{item.submittedAt}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <div className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-center min-w-[100px]">
              <div className="text-[10px] text-slate-500 font-medium">Quỹ phép năm</div>
              <div className="text-sm font-bold text-blue-700 font-mono">
                Còn {item.remainingQuota ?? 9} / 12 ngày
              </div>
            </div>
          </div>
        </div>

        {/* Thông tin chi tiết đơn xin nghỉ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Cột trái: Loại nghỉ & Thời gian */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
            <h4 className="font-bold text-slate-900 uppercase text-[11px] pb-1 border-b border-slate-100 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-blue-600" />
              <span>Thời gian và Hình thức nghỉ</span>
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between items-baseline gap-3">
                <span className="text-slate-500 shrink-0">Loại hình nghỉ:</span>
                <span className="font-semibold text-slate-900 text-right">
                  {item.type || item.leaveType}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Thời gian nghỉ:</span>
                <span className="font-bold text-blue-700 font-mono">
                  {item.range}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Khung ca nghỉ:</span>
                <span className="text-slate-800 font-medium">
                  {item.shiftType || 'Cả ngày (1.0 ngày công)'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Cơ chế tính lương:</span>
                <span className={`font-semibold text-[11px] px-2 py-0.5 rounded ${
                  item.leaveType?.includes('không hưởng lương')
                    ? 'bg-amber-50 text-amber-800'
                    : item.leaveType?.includes('BHXH')
                    ? 'bg-purple-50 text-purple-800'
                    : 'bg-emerald-50 text-emerald-800'
                }`}>
                  {item.leaveType?.includes('không hưởng lương')
                    ? 'Nghỉ không lương (Trừ công tháng)'
                    : item.leaveType?.includes('BHXH')
                    ? 'Hưởng trợ cấp BHXH theo Luật'
                    : 'Hưởng nguyên 100% lương'}
                </span>
              </div>
            </div>
          </div>

          {/* Cột phải: Bàn giao & Lý do */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
            <h4 className="font-bold text-slate-900 uppercase text-[11px] pb-1 border-b border-slate-100 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Bàn giao và Lý do cụ thể</span>
            </h4>
            <div className="space-y-2">
              <div>
                <span className="text-slate-500 block mb-0.5">Người nhận bàn giao công việc:</span>
                <span className="font-bold text-slate-800">
                  {item.handoverPerson || item.handover_person || item.handover_to || 'Đồng nghiệp trong bộ phận'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Nội dung đã bàn giao:</span>
                <p className="text-slate-700 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                  "{item.handoverNote || item.conflictCheck || 'Đã bàn giao task Jira và thông báo với các thành viên trong squad'}"
                </p>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Lý do nghỉ phép:</span>
                <p className="text-slate-900 font-medium">
                  {item.reason}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Minh chứng chứng từ đính kèm (File Attachment) */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                FILE
              </div>
              <div>
                <div className="font-bold text-slate-900 text-xs">
                  {item.attachedFile || (item.leaveType?.includes('BHXH') ? 'Giay_ra_vien_chung_nhan_C65.pdf' : 'Bien_ban_ban_giao_cong_viec.pdf')}
                </div>
                <div className="text-[11px] text-slate-500">
                  Dung lượng: 1.8 MB • Tải lên lúc {item.submittedAt} • Đã quét an toàn virus
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDocPreview(!showDocPreview)}
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Eye className="w-3.5 h-3.5 text-blue-600" />
                <span>{showDocPreview ? 'Ẩn xem trước' : 'Xem chứng từ đính kèm'}</span>
              </button>
            </div>
          </div>

          {/* Khung xem trước chứng từ đính kèm */}
          {showDocPreview && (
            <div className="mt-3 p-4 bg-white border border-blue-200 rounded-xl space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Bản Scan Minh Chứng Kèm Đơn (Có giá trị xác thực)
                </span>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium border border-emerald-200">
                  Hợp lệ
                </span>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg text-center space-y-2 font-admin border border-dashed border-slate-300">
                <p className="font-bold uppercase text-xs text-slate-900">
                  {item.leaveType?.includes('BHXH') 
                    ? 'GIẤY CHỨNG NHẬN NGHỈ VIỆC HƯỞNG BẢO HIỂM XÃ HỘI (MẪU C65-HD)'
                    : 'GIẤY XÁC NHẬN CHẾ ĐỘ NGHỈ VIỆC VÀ BÀN GIAO'}
                </p>
                <p className="text-[11px] text-slate-600">
                  Cấp cho: <strong>{item.employeeName}</strong> • Mã nhân viên: <strong>{item.employeeId}</strong>
                </p>
                <p className="text-[11px] text-slate-600">
                  Cơ quan xác nhận: {item.leaveType?.includes('BHXH') ? 'Bệnh viện Đa khoa Quốc tế Vinmec' : 'Văn phòng Điều hành Nexus Technologies'}
                </p>
                <div className="w-20 h-20 rounded-full border border-rose-400 bg-rose-50/50 mx-auto flex flex-col items-center justify-center text-[7px] font-bold text-rose-700 rotate-[-5deg]">
                  <span>ĐÃ CHỨNG THỰC</span>
                  <span>12-09-2026</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cảnh báo phân bổ nhân sự (Conflict Alert) */}
        <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-900">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold">Đánh giá tác động tiến độ (Workload Analysis): </span>
            {item.conflictWarning || 'Trong thời gian này, quân số của bộ phận đảm bảo trên 80%. Không có đồng nghiệp cùng phụ trách tính năng then chốt nghỉ trùng ngày.'}
          </div>
        </div>

        {/* Tiến trình phê duyệt nhiều cấp (Approval Flow Stepper) */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
          <h4 className="font-bold text-slate-900 uppercase text-[11px] pb-1 border-b border-slate-100 flex items-center justify-between">
            <span>Tiến trình luồng duyệt (Approval Workflow)</span>
            <span className="text-[10px] text-slate-500 font-normal">
              {item.approvalType === 'two_level' ? 'Quy trình 2 cấp: Trưởng phòng -> CEO' : 'Quy trình thẩm quyền chuẩn hóa'}
            </span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {/* Bước 1 */}
            <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Bước 1: Nộp đơn</span>
              </div>
              <p className="text-slate-800 font-medium">{item.employeeName}</p>
              <p className="text-[10px] text-slate-500">{item.submittedAt}</p>
            </div>

            {/* Bước 2 */}
            <div className={`p-3 rounded-lg border space-y-1 ${
              item.status === 'approved' || actionDone === 'approved'
                ? 'bg-emerald-50/70 border-emerald-200'
                : 'bg-blue-50/70 border-blue-200'
            }`}>
              <div className={`flex items-center gap-1.5 font-bold text-[11px] ${
                item.status === 'approved' || actionDone === 'approved' ? 'text-emerald-700' : 'text-blue-700'
              }`}>
                {item.status === 'approved' || actionDone === 'approved' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                <span>Bước 2: Trưởng phòng duyệt</span>
              </div>
              <p className="text-slate-800 font-medium">{item.manager_approver_name || item.approver || 'Trưởng bộ phận'}</p>
              <p className="text-[10px] text-slate-500">
                {item.status === 'approved' || actionDone === 'approved' ? 'Đã thẩm duyệt hợp lệ' : 'Đang chờ xem xét'}
              </p>
            </div>

            {/* Bước 3 */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-500 font-bold text-[11px]">
                <Clock className="w-3.5 h-3.5" />
                <span>Bước 3: HRD quyết toán công</span>
              </div>
              <p className="text-slate-800 font-medium">{item.hr_approver_name || 'Phòng Nhân sự (HRD)'}</p>
              <p className="text-[10px] text-slate-500">Đồng bộ tự động vào bảng lương</p>
            </div>
          </div>
        </div>

        {/* Lời ghi chú phê duyệt (nếu đã duyệt trước đó) */}
        {item.approvalNote && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs space-y-1">
            <span className="font-bold text-blue-900">Ghi chú của người duyệt ({item.approver}):</span>
            <p className="text-blue-800 italic">"{item.approvalNote}"</p>
          </div>
        )}

        {/* Box nhập lý do từ chối khi bấm Từ chối */}
        {isRejecting && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2.5 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
              <XCircle className="w-4 h-4 text-rose-600" />
              <span>Nhập lý do từ chối đơn để phản hồi tới nhân viên:</span>
            </div>
            <textarea
              rows={2}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="VD: Trùng lịch phát hành Sprint Demo hoặc thời gian này team đang thiếu nhân lực..."
              className="w-full p-2.5 bg-white border border-rose-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRejecting(false)}
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium rounded-lg text-xs transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleRejectAction}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs transition cursor-pointer shadow-sm"
              >
                Xác nhận từ chối đơn
              </button>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        {(!isStaff && isApprover && item.status === 'pending' && !isRejecting && !actionDone) ? (
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsRejecting(true)}
              className="px-4 py-2 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Từ chối đơn
            </button>

            <button
              type="button"
              onClick={handleApproveAction}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {item.approvalType === 'two_level'
                  ? 'Xác nhận và Chuyển Tổng Giám Đốc phê duyệt'
                  : 'Phê duyệt đơn nghỉ phép'}
              </span>
            </button>
          </div>
        ) : isStaff && item.status === 'pending' ? (
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Đơn nghỉ phép đang chờ Trưởng bộ phận xét duyệt theo đúng thẩm quyền. Bạn sẽ nhận thông báo khi có kết quả.</span>
            </div>
          </div>
        ) : null}
      </div>
    </AppleModal>
  );
}
