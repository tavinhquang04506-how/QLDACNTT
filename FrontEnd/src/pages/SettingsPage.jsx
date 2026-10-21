import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { 
  Shield, 
  Clock, 
  Check, 
  Save, 
  Building,
  Lock,
  Percent,
  MapPin,
  ShieldCheck,
  AlertCircle,
  Loader2,
  RefreshCw
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function SettingsPage() {
  const { currentRole } = useAuth();
  const [activeTab, setActiveTab] = useState('attendance');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  // Settings values (backed by /api/settings -> system_settings table)
  const [autoApproveOT, setAutoApproveOT] = useState(false);
  const [lateGraceMinutes, setLateGraceMinutes] = useState(15);
  const [maxOtPerMonth, setMaxOtPerMonth] = useState(40);
  const [faceConfidenceThreshold, setFaceConfidenceThreshold] = useState(98);
  const [gpsRadiusMeters, setGpsRadiusMeters] = useState(250);
  const [officeLat, setOfficeLat] = useState(10.762622);
  const [officeLng, setOfficeLng] = useState(106.660172);
  const [officeName, setOfficeName] = useState('Tòa nhà NEXUS Tower');
  const [personalIncomeTaxDeduction, setPersonalIncomeTaxDeduction] = useState(11000000);
  const [dependentDeduction, setDependentDeduction] = useState(4400000);
  const [defaultAllowances, setDefaultAllowances] = useState(1500000);
  const [policyEffectiveFrom, setPolicyEffectiveFrom] = useState('2020-01');

  const canEditSettings = currentRole?.key === 'CEO' || currentRole?.key === 'HR_DIRECTOR';

  const applyServerSettings = (d) => {
    if (!d || typeof d !== 'object') return;
    if (d.autoApproveOT !== undefined || d.auto_approve_ot !== undefined) {
      setAutoApproveOT(Boolean(d.autoApproveOT ?? d.auto_approve_ot));
    }
    if (d.lateGraceMinutes !== undefined || d.late_grace_minutes !== undefined) {
      setLateGraceMinutes(Number(d.lateGraceMinutes ?? d.late_grace_minutes));
    }
    if (d.maxOtPerMonth !== undefined || d.max_ot_per_month !== undefined) {
      setMaxOtPerMonth(Number(d.maxOtPerMonth ?? d.max_ot_per_month));
    }
    if (d.faceConfidenceThreshold !== undefined || d.face_confidence_threshold !== undefined) {
      setFaceConfidenceThreshold(Number(d.faceConfidenceThreshold ?? d.face_confidence_threshold));
    }
    if (d.gpsRadiusMeters !== undefined || d.gps_radius_meters !== undefined) {
      setGpsRadiusMeters(Number(d.gpsRadiusMeters ?? d.gps_radius_meters));
    }
    if (d.officeLat !== undefined || d.office_lat !== undefined) {
      setOfficeLat(Number(d.officeLat ?? d.office_lat));
    }
    if (d.officeLng !== undefined || d.office_lng !== undefined) {
      setOfficeLng(Number(d.officeLng ?? d.office_lng));
    }
    if (d.officeName !== undefined || d.office_name !== undefined) {
      setOfficeName(String(d.officeName ?? d.office_name));
    }
    if (d.personalIncomeTaxDeduction !== undefined || d.personal_income_tax_deduction !== undefined) {
      setPersonalIncomeTaxDeduction(Number(d.personalIncomeTaxDeduction ?? d.personal_income_tax_deduction));
    }
    if (d.dependentDeduction !== undefined || d.dependent_deduction !== undefined) {
      setDependentDeduction(Number(d.dependentDeduction ?? d.dependent_deduction));
    }
    if (d.defaultAllowances !== undefined || d.default_allowances !== undefined) {
      setDefaultAllowances(Number(d.defaultAllowances ?? d.default_allowances));
    }
    if (d.policyEffectiveFrom !== undefined || d.policy_effective_from !== undefined) {
      setPolicyEffectiveFrom(String(d.policyEffectiveFrom ?? d.policy_effective_from));
    }
    if (d.updated_at) {
      setLastUpdated(d.updated_at);
    }
  };

  const loadSettings = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.get('/settings');
      if (!res?.success || !res?.data) {
        throw new Error(res?.message || 'Không thể tải cấu hình hệ thống');
      }
      applyServerSettings(res.data);
    } catch (err) {
      setErrorMsg(err?.message || 'Không thể tải cấu hình hệ thống từ máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!canEditSettings || saving) return;
    setSaving(true);
    setSaved(false);
    setErrorMsg('');

    try {
      const res = await api.put('/settings', {
        autoApproveOT,
        lateGraceMinutes: Number(lateGraceMinutes),
        maxOtPerMonth: Number(maxOtPerMonth),
        faceConfidenceThreshold: Number(faceConfidenceThreshold),
        gpsRadiusMeters: Number(gpsRadiusMeters),
        officeLat: Number(officeLat),
        officeLng: Number(officeLng),
        officeName: String(officeName).trim() || 'Tòa nhà NEXUS Tower',
        personalIncomeTaxDeduction: Number(personalIncomeTaxDeduction),
        dependentDeduction: Number(dependentDeduction),
        defaultAllowances: Number(defaultAllowances),
        policyEffectiveFrom: String(policyEffectiveFrom).trim() || '2020-01',
      });

      if (!res?.success) {
        throw new Error(res?.message || 'Lưu cấu hình thất bại');
      }

      if (res.data) {
        applyServerSettings(res.data);
      }
      setSaved(true);
      try {
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
      } catch {}
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setErrorMsg(err?.message || 'Không thể lưu cấu hình hệ thống. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full min-h-full p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 font-display">
              Cài Đặt & Cấu Hình Hệ Thống
            </h1>
            <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full border border-blue-200">
              Nexus Config Enterprise
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Quản trị quy tắc chấm công ca làm, chính sách thuế & BHXH, và định vị văn phòng check-in
            {lastUpdated ? ` • Cập nhật lần cuối: ${new Date(lastUpdated).toLocaleString('vi-VN')}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadSettings}
            disabled={loading || saving}
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold px-3 py-2.5 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            title="Làm mới cấu hình từ CSDL"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>Tải lại</span>
          </button>

          {canEditSettings ? (
            <button
              type="button"
              data-testid="settings-save-btn"
              onClick={handleSave}
              disabled={saving || loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saved ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>
                {saving
                  ? 'Đang lưu cấu hình...'
                  : saved
                  ? 'Đã lưu cấu hình thành công!'
                  : 'Lưu Thay Đổi Cấu Hình'}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Chế độ chỉ đọc ({currentRole?.title || 'Nhân sự'})</span>
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div
          data-testid="settings-error-banner"
          className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          data-testid="settings-tab-attendance"
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'attendance'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Ca Làm & Điểm Danh</span>
        </button>

        <button
          type="button"
          data-testid="settings-tab-tax"
          onClick={() => setActiveTab('tax_bhxh')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'tax_bhxh'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Percent className="w-4 h-4" />
          <span>Thuế TNCN & BHXH</span>
        </button>

        <button
          type="button"
          data-testid="settings-tab-biometrics"
          onClick={() => setActiveTab('biometrics')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'biometrics'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Bán Kính GPS & Check-in</span>
        </button>
      </div>

      {/* Tab 1: Ca Làm & Điểm Danh */}
      {activeTab === 'attendance' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Clock className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm font-display">
                  Quy Định Giờ Làm & Đi Muộn
                </h3>
              </div>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Chuẩn Hành Chính
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Thời gian ân hạn đi trễ buổi sáng (Grace Period)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    data-testid="input-late-grace-minutes"
                    min="0"
                    max="180"
                    value={lateGraceMinutes}
                    onChange={(e) => setLateGraceMinutes(Number(e.target.value))}
                    disabled={!canEditSettings}
                    className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs outline-none focus:bg-white focus:border-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                  <span className="text-slate-500">phút (Sau 08:{String(lateGraceMinutes).padStart(2, '0')} sẽ tính là đi muộn vào ca)</span>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Khung giờ làm việc chuẩn (Standard Shift)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Ca Sáng:</span>
                    <strong className="text-slate-900">08:00 - 12:00 (4.0 giờ)</strong>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Ca Chiều:</span>
                    <strong className="text-slate-900">13:30 - 17:30 (4.0 giờ)</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm font-display">
                  Chính Sách Làm Thêm Giờ (OT)
                </h3>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Điều 107 BLLĐ
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Giới hạn số giờ làm thêm tối đa / tháng
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    data-testid="input-max-ot-per-month"
                    min="1"
                    max="300"
                    value={maxOtPerMonth}
                    onChange={(e) => setMaxOtPerMonth(Number(e.target.value))}
                    disabled={!canEditSettings}
                    className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs outline-none focus:bg-white focus:border-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                  <span className="text-slate-500">giờ / tháng (Cảnh báo khi vượt ngưỡng {maxOtPerMonth}h)</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className={`inline-flex items-center gap-3 ${canEditSettings ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'}`}>
                  <input
                    type="checkbox"
                    checked={autoApproveOT}
                    onChange={(e) => setAutoApproveOT(e.target.checked)}
                    disabled={!canEditSettings}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 disabled:opacity-75"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Tự động duyệt OT dưới 2 giờ vào ngày thường</span>
                    <span className="text-slate-400 block mt-0.5">Hệ thống ghi nhận hệ số 150% theo dữ liệu chấm công ra về</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Thuế TNCN & BHXH */}
      {activeTab === 'tax_bhxh' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Percent className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-slate-900 text-sm font-display">
                  Mức Giảm Trừ Gia Cảnh Thuế TNCN
                </h3>
              </div>
              <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                Nghị Quyết 954/2020
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Mức giảm trừ bản thân người nộp thuế (VNĐ / tháng)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    data-testid="input-pit-deduction"
                    min="0"
                    step="100000"
                    value={personalIncomeTaxDeduction}
                    onChange={(e) => setPersonalIncomeTaxDeduction(Number(e.target.value))}
                    disabled={!canEditSettings}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-900 text-xs disabled:opacity-75"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Mức giảm trừ cho mỗi người phụ thuộc (VNĐ / người / tháng)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    data-testid="input-dependent-deduction"
                    min="0"
                    step="100000"
                    value={dependentDeduction}
                    onChange={(e) => setDependentDeduction(Number(e.target.value))}
                    disabled={!canEditSettings}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-900 text-xs disabled:opacity-75"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Phụ cấp định kỳ mặc định (VNĐ / tháng)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    data-testid="input-default-allowances"
                    min="0"
                    step="100000"
                    value={defaultAllowances}
                    onChange={(e) => setDefaultAllowances(Number(e.target.value))}
                    disabled={!canEditSettings}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-900 text-xs disabled:opacity-75"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Kỳ lương hiệu lực chính sách (YYYY-MM)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    data-testid="input-policy-effective-from"
                    value={policyEffectiveFrom}
                    onChange={(e) => setPolicyEffectiveFrom(e.target.value)}
                    disabled={!canEditSettings}
                    placeholder="YYYY-MM"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-900 text-xs disabled:opacity-75"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Building className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm font-display">
                  Tỷ Lệ Đóng Bảo Hiểm Xã Hội Bắt Buộc
                </h3>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Luật BHXH 2024
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-600">Trích trừ từ lương Người lao động:</span>
                <strong className="text-rose-600 font-mono">10.5% (8% BHXH + 1.5% BHYT + 1% BHTN)</strong>
              </div>
              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-600">Doanh nghiệp chi trả thêm:</span>
                <strong className="text-blue-600 font-mono">21.5% (17.5% BHXH + 3% BHYT + 1% BHTN)</strong>
              </div>
              <div className="flex justify-between p-2.5 bg-blue-50/50 rounded-xl border border-blue-200">
                <span className="text-blue-900 font-bold">Tổng mức trích nộp cơ quan BHXH:</span>
                <strong className="text-blue-700 font-mono">32.0% Lương Hợp Đồng</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Bán Kính GPS & Check-in */}
      {activeTab === 'biometrics' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <MapPin className="w-5 h-5 text-rose-600" />
                <h3 className="font-bold text-slate-900 text-sm font-display">
                  Định Vị Tọa Độ Trụ Sở & Bán Kính Check-in
                </h3>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                GPS Active
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Bán kính hợp lệ cho phép nhân viên Check-in
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="10"
                    max="10000"
                    value={gpsRadiusMeters}
                    onChange={(e) => setGpsRadiusMeters(Number(e.target.value))}
                    disabled={!canEditSettings}
                    className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs outline-none focus:bg-white focus:border-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                  <span className="text-slate-500">mét tính từ tâm tòa nhà trụ sở chính</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800 block">Tọa độ trụ sở chính ({officeName}):</span>
                <p className="text-[11px] text-slate-600 font-mono">
                  {officeLat}° N, {officeLng}° E
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Shield className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm font-display">
                  Ngưỡng Xác Thực Kiosk Chấm Công Cổng
                </h3>
              </div>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Kiosk Gate
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-bold text-slate-700">
                    Ngưỡng độ tin cậy thiết bị Kiosk (Confidence Threshold)
                  </label>
                  <span className="font-bold text-blue-600">{faceConfidenceThreshold}%</span>
                </div>
                <input
                  type="range"
                  min="90"
                  max="99"
                  value={faceConfidenceThreshold}
                  onChange={(e) => setFaceConfidenceThreshold(Number(e.target.value))}
                  disabled={!canEditSettings}
                  className="w-full accent-blue-600 disabled:opacity-75 disabled:cursor-not-allowed"
                />
                <span className="text-slate-400 text-[11px] block mt-1">
                  Áp dụng cho log ghi nhận chấm công tại Kiosk cổng và kiểm tra đối soát.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
