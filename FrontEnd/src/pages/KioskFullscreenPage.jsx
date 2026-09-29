import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  Clock, 
  Building2,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  Wifi,
  Smartphone,
  KeyRound,
  MapPin
} from 'lucide-react';
import attendanceService from '../services/attendanceService';

export default function KioskFullscreenPage() {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [kioskCode, setKioskCode] = useState('------');
  const [expiresIn, setExpiresIn] = useState(20);
  const [stepDuration, setStepDuration] = useState(20);
  const [recentPunches, setRecentPunches] = useState([]);

  // Đồng hồ thời gian thực
  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Lấy mã Kiosk định kỳ từ Backend
  const fetchKioskCode = async () => {
    try {
      const res = await attendanceService.getKioskCode();
      if (res && res.success && res.data) {
        setKioskCode(res.data.code);
        setExpiresIn(res.data.expiresIn || 20);
        setStepDuration(res.data.stepDuration || 20);
      }
    } catch (err) {
      console.warn('Lỗi lấy mã Kiosk:', err);
    }
  };

  // Lấy lượt chấm công gần nhất
  const fetchRecentLogs = async () => {
    try {
      const res = await attendanceService.getLive();
      if (res && res.success && Array.isArray(res.data)) {
        setRecentPunches(res.data.slice(0, 4));
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchKioskCode();
    fetchRecentLogs();

    // Đếm ngược từng giây tại client
    const countdownTimer = setInterval(() => {
      setExpiresIn((prev) => {
        if (prev <= 1) {
          fetchKioskCode();
          fetchRecentLogs();
          return 20;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownTimer);
  }, []);

  // Tính phần trăm vòng tròn đếm ngược
  const progressPercent = Math.max(0, Math.min(100, (expiresIn / stepDuration) * 100));
  const strokeDashoffset = 283 - (283 * progressPercent) / 100; // Chu vi r=45 là ~283

  // Tách 6 chữ số
  const digits = kioskCode ? kioskCode.padEnd(6, '-').split('').slice(0, 6) : ['-', '-', '-', '-', '-', '-'];

  return (
    <div className="h-screen w-screen bg-[#f8fafc] bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] text-slate-900 flex flex-col justify-between select-none overflow-hidden relative font-sans">
      {/* Background Ambient Aura (Soft Pastel Glows) */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] bg-gradient-to-tr from-emerald-100/50 via-teal-100/30 to-blue-100/40 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-blue-100/40 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute -top-20 -right-20 w-96 h-96 bg-emerald-100/40 blur-[120px] rounded-full pointer-events-none" />

      {/* Header - Apple Glassmorphism */}
      <header className="px-8 py-4 flex items-center justify-between z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl shadow-2xs">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/attendance')}
            className="px-3.5 py-2 rounded-xl bg-slate-100/90 hover:bg-slate-200 text-slate-700 transition-all active:scale-95 cursor-pointer flex items-center gap-2 text-xs font-bold border border-slate-200/80 shadow-2xs"
            title="Quay lại Chấm công"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
            <span>Thoát Kiosk</span>
          </button>

          <div className="h-6 w-px bg-slate-200" />

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-blue-600 flex items-center justify-center font-bold text-xl text-white shadow-md shadow-emerald-600/20">
              N
            </div>
            <div>
              <div className="font-bold text-base tracking-wide text-slate-900 flex items-center gap-2 font-display">
                <span>KIOSK ĐIỂM DANH CỔNG A1</span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-extrabold flex items-center gap-1.5 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  ONLINE
                </span>
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Trụ sở chính NEXUS • Tòa nhà Innovation, Cầu Giấy, Hà Nội</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Digital Clock */}
        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 font-medium bg-slate-100/80 px-3 py-1.5 rounded-xl border border-slate-200/60">
            <Wifi className="w-3.5 h-3.5 text-emerald-600" />
            <span>Kết nối máy chủ thời gian thực</span>
          </div>

          <div className="text-right">
            <div className="font-mono text-3xl font-extrabold tracking-tight text-slate-900 flex items-center justify-end gap-2">
              <Clock className="w-6 h-6 text-emerald-600" />
              <span>{currentTime.toLocaleTimeString('vi-VN')}</span>
            </div>
            <div className="text-xs text-slate-500 font-medium capitalize mt-0.5">
              {currentTime.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
            </div>
          </div>
        </div>
      </header>

      {/* Main Center Display */}
      <main className="flex-1 flex flex-col items-center justify-center relative p-6 z-10 max-w-5xl mx-auto w-full">
        {/* Main Luxury Glass Card */}
        <div className="relative w-full max-w-3xl bg-white/95 backdrop-blur-2xl border border-slate-200/80 rounded-[36px] p-8 md:p-12 shadow-[0_25px_60px_-15px_rgba(15,23,42,0.08),0_0_0_1px_rgba(255,255,255,0.9)_inset] flex flex-col items-center space-y-7">
          
          {/* Top Decorative Subtle Light Bar */}
          <div className="w-20 h-1 rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-blue-500 opacity-80" />

          {/* 6 Digit Cards Display (3 - 3 Format mirroring attendance input pad) */}
          <div className="w-full flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={kioskCode}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex items-center justify-center gap-2 sm:gap-3 md:gap-4"
              >
                {/* 3 Digits Left */}
                {digits.slice(0, 3).map((digit, idx) => (
                  <div
                    key={`d1-${idx}`}
                    className="w-14 h-22 sm:w-20 sm:h-28 md:w-24 md:h-34 rounded-2xl md:rounded-3xl bg-gradient-to-b from-white via-emerald-50/15 to-emerald-50/35 border-2 border-emerald-400/80 shadow-[0_8px_20px_rgba(16,185,129,0.07),inset_0_1px_1px_rgba(255,255,255,1)] flex items-center justify-center font-mono text-5xl sm:text-6xl md:text-7xl font-black text-emerald-800 transition-all"
                  >
                    {digit}
                  </div>
                ))}

                {/* Hyphen Separator */}
                <div className="text-emerald-400 font-light text-3xl sm:text-4xl md:text-5xl select-none px-1 sm:px-2 md:px-3">
                  -
                </div>

                {/* 3 Digits Right */}
                {digits.slice(3, 6).map((digit, idx) => (
                  <div
                    key={`d2-${idx}`}
                    className="w-14 h-22 sm:w-20 sm:h-28 md:w-24 md:h-34 rounded-2xl md:rounded-3xl bg-gradient-to-b from-white via-emerald-50/15 to-emerald-50/35 border-2 border-emerald-400/80 shadow-[0_8px_20px_rgba(16,185,129,0.07),inset_0_1px_1px_rgba(255,255,255,1)] flex items-center justify-center font-mono text-5xl sm:text-6xl md:text-7xl font-black text-emerald-800 transition-all"
                  >
                    {digit}
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Circular Countdown Progress Pill */}
          <div className="inline-flex items-center gap-3.5 bg-slate-50/90 backdrop-blur-md px-5 py-2.5 rounded-full border border-slate-200/90 shadow-2xs">
            {/* SVG Radial Progress */}
            <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  className="stroke-slate-200"
                  strokeWidth="10"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  className={`transition-all duration-1000 ease-linear ${
                    expiresIn <= 5 ? 'stroke-amber-500' : 'stroke-emerald-600'
                  }`}
                  strokeWidth="10"
                  fill="transparent"
                  strokeDasharray="283"
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </svg>
              <span className={`absolute font-mono text-[10px] font-extrabold ${
                expiresIn <= 5 ? 'text-amber-600' : 'text-slate-900'
              }`}>
                {expiresIn}
              </span>
            </div>

            <div className="text-xs text-slate-600 font-medium">
              Mã sẽ đổi mới sau <strong className={`font-mono font-bold ${
                expiresIn <= 5 ? 'text-amber-600' : 'text-emerald-700'
              }`}>{expiresIn}s</strong>
            </div>
          </div>
        </div>
      </main>

      {/* Footer / Live Ticker - Clean Apple Glassmorphism */}
      <footer className="px-8 py-3.5 bg-white/85 backdrop-blur-xl border-t border-slate-200/80 flex items-center justify-between text-xs z-20">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Lượt chấm công vừa qua:
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {recentPunches.length > 0 ? (
              recentPunches.map((p, i) => (
                <div key={p.id || i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-bold text-slate-800">{p.full_name || p.employee_id}</span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    {p.event_time ? new Date(p.event_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Vừa xong'}
                  </span>
                </div>
              ))
            ) : (
              <span className="text-slate-400 italic">Sẵn sàng nhận lượt chấm công mới...</span>
            )}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Bảo mật TOTP thời gian thực</span>
        </div>
      </footer>
    </div>
  );
}
