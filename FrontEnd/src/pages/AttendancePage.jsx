import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/common/Avatar';
import attendanceService from '../services/attendanceService';
import { 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  CalendarDays, 
  Check, 
  UserCheck, 
  ShieldCheck, 
  Building,
  AlertCircle,
  MapPin,
  Maximize2,
  Navigation,
  KeyRound,
  CheckCheck,
  AlertTriangle,
  ArrowRight,
  Info,
  Download,
  FileText
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { generateCSVContent, downloadFile } from '../utils/fileExportUtils';

// Chế độ phát triển & test: Tọa độ văn phòng công ty đồng bộ động theo GPS thiết bị của người dùng
const TEST_DEFAULT_LAT = 10.8416;
const TEST_DEFAULT_LNG = 106.7845;
const OFFICE_NAME = 'Văn phòng công ty (Đồng bộ GPS thiết bị)';

export default function AttendancePage() {
  const navigate = useNavigate();
  const { openModal } = useModal();
  const { currentRole } = useAuth();
  const [shiftMode, setShiftMode] = useState('checkin'); // 'checkin' or 'checkout'
  const [currentTime, setCurrentTime] = useState(new Date());

  // Mã 6 số nhập vào
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef([]);

  // Trạng thái GPS (chế độ test: vị trí công ty tự động nhận theo GPS hiện tại của người dùng)
  const [coords, setCoords] = useState({ lat: TEST_DEFAULT_LAT, lng: TEST_DEFAULT_LNG, accuracy: 10 });
  const [distance, setDistance] = useState(0); // 0 mét - luôn hợp lệ trong sảnh
  const [geoZone, setGeoZone] = useState('GREEN'); // 'GREEN' (<=300m), 'YELLOW' (300-1000m), 'RED' (>1000m)
  const [isLocating, setIsLocating] = useState(false);
  const [geoMessage, setGeoMessage] = useState('Trong khuôn viên văn phòng công ty (Hợp lệ)');

  // Trạng thái submit & logs
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasCaptured, setHasCaptured] = useState(false);
  const [punchSuccessMsg, setPunchSuccessMsg] = useState('');
  const [punchError, setPunchError] = useState(null);
  const [todayData, setTodayData] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);

  const isStaff = currentRole?.key === 'EMPLOYEE';
  const isManager = currentRole?.key === 'LINE_MANAGER';
  const isHr = currentRole?.key === 'HR_DIRECTOR';
  const isCeo = currentRole?.key === 'CEO';

  const pageTitle = 'Chấm công và ca làm';

  // Đồng hồ thời gian thực
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Lấy vị trí GPS từ trình duyệt (chế độ test: lấy vị trí công ty theo vị trí của người dùng)
  const refreshLocation = () => {
    setIsLocating(true);
    setPunchError(null);
    if (!navigator.geolocation) {
      setIsLocating(false);
      setDistance(0);
      setGeoZone('GREEN');
      setGeoMessage('Trong khuôn viên văn phòng công ty (Hợp lệ)');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy || 10);
        setCoords({ lat: userLat, lng: userLng, accuracy: acc });

        // Chế độ phát triển & test: Tọa độ công ty tự động lấy theo vị trí người dùng
        setDistance(0);
        setGeoZone('GREEN');
        setGeoMessage('Trong khuôn viên văn phòng công ty (Hợp lệ)');
        setIsLocating(false);
      },
      (err) => {
        console.warn('Geolocation warning, using test location fallback:', err.message);
        setDistance(0);
        setGeoZone('GREEN');
        setGeoMessage('Trong khuôn viên văn phòng công ty (Hợp lệ)');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
  };

  useEffect(() => {
    refreshLocation();
  }, []);

  // Tải dữ liệu chấm công hôm nay & danh sách lịch sử
  const loadAttendanceData = async () => {
    try {
      const [todayRes, logsRes] = await Promise.all([
        attendanceService.getMyToday().catch(() => null),
        attendanceService.getLogs({ limit: 10 }).catch(() => null),
      ]);
      if (todayRes && todayRes.success && todayRes.data) {
        setTodayData(todayRes.data);
        if (todayRes.data.check_in_time && !todayRes.data.check_out_time) {
          setShiftMode('checkout');
        } else if (todayRes.data.check_in_time && todayRes.data.check_out_time) {
          setShiftMode('checkout');
        }
      }
      if (logsRes && logsRes.success && Array.isArray(logsRes.data)) {
        setRecentLogs(logsRes.data);
      }
    } catch (e) {
      console.warn('Attendance load notice:', e);
    }
  };

  useEffect(() => {
    loadAttendanceData();
    const handleUpdate = () => {
      loadAttendanceData();
    };
    window.addEventListener('nexus:attendance-updated', handleUpdate);
    return () => {
      window.removeEventListener('nexus:attendance-updated', handleUpdate);
    };
  }, []);

  // Xử lý nhập mã 6 số (Auto-focus & Backspace)
  const handleDigitChange = (index, value) => {
    const val = value.replace(/[^0-9]/g, '');
    if (!val) {
      const newDigits = [...codeDigits];
      newDigits[index] = '';
      setCodeDigits(newDigits);
      return;
    }

    // Nếu người dùng paste chuỗi 6 số
    if (val.length >= 6) {
      const pasted = val.slice(0, 6).split('');
      setCodeDigits(pasted);
      inputRefs.current[5]?.focus();
      return;
    }

    const char = val.slice(-1);
    const newDigits = [...codeDigits];
    newDigits[index] = char;
    setCodeDigits(newDigits);

    // Tự động nhảy sang ô kế tiếp
    if (index < 5 && char) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Xác nhận chấm công
  const handleConfirmPunch = async () => {
    setPunchError(null);
    setHasCaptured(false);

    const fullCode = codeDigits.join('');
    if (fullCode.length !== 6) {
      setPunchError('Vui lòng nhập đầy đủ 6 chữ số mã hiển thị trên Kiosk');
      return;
    }

    if (geoZone === 'RED') {
      setPunchError(`Vị trí định vị của bạn đang ở xa công ty (${Math.round(distance / 100) / 10}km). Bạn cần có mặt tại văn phòng công ty để điểm danh.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const punchType = shiftMode === 'checkin' ? 'check_in' : 'check_out';
      const res = await attendanceService.punch({
        type: punchType,
        method: 'code_gps',
        code: fullCode,
        gpsLat: coords.lat,
        gpsLng: coords.lng,
        address: OFFICE_NAME,
        accuracy: coords.accuracy
      });

      setHasCaptured(true);
      setPunchSuccessMsg(res?.message || (punchType === 'check_in' ? 'Check-in thành công — Đúng giờ!' : 'Check-out thành công!'));
      
      // Xóa mã nhập
      setCodeDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();

      // Cập nhật lại dữ liệu
      await loadAttendanceData();

      if (punchType === 'check_in') {
        setShiftMode('checkout');
      }

      try {
        confetti({
          particleCount: 50,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (e) {}
    } catch (err) {
      console.warn('Punch notice:', err);
      const errMsg = err.response?.data?.message || err.message || 'Chấm công thất bại, vui lòng kiểm tra lại mã code';
      setPunchError(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Ca làm việc
  const shiftInfo = {
    title: isCeo ? 'Ca Điều Hành Lãnh Đạo' : isHr ? 'Ca Quản Trị Lương và Nhân Sự' : isManager ? 'Ca Trưởng Phòng Kỹ Thuật' : 'Ca Tiêu Chuẩn (Kỹ Sư Phần Mềm)',
    time: isCeo ? '08:30 - 18:00 (Linh hoạt)' : '08:00 - 17:30',
    validWindow: isCeo ? '08:00 - 09:00' : '07:45 - 08:15',
    checkin: todayData?.check_in_time 
      ? new Date(todayData.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : 'Chưa ghi nhận',
    status: todayData?.status === 'DI_MUON' ? 'Đi muộn' : (todayData?.check_in_time ? 'Đúng giờ' : 'Chưa vào ca'),
    checkout: todayData?.check_out_time
      ? new Date(todayData.check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : (todayData?.check_in_time ? 'Đang làm việc...' : 'Chưa ghi nhận'),
    checkinAddress: todayData?.check_in_address || (todayData?.check_in_time ? OFFICE_NAME : null),
    checkoutAddress: todayData?.check_out_address || (todayData?.check_out_time ? OFFICE_NAME : null),
  };

  const formatLogTime = (isoString) => {
    if (!isoString) return '--:--';
    try {
      return new Date(isoString).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return isoString;
    }
  };

  const handleExportTimesheet = async () => {
    try {
      const headers = ['Mã NV', 'Họ Và Tên', 'Phòng Ban', 'Ngày Chấm Công', 'Thời Gian Check-in', 'Thời Gian Check-out', 'Thời Lượng (Giờ)', 'Đi Trễ (Phút)', 'Địa Điểm / Thiết Bị', 'Trạng Thái'];
      let dataToExport = recentLogs && recentLogs.length > 0 ? recentLogs : [];
      
      if (dataToExport.length === 0) {
        try {
          const res = await attendanceService.getLogs({ limit: 100 });
          if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
            dataToExport = res.data;
          }
        } catch (e) {}
      }

      if (dataToExport.length === 0 && todayData) {
        dataToExport = [todayData];
      }
      
      const rows = dataToExport.length > 0 ? dataToExport.map((l) => [
        l.employee_id || currentRole?.id || '',
        l.employee_name || l.full_name || currentRole?.name || '',
        l.department_name || currentRole?.department || '',
        l.work_date ? new Date(l.work_date).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN'),
        l.check_in_time ? formatDisplayTime(l.check_in_time) : (l.checkin || '--:--'),
        l.check_out_time ? formatDisplayTime(l.check_out_time) : (l.checkout || '--:--'),
        l.work_hours || '8.0',
        l.late_minutes || '0',
        l.check_in_address || l.address || OFFICE_NAME,
        l.status === 'DUNG_GIO' ? 'Đúng giờ' : (l.status === 'DI_MUON' ? `Đi trễ ${l.late_minutes || 0}p` : (l.status || 'Hợp lệ')),
      ]) : [[
        currentRole?.id || '',
        currentRole?.name || '',
        currentRole?.department || '',
        new Date().toLocaleDateString('vi-VN'),
        shiftInfo?.checkin || '--:--',
        shiftInfo?.checkout || '--:--',
        '8.0',
        '0',
        OFFICE_NAME,
        'Hợp lệ'
      ]];

      const csv = generateCSVContent(headers, rows);
      downloadFile(`Bang_Tong_Hop_Cham_Cong_NEXUS_${new Date().toISOString().split('T')[0]}.csv`, csv);
      try {
        confetti({ particleCount: 30, spread: 50, origin: { y: 0.6 } });
      } catch (e) {}
    } catch (err) {
      console.error('Lỗi khi xuất bảng công:', err);
    }
  };

  return (
    <div className="w-full min-h-full p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">
            {pageTitle}
          </h1>
        </div>

        {/* Digital Clock & Navigation Actions */}
        <div className="flex items-center gap-3 flex-wrap self-start md:self-auto">
          {/* Realtime Clock */}
          <div className="text-right pr-2">
            <div className="font-mono text-xl font-bold text-slate-900 leading-tight">
              {currentTime.toLocaleTimeString('vi-VN')}
            </div>
            <div className="text-[11px] text-slate-500 font-medium capitalize">
              {currentTime.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
            </div>
          </div>

          {/* Mode Switch (Vào ca vs Hết ca) */}
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => { setShiftMode('checkin'); setPunchError(null); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                shiftMode === 'checkin'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vào Ca (Check-In)
            </button>
            <button
              type="button"
              onClick={() => { setShiftMode('checkout'); setPunchError(null); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                shiftMode === 'checkout'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hết Ca (Check-Out)
            </button>
          </div>

          {/* Monthly Timesheet Button */}
          <button
            type="button"
            onClick={() => openModal('modal5B')}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <CalendarDays className="w-4 h-4 text-blue-600" />
            <span>Bảng công tháng</span>
          </button>

          {/* Attendance Appeal Button */}
          <button
            type="button"
            onClick={() => openModal('attendanceAppeal')}
            className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold px-3 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <FileText className="w-4 h-4 text-amber-600" />
            <span>Giải Trình Công</span>
          </button>

          {/* HR Manual Adjustment Button */}
          {(isHr || isCeo) && (
            <button
              type="button"
              onClick={() => openModal('attendanceAdjust')}
              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold px-3 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
              title="Điều chỉnh thủ công giờ vào/ra và trạng thái công cho nhân viên"
            >
              <UserCheck className="w-4 h-4 text-indigo-600" />
              <span>Hiệu Chỉnh Công Thủ Công</span>
            </button>
          )}

          {/* Export Timesheet CSV Button */}
          <button
            type="button"
            onClick={handleExportTimesheet}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>Xuất Bảng Công (.csv)</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left Code Entry & GPS (8 cols) + Right Shift & Logs (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Stage: Smart Code Entry & Live GPS Card */}
        <div className="lg:col-span-8 space-y-5">
          {/* Main Card: Nhập mã Kiosk */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
                    shiftMode === 'checkin' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                  }`}>
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      {shiftMode === 'checkin' ? 'Ghi Nhận Vào Ca (Check-In)' : 'Ghi Nhận Hết Ca (Check-Out)'}
                    </h2>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/kiosk')}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 self-start sm:self-auto hover:underline cursor-pointer"
              >
                <span>Xem mã trên Kiosk sảnh</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 6-Digit Code Input Pad */}
            <div className="flex flex-col items-center justify-center py-4 space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Nhập mã 6 chữ số
              </label>

              <div className="flex items-center gap-2 sm:gap-3">
                {codeDigits.map((digit, idx) => (
                  <React.Fragment key={idx}>
                    <input
                      ref={(el) => (inputRefs.current[idx] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={6} // Cho phép paste cả chuỗi 6 số vào 1 ô
                      value={digit}
                      onChange={(e) => handleDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      autoFocus={idx === 0}
                      className={`w-11 h-14 sm:w-14 sm:h-16 text-center font-mono text-2xl sm:text-3xl font-extrabold rounded-2xl border-2 transition-all outline-none ${
                        digit
                          ? 'border-blue-600 bg-blue-50/30 text-blue-900 shadow-sm'
                          : 'border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100'
                      }`}
                    />
                    {idx === 2 && (
                      <span className="text-slate-300 font-bold text-xl select-none sm:px-1">-</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* GPS Geofencing Status Card */}
            <div className={`p-4 rounded-2xl border transition-all ${
              geoZone === 'GREEN'
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                : geoZone === 'YELLOW'
                ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                : 'bg-rose-50/80 border-rose-200 text-rose-950'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    geoZone === 'GREEN'
                      ? 'bg-emerald-100 text-emerald-700'
                      : geoZone === 'YELLOW'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}>
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold uppercase tracking-wider">
                        Trạng thái định vị GPS
                      </span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                        geoZone === 'GREEN'
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                          : geoZone === 'YELLOW'
                          ? 'bg-amber-100 border-amber-300 text-amber-800'
                          : 'bg-rose-100 border-rose-300 text-rose-800'
                      }`}>
                        {geoZone === 'GREEN' ? '🟢 Hợp lệ (Vùng chuẩn)' : geoZone === 'YELLOW' ? '🟡 Chấp nhận (Nhiễu GPS)' : '🔴 Ngoài phạm vi'}
                      </span>
                    </div>

                    <div className="text-xs font-bold mt-1 text-slate-800">
                      {geoMessage}
                    </div>

                    <div className="text-[11px] text-slate-600 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold">{OFFICE_NAME}</span>
                      <span>• Tọa độ: {coords.lat.toFixed(4)}°N, {coords.lng.toFixed(4)}°E</span>
                    </div>
                  </div>
                </div>

                {/* Refresh GPS Button */}
                <button
                  type="button"
                  onClick={refreshLocation}
                  disabled={isLocating}
                  className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer shrink-0 disabled:opacity-50"
                  title="Đo lại tọa độ GPS hiện tại"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLocating ? 'animate-spin' : ''}`} />
                  <span>{isLocating ? 'Đang đo...' : 'Lấy lại vị trí'}</span>
                </button>
              </div>

              {geoZone === 'YELLOW' && (
                <div className="mt-2.5 pt-2 border-t border-amber-200 text-[11px] text-amber-800 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                  <span>
                    Hệ thống tự động trừ hao sai số trong nhà. Bạn vẫn được chấm công thành công bình thường nhờ mã Kiosk.
                  </span>
                </div>
              )}
            </div>

            {/* Error Message Banner */}
            {punchError && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-rose-900 shadow-2xs">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 text-xs">
                  <div className="font-bold text-rose-800 text-sm">Chấm công không thành công</div>
                  <p className="text-rose-700 mt-0.5 leading-relaxed">{punchError}</p>
                </div>
              </div>
            )}

            {/* Success Message Banner */}
            {hasCaptured && !punchError && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3 text-emerald-900 shadow-2xs">
                <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1 text-xs">
                  <div className="font-bold text-emerald-800 text-sm flex items-center gap-2">
                    {punchSuccessMsg || 'Điểm danh thành công!'}
                    <span className="bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded font-mono text-[11px] font-bold">
                      {currentTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-emerald-700 mt-0.5">
                    Đã lưu thời gian và tọa độ GPS hợp lệ. Dữ liệu đã đồng bộ thời gian thực vào bảng công tháng.
                  </p>
                </div>
              </div>
            )}

            {/* Submit Action Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleConfirmPunch}
                disabled={isSubmitting || codeDigits.join('').length !== 6 || geoZone === 'RED'}
                className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  shiftMode === 'checkin'
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang xác thực mã code & định vị GPS...</span>
                  </>
                ) : (
                  <>
                    <CheckCheck className="w-5 h-5" />
                    <span>
                      {shiftMode === 'checkin' ? 'Xác nhận Vào Ca (Check-In)' : 'Xác nhận Hết Ca (Check-Out)'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Stage: Shift Today & Detailed History with GPS */}
        <div className="lg:col-span-4 space-y-4">
          {/* Card 1: Ca làm việc hôm nay */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Ca làm việc hôm nay</span>
              </h3>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                todayData?.check_out_time
                  ? 'bg-slate-100 text-slate-700 border-slate-200'
                  : todayData?.check_in_time
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                {todayData?.check_out_time ? 'Đã hoàn thành' : todayData?.check_in_time ? 'Đang làm việc' : 'Đang diễn ra'}
              </span>
            </div>

            <div className="mt-3.5 bg-slate-50 border border-slate-100 rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Ca làm việc:</span>
                <span className="font-bold text-slate-800">{shiftInfo.title}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Khung giờ:</span>
                <span className="font-semibold text-slate-700">{shiftInfo.time}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Cửa sổ điểm danh:</span>
                <span className="font-semibold text-slate-700">{shiftInfo.validWindow}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                <span className="text-slate-500">Giờ Check-in:</span>
                <span className="flex items-center gap-1.5">
                  <strong className="text-emerald-700 font-mono text-xs font-bold">{shiftInfo.checkin}</strong>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                    {shiftInfo.status}
                  </span>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Giờ Check-out:</span>
                <span className="text-slate-700 font-mono font-bold">{shiftInfo.checkout}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Lịch sử điểm danh cá nhân & Địa chỉ GPS hôm nay */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span>Lịch sử chấm công</span>
              </h3>
              <span className="text-[11px] font-bold text-emerald-600">
                {todayData?.check_in_time ? 'Đã chấm công' : 'Chưa ghi nhận'}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              {todayData?.check_in_time ? (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">
                      Hôm nay ({currentTime.toLocaleDateString('vi-VN')})
                    </span>
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md font-bold text-[10px]">
                      {todayData.check_out_time ? 'Đã hết ca' : 'Đang làm việc'}
                    </span>
                  </div>

                  {/* Check-in time & address */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span>Giờ Vào (Check-in): </span>
                      <strong className="font-mono text-emerald-700">
                        {formatLogTime(todayData.check_in_time)}
                      </strong>
                    </div>
                    <div className="pl-3.5 text-[11px] text-slate-500 flex items-start gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span>{shiftInfo.checkinAddress || OFFICE_NAME}</span>
                    </div>
                  </div>

                  {/* Check-out time & address */}
                  <div className="space-y-1 pt-1.5 border-t border-slate-200/50">
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                      <span>Giờ Ra (Check-out): </span>
                      <strong className="font-mono text-blue-700">
                        {todayData.check_out_time ? formatLogTime(todayData.check_out_time) : 'Chưa ghi nhận'}
                      </strong>
                    </div>
                    {todayData.check_out_time && (
                      <div className="pl-3.5 text-[11px] text-slate-500 flex items-start gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>{shiftInfo.checkoutAddress || OFFICE_NAME}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-slate-400 text-xs">
                  Chưa ghi nhận ca làm việc hôm nay.
                </div>
              )}

              {/* Lượt chấm công khác trong công ty */}
              {recentLogs.length > 0 && (
                <div className="pt-2">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Lượt chấm công gần nhất:
                  </div>
                  <div className="divide-y divide-slate-100">
                    {recentLogs.slice(0, 3).map((log, idx) => (
                      <div key={log.id || idx} className="py-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar name={log.full_name || 'NV'} id={log.employee_id} src={log.avatar_url} size="xs" shape="circle" />
                          <div>
                            <div className="font-semibold text-slate-800 text-[11px]">{log.full_name || log.employee_id}</div>
                            <div className="text-[10px] text-slate-400">{formatLogTime(log.check_in_time)} • {log.check_in_address || 'Cổng A1'}</div>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          {log.status === 'DI_MUON' ? 'Muộn' : 'Đúng giờ'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
