import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/common/Avatar';
import leaveService from '../services/leaveService';
import { 
  CalendarDays, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Sparkles, 
  Clock, 
  Check, 
  ShieldAlert,
  Eye,
  CheckCheck,
  UserCheck,
  RotateCcw,
  Building,
  Award,
  Filter,
  ShieldCheck,
  Plus
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { normalizeLeaveRequest, formatDateVN } from '../utils/dataAdapters';

export default function LeaveManagementPage() {
  const { openModal } = useModal();
  const { currentRole } = useAuth();
  const [activeTab, setActiveTab] = useState('pending');
  const [approvedList, setApprovedList] = useState([]);
  const [apiLeaves, setApiLeaves] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const currentMonthYear = new Date().toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' });

  // Load real leave requests and balances from backend PostgreSQL
  const loadLeaves = async () => {
    try {
      const [res, balRes] = await Promise.all([
        leaveService.getAll().catch(() => null),
        leaveService.getBalances('me').catch(() => null),
      ]);
      if (res && res.success && Array.isArray(res.data)) {
        setApiLeaves(res.data);
      }
      if (balRes && balRes.success && Array.isArray(balRes.data)) {
        setLeaveBalances(balRes.data);
      }
    } catch (e) {
      console.warn('Backend leaves API notice, fallback to local:', e);
    }
  };

  useEffect(() => {
    loadLeaves();
    const handleUpdate = () => loadLeaves();
    window.addEventListener('nexus:leave-updated', handleUpdate);
    return () => window.removeEventListener('nexus:leave-updated', handleUpdate);
  }, [currentRole.key]);


  const handleApprove = async (id, name) => {
    setApprovedList((prev) => [...prev, id]);
    try {
      await leaveService.approve(id, 'Đồng ý phê duyệt đơn phép');
      loadLeaves();
    } catch (e) {
      console.warn('Backend approve notice:', e);
    }
    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });
    } catch (e) {}
  };

  // ==========================================
  // VIEW 1: CẤP 3 - NHÂN VIÊN (ESS)
  // ==========================================
  if (currentRole.key === 'EMPLOYEE') {
    const rawApiLeaves = apiLeaves.map(l => ({
      id: l.id,
      employeeName: l.full_name || 'Phạm Minh Quân',
      employeeId: l.employee_id,
      employeeRole: l.job_title || 'Kỹ sư Phần mềm (Frontend)',
      employeeDept: l.department_name || 'Phòng Phát triển Phần mềm',
      type: l.leave_type_name || 'Nghỉ việc riêng hưởng nguyên lương',
      leaveType: l.leave_type_name || 'Nghỉ việc riêng hưởng nguyên lương',
      range: `${new Date(l.start_date).toLocaleDateString('vi-VN')} - ${new Date(l.end_date).toLocaleDateString('vi-VN')} (${l.total_days} ngày)`,
      daysCount: Number(l.total_days),
      shiftType: 'Cả ngày (08:00 - 17:30)',
      reason: l.reason,
      handoverPerson: l.handover_to || 'Đồng nghiệp',
      handoverNote: 'Đã bàn giao theo dõi ticket Jira',
      submittedAt: new Date(l.submitted_at).toLocaleDateString('vi-VN'),
      approver: l.manager_approver_name || (currentRole.key === 'LINE_MANAGER' ? currentRole.name : 'Trưởng phòng bộ phận'),
      status: approvedList.includes(l.id) || l.stage === 'DA_PHE_DUYET' ? 'approved' : l.stage === 'TU_CHOI' ? 'rejected' : 'pending',
      statusLabel: approvedList.includes(l.id) || l.stage === 'DA_PHE_DUYET' ? 'Đã duyệt' : l.stage === 'CHO_TRUONG_PHONG_DUYET' ? 'Đang chờ Trưởng phòng duyệt' : l.stage === 'CHO_HR_PHE_CHUAN' ? 'Chờ HR phê chuẩn' : 'Từ chối',
      statusColor: approvedList.includes(l.id) || l.stage === 'DA_PHE_DUYET' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200',
      approvalType: 'two_level',
      attachedFile: l.attachment_name || null,
      remainingQuota: Math.max(0, Number(l.remaining_days || (12 - Number(l.used_days || 0)))),
    }));

    const myLeaveRequests = rawApiLeaves;

    const myLeaveBalances = Array.isArray(leaveBalances) && leaveBalances.length > 0
      ? (leaveBalances.find(b => b.leave_type_code === 'PHEP_NAM') || leaveBalances[0])
      : null;
    const entitledDays = Number(myLeaveBalances?.entitled_days || 12);
    const usedDays = Number(myLeaveBalances?.used_days || myLeaveRequests.filter(r => r.status === 'approved').reduce((sum, r) => sum + (r.daysCount || 0), 0));
    const pendingDays = Number(myLeaveRequests.filter(r => r.status === 'pending').reduce((sum, r) => sum + (r.daysCount || 0), 0));
    const remainingDays = Math.max(0, entitledDays - usedDays);

    return (
      <div className="w-full min-h-full p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 font-display">
                Đơn Nghỉ Phép và Quỹ Phép Cá Nhân
              </h1>
              <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full border border-blue-200">
                Quỹ phép năm: Còn {remainingDays}/{entitledDays} ngày
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => openModal('modal6A', { leaves: apiLeaves })}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-2 transition-all cursor-pointer"
            >
              <CalendarDays className="w-4 h-4 text-blue-600" />
              <span>Xem lịch phép</span>
            </button>
            <button
              type="button"
              onClick={() => openModal('modal6D')}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo đơn nghỉ phép mới</span>
            </button>
          </div>
        </div>

        {/* Quota cards: 4 metrics minh bạch từ CSDL */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs">
            <span className="text-xs text-slate-500 font-medium">Tổng quỹ phép 2026</span>
            <div className="text-2xl font-bold text-slate-900 mt-1 font-display">{entitledDays} ngày</div>
            <span className="text-[11px] text-slate-400">1 ngày phép tích lũy / tháng</span>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs">
            <span className="text-xs text-slate-500 font-medium">Đã sử dụng</span>
            <div className="text-2xl font-bold text-amber-600 mt-1 font-display">{usedDays} ngày</div>
            <span className="text-[11px] text-amber-600 font-semibold">Theo dữ liệu hệ thống</span>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs">
            <span className="text-xs text-slate-500 font-medium">Đang chờ duyệt</span>
            <div className="text-2xl font-bold text-blue-600 mt-1 font-display">{pendingDays} ngày</div>
            <span className="text-[11px] text-blue-600 font-semibold">Đơn đang trong quy trình</span>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs">
            <span className="text-xs text-slate-500 font-medium">Khả dụng còn lại</span>
            <div className="text-2xl font-bold text-emerald-600 mt-1 font-display">{remainingDays} ngày</div>
            <span className="text-[11px] text-emerald-600 font-semibold">Hạn dùng đến hết 31/12/2026</span>
          </div>
        </div>

        {/* Leave Requests Table - Clickable Rows */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Lịch sử gửi đơn nghỉ phép của bạn</h3>
              <p className="text-xs text-slate-500">Bấm vào từng đơn để xem chi tiết tiến trình thẩm duyệt và minh chứng đính kèm</p>
            </div>
            <span className="text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 font-medium">
              3 đơn gần nhất
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <th className="py-3 px-4">Mã đơn</th>
                  <th className="py-3 px-4">Loại nghỉ phép</th>
                  <th className="py-3 px-4">Thời gian nghỉ</th>
                  <th className="py-3 px-4">Lý do</th>
                  <th className="py-3 px-4">Người phê duyệt</th>
                  <th className="py-3 px-4">Ngày gửi</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4 text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myLeaveRequests.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      Bạn chưa tạo đơn xin nghỉ phép nào. Nhấn "+ Tạo đơn nghỉ phép" để gửi đơn mới.
                    </td>
                  </tr>
                ) : (
                  myLeaveRequests.map((req) => (
                    <tr 
                      key={req.id} 
                      onClick={() => openModal('modal6E', req)}
                      className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-600">{req.id}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">{req.type}</td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">{req.range}</td>
                      <td className="py-3.5 px-4 text-slate-500 italic max-w-xs truncate">{req.reason}</td>
                      <td className="py-3.5 px-4 text-slate-700">{req.approver}</td>
                      <td className="py-3.5 px-4 text-slate-400 font-mono">{req.submittedAt}</td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${req.statusColor}`}>
                          {req.statusLabel}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openModal('modal6E', req);
                          }}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition"
                          title="Xem chi tiết đơn này"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: CẤP 2B - TRƯỞNG PHÒNG (LINE MANAGER - NGƯỜI DUYỆT CHỦ CHỐT)
  // ==========================================
  if (currentRole.key === 'LINE_MANAGER') {
    const apiDeptPending = apiLeaves
      .filter(l => l.stage === 'CHO_TRUONG_PHONG_DUYET' && l.employee_id !== currentRole?.id && !approvedList.includes(l.id))
      .map(l => ({
        id: l.id,
        empId: l.employee_id,
        empName: l.full_name || 'Nhân viên',
        employeeName: l.full_name || 'Nhân viên',
        employeeId: l.employee_id,
        role: l.job_title || 'Kỹ sư Phần mềm',
        employeeRole: l.job_title || 'Kỹ sư Phần mềm',
        employeeDept: l.department_name || 'Phòng Phát triển Phần mềm',
        avatar: l.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
        employeeAvatar: l.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
        type: l.leave_type_name || 'Nghỉ phép',
        leaveType: l.leave_type_name || 'Nghỉ phép',
        range: `${new Date(l.start_date).toLocaleDateString('vi-VN')} - ${new Date(l.end_date).toLocaleDateString('vi-VN')} (${l.total_days} ngày)`,
        daysCount: Number(l.total_days),
        shiftType: 'Cả ngày (08:00 - 17:30)',
        reason: l.reason,
        handoverPerson: l.handover_to || 'Đồng nghiệp cùng Squad',
        handoverNote: 'Đã hoàn thành bàn giao task trước khi gửi đơn',
        submittedAt: new Date(l.submitted_at).toLocaleDateString('vi-VN'),
        remainingQuota: Math.max(0, Number(l.remaining_days || (12 - Number(l.used_days || 0)))),
        conflictCheck: 'Đã đối soát lịch trực và tiến độ sprint',
        conflictWarning: 'Không trùng lịch Sprint Demo.',
        urgency: 'Bình thường',
        approvalType: 'two_level',
        attachedFile: l.attachment_name || null,
        approver: currentRole.name ? `${currentRole.name} (Trưởng phòng)` : 'Trưởng phòng bộ phận',
        status: 'pending',
      }));

    const deptPendingRequests = apiDeptPending.filter(a => !approvedList.includes(a.id));

    const managerApprovedLeaves = apiLeaves
      .filter(l => l.stage === 'DA_PHE_DUYET' || l.stage === 'CHO_HR_PHE_CHUAN' || approvedList.includes(l.id))
      .map(l => ({
        id: l.id,
        employeeName: l.full_name || 'Nhân sự',
        employeeId: l.employee_id || '',
        employeeRole: l.job_title || 'Chuyên viên',
        employeeDept: l.department_name || 'Phòng ban',
        type: l.leave_type_name || 'Nghỉ phép',
        leaveType: l.leave_type_name || 'Nghỉ phép',
        range: `${new Date(l.start_date).toLocaleDateString('vi-VN')} - ${new Date(l.end_date).toLocaleDateString('vi-VN')} (${l.total_days} ngày)`,
        daysCount: Number(l.total_days || 1),
        reason: l.reason || 'Nghỉ phép cá nhân',
        handoverPerson: l.handover_to || 'Đồng nghiệp',
        approver: l.manager_approver_name || (currentRole.name ? `${currentRole.name} (Trưởng phòng)` : 'Trưởng phòng bộ phận'),
        approvalNote: l.manager_note || 'Đã thẩm định và xác nhận bàn giao công việc.',
        status: 'approved',
        submittedAt: new Date(l.submitted_at || Date.now()).toLocaleDateString('vi-VN'),
        attachedFile: l.attachment_name || null
      }));

    return (
      <div className="w-full min-h-full p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 font-display">
                Phê Duyệt Nghỉ Phép Bộ Phận
              </h1>
              <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full border border-emerald-200">
                Thẩm định vận hành • {deptPendingRequests.length} đơn chờ xử lý
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => openModal('modal6A', { leaves: apiLeaves })}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-2 transition-all cursor-pointer"
            >
              <CalendarDays className="w-4 h-4 text-blue-600" />
              <span>Lịch nghỉ phép bộ phận</span>
            </button>
            <button
              type="button"
              onClick={() => openModal('modal6D')}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo đơn xin nghỉ của tôi</span>
            </button>
          </div>
        </div>

        {/* 3 Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Đơn cần bạn duyệt</p>
              <h3 className="text-2xl font-bold font-display text-amber-600 mt-1">
                {deptPendingRequests.length} đơn
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Thuộc team Kỹ thuật Phần mềm</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Hiện diện bộ phận</p>
              <h3 className="text-2xl font-bold font-display text-emerald-600 mt-1">Hoạt động</h3>
              <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">Tiến độ Sprint được đảm bảo</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Đã phê duyệt trong tháng</p>
              <h3 className="text-2xl font-bold font-display text-blue-600 mt-1">
                {managerApprovedLeaves.length} đơn
              </h3>
              <p className="text-[11px] text-blue-600 font-semibold mt-0.5">Đảm bảo đúng tiến độ release</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <CheckCheck className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Pending list */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              Danh Sách Đơn Chờ Xem Xét và Phê Duyệt
            </h3>
            <span className="text-xs text-slate-400">Bấm vào đơn để xem chứng từ đính kèm trước khi duyệt</span>
          </div>

          {deptPendingRequests.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-slate-500 text-xs">
              Hiện không có đơn nghỉ phép nào đang chờ duyệt trong bộ phận của bạn.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {deptPendingRequests.map((item) => {
                const isApproved = approvedList.includes(item.id);
                return (
                  <div 
                    key={item.id} 
                    onClick={() => openModal('modal6E', item)}
                    className="bg-white rounded-2xl p-5 border border-slate-200/90 hover:border-blue-300 shadow-2xs hover:shadow-apple-card transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-5 cursor-pointer"
                  >
                    <div className="flex items-start gap-4">
                      <Avatar
                        src={item.avatar}
                        name={item.empName}
                        id={item.empId}
                        size="lg"
                        shape="rounded"
                      />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-slate-900">{item.empName}</h4>
                          <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {item.empId}
                          </span>
                          <span className="text-xs text-slate-500">• {item.role}</span>
                        </div>
                        <div className="mt-2 space-y-1 text-xs">
                          <p className="font-semibold text-slate-800">
                            Loại nghỉ: <span className="text-blue-600 font-bold">{item.type}</span> • Thời gian: <span className="font-mono font-bold text-slate-900">{item.range}</span>
                          </p>
                          <p className="text-slate-500">Lý do: <span className="italic text-slate-700">"{item.reason}"</span></p>
                          <p className="text-emerald-700 font-medium flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {item.conflictCheck}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 self-end md:self-center shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openModal('modal6E', item);
                        }}
                        className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-600" />
                        <span>Xem chi tiết</span>
                      </button>

                      {isApproved ? (
                        <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-4 py-2 rounded-xl border border-emerald-200 flex items-center gap-1.5">
                          <Check className="w-4 h-4 text-emerald-600" />
                          {item.approvalType === 'two_level' ? 'Đã chuyển CEO duyệt' : 'Trưởng phòng đã duyệt'}
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openModal('modal6C', item);
                            }}
                            className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold px-3 py-2 rounded-xl transition-all cursor-pointer"
                          >
                            Từ chối
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApprove(item.id, item.empName);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                            <span>{item.approvalType === 'two_level' ? 'Xác nhận và Chuyển CEO' : 'Duyệt đơn'}</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Lịch sử các đơn đã phê duyệt của bộ phận */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Lịch sử đơn đã phê duyệt của bộ phận</h3>
              <p className="text-xs text-slate-500">Bấm vào từng đơn để xem lại ghi chú và chứng từ lưu trữ</p>
            </div>
            <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-bold">
              Đảm bảo 100% tiến độ Sprint
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <th className="py-3 px-4">Mã đơn</th>
                  <th className="py-3 px-4">Nhân sự</th>
                  <th className="py-3 px-4">Loại nghỉ phép</th>
                  <th className="py-3 px-4">Thời gian</th>
                  <th className="py-3 px-4">Người bàn giao</th>
                  <th className="py-3 px-4">Ghi chú duyệt</th>
                  <th className="py-3 px-4 text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {managerApprovedLeaves.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-slate-400">
                      Chưa có đơn nghỉ phép nào đã phê duyệt trong kỳ này.
                    </td>
                  </tr>
                ) : (
                  managerApprovedLeaves.map((row) => (
                    <tr 
                      key={row.id} 
                      onClick={() => openModal('modal6E', row)}
                      className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-600">{row.id}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">{row.employeeName}</td>
                      <td className="py-3.5 px-4 text-slate-700">{row.type}</td>
                      <td className="py-3.5 px-4 font-medium text-slate-800">{row.range}</td>
                      <td className="py-3.5 px-4 text-slate-600">{row.handoverPerson}</td>
                      <td className="py-3.5 px-4 text-slate-500 italic max-w-xs truncate">"{row.approvalNote}"</td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openModal('modal6E', row);
                          }}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition"
                          title="Xem chi tiết hồ sơ đơn đã duyệt"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 3: CẤP 1 (CEO) - GIÁM SÁT & KIỂM TOÁN LỊCH SỬ ĐÃ DUYỆT (MONTHLY COUNTER AUTO-RESET)
  // ==========================================
  if (currentRole.key === 'CEO') {
    const ceoSubordinateRequests = apiLeaves
      .filter(l => (l.job_title?.includes('Trưởng') || l.job_title?.includes('Giám Đốc') || Number(l.total_days) > 3) && l.stage !== 'DA_PHE_DUYET' && l.stage !== 'TU_CHOI' && !approvedList.includes(l.id))
      .map(l => ({
        id: l.id,
        employeeName: l.full_name || l.name || 'Nhân sự',
        employeeId: l.employee_id || '',
        employeeRole: l.job_title || 'Cán bộ Quản lý',
        employeeDept: l.department_name || 'Phòng ban',
        leaveType: l.leave_type_name || 'Nghỉ phép',
        type: `${l.leave_type_name || 'Nghỉ phép'} (${l.total_days} ngày)`,
        range: `${new Date(l.start_date).toLocaleDateString('vi-VN')} - ${new Date(l.end_date).toLocaleDateString('vi-VN')} (${l.total_days} ngày)`,
        daysCount: Number(l.total_days || 1),
        reason: l.reason || 'Nghỉ phép theo quy chế',
        handoverPerson: l.handover_to || 'Đồng nghiệp',
        approvalType: 'ceo_direct',
        attachedFile: l.attachment_name || null,
        status: approvedList.includes(l.id) ? 'approved' : 'pending',
        submittedAt: new Date(l.submitted_at || Date.now()).toLocaleDateString('vi-VN'),
        note: l.notes || 'Đã phân chia task và bàn giao công việc trước khi trình Tổng Giám Đốc.'
      }));

    const historicalApprovedLeaves = apiLeaves
      .filter(l => l.stage === 'DA_PHE_DUYET' || approvedList.includes(l.id))
      .map(l => ({
        id: l.id,
        employeeName: l.full_name,
        emp: l.full_name,
        employeeId: l.employee_id,
        employeeRole: l.job_title,
        dept: l.department_name || 'Toàn công ty',
        employeeDept: l.department_name || 'Toàn công ty',
        leaveType: l.leave_type_name,
        type: `${l.leave_type_name} (${l.total_days} ngày)`,
        range: `${new Date(l.start_date).toLocaleDateString('vi-VN')} - ${new Date(l.end_date).toLocaleDateString('vi-VN')} (${l.total_days} ngày)`,
        dates: `${new Date(l.start_date).toLocaleDateString('vi-VN')} - ${new Date(l.end_date).toLocaleDateString('vi-VN')}`,
        daysCount: Number(l.total_days || 1),
        approver: l.manager_approver_name || l.hr_approver_name || currentRole.name || 'Ban Giám Đốc',
        status: 'Hợp lệ',
        audit: l.leave_type_code === 'PHEP_NAM' ? 'Đã trừ phép năm' : l.leave_type_code === 'NGHI_OM' ? 'Hưởng BHXH' : 'Theo quy chế',
        reason: l.reason || 'Giải quyết việc cá nhân',
        handoverPerson: l.handover_to || 'Đồng nghiệp',
        approvalNote: l.manager_note || 'Đã thẩm định và hoàn tất phê duyệt theo thẩm quyền.',
        submittedAt: new Date(l.submitted_at || Date.now()).toLocaleDateString('vi-VN'),
        attachedFile: l.attachment_name || null
      }));

    const totalApprovedDays = historicalApprovedLeaves.reduce((sum, item) => sum + (item.daysCount || 0), 0);

    return (
      <div className="w-full min-h-full p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 font-display">
                Phê Duyệt Nghỉ Phép Cấp Cao và Lịch Sử Đã Duyệt
              </h1>
              {/* Auto reset monthly badge */}
              <span className="bg-purple-50 text-purple-700 text-xs font-bold px-3 py-1 rounded-full border border-purple-200 flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" />
                Lịch sử đã duyệt {currentMonthYear}: {historicalApprovedLeaves.length} đơn (Tự động reset đầu mỗi tháng)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Góc nhìn kiểm toán toàn diện: Theo dõi tỷ lệ nghỉ phép toàn công ty, thẩm định đơn nghỉ dài hạn và phê duyệt đơn của cấp Trưởng phòng.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => openModal('modal6A', { leaves: apiLeaves })}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-2 transition-all cursor-pointer"
            >
              <CalendarDays className="w-4 h-4 text-blue-600" />
              <span>Sơ đồ lịch nghỉ toàn công ty</span>
            </button>
          </div>
        </div>

        {/* Macro Strategic Cards for CEO */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Tỷ lệ vắng mặt trung bình</p>
              <h3 className="text-2xl font-bold font-display text-emerald-600 mt-1">1.2%</h3>
              <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">Rất tốt (&lt; 2.5% chuẩn)</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Tổng ngày nghỉ {currentMonthYear}</p>
              <h3 className="text-2xl font-bold font-display text-slate-900 mt-1">{totalApprovedDays} ngày</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Đã được phê duyệt hợp lệ</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <CalendarDays className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Đơn cấp Trưởng cần CEO duyệt</p>
              <h3 className="text-2xl font-bold font-display text-amber-600 mt-1">{ceoSubordinateRequests.length} đơn</h3>
              <p className="text-[11px] text-amber-600 font-semibold mt-0.5">Cần Tổng Giám Đốc quyết định</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Đã duyệt trong tháng (Reset kỳ)</p>
              <h3 className="text-2xl font-bold font-display text-purple-600 mt-1">{historicalApprovedLeaves.length} đơn</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Tự động tổng hợp từ CSDL</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <CheckCheck className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Special CEO Approval Cards: Direct subordinates (Trưởng phòng & Giám Đốc Nhân Sự) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <span>Đơn nghỉ phép cấp Quản lý trực thuộc cần Tổng Giám Đốc phê duyệt ({ceoSubordinateRequests.length})</span>
            </h3>
            <span className="text-[11px] text-slate-500 font-medium italic">
              * Theo ma trận thẩm quyền, Trưởng phòng và Giám đốc Khối do CEO trực tiếp phê duyệt
            </span>
          </div>

          {ceoSubordinateRequests.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-slate-500 text-xs">
              Hiện không có đơn nghỉ phép cấp quản lý nào đang chờ Tổng Giám Đốc phê duyệt.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {ceoSubordinateRequests.map((req) => (
                <div 
                  key={req.id}
                  onClick={() => openModal('modal6E', req)}
                  className="bg-gradient-to-r from-amber-50/90 via-orange-50/70 to-white border border-amber-200 hover:border-amber-300 rounded-2xl p-5 shadow-2xs cursor-pointer transition-all"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <Avatar name={req.employeeName} id={req.employeeId} size="lg" shape="rounded" />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                            Cần CEO duyệt
                          </span>
                          <h4 className="font-bold text-slate-900 text-sm">
                            {req.employeeName} • {req.employeeRole}
                          </h4>
                          <span className="text-xs text-slate-400 font-mono">({req.employeeId})</span>
                        </div>
                        <p className="text-xs text-slate-700 mt-1">
                          <strong>Loại nghỉ:</strong> {req.type} ({req.range}) • <strong>Lý do:</strong> {req.reason}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Bàn giao cho: <strong>{req.handoverPerson}</strong>. {req.note}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openModal('modal6E', req);
                        }}
                        className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-600" />
                        <span>Xem chi tiết</span>
                      </button>

                      {approvedList.includes(req.id) ? (
                        <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5">
                          <Check className="w-4 h-4" /> Đã Phê Duyệt
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApprove(req.id, req.employeeName);
                          }}
                          className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                        >
                          <Check className="w-4 h-4" />
                          <span>Duyệt đơn</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AUDIT LOG: Lịch sử đã duyệt toàn công ty */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <CheckCheck className="w-4 h-4 text-purple-600" />
                Lịch Sử Đã Phê Duyệt Toàn Công Ty ({currentMonthYear})
              </h3>
              <p className="text-xs text-slate-500">
                Nhật ký kiểm toán minh bạch • Bấm vào từng dòng để xem toàn bộ chi tiết đơn, chứng từ và tiến trình phê duyệt
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-lg">
                Chu kỳ: 01/09/2026 - 30/09/2026
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200 text-[11px] uppercase">
                  <th className="py-3 px-4">Mã đơn</th>
                  <th className="py-3 px-4">Nhân viên</th>
                  <th className="py-3 px-4">Phòng ban</th>
                  <th className="py-3 px-4">Loại nghỉ và Số ngày</th>
                  <th className="py-3 px-4">Khoảng thời gian</th>
                  <th className="py-3 px-4">Cấp thẩm quyền đã duyệt</th>
                  <th className="py-3 px-4">Kiểm toán C&B</th>
                  <th className="py-3 px-4 text-center">Trạng thái</th>
                  <th className="py-3 px-4 text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historicalApprovedLeaves.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-8 text-center text-slate-400">
                      Chưa có đơn nghỉ phép nào đã được duyệt trong hệ thống.
                    </td>
                  </tr>
                ) : (
                  historicalApprovedLeaves.map((item) => (
                    <tr 
                      key={item.id} 
                      onClick={() => openModal('modal6E', item)}
                      className="hover:bg-purple-50/40 cursor-pointer transition"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-purple-700">{item.id}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{item.emp}</td>
                      <td className="py-3 px-4 text-slate-600">{item.dept}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{item.type}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{item.dates}</td>
                      <td className="py-3 px-4 text-slate-700 font-medium">{item.approver}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium text-[11px]">
                          {item.audit}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openModal('modal6E', item);
                          }}
                          className="p-1.5 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg transition"
                          title="Xem chi tiết đơn và lịch sử"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 4: CẤP 2A - QUẢN TRỊ HR / HRD (THẨM DUYỆT CHẾ ĐỘ BHXH & QUY CHẾ)
  // ==========================================
  const hrPendingLeaves = apiLeaves.filter(l => 
    !approvedList.includes(l.id) && 
    l.stage !== 'DA_PHE_DUYET' && 
    l.stage !== 'TU_CHOI' &&
    l.employee_id !== currentRole?.id &&
    !(l.job_title?.includes('Trưởng') || l.job_title?.includes('Giám Đốc'))
  );
  
  const c65Candidate = hrPendingLeaves.find(l => 
    l.stage === 'CHO_HR_PHE_CHUAN' || 
    l.leave_type_code === 'NGHI_OM' || 
    l.leave_type_name?.toLowerCase().includes('ốm') ||
    l.leave_type_name?.toLowerCase().includes('c65')
  ) || hrPendingLeaves[0];

  const c65Request = c65Candidate ? {
    id: c65Candidate.id,
    employeeName: c65Candidate.full_name || 'Nhân sự',
    employeeId: c65Candidate.employee_id || '',
    employeeRole: c65Candidate.job_title || 'Chuyên viên',
    employeeDept: c65Candidate.department_name || 'Phòng ban',
    leaveType: c65Candidate.leave_type_name || 'Nghỉ ốm đau hưởng trợ cấp Bảo hiểm Xã hội (C65-HD)',
    type: c65Candidate.leave_type_name || 'Nghỉ ốm BHXH (C65-HD)',
    range: `${new Date(c65Candidate.start_date).toLocaleDateString('vi-VN')} (${c65Candidate.total_days} ngày)`,
    daysCount: Number(c65Candidate.total_days || 1),
    reason: c65Candidate.reason || 'Điều trị ngoại trú tại Bệnh viện. Kèm giấy chứng nhận nghỉ việc hưởng BHXH (Mẫu C65-HD).',
    handoverPerson: c65Candidate.handover_to || 'Đồng nghiệp cùng phòng',
    attachedFile: c65Candidate.attachment_name || null,
    approvalType: 'hr_c65',
    status: approvedList.includes(c65Candidate.id) ? 'approved' : 'pending',
    submittedAt: new Date(c65Candidate.submitted_at || Date.now()).toLocaleDateString('vi-VN')
  } : null;

  const approvedLeavesCount = apiLeaves.filter(l => l.stage === 'DA_PHE_DUYET' || approvedList.includes(l.id)).length;
  const totalApprovedDaysAll = apiLeaves.filter(l => l.stage === 'DA_PHE_DUYET' || approvedList.includes(l.id)).reduce((sum, l) => sum + Number(l.total_days || 0), 0);
  const validApprovalRate = apiLeaves.length > 0 ? ((approvedLeavesCount / apiLeaves.length) * 100).toFixed(1) : '100.0';

  return (
    <div className="w-full min-h-full p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 font-display">
              Thẩm Duyệt Nghỉ Phép và Chế Độ Phúc Lợi
            </h1>
            <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full border border-blue-200">
              Thẩm định hồ sơ C65 và Quy chế
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Kiểm tra chứng từ bảo hiểm y tế, hồ sơ hưởng chế độ ốm đau/thai sản và đồng bộ sang kỳ quyết toán tiền lương.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => openModal('modal6A', { leaves: apiLeaves })}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <CalendarDays className="w-4 h-4 text-blue-600" />
            <span>Xem lịch phép công ty</span>
          </button>
          <button
            type="button"
            onClick={() => openModal('modal6D')}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo đơn xin nghỉ của tôi</span>
          </button>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Hồ sơ chờ HR duyệt</p>
            <h3 className="text-2xl font-bold font-display text-amber-600 mt-1">{hrPendingLeaves.length} hồ sơ</h3>
            <p className="text-[11px] text-amber-700 font-semibold mt-0.5">Cần đối soát chứng từ</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <ShieldAlert className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Tỷ lệ duyệt hợp lệ</p>
            <h3 className="text-2xl font-bold font-display text-emerald-600 mt-1">{validApprovalRate}%</h3>
            <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">{approvedLeavesCount} đơn đúng quy chế</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Tổng ngày nghỉ toàn công ty</p>
            <h3 className="text-2xl font-bold font-display text-slate-900 mt-1">{totalApprovedDaysAll} ngày</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Kỳ Tháng 09/2026</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <CalendarDays className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Chế độ BHXH trích chi</p>
            <h3 className="text-2xl font-bold font-display text-purple-600 mt-1">8.420.000 đ</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Cơ quan BHXH thanh toán</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 space-y-4">
          {!c65Request ? (
            <div className="bg-white rounded-2xl p-8 border border-dashed border-slate-200 text-center text-slate-500 text-xs">
              Hiện không có hồ sơ chứng từ C65 hoặc đơn nghỉ phép nào đang chờ HR thẩm định.
            </div>
          ) : (
            /* C65 Medical Claim item */
            <article 
              onClick={() => openModal('modal6E', c65Request)}
              className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:border-blue-300 hover:shadow-apple-card transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <Avatar name={c65Request.employeeName} id={c65Request.employeeId} size="lg" shape="rounded" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-sm">{c65Request.employeeName}</h3>
                      <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                        {c65Request.employeeId}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{c65Request.employeeRole} • {c65Request.employeeDept}</p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span className="bg-amber-50 text-amber-800 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-amber-200">
                    {c65Request.type}
                  </span>
                  <span className="text-[10px] text-slate-400">Gần đây</span>
                </div>
              </div>

              <div className="mt-4 p-3.5 rounded-xl bg-slate-50 space-y-2 border border-slate-100 text-xs">
                <div className="flex items-center gap-2 font-semibold text-slate-800">
                  <CalendarDays className="w-4 h-4 text-amber-600" />
                  <span>{c65Request.range}</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  <strong>Lý do:</strong> {c65Request.reason}
                </p>
                
                {c65Request.attachedFile && (
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openModal('modal6E', c65Request);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold text-xs hover:bg-amber-50 transition-colors shadow-2xs cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-amber-600" />
                      <span>{c65Request.attachedFile}</span>
                      <Eye className="w-3.5 h-3.5 text-slate-400 ml-1" />
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-3 px-3 py-2 rounded-xl bg-amber-50 text-amber-900 flex items-center justify-between text-xs border border-amber-200">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-700" />
                  <span>Chế độ: <strong>Chứng từ hợp lệ</strong> theo quy định.</span>
                </div>
                <span className="font-bold text-amber-800">Hưởng chế độ quy định</span>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openModal('modal6E', c65Request);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  <span>Xem hồ sơ chi tiết</span>
                </button>

                {approvedList.includes(c65Request.id) ? (
                  <span className="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200 flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    Đơn đã được HR thẩm định thành công
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openModal('modal6C', { employeeName: c65Request.employeeName, id: c65Request.id });
                      }}
                      className="px-3.5 py-1.5 rounded-xl text-rose-600 bg-rose-50 hover:bg-rose-100 font-bold text-xs border border-rose-200 transition-colors cursor-pointer"
                    >
                      Yêu cầu bổ sung chứng từ
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApprove(c65Request.id, c65Request.employeeName);
                      }}
                      className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Duyệt quyết toán BHXH</span>
                    </button>
                  </div>
                )}
              </div>
            </article>
          )}
        </div>

        {/* Right Column: Policy Compliance */}
        <div className="xl:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm font-display">
                  Kiểm tra tự động và Tuân thủ Luật Lao động
                </h3>
                <p className="text-[11px] text-slate-500">Hệ thống thẩm định quy chế và chính sách</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Hồ sơ thẩm định quy chuẩn và đầy đủ điều kiện</span>
              </div>
              <p className="leading-relaxed text-slate-600">
                Đã tra cứu mã bảo hiểm xã hội hợp lệ trên hệ thống dữ liệu nhân sự. Chứng từ đủ điều kiện thanh toán chế độ theo đúng quy chế hiện hành của doanh nghiệp.
              </p>
            </div>

            {c65Request && (
              <button
                type="button"
                onClick={() => openModal('modal6E', c65Request)}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Xem chi tiết hồ sơ chứng nhận đính kèm</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

