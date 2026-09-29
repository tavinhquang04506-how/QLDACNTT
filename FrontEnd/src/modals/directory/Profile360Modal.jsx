import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppleModal from '../../components/motion/AppleModal';
import Avatar from '../../components/common/Avatar';
import { 
  Mail, 
  Phone, 
  Building, 
  Award, 
  Clock, 
  CheckCircle2, 
  ShieldCheck, 
  Printer, 
  Eye,
  Download,
  AlertCircle,
  ArrowRight,
  Loader2
} from 'lucide-react';
import ContractPdfPreviewModal from './ContractPdfPreviewModal';
import { useAuth } from '../../context/AuthContext';
import employeeService from '../../services/employeeService';
import { normalizeEmployee, formatVND, formatDateVN } from '../../utils/dataAdapters';
import analyticsService from '../../services/analyticsService';
import { CELL_META, periodLabel } from '../../utils/nineBox';

const CONTRACT_TYPE_LABELS = {
  CHINH_THUC: 'Hợp đồng lao động chính thức',
  THU_VIEC: 'Hợp đồng thử việc',
  THOI_VU: 'Hợp đồng thời vụ',
  CONG_TAC_VIEN: 'Hợp đồng cộng tác viên',
};

export default function Profile360Modal({ isOpen, onClose, payload }) {
  const navigate = useNavigate();
  const { currentRole, user } = useAuth();
  const [activeTab, setActiveTab] = useState('info');
  const [managerTab, setManagerTab] = useState('assignment');
  const [isContractPdfOpen, setIsContractPdfOpen] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [loadingReview, setLoadingReview] = useState(false);
  const [detailEmp, setDetailEmp] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const actorEmpId = user?.employeeId || user?.employee_id || currentRole?.id || '';
  const targetId = payload?.id || payload?.employee_id || payload?.employeeId || actorEmpId;

  useEffect(() => {
    if (!isOpen || !targetId) {
      setDetailEmp(null);
      return;
    }
    let alive = true;
    setLoadingDetail(true);
    employeeService.getById(targetId)
      .then((res) => {
        if (!alive) return;
        if (res?.success && res.data) {
          setDetailEmp(normalizeEmployee(res.data));
        }
      })
      .catch(() => {
        // Fallback to normalized payload if actor only has directory list access
      })
      .finally(() => {
        if (alive) setLoadingDetail(false);
      });
    return () => { alive = false; };
  }, [isOpen, targetId]);

  const baseEmp = payload ? normalizeEmployee(payload) : normalizeEmployee(user || currentRole || {});
  const emp = detailEmp ? { ...baseEmp, ...detailEmp } : baseEmp;

  const isStaff = currentRole?.key === 'EMPLOYEE';
  const isManager = currentRole?.key === 'LINE_MANAGER';
  const isCeo = currentRole?.key === 'CEO';
  const isHrd = currentRole?.key === 'HR_DIRECTOR';
  const isOwner = Boolean(actorEmpId && emp.id && String(actorEmpId) === String(emp.id));

  // Lý lịch nhân thân và Hợp đồng lương chỉ có HR, CEO hoặc chính nhân sự đó xem được
  const canViewConfidential = isCeo || isHrd || isOwner;
  const isRestrictedManager = isManager && !canViewConfidential;
  const isRestrictedPeer = !canViewConfidential && !isRestrictedManager;

  useEffect(() => {
    if (!isOpen || !emp?.id) {
      setReviews([]);
      return;
    }
    if (payload?.review) {
      setReviews([payload.review]);
    }
    let alive = true;
    setLoadingReview(true);
    analyticsService.getReviews({ employeeId: emp.id, limit: 10 })
      .then((res) => {
        if (!alive) return;
        const items = Array.isArray(res?.data) ? res.data : [];
        setReviews(items);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingReview(false);
      });
    return () => { alive = false; };
  }, [isOpen, emp?.id, payload]);

  const latestReview = reviews[0] || (payload?.review ? payload.review : null);
  const cellNumber = latestReview ? Number(latestReview.nine_box_cell) : null;
  const cellMeta = cellNumber ? CELL_META[cellNumber] : null;

  const kpiText = emp.kpiScore !== null && emp.kpiScore !== undefined ? `${emp.kpiScore}%` : 'Chưa có';
  const attendanceText = emp.attendanceRate !== null && emp.attendanceRate !== undefined ? `${emp.attendanceRate}%` : 'Chưa có';
  const leaveBalanceText = emp.leaveBalance !== null && emp.leaveBalance !== undefined ? `${emp.leaveBalance} ngày` : 'Chưa cập nhật';
  const contractNoText = emp.contractNo || (emp.id ? `HDLD-${emp.id}` : 'Chưa cập nhật');
  const contractTypeText = CONTRACT_TYPE_LABELS[emp.contractType] || emp.contractType || 'Chưa cập nhật';

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isRestrictedPeer
          ? `Thông tin đồng nghiệp: ${emp.name}`
          : isRestrictedManager
          ? `Hồ sơ nhân sự bộ phận: ${emp.name}`
          : `Hồ sơ nhân sự: ${emp.name}`
      }
      subtitle={
        !canViewConfidential
          ? `Mã nhân sự: ${emp.id || 'Chưa cập nhật'} • ${emp.department}`
          : `Mã nhân viên: ${emp.id || 'Chưa cập nhật'} • Dữ liệu hồ sơ nhân sự từ CSDL PostgreSQL`
      }
      badge={
        isRestrictedManager ? (
          <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
            <Building className="w-3.5 h-3.5" />
            {emp.department}
          </span>
        ) : !canViewConfidential ? (
          <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Danh bạ nội bộ
          </span>
        ) : (
          <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            Hồ sơ đã xác thực
          </span>
        )
      }
      maxWidth="max-w-4xl"
    >
      <div className="p-6 space-y-6">
        {loadingDetail && (
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
            <span>Đang đồng bộ chi tiết hồ sơ từ máy chủ...</span>
          </div>
        )}

        {/* Profile Banner */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="relative">
              <Avatar
                src={emp.avatar}
                name={emp.name}
                id={emp.id}
                size="2xl"
                shape="rounded"
              />
              <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full ring-2 ring-white flex items-center justify-center text-white text-[10px] font-bold">
                ✓
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold text-slate-900 font-display">{emp.name}</h2>
                {emp.id && (
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                    {emp.id}
                  </span>
                )}
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {emp.status === 'DA_NGHI_VIEC' ? 'Đã nghỉ việc' : emp.status === 'THU_VIEC' ? 'Thử việc' : 'Đang làm việc'}
                </span>
              </div>

              <p className="text-xs font-semibold text-slate-600 mt-1">
                {emp.role} • {emp.department}
              </p>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-2">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-700 font-medium">{emp.email || 'Chưa cập nhật'}</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-700 font-medium">{emp.phone || 'Chưa cập nhật'}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-3 self-start md:self-center flex-wrap">
            {isRestrictedPeer ? (
              <div className="px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-100 text-center">
                <div className="text-[10px] font-bold uppercase text-blue-500">Phòng ban</div>
                <div className="text-xs font-bold text-blue-700 mt-0.5 font-display">{emp.department}</div>
              </div>
            ) : (
              <>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-center min-w-[90px]">
                  <div className="text-[10px] font-bold uppercase text-slate-400">KPI</div>
                  <div className="text-base font-bold text-emerald-600 font-display">{kpiText}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-center min-w-[90px]">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Chuyên cần</div>
                  <div className="text-base font-bold text-blue-600 font-display">{attendanceText}</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Khung nội dung chi tiết */}
        {isRestrictedPeer ? (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-white border border-slate-200/90 space-y-3">
                <h3 className="font-bold text-slate-900 uppercase text-[11px] pb-1 border-b border-slate-100 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-blue-600" />
                  <span>Vị trí công tác</span>
                </h3>
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Phòng ban:</span>
                    <span className="font-semibold text-slate-800">{emp.department || 'Chưa phân bổ'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Vị trí đảm nhiệm:</span>
                    <span className="font-semibold text-blue-700">{emp.role || 'Chưa cập nhật'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Quản lý trực tiếp:</span>
                    <span className="text-slate-800 font-semibold">{emp.managerName || emp.manager_name || 'Chưa cập nhật'}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200/90 space-y-3">
                <h3 className="font-bold text-slate-900 uppercase text-[11px] pb-1 border-b border-slate-100 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Thông tin liên hệ công việc</span>
                </h3>
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Hòm thư nội bộ:</span>
                    <span className="font-mono font-semibold text-slate-800">{emp.email || 'Chưa cập nhật'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Số điện thoại liên hệ:</span>
                    <span className="font-mono text-slate-800 font-semibold">{emp.phone || 'Chưa cập nhật'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Ngày gia nhập:</span>
                    <span className="text-slate-800 font-medium">{emp.joinedDate ? formatDateVN(emp.joinedDate) : 'Chưa cập nhật'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : isRestrictedManager ? (
          <div className="space-y-4 text-xs">
            <div className="flex gap-4 border-b border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setManagerTab('assignment')}
                className={`pb-2.5 border-b-2 transition-colors cursor-pointer ${
                  managerTab === 'assignment'
                    ? 'text-blue-600 border-blue-600'
                    : 'text-slate-500 border-transparent hover:text-slate-800'
                }`}
              >
                Vị trí công tác và Phân công nhiệm vụ
              </button>
              <button
                type="button"
                onClick={() => setManagerTab('kpi')}
                className={`pb-2.5 border-b-2 transition-colors cursor-pointer ${
                  managerTab === 'kpi'
                    ? 'text-blue-600 border-blue-600'
                    : 'text-slate-500 border-transparent hover:text-slate-800'
                }`}
              >
                Lịch sử KPI và Đánh giá hiệu suất
              </button>
            </div>

            {managerTab === 'assignment' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-white border border-slate-200/90 space-y-3 shadow-2xs">
                  <h3 className="font-bold text-slate-900 uppercase text-[11px] pb-1 border-b border-slate-100 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-blue-600" />
                    <span>Vị trí công tác và Phân công chuyên môn</span>
                  </h3>
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Phòng ban trực thuộc:</span>
                      <span className="font-semibold text-slate-800">{emp.department || 'Chưa phân bổ'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Chức danh đảm nhiệm:</span>
                      <span className="font-semibold text-blue-700">{emp.role || 'Chưa cập nhật'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Cấp quản lý trực tiếp:</span>
                      <span className="font-semibold text-slate-800">{emp.managerName || emp.manager_name || 'Chưa cập nhật'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Số ngày phép năm còn lại:</span>
                      <span className="font-bold text-emerald-700 font-mono">{leaveBalanceText}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200/90 space-y-3 shadow-2xs">
                  <h3 className="font-bold text-slate-900 uppercase text-[11px] pb-1 border-b border-slate-100 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Thông tin liên hệ công vụ nội bộ</span>
                  </h3>
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Hòm thư điện tử công vụ:</span>
                      <span className="font-mono font-semibold text-slate-800">{emp.email || 'Chưa cập nhật'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Số điện thoại liên lạc:</span>
                      <span className="font-mono text-slate-800 font-semibold">{emp.phone || 'Chưa cập nhật'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Ngày bắt đầu làm việc:</span>
                      <span className="text-slate-800 font-medium">{emp.joinedDate ? formatDateVN(emp.joinedDate) : 'Chưa cập nhật'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Trạng thái nhân sự:</span>
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                        {emp.status === 'DA_NGHI_VIEC' ? 'Đã nghỉ việc' : emp.status === 'THU_VIEC' ? 'Thử việc' : 'Đang làm việc'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between pb-1 border-b border-purple-200">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-purple-600" />
                      <h3 className="font-bold text-purple-900 uppercase text-[11px]">
                        Đánh giá hiệu suất và KPI (Mô hình 9-Box)
                      </h3>
                    </div>
                    {latestReview && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                        {periodLabel(latestReview.period)}
                      </span>
                    )}
                  </div>

                  {loadingReview ? (
                    <div className="py-6 flex items-center justify-center gap-2 text-xs text-purple-700">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang tải dữ liệu đánh giá...</span>
                    </div>
                  ) : latestReview ? (
                    <div className="space-y-2.5 text-purple-900">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Điểm Hiệu suất (Performance):</span>
                        <span className="font-bold font-mono text-emerald-700">
                          {Math.round(Number(latestReview.performance_score))}/100
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Điểm Tiềm năng (Potential):</span>
                        <span className="font-bold font-mono text-blue-700">
                          {Math.round(Number(latestReview.potential_score))}/100
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Phân nhóm năng lực 9-Box:</span>
                        <span className={`font-bold px-2 py-0.5 rounded border text-[11px] ${cellMeta?.badge || 'bg-purple-100 text-purple-800 border-purple-200'}`}>
                          Ô {cellNumber} — {cellMeta?.title || 'Đã phân loại'}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-purple-200/60 space-y-1">
                        <span className="text-[11px] font-bold text-purple-950 block">Nhận xét của Trưởng phòng:</span>
                        <p className="text-[11px] text-purple-900 italic leading-relaxed bg-white/70 p-2.5 rounded-lg border border-purple-100">
                          "{latestReview.comments || 'Chưa có nhận xét chi tiết'}"
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5 text-purple-900">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Điểm KPI hiện tại:</span>
                        <span className="font-bold font-mono text-emerald-700">{kpiText}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Tỷ lệ chuyên cần:</span>
                        <span className="font-bold font-mono text-blue-700">{attendanceText}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-900 text-[11px] space-y-1.5">
                        <div className="font-semibold flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Chưa có dữ liệu đánh giá hiệu suất 9-Box</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200/90 space-y-3 shadow-2xs">
                  <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <h3 className="font-bold text-slate-900 uppercase text-[11px]">
                      Thông tin quản trị bộ phận
                    </h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Phòng ban công tác:</span>
                      <span className="font-bold text-slate-800">{emp.department || 'Chưa phân bổ'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Điểm KPI ghi nhận:</span>
                      <span className="font-mono font-bold text-blue-600">{kpiText}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Chế độ xem toàn quyền: HR Director / CEO / Cá nhân xem hồ sơ của chính mình */
          <>
            <div className="flex gap-4 border-b border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('info')}
                className={`pb-2.5 border-b-2 transition-colors ${
                  activeTab === 'info'
                    ? 'text-blue-600 border-blue-600'
                    : 'text-slate-500 border-transparent hover:text-slate-800'
                }`}
              >
                Lý lịch và Nhân thân
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('salary')}
                className={`pb-2.5 border-b-2 transition-colors ${
                  activeTab === 'salary'
                    ? 'text-blue-600 border-blue-600'
                    : 'text-slate-500 border-transparent hover:text-slate-800'
                }`}
              >
                Hợp đồng và Lương thưởng
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('kpi')}
                className={`pb-2.5 border-b-2 transition-colors ${
                  activeTab === 'kpi'
                    ? 'text-blue-600 border-blue-600'
                    : 'text-slate-500 border-transparent hover:text-slate-800'
                }`}
              >
                Lịch sử KPI và Đánh giá hiệu suất
              </button>
            </div>

            {activeTab === 'info' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-white border border-slate-200/90 space-y-3">
                  <h3 className="font-bold text-slate-900 uppercase text-[11px] pb-1 border-b border-slate-100">
                    Thông tin cá nhân (từ CSDL)
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Số CCCD/CMND:</span>
                      <span className="font-mono font-bold text-slate-800">{emp.citizenId || 'Chưa cập nhật'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Ngày sinh:</span>
                      <span className="text-slate-800 font-medium">{emp.dob ? formatDateVN(emp.dob) : 'Chưa cập nhật'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Giới tính:</span>
                      <span className="text-slate-800 font-medium">
                        {emp.gender === 'Nu' ? 'Nữ' : emp.gender === 'Nam' ? 'Nam' : emp.gender || 'Chưa cập nhật'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Địa chỉ liên hệ:</span>
                      <span className="text-slate-800 font-medium text-right max-w-[220px]">{emp.address || 'Chưa cập nhật'}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200/90 space-y-3">
                  <h3 className="font-bold text-slate-900 uppercase text-[11px] pb-1 border-b border-slate-100">
                    Tài khoản thanh toán & Chế độ
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Số tài khoản ngân hàng:</span>
                      <span className="font-mono font-bold text-slate-800">{emp.bankAccount || 'Chưa cập nhật'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Ngân hàng thụ hưởng:</span>
                      <span className="font-semibold text-slate-800">{emp.bankName || 'Chưa cập nhật'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tỷ lệ đóng BHXH bắt buộc:</span>
                      <span className="text-slate-800 font-bold">10.5% NLĐ / 21.5% DN</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Số dư phép năm hiện tại:</span>
                      <span className="text-emerald-700 font-bold">{leaveBalanceText}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'salary' && (
              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-xl bg-white border border-slate-200/90 space-y-3">
                  <h3 className="font-bold text-slate-900 uppercase text-[11px] pb-1 border-b border-slate-100 flex items-center justify-between">
                    <span>Chi tiết Hợp đồng và Chế độ tiền lương</span>
                    <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-mono font-medium border border-blue-200">
                      Số: {contractNoText}
                    </span>
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-500 block mb-0.5">Lương cơ bản thỏa thuận:</span>
                      <span className="text-base font-bold font-mono text-blue-600">
                        {emp.baseSalary !== null && emp.baseSalary !== undefined
                          ? `${formatVND(emp.baseSalary)} / tháng`
                          : 'Chưa cập nhật'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5">Tài khoản nhận lương:</span>
                      <span className="text-sm font-bold font-mono text-slate-800">
                        {emp.bankAccount ? `${emp.bankAccount} (${emp.bankName || 'Ngân hàng'})` : 'Chưa cập nhật'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5">Số dư ngày phép năm:</span>
                      <span className="text-sm font-bold text-emerald-700">
                        {leaveBalanceText}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5">Ngày bắt đầu làm việc:</span>
                      <span className="text-sm font-medium text-slate-800">
                        {emp.joinedDate ? formatDateVN(emp.joinedDate) : 'Chưa cập nhật'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs shadow-2xs">
                        HĐ
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs">
                          {contractNoText}
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          {contractTypeText} • Lưu trữ trong CSDL hợp đồng lao động
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsContractPdfOpen(true)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Xem bản in hợp đồng</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsContractPdfOpen(true)}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs transition-colors cursor-pointer"
                        title="Mở bản in hợp đồng"
                      >
                        <Download className="w-4 h-4 text-slate-600" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'kpi' && (
              <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-200 space-y-3 text-xs text-purple-900">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-purple-600" />
                    <h3 className="font-bold uppercase text-[11px]">Đánh giá Hiệu suất (Mô hình 9-Box Talent Matrix)</h3>
                  </div>
                  {latestReview && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                      {periodLabel(latestReview.period)}
                    </span>
                  )}
                </div>
                {loadingReview ? (
                  <div className="py-4 flex items-center justify-center gap-2 text-xs text-purple-700">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang tải dữ liệu đánh giá...</span>
                  </div>
                ) : latestReview ? (
                  <div className="space-y-2.5">
                    <p className="leading-relaxed">
                      Nhân sự <strong>{emp.name}</strong> được đánh giá thuộc nhóm{' '}
                      <strong className={`px-2 py-0.5 rounded border ${cellMeta?.badge || 'bg-purple-100 text-purple-800'}`}>
                        Ô {cellNumber} — {cellMeta?.title || 'Đã xếp loại'}
                      </strong>{' '}
                      trong kỳ <strong>{periodLabel(latestReview.period)}</strong> với Điểm Hiệu suất: <strong>{Math.round(Number(latestReview.performance_score))}/100</strong> và Điểm Tiềm năng: <strong>{Math.round(Number(latestReview.potential_score))}/100</strong>.
                    </p>
                    <div className="p-3 bg-white/80 rounded-xl border border-purple-200 space-y-1">
                      <span className="text-[11px] font-bold text-purple-950 block">Nhận xét của người đánh giá:</span>
                      <p className="text-[11px] italic text-purple-900">"{latestReview.comments || 'Chưa có nhận xét'}"</p>
                      <div className="text-[10px] text-purple-700 pt-1 border-t border-purple-100 flex justify-between">
                        <span>Đánh giá bởi: <strong>{latestReview.reviewer_name || 'Cấp quản lý'}</strong></span>
                        <span>{formatDateVN(latestReview.updated_at || latestReview.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 space-y-1.5">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Chưa có đánh giá hiệu suất 9-Box kỳ này</span>
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      Nhân sự <strong>{emp.name}</strong> chưa có dữ liệu đánh giá từ cấp quản lý trực tiếp.
                    </p>
                    {(canViewConfidential || isManager) && !isStaff && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          navigate(`/ai-analytics?review=${emp.id}`);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 hover:underline pt-0.5 cursor-pointer"
                      >
                        <span>Mở phân hệ Đánh giá Hiệu suất</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="pt-2 flex items-center justify-between border-t border-slate-100">
          {canViewConfidential ? (
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>In hồ sơ nhân sự</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
          >
            Đóng cửa sổ
          </button>
        </div>
      </div>

      <ContractPdfPreviewModal
        isOpen={isContractPdfOpen}
        onClose={() => setIsContractPdfOpen(false)}
        emp={emp}
      />
    </AppleModal>
  );
}
