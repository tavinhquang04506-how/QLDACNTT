import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import authService from '../services/authService';
import { 
  BadgeCheck, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Globe
} from 'lucide-react';

export default function Page1_Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated, currentRole } = useAuth();

  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoNotice, setInfoNotice] = useState('');

  // Tự động chuyển trang nếu đã đăng nhập hợp lệ
  React.useEffect(() => {
    if (isAuthenticated) {
      if (currentRole?.key === 'EMPLOYEE') {
        navigate('/portal', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [isAuthenticated, currentRole, navigate]);

  const idToEmailMap = {
    'NV-0001': 'ceo@fwbnexus.vn',
    'NV-1001': 'hrd@fwbnexus.vn',
    'NV-1002': 'lead@fwbnexus.vn',
    'NV-0842': 'employee@fwbnexus.vn',
    'NV-1003': 'thao.dang@fwbnexus.vn',
    'NV-1004': 'trong.tran@fwbnexus.vn',
    'NV-1007': 'bao.hoang@fwbnexus.vn',
  };

  const handleLogin = async (e) => {
    e?.preventDefault();
    const cleanId = employeeId.trim();
    if (!cleanId || !password) {
      setErrorMessage('Vui lòng nhập đầy đủ mã nhân viên/email và mật khẩu');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    const mappedEmail = idToEmailMap[cleanId.toUpperCase()];
    const emailToUse = mappedEmail || (cleanId.includes('@') ? cleanId : `${cleanId.toLowerCase()}@fwbnexus.vn`);

    try {
      const res = await authService.login(emailToUse, password);
      setIsLoading(false);
      if (res?.success) {
        const user = res.user;
        const role = user?.roleCode;
        login(res.accessToken || res.token, user);
        if (role === 'EMPLOYEE') {
          navigate('/portal');
        } else {
          navigate('/dashboard');
        }
      } else {
        setErrorMessage(res?.message || 'Email hoặc mật khẩu không chính xác');
      }
    } catch (err) {
      setIsLoading(false);
      console.warn('API login error:', err);
      setErrorMessage(err?.message || 'Đăng nhập không thành công, vui lòng kiểm tra lại thông tin');
    }
  };

  return (
    <div 
      className="min-h-screen w-full flex flex-col justify-center items-center select-none relative overflow-x-hidden"
      style={{
        backgroundColor: '#F8FAFC',
        backgroundImage: 'radial-gradient(rgba(37, 99, 235, 0.05) 1px, transparent 1px), radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.07), transparent 70%)',
        backgroundSize: '24px 24px, 100% 100%'
      }}
    >
      {/* Top right language */}
      <div className="fixed top-5 right-6 z-20 flex items-center gap-2.5">
        <button 
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-2xs text-[12px] font-semibold text-slate-700 hover:bg-white hover:border-slate-300 transition-colors"
        >
          <Globe className="w-3.5 h-3.5 text-slate-500" />
          <span>Tiếng Việt</span>
        </button>
      </div>

      {/* Main Container: Centered Login Card */}
      <main className="w-full flex-1 flex items-center justify-center p-4 md:p-8">
        <motion.div 
          className="w-full max-w-[440px]"
          initial={{ opacity: 0, scale: 0.98, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="w-full bg-white border border-slate-200/90 rounded-3xl p-7 md:p-9 shadow-xl relative">
            {/* Header */}
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-600 flex items-center justify-center text-white font-extrabold text-2xl shadow-lg shadow-blue-500/25">
                N
              </div>

              <div className="mt-4 flex items-center justify-center">
                <span className="text-base font-extrabold text-slate-900 tracking-wider font-display uppercase">
                  NEXUS HRMS
                </span>
              </div>

              <h1 className="mt-1 text-xl font-black text-slate-900 font-display tracking-tight">
                Đăng nhập Hệ thống
              </h1>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Info Notice */}
            {infoNotice && (
              <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-blue-600" />
                  <span>{infoNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setInfoNotice('')}
                  className="text-blue-500 hover:text-blue-800 text-xs font-bold px-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              {/* Employee ID */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Mã Nhân Viên / Email Công Việc:
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <BadgeCheck className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder="Nhập mã nhân viên hoặc email..."
                    className="w-full h-11 pl-10 pr-4 text-xs font-medium bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 rounded-xl outline-none transition-all"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Mật khẩu:</label>
                  <button
                    type="button"
                    onClick={() => setInfoNotice('Vui lòng liên hệ phòng IT Helpdesk qua email: it-support@fwbnexus.vn hoặc Hotline 0900.000.001 để được hỗ trợ cấp lại mật khẩu.')}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                  >
                    Quên mật khẩu?
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu..."
                    className="w-full h-11 pl-10 pr-10 text-xs font-medium bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 rounded-xl outline-none transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-xs text-slate-600 font-medium">Duy trì đăng nhập trong 30 ngày</span>
                </label>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all duration-150 flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-75 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang xác thực bảo mật...</span>
                    </>
                  ) : (
                    <>
                      <span>Đăng nhập vào Hệ thống</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Quick Test Accounts (4 Cấp độ) */}
            <div className="mt-6 pt-5 border-t border-slate-100">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center mb-3">
                Chọn nhanh tài khoản thử nghiệm (4 cấp độ):
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEmployeeId('ceo@fwbnexus.vn');
                    setPassword('Ceo@123456');
                  }}
                  className="p-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200/80 text-left transition-all cursor-pointer group"
                >
                  <div className="text-[11px] font-bold text-purple-700 flex items-center gap-1">
                    <span>👑</span> Cấp 1: CEO
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">ceo@fwbnexus.vn</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEmployeeId('hrd@fwbnexus.vn');
                    setPassword('Hrd@123456');
                  }}
                  className="p-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200/80 text-left transition-all cursor-pointer group"
                >
                  <div className="text-[11px] font-bold text-blue-700 flex items-center gap-1">
                    <span>💼</span> Cấp 2A: HRD
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">hrd@fwbnexus.vn</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEmployeeId('lead@fwbnexus.vn');
                    setPassword('Lead@123456');
                  }}
                  className="p-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 text-left transition-all cursor-pointer group"
                >
                  <div className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                    <span>👥</span> Cấp 2B: Trưởng phòng
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">lead@fwbnexus.vn</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEmployeeId('employee@fwbnexus.vn');
                    setPassword('Emp@123456');
                  }}
                  className="p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200/80 text-left transition-all cursor-pointer group"
                >
                  <div className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
                    <span>👤</span> Cấp 3: Nhân viên
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">employee@fwbnexus.vn</div>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
