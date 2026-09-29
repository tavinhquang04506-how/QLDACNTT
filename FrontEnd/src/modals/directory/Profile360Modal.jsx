import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppleModal from '../../components/motion/AppleModal';
import Avatar from '../../components/common/Avatar';
import { AVATAR_SEEDS } from '../../utils/avatarUtils';
import { 
  User, 
  Mail, 
  Phone, 
  Building, 
  Calendar, 
  CreditCard, 
  Award, 
  Clock, 
  FileText, 
  CheckCircle2, 
  ShieldCheck, 
  Printer, 
  Edit,
  Eye,
  Download,
  Upload,
  AlertCircle,
  ArrowRight,
  Loader2
} from 'lucide-react';
import ContractPdfPreviewModal from './ContractPdfPreviewModal';
import { useAuth } from '../../context/AuthContext';
import { normalizeEmployee, formatVND, formatDateVN } from '../../utils/dataAdapters';
import analyticsService from '../../services/analyticsService';
import { CELL_META, periodLabel } from '../../utils/nineBox';

export default function Profile360Modal({ isOpen, onClose, payload }) {
  const navigate = useNavigate();
  const { currentRole } = useAuth();
  const [activeTab, setActiveTab] = useState('info');
  const [managerTab, setManagerTab] = useState('assignment'); // 'assignment' | 'kpi'
  const [isContractPdfOpen, setIsContractPdfOpen] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [loadingReview, setLoadingReview] = useState(false);

  const emp = payload ? normalizeEmployee(payload) : {
    id: currentRole?.id || "",
    name: currentRole?.name || "Nhân sự",
    role: currentRole?.title || "Chuyên viên",
    department: currentRole?.department || "Khối Chuyên Môn",
    email: currentRole?.email || "",
    phone: currentRole?.phone || "",
    avatar: currentRole?.avatar || AVATAR_SEEDS.STAFF_1,
    baseSalary: Number(currentRole?.baseSalary || 0),
    kpiScore: Number(currentRole?.kpiScore || 0),
    attendanceRate: 100,
    leaveBalance: Number(currentRole?.leaveBalance || 12.0),
    citizenId: currentRole?.citizenId || "",
    bankAccount: currentRole?.bankAccount || "",
    bankName: currentRole?.bankName || "",
    manager_name: currentRole?.manager_name || "Trưởng bộ phận"
  };

  const isStaff = currentRole?.key === 'EMPLOYEE';
  const isManager = currentRole?.key === 'LINE_MANAGER';
  const isCeo = currentRole?.key === 'CEO';
  const isHrd = currentRole?.key === 'HR_DIRECTOR';

  // Yêu cầu: Lý lịch nhân thân và Hợp đồng lương chỉ có HR và CEO thấy được
  const canViewConfidential = isCeo || isHrd;
  const isRestrictedManager = isManager && !canViewConfidential;
  const isRestrictedPeer = isStaff && !canViewConfidential;

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
      .catch((err) => {
        console.warn('Lỗi tải đánh giá nhân sự cho Profile360Modal:', err);
      })
      .finally(() => {
        if (alive) setLoadingReview(false);
      });
    return () => { alive = false; };
  }, [isOpen, emp?.id, payload]);

  const latestReview = reviews[0] || (payload?.review ? payload.review : null);
  const cellNumber = latestReview ? Number(latestReview.nine_box_cell) : null;
  const cellMeta = cellNumber ? CELL_META[cellNumber] : null;

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
          ? `Mã nhân sự: ${emp.id} • ${emp.department}`
          : `Mã nhân viên: ${emp.id} • Dữ liệu xác thực thông tin và Hợp đồng lao động chính thức`
      }
      badge={
        isRestrictedManager ? (
          <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
            <Building className="w-3.5 h-3.5" />
            Nhân sự bộ phận Kỹ thuật
          </span>
        ) : !canViewConfidential ? (
          <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Đang làm việc tại văn phòng
          </span>
        ) : (
          <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            Đã xác thực eKYC
          </span>
        )
      }
      maxWidth="max-w-4xl"
    >
      <div className="p-6 space-y-6">
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
                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  {emp.id}
                </span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Chính thức
                </span>
              </div>

              <p className="text-xs font-semibold text-slate-600 mt-1">
                {emp.role} • {emp.department}
              </p>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-2">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-700 font-medium">{emp.email}</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-700 font-medium">{emp.phone || '0912 345 678'}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Quick stats and action buttons in banner */}
          <div className="flex items-center gap-3 self-start md:self-center flex-wrap">
            {isRestrictedPeer ? (
              <div className="px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-100 text-center">
                <div className="text-[10px] font-bold uppercase text-blue-500">Khối chuyên môn</div>
                <div className="text-xs font-bold text-blue-700 mt-0.5 font-display">Kỹ thuật & Phát triển Phần mềm</div>
              </div>
            ) : (
              <>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-center min-w-[90px]">
                  <div className="text-[10px] font-bold uppercase text-slate-400">KPI T9</div>
                  <div className="text-base font-bold text-emerald-600 font-display">{emp.kpiScore}%</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-center min-w-[90px]">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Chuyên cần</div>
                  <div className="text-base font-bold text-blue-600 font-display">{emp.attendanceRate || 98.5}%</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Khung nội dung chi tiết */}
        {isRestrictedPeer ? (
          /* Chế độ xem đồng nghiệp: Chỉ hiển thị vị trí công tác & thông tin liên hệ công việc */
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Vị trí và Bộ phận công tác */}
              <div className="p-4 rounded-xl bg-white border border-slate-200/90 space-y-3">
                <h3 className="font-bold text-slate-900 uppercase text-[11px] pb-1 border-b border-slate-100 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-blue-600" />
                  <span>Vị trí công tác & Phân công nhiệm vụ</span>
                </h3>
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Phòng ban:</span>
                    <span className="font-semibold text-slate-800">{emp.department || 'Kỹ thuật Phần mềm'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Vị trí đảm nhiệm:</span>
                    <span className="font-semibold text-blue-700">{emp.role}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Nhóm dự án / Squad:</span>
                    <span className="text-slate-800 font-medium">Core Platform & Infrastructure</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Quản lý trực tiếp:</span>
                    <span className="text-slate-800 font-semibold">{emp.manager_name || emp.managerName || 'Trưởng bộ phận'}</span>
                  </div>
                </div>
              </div>

              {/* Thông tin liên hệ công việc nội bộ */}
              <div className="p-4 rounded-xl bg-white border border-slate-200/90 space-y-3">
                <h3 className="font-bold text-slate-900 uppercase text-[11px] pb-1 border-b border-slate-100 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Thông tin liên hệ công vụ nội bộ</span>
                </h3>
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Hòm thư nội bộ:</span>
                    <span className="font-mono font-semibold text-slate-800">{emp.email}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Số máy lẻ nội bộ:</span>
                    <span className="font-mono text-slate-800 font-semibold">Ext: #1042</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Vị trí chỗ ngồi:</span>
                    <span className="text-slate-800 font-medium">Khu B - Tầng 4, Tòa nhà Nexus</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Giờ làm việc:</span>
                    <span className="text-emerald-700 font-semibold">08:00 - 17:30 (Thứ 2 - Thứ 6)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : isRestrictedManager ? (
          /* Chế độ xem của Trưởng phòng: Tuyệt đối không hiển thị CCCD, nhân thân, BHXH, thuế TNCN hay lương thưởng */
          <div className="space-y-4 text-xs">
            {/* Tab điều hướng dành riêng cho Trưởng phòng */}
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

            {/* Nội dung theo Tab của Trưởng phòng */}
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
                      <span className="font-semibold text-slate-800">{emp.department || 'Phòng Phát triển Phần mềm'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Chức danh đảm nhiệm:</span>
                      <span className="font-semibold text-blue-700">{emp.role}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Đội nhóm dự án / Squad:</span>
                      <span className="font-semibold text-slate-800">Squad Core Banking và Cloud Engine</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Cấp quản lý trực tiếp:</span>
                      <span className="font-semibold text-slate-800">{emp.manager_name || emp.managerName || 'Trưởng bộ phận'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Số ngày phép năm còn lại:</span>
                      <span className="font-bold text-emerald-700 font-mono">{emp.leaveBalance || emp.leave_balance || 12} ngày</span>
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
                      <span className="font-mono font-semibold text-slate-800">{emp.email}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Số máy lẻ bàn nội bộ:</span>
                      <span className="font-mono text-slate-800 font-semibold">Ext: #{emp.phone ? emp.phone.slice(-4) : '1002'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Số điện thoại liên lạc:</span>
                      <span className="font-mono text-slate-800 font-semibold">{emp.phone || '0909 112 233'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Vị trí chỗ ngồi làm việc:</span>
                      <span className="text-slate-800 font-medium">Phòng Kỹ thuật - Tầng 4 Tòa nhà Nexus</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Trạng thái nhân sự:</span>
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                        Đang làm việc chính thức
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
                          <span className="ml-1 text-[10px] font-bold text-slate-500">
                            ({Number(latestReview.performance_score) >= 80 ? 'Cao' : Number(latestReview.performance_score) >= 60 ? 'Đạt' : 'Cần cải thiện'})
                          </span>
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Điểm Tiềm năng (Potential):</span>
                        <span className="font-bold font-mono text-blue-700">
                          {Math.round(Number(latestReview.potential_score))}/100
                          <span className="ml-1 text-[10px] font-bold text-slate-500">
                            ({Number(latestReview.potential_score) >= 80 ? 'Cao' : Number(latestReview.potential_score) >= 60 ? 'Trung bình' : 'Thấp'})
                          </span>
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
                        <div className="flex items-center justify-between text-[10px] text-purple-700/80 pt-0.5">
                          <span>Người đánh giá: <strong>{latestReview.reviewer_name || 'Trưởng phòng trực tiếp'}</strong></span>
                          <span>{formatDateVN(latestReview.updated_at || latestReview.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5 text-purple-900">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Điểm KPI hiện tại:</span>
                        <span className="font-bold font-mono text-emerald-700">
                          {emp.kpiScore ? `${emp.kpiScore}%` : 'Chưa ghi nhận'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Tỷ lệ chuyên cần:</span>
                        <span className="font-bold font-mono text-blue-700">{emp.attendanceRate || 100}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Phân nhóm năng lực 9-Box:</span>
                        <span className="font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                          Chưa có đánh giá
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-900 text-[11px] space-y-1.5">
                        <div className="font-semibold flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Chưa có dữ liệu đánh giá hiệu suất</span>
                        </div>
                        <p className="text-amber-800 leading-relaxed">
                          Nhân sự chưa có dữ liệu đánh giá hiệu suất định kỳ từ cấp quản lý. Kết quả xếp loại 9-Box và nhận xét sẽ xuất hiện sau khi Trưởng phòng hoàn tất đánh giá.
                        </p>
                        {(isManager || canViewConfidential) && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              navigate(`/ai-analytics?review=${emp.id}`);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 hover:underline pt-0.5 cursor-pointer"
                          >
                            <span>Thực hiện đánh giá nhân sự này ngay</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200/90 space-y-3 shadow-2xs">
                  <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <h3 className="font-bold text-slate-900 uppercase text-[11px]">
                      Tiến độ và Trọng số nhiệm vụ được giao
                    </h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Phòng ban công tác:</span>
                      <span className="font-bold text-slate-800">{emp.department || 'Phòng ban trực thuộc'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Tiến độ công việc sprint:</span>
                      <span className="font-bold text-emerald-600">Đảm bảo tiến độ</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Trọng số KPI tháng:</span>
                      <span className="font-mono font-bold text-blue-600">{emp.kpiScore ? `${emp.kpiScore}%` : 'Đang cập nhật'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Thẩm quyền đánh giá:</span>
                      <span className="text-slate-700 font-semibold">Trưởng {emp.department || 'bộ phận'} trực tiếp</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Chế độ xem toàn quyền: HR Director / CEO / Cá nhân xem hồ sơ của chính mình */
          <>
            {/* Tab Selection */}
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

            {/* Tab Content */}
            {activeTab === 'info' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-white border border-slate-200/90 space-y-3">
                  <h3 className="font-bold text-slate-900 uppercase text-[11px] pb-1 border-b border-slate-100">
                    Thông tin cá nhân
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Số CCCD:</span>
                      <span className="font-mono font-bold text-slate-800">{emp.cccd || '079198001234'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Ngày cấp:</span>
                      <span className="text-slate-800 font-medium">10/02/2021 (Cục CSQLHC)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Quê quán:</span>
                      <span className="text-slate-800 font-medium">TP. Hà Nội</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Địa chỉ thường trú:</span>
                      <span className="text-slate-800 font-medium text-right max-w-[200px]">Cầu Giấy, Hà Nội</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200/90 space-y-3">
                  <h3 className="font-bold text-slate-900 uppercase text-[11px] pb-1 border-b border-slate-100">
                    Chế độ Bảo hiểm và Thuế
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Mã số BHXH:</span>
                      <span className="font-mono font-bold text-slate-800">7919028812</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Mã số thuế TNCN:</span>
                      <span className="font-mono font-bold text-slate-800">8392019283</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Số người phụ thuộc:</span>
                      <span className="text-slate-800 font-bold">01 người (Con nhỏ)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Thẻ BHYT khám chữa bệnh:</span>
                      <span className="text-emerald-700 font-bold">Bệnh viện Vinmec</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'salary' && (
              <div className="space-y-4 text-xs">
                {/* Chi tiết Hợp đồng và Chế độ tiền lương */}
                <div className="p-4 rounded-xl bg-white border border-slate-200/90 space-y-3">
                  <h3 className="font-bold text-slate-900 uppercase text-[11px] pb-1 border-b border-slate-100 flex items-center justify-between">
                    <span>Chi tiết Hợp đồng và Chế độ tiền lương</span>
                    <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-mono font-medium border border-blue-200">
                      Số: HĐLĐ-2023/0315-NEXUS
                    </span>
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-500 block mb-0.5">Lương cơ bản thỏa thuận:</span>
                      <span className="text-base font-bold font-mono text-blue-600">
                        {formatVND(emp.baseSalary || emp.contractSalary || 20000000)} / tháng
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5">Tài khoản nhận lương:</span>
                      <span className="text-sm font-bold font-mono text-slate-800">
                        {emp.bankAccount || '0071 9384 11'} ({emp.bankName || 'Vietcombank'})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5">Số dư ngày phép năm 2026:</span>
                      <span className="text-sm font-bold text-emerald-700">
                        {emp.leaveBalance || 9.5} ngày còn lại
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5">Ngày bắt đầu làm việc:</span>
                      <span className="text-sm font-medium text-slate-800">
                        {formatDateVN(emp.joinedDate) || emp.joinDate || '15/03/2023'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Khung tài liệu Hợp đồng lao động đã ký kết (PDF) */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs shadow-2xs">
                        PDF
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs">
                          Hop_dong_lao_dong_da_ky_{emp.id}.pdf
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          2.4 MB • Hợp đồng lao động không xác định thời hạn • Đã xác thực e-Sign và Đóng dấu đỏ
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
                        <span>Xem hợp đồng chi tiết đã ký (PDF)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsContractPdfOpen(true)}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs transition-colors cursor-pointer"
                        title="Tải tệp tin hợp đồng PDF"
                      >
                        <Download className="w-4 h-4 text-slate-600" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Người đại diện ký kết: <strong>{emp.signer || 'Ban Giám Đốc Doanh Nghiệp (CEO)'}</strong></span>
                    <span className="text-emerald-700 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Chữ ký số VNPT-CA hợp lệ
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'kpi' && (
              <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-200 space-y-3 text-xs text-purple-900">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-purple-600" />
                    <h3 className="font-bold uppercase text-[11px]">Đánh giá AI (Mô hình 9-Box Talent Matrix)</h3>
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
                      Nhân sự <strong>{emp.name}</strong> được Trưởng phòng đánh giá thuộc nhóm{' '}
                      <strong className={`px-2 py-0.5 rounded border ${cellMeta?.badge || 'bg-purple-100 text-purple-800'}`}>
                        Ô {cellNumber} — {cellMeta?.title || 'Đã xếp loại'}
                      </strong>{' '}
                      trong kỳ <strong>{periodLabel(latestReview.period)}</strong> với Điểm Hiệu suất: <strong>{Math.round(Number(latestReview.performance_score))}/100</strong> và Điểm Tiềm năng: <strong>{Math.round(Number(latestReview.potential_score))}/100</strong>.
                    </p>
                    <div className="p-3 bg-white/80 rounded-xl border border-purple-200 space-y-1">
                      <span className="text-[11px] font-bold text-purple-950 block">Nhận xét của Trưởng phòng:</span>
                      <p className="text-[11px] italic text-purple-900">"{latestReview.comments}"</p>
                      <div className="text-[10px] text-purple-700 pt-1 border-t border-purple-100 flex justify-between">
                        <span>Đánh giá bởi: <strong>{latestReview.reviewer_name || 'Trưởng phòng trực tiếp'}</strong></span>
                        <span>{formatDateVN(latestReview.updated_at || latestReview.created_at)}</span>
                      </div>
                    </div>
                    {cellMeta?.actions && cellMeta.actions.length > 0 && (
                      <div className="pt-2 border-t border-purple-200/70 text-[11px]">
                        <span className="font-bold text-purple-950 block mb-1">Khuyến nghị chiến lược nhân sự:</span>
                        <ul className="list-disc list-inside space-y-0.5 text-purple-800">
                          {cellMeta.actions.map((act, i) => (
                            <li key={i}>{act}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 space-y-1.5">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Chưa có đánh giá hiệu suất 9-Box kỳ này</span>
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      Nhân sự <strong>{emp.name}</strong> chưa có dữ liệu đánh giá từ cấp quản lý trực tiếp. Kết quả xếp loại năng lực 9-Box sẽ hiển thị tại đây khi Trưởng phòng hoàn tất đánh giá.
                    </p>
                    {(canViewConfidential || isManager) && (
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
              <span>In hồ sơ nhân sự (PDF)</span>
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

      {/* Contract Preview Modal */}
      <ContractPdfPreviewModal
        isOpen={isContractPdfOpen}
        onClose={() => setIsContractPdfOpen(false)}
        emp={emp}
      />
    </AppleModal>
  );
}
