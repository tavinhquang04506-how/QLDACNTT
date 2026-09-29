import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { Download, Printer } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

export default function Modal2B_PdfReport({ isOpen, onClose }) {
  const { currentRole } = useAuth();
  const [exported, setExported] = useState(false);
  const [stats, setStats] = useState({
    totalEmployees: 0,
    presentCount: 0,
    lateCount: 0,
    leaveCount: 0,
    payrollBudget: 'Chưa có dữ liệu kỳ lương',
    payrollPeriod: 'Chưa mở kỳ',
  });

  const currentDateStr = `Hà Nội, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`;

  useEffect(() => {
    if (!isOpen) return;
    Promise.allSettled([
      api.get('/dashboard/stats'),
      api.get('/payroll/periods'),
    ]).then(([dashRes, periodRes]) => {
      const dData = dashRes.status === 'fulfilled' && dashRes.value?.data ? dashRes.value.data : null;
      const periods = periodRes.status === 'fulfilled' && Array.isArray(periodRes.value?.data) ? periodRes.value.data : [];

      const totalEmp = Number(dData?.overview?.total_active ?? 0);
      const present = Number(dData?.overview?.present_today ?? 0);
      const late = Number(dData?.overview?.late_today ?? 0);
      const leaves = Number(dData?.overview?.pending_leaves ?? 0);

      const latestLockedOrFirst = periods.find((p) => p.status === 'DA_CHOT' || p.status === 'DA_CHUYEN_KHOAN') || periods[0] || null;
      const netAmount = latestLockedOrFirst ? Number(latestLockedOrFirst.total_net ?? 0) : 0;

      setStats({
        totalEmployees: totalEmp,
        presentCount: present,
        lateCount: late,
        leaveCount: leaves,
        payrollBudget:
          latestLockedOrFirst && netAmount > 0
            ? `${netAmount.toLocaleString('vi-VN')} VNĐ`
            : latestLockedOrFirst
            ? `0 VNĐ (Kỳ ${latestLockedOrFirst.period} đang dự thảo)`
            : 'Chưa có dữ liệu kỳ lương',
        payrollPeriod: latestLockedOrFirst ? `Kỳ ${latestLockedOrFirst.period}` : 'Chưa mở kỳ',
      });
    }).catch(console.warn);
  }, [isOpen]);

  const handlePrint = () => {
    setExported(true);
    try {
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
    } catch {}
    window.print();
  };

  const attendanceRate = stats.totalEmployees > 0 
    ? ((stats.presentCount / stats.totalEmployees) * 100).toFixed(1) 
    : '0.0';

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Xuất Báo Cáo Tình Hình Nhân Sự và Chuyên Cần"
      subtitle="Bản xem trước báo cáo tổng hợp từ CSDL PostgreSQL • Chuẩn trang in A4"
      maxWidth="max-w-4xl"
    >
      <div className="p-6 space-y-6">
        {/* Document Preview Card */}
        <div className="bg-white border border-slate-300 rounded-2xl p-8 shadow-sm font-sans relative overflow-hidden">
          {/* Header */}
          <div className="flex justify-between items-start border-b border-slate-200 pb-5">
            <div>
              <div className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                TẬP ĐOÀN CÔNG NGHỆ FWB NEXUS CORP
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Số: 1209/BC-NS/{new Date().getFullYear()} • Ban Giám Đốc Nhân Sự
              </div>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div className="font-bold text-slate-800">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
              <div className="text-[11px] italic">Độc lập - Tự do - Hạnh phúc</div>
              <div className="text-[11px] mt-1">{currentDateStr}</div>
            </div>
          </div>

          {/* Title */}
          <div className="text-center my-6">
            <h1 className="text-xl font-bold font-display uppercase tracking-tight text-slate-900">
              BÁO CÁO TỔNG QUAN TÌNH HÌNH NHÂN SỰ VÀ CHẤM CÔNG HÔM NAY
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              (Dữ liệu tổng hợp trực tiếp từ hệ thống CSDL NEXUS HRMS)
            </p>
          </div>

          {/* Core Table */}
          <table className="w-full text-xs border border-slate-300 mb-6">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-700">
                <th className="p-2.5 border-r border-slate-300 text-left">Chỉ tiêu tổng hợp</th>
                <th className="p-2.5 border-r border-slate-300 text-center">Số lượng / Tỷ lệ</th>
                <th className="p-2.5 border-r border-slate-300 text-center">Nguồn dữ liệu</th>
                <th className="p-2.5 text-left">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="p-2.5 border-r border-slate-300 font-semibold">1. Tổng số nhân sự đang làm việc</td>
                <td className="p-2.5 border-r border-slate-300 text-center font-bold">{stats.totalEmployees} nhân viên</td>
                <td className="p-2.5 border-r border-slate-300 text-center text-emerald-600 font-bold">CSDL Nhân sự</td>
                <td className="p-2.5">Đồng bộ từ bảng employees</td>
              </tr>
              <tr>
                <td className="p-2.5 border-r border-slate-300 font-semibold">2. Tỷ lệ hiện diện hôm nay</td>
                <td className="p-2.5 border-r border-slate-300 text-center font-bold text-blue-600">{stats.presentCount} / {stats.totalEmployees} ({attendanceRate}%)</td>
                <td className="p-2.5 border-r border-slate-300 text-center text-emerald-600 font-bold">Thời gian thực</td>
                <td className="p-2.5">Điểm danh qua Kiosk QR và GPS</td>
              </tr>
              <tr>
                <td className="p-2.5 border-r border-slate-300 font-semibold">3. Ghi nhận đi trễ hôm nay</td>
                <td className="p-2.5 border-r border-slate-300 text-center font-bold text-amber-600">{stats.lateCount} trường hợp</td>
                <td className="p-2.5 border-r border-slate-300 text-center text-slate-600 font-bold">Bảng công ngày</td>
                <td className="p-2.5">Trạng thái DI_MUON trong attendance_logs</td>
              </tr>
              <tr>
                <td className="p-2.5 border-r border-slate-300 font-semibold">4. Đơn xin nghỉ phép đang chờ duyệt</td>
                <td className="p-2.5 border-r border-slate-300 text-center font-bold">{stats.leaveCount} đơn</td>
                <td className="p-2.5 border-r border-slate-300 text-center">Phân hệ Nghỉ phép</td>
                <td className="p-2.5">Đơn chờ cấp quản lý hoặc HR phê chuẩn</td>
              </tr>
              <tr>
                <td className="p-2.5 border-r border-slate-300 font-semibold">5. Quỹ lương thực lĩnh ({stats.payrollPeriod})</td>
                <td className="p-2.5 border-r border-slate-300 text-center font-bold text-slate-900">{stats.payrollBudget}</td>
                <td className="p-2.5 border-r border-slate-300 text-center text-emerald-600 font-bold">{stats.payrollPeriod}</td>
                <td className="p-2.5">Tổng thu nhập thực lĩnh từ payroll_periods</td>
              </tr>
            </tbody>
          </table>

          {/* Signatures */}
          <div className="flex justify-between items-end mt-8 pt-4">
            <div className="text-center">
              <div className="text-xs font-bold text-slate-700">NGƯỜI LẬP BÁO CÁO</div>
              <div className="text-[11px] text-slate-400 mt-1">{currentRole?.title || 'Nhân sự'}</div>
              <div className="h-16 flex items-center justify-center font-display italic text-slate-700 font-bold text-lg">
                {currentRole?.name || 'Người lập'}
              </div>
              <div className="text-xs font-semibold text-slate-800">{currentRole?.name || ''}</div>
            </div>

            <div className="text-center">
              <div className="text-xs font-bold text-slate-700">BAN GIÁM ĐỐC</div>
              <div className="text-[11px] text-slate-400 mt-1">Xem xét & Phê duyệt</div>
              <div className="h-16 flex items-center justify-center font-display italic text-blue-800 font-bold text-lg">
                FWB NEXUS
              </div>
              <div className="text-xs font-semibold text-slate-800">Ban Lãnh Đạo NEXUS</div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Mã báo cáo: <span className="font-mono text-slate-700">{`NX-REP-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}`}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
            >
              Đóng
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{exported ? 'Mở lại hộp thoại In / Lưu PDF' : 'In / Lưu Báo cáo PDF'}</span>
            </button>
          </div>
        </div>
      </div>
    </AppleModal>
  );
}
