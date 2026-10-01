import React, { useState } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { 
  UserPlus, 
  CheckCircle2, 
  ShieldCheck, 
  Mail, 
  Key, 
  User, 
  QrCode, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft,
  Send,
  FileText,
  CreditCard,
  KeyRound
} from 'lucide-react';
import confetti from 'canvas-confetti';
import employeeService from '../../services/employeeService';

const DEPT_NAME_MAP = {
  'DEPT-IT': 'Phòng Phát triển Phần mềm',
  'DEPT-HR': 'Nhân sự và Vận hành',
  'DEPT-SALES': 'Kinh doanh và Dự án',
  'DEPT-ACC': 'Tài chính Kế toán',
  'DEPT-MKT': 'Marketing và Truyền thông',
  'DEPT-CEO': 'Ban Điều Hành và Lãnh Đạo',
};

export default function OnboardingModal({ isOpen, onClose }) {
  const [activeStep, setActiveStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('1998-05-15');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('Nam');
  const [cccd, setCccd] = useState('');
  const [department, setDepartment] = useState('DEPT-IT');
  const [role, setRole] = useState('Kỹ sư Phần mềm');
  const [contractType, setContractType] = useState('Hợp đồng thử việc 02 tháng');
  const [salary, setSalary] = useState('22000000');
  const [assignedRole, setAssignedRole] = useState('employee');
  const [email, setEmail] = useState('');
  const [employeeId] = useState(() => `NV-${Math.floor(2000 + Math.random() * 7999)}`);
  const [badgeNumber] = useState(() => `NX-${Math.floor(1000 + Math.random() * 8999)}`);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);

    const formattedDob = dob.includes('/') ? dob.split('/').reverse().join('-') : (dob || '1998-01-01');

    const finalName = fullName.trim() || 'Nhân viên mới';
    const computedEmail = email.trim() || `${finalName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '.')}@nexus.vn`;

    const newEmployee = {
      id: employeeId,
      name: finalName,
      role: role,
      department: DEPT_NAME_MAP[department] || 'Phòng Phát triển Phần mềm',
      email: computedEmail,
      phone: phone || '0901 234 567',
      avatar: gender === 'Nữ'
        ? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80'
        : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      contractSalary: Number(salary) || 22000000,
      status: 'active',
      type: contractType.toLowerCase().includes('thử việc') ? 'Thử việc' : 'Toàn thời gian',
      joinDate: new Date().toLocaleDateString('vi-VN'),
      leaveBalance: 12,
      cccd: cccd || '079198001234',
      bankAccount: '1029 3847 55',
      bankName: 'Vietcombank',
      kpiScore: 100.0,
      attendanceRate: 100.0,
      badgeNumber: badgeNumber,
      badgeId: badgeNumber
    };

    // 1. Try to persist to PostgreSQL backend API
    try {
      await employeeService.create({
        fullName: finalName,
        departmentId: department,
        jobTitle: role,
        workEmail: computedEmail,
        phoneNumber: phone || '0901234567',
        citizenId: cccd && (cccd.length === 9 || cccd.length === 12) ? cccd : '079198001234',
        dateOfBirth: formattedDob,
        gender: gender === 'Nữ' ? 'Nu' : 'Nam',
        baseSalary: Number(salary) || 22000000,
        contractType: contractType.toLowerCase().includes('thử việc') ? 'THU_VIEC' : 'CHINH_THUC',
        joinedDate: new Date().toISOString().split('T')[0],
      });
    } catch (err) {
      console.warn('API save notice (fallback to local state):', err.message || err);
    }

    // 2. Dispatch custom event so Page4_Directory updates immediately in UI
    window.dispatchEvent(new CustomEvent('nexus:employee-added', { detail: newEmployee }));

    try {
      confetti({ particleCount: 70, spread: 80, origin: { y: 0.6 } });
    } catch (err) {}

    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 1400);
  };

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Tiếp nhận nhân sự mới và Cấp tài khoản"
      subtitle={`Quy trình Onboarding 3 bước chuẩn doanh nghiệp • Mã nhân sự ${employeeId}`}
      badge={
        <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
          Onboarding HR Standard
        </span>
      }
      maxWidth="max-w-2xl"
    >
      <div className="p-6 space-y-5">
        {/* Step Tracker (3 Practical Steps - Removed Face ID Cổng) */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center justify-between text-xs">
          {/* Step 1 */}
          <button
            type="button"
            onClick={() => setActiveStep(1)}
            className={`flex items-center gap-2 font-bold cursor-pointer transition-colors ${
              activeStep === 1
                ? 'text-blue-700'
                : activeStep > 1
                ? 'text-emerald-700'
                : 'text-slate-400'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              activeStep > 1
                ? 'bg-emerald-600 text-white'
                : activeStep === 1
                ? 'bg-blue-600 text-white ring-2 ring-blue-100'
                : 'bg-slate-200 text-slate-600'
            }`}>
              {activeStep > 1 ? '✓' : '1'}
            </span>
            <span>1. Hồ sơ & Hợp đồng</span>
          </button>

          <div className="flex-1 mx-2 h-[2px] bg-slate-200" />

          {/* Step 2 */}
          <button
            type="button"
            onClick={() => setActiveStep(2)}
            className={`flex items-center gap-2 font-bold cursor-pointer transition-colors ${
              activeStep === 2
                ? 'text-blue-700'
                : activeStep > 2
                ? 'text-emerald-700'
                : 'text-slate-400'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              activeStep > 2
                ? 'bg-emerald-600 text-white'
                : activeStep === 2
                ? 'bg-blue-600 text-white ring-2 ring-blue-100'
                : 'bg-slate-200 text-slate-600'
            }`}>
              {activeStep > 2 ? '✓' : '2'}
            </span>
            <span>2. Cấp tài khoản & Quyền</span>
          </button>

          <div className="flex-1 mx-2 h-[2px] bg-slate-200" />

          {/* Step 3: Thẻ nhân viên số & Sổ tay gia nhập */}
          <button
            type="button"
            onClick={() => setActiveStep(3)}
            className={`flex items-center gap-2 font-bold cursor-pointer transition-colors ${
              activeStep === 3
                ? 'text-blue-700'
                : 'text-slate-400'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              activeStep === 3
                ? 'bg-blue-600 text-white ring-2 ring-blue-100'
                : 'border border-slate-300 bg-white text-slate-400'
            }`}>
              3
            </span>
            <span>3. Thẻ nhân viên số & Sổ tay</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* STEP 1: Hồ sơ & Hợp đồng */}
          {activeStep === 1 && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <span className="font-bold uppercase tracking-wider text-slate-700 text-[11px]">
                  I. Thông tin cá nhân và Hợp đồng lao động
                </span>
                <span className="text-slate-400 text-[11px]">Nhập đầy đủ thông tin pháp lý</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Họ và tên nhân sự *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Lê Thị Thảo Vy"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Ngày sinh</label>
                    <input
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Giới tính</label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
                    >
                      <option>Nam</option>
                      <option>Nữ</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Số Căn cước công dân (CCCD) *</label>
                  <input
                    type="text"
                    required
                    placeholder="12 chữ số CCCD"
                    value={cccd}
                    onChange={(e) => setCccd(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Số điện thoại liên lạc *</label>
                  <input
                    type="text"
                    required
                    placeholder="09xx xxx xxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Phòng ban tiếp nhận *</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white"
                  >
                    <option value="DEPT-IT">Phòng Phát triển Phần mềm (IT)</option>
                    <option value="DEPT-HR">Nhân sự và Vận hành (HR)</option>
                    <option value="DEPT-SALES">Kinh doanh và Dự án (Sales)</option>
                    <option value="DEPT-ACC">Tài chính Kế toán (Finance)</option>
                    <option value="DEPT-MKT">Marketing và Truyền thông</option>
                    <option value="DEPT-CEO">Ban Tổng Giám Đốc</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Chức danh công việc *</label>
                  <input
                    type="text"
                    required
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Loại hợp đồng</label>
                  <select
                    value={contractType}
                    onChange={(e) => setContractType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
                  >
                    <option>Hợp đồng thử việc 02 tháng</option>
                    <option>Hợp đồng không xác định thời hạn</option>
                    <option>Hợp đồng có thời hạn 12 tháng</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Lương thỏa thuận hợp đồng (Gross)</label>
                  <input
                    type="text"
                    value={Number(salary).toLocaleString('vi-VN') + ' đ'}
                    onChange={(e) => setSalary(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                >
                  <span>Sang Bước 2: Cấp tài khoản</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Cấp tài khoản & Phân quyền */}
          {activeStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-3">
                <div className="flex items-center gap-2 font-bold text-blue-900 text-xs uppercase tracking-wider">
                  <Key className="w-4 h-4 text-blue-600" />
                  <span>II. Thiết lập tài khoản hệ thống doanh nghiệp</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Mã nhân viên tự sinh:</label>
                    <span className="bg-blue-100 text-blue-800 font-mono font-bold px-3 py-2 rounded-xl border border-blue-200 block text-center text-xs">
                      {employeeId}
                    </span>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Hòm thư công vụ:</label>
                    <input
                      type="email"
                      placeholder="ho.ten@nexus.vn"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Phân quyền vai trò:</label>
                    <select
                      value={assignedRole}
                      onChange={(e) => setAssignedRole(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                    >
                      <option value="employee">👤 Nhân viên ESS (Cấp 3)</option>
                      <option value="manager">🛡️ Trưởng phòng / Lead (Cấp 2B)</option>
                      <option value="admin">⚙️ Quản trị viên HR (Cấp 2A)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Mật khẩu bảo mật khởi tạo ngẫu nhiên sẽ được gửi tự động qua email công vụ của nhân sự mới.</span>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Quay lại Bước 1</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                >
                  <span>Sang Bước 3: Thẻ nhân viên số & Sổ tay</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Thẻ Nhân Viên Số & Hướng Dẫn Hội Nhập */}
          {activeStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-gradient-to-br from-indigo-50/70 via-blue-50/40 to-slate-50 border border-indigo-200/90 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between pb-1 border-b border-indigo-100/70">
                  <div className="flex items-center gap-2 font-bold text-indigo-950 text-xs uppercase tracking-wider">
                    <CreditCard className="w-4 h-4 text-indigo-600" />
                    <span>III. Cấp Thẻ Nhân Viên Số & Hướng Dẫn Hội Nhập</span>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-700 bg-white px-2.5 py-0.5 rounded-full border border-indigo-200 flex items-center gap-1 shadow-2xs">
                    <ShieldCheck className="w-3 h-3 text-indigo-600" />
                    <span>Chuẩn Định Danh ISO 27001</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-stretch">
                  {/* Card 1: Thẻ Nhân Viên Điện Tử (Virtual Smart Badge) */}
                  <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 text-white p-4 rounded-xl shadow-md border border-indigo-400/30 flex flex-col justify-between space-y-3">
                    <div className="absolute -top-10 -right-10 w-28 h-28 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />
                    
                    <div className="flex items-center justify-between relative z-10">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-lg bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center">
                          <CreditCard className="w-3.5 h-3.5 text-indigo-300" />
                        </div>
                        <span className="text-[10px] font-bold tracking-widest text-indigo-200 uppercase">
                          NEXUS SMART BADGE
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Đã kích hoạt
                      </span>
                    </div>

                    <div className="space-y-1 relative z-10 pt-1">
                      <div className="text-[10px] text-indigo-200 font-medium">Mã định danh nhân sự</div>
                      <div className="text-xl font-mono font-black tracking-wider text-white">
                        {employeeId}
                      </div>
                      <div className="text-xs font-bold text-slate-100 truncate pt-0.5">
                        {fullName.trim() || 'Nhân viên mới'}
                      </div>
                      <div className="text-[10px] text-indigo-200/80 truncate">
                        {role} • {DEPT_NAME_MAP[department] || department}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-indigo-500/20 flex items-center justify-between text-[10px] text-indigo-200/90 relative z-10 font-mono">
                      <span>Mã thẻ: {badgeNumber}</span>
                      <span className="text-indigo-300 font-sans font-medium flex items-center gap-1">
                        <QrCode className="w-3 h-3" /> QR Sẵn sàng
                      </span>
                    </div>
                  </div>

                  {/* Card 2: Quy Trình Điểm Danh & Chấm Công Chuẩn */}
                  <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-2xs flex flex-col justify-between space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
                        <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <span className="text-xs font-bold text-slate-900">
                        Phương Thức Chấm Công Tích Hợp
                      </span>
                    </div>

                    <div className="space-y-2 text-[11px] text-slate-600">
                      <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 space-y-0.5">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                          Nhập mã Kiosk sảnh (Mã 6 số động)
                        </div>
                        <p className="text-[10px] text-slate-500 pl-3">
                          Nhập mã hiển thị trên màn hình Kiosk sảnh (cập nhật 20s/lần) kèm định vị GPS trụ sở.
                        </p>
                      </div>

                      <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 space-y-0.5">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                          Quét mã QR Thẻ nhân viên số
                        </div>
                        <p className="text-[10px] text-slate-500 pl-3">
                          Quét QR trên thẻ hoặc Mobile App tại camera Kiosk cổng A1 để tự động ghi nhận Vào/Ra ca.
                        </p>
                      </div>
                    </div>

                    <div className="text-[10px] text-blue-700 bg-blue-50/70 px-2 py-1 rounded-md border border-blue-100 font-medium">
                      ✓ Quyền chấm công tự động kích hoạt ngay sau khi hoàn tất Onboarding.
                    </div>
                  </div>
                </div>

                {/* Sổ tay Onboarding & Hướng dẫn gia nhập */}
                <div className="p-3.5 bg-white rounded-xl border border-indigo-100 flex items-center justify-between text-xs shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <strong className="text-slate-800 font-bold block">
                        Sổ tay văn hóa doanh nghiệp & Hướng dẫn gia nhập (PDF)
                      </strong>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Tự động đính kèm gửi vào hòm thư công vụ {email.trim() || 'email nhân viên mới'}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Sẵn sàng gửi</span>
                  </span>
                </div>
              </div>

              {/* Bottom Navigation */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Quay lại Bước 2</span>
                </button>

                <button
                  type="submit"
                  disabled={submitted}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {submitted ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                      <span>Đã tạo hồ sơ & Kích hoạt Onboarding!</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Hoàn tất & Cấp tài khoản nhân sự</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </AppleModal>
  );
}
