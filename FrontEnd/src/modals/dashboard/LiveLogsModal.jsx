import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import Avatar from '../../components/common/Avatar';
import { AVATAR_SEEDS } from '../../utils/avatarUtils';
import { Search, Download, RefreshCw, DoorOpen, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import attendanceService from '../../services/attendanceService';
import { generateCSVContent, downloadFile } from '../../utils/fileExportUtils';

export default function LiveLogsModal({ isOpen, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [gateFilter, setGateFilter] = useState('all');

  const fetchLiveLogs = async () => {
    setLoading(true);
    try {
      const res = await attendanceService.getLive();
      if (res && res.data) {
        const raw = Array.isArray(res.data) ? res.data : [];
        const normalized = raw.map(log => ({
          id: log.employee_id || `NV-${log.id}`,
          name: log.full_name || log.name || 'Nhân sự',
          role: log.job_title || log.role || 'Chuyên viên',
          dept: log.department_name || log.department_id || log.dept || 'Kỹ thuật',
          time: log.event_time ? new Date(log.event_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : (log.time || '--:--:--'),
          gate: log.check_in_method || log.gate || 'Cổng A1',
          match: log.match || '99.5%',
          status: log.late_minutes > 0 ? `Trễ ${log.late_minutes}p` : (log.status || 'Đúng giờ'),
          photo: log.avatar_url || log.photo || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'
        }));
        setLogs(normalized);
      }
    } catch (e) {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLiveLogs();
    }
  }, [isOpen]);

  const filteredLogs = logs.filter((item) => {
    const matchesSearch =
      item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.dept?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGate = gateFilter === 'all' || item.gate === gateFilter;
    return matchesSearch && matchesGate;
  });

  const handleExportLiveLogs = () => {
    const headers = ['Mã NV', 'Họ và Tên', 'Chức Vụ', 'Phòng Ban', 'Thời Gian Ghi Nhận', 'Cổng/Thiết Bị', 'Độ Khớp FaceID', 'Trạng Thái'];
    const rows = (filteredLogs || []).map((l) => [
      l.id || '',
      l.name || '',
      l.role || '',
      l.dept || '',
      l.time || '',
      l.gate || '',
      l.match || '',
      l.status || ''
    ]);
    const csvContent = generateCSVContent(headers, rows);
    downloadFile(`Nhat_ky_cham_cong_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
  };

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Nhật ký chấm công thời gian thực trong ngày"
      subtitle="Đồng bộ tự động từ hệ thống điểm danh Kiosk AI Face ID và Cổng Barrier"
      badge={
        <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full border border-blue-200 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
          {filteredLogs.length} lượt ghi nhận
        </span>
      }
      maxWidth="max-w-5xl"
    >
      <div className="p-6 space-y-4">
        {/* Toolbar Filter */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo mã NV, tên, phòng ban..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={gateFilter}
              onChange={(e) => setGateFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="all">Tất cả cổng (A1, A2, B1)</option>
              <option value="Cổng A1">Cổng A1</option>
              <option value="Cổng A2">Cổng A2</option>
              <option value="Cổng B1">Cổng B1</option>
            </select>

            <button
              type="button"
              onClick={fetchLiveLogs}
              className="p-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>

            <button
              type="button"
              onClick={handleExportLiveLogs}
              className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Tải nhật ký chấm công định dạng Excel/CSV UTF-8"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Xuất Excel</span>
            </button>
          </div>
        </div>

        {/* High-density Data Table */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 px-3">Ảnh nhận diện cổng</th>
                <th className="py-2.5 px-3">Mã NV</th>
                <th className="py-2.5 px-3">Nhân viên và Chức danh</th>
                <th className="py-2.5 px-3">Phòng ban</th>
                <th className="py-2.5 px-3">Thời gian</th>
                <th className="py-2.5 px-3">Cổng check-in</th>
                <th className="py-2.5 px-3 text-center">Độ khớp khuôn mặt</th>
                <th className="py-2.5 px-3 text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                      <span className="text-xs">Đang tải nhật ký điểm danh thời gian thực...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <Clock className="w-6 h-6 text-slate-300 mx-auto" />
                      <p className="text-xs font-semibold text-slate-600">Chưa có lượt ghi nhận nào</p>
                      <p className="text-[11px] text-slate-400">Các lượt quẹt thẻ hoặc nhận diện Face ID sẽ xuất hiện tại đây.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                <tr key={log.id + log.time} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 px-3">
                    <Avatar
                      src={log.photo}
                      name={log.name}
                      id={log.id}
                      size="sm"
                      shape="rounded"
                    />
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-600">
                    {log.id}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-bold text-slate-900">{log.name}</div>
                    <div className="text-[11px] text-slate-400">{log.role}</div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">
                    {log.dept}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-800 font-semibold">
                    {log.time}
                  </td>
                  <td className="py-2.5 px-3 text-slate-700 font-medium">
                    {log.gate}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-blue-600">
                    {log.match}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        log.status.includes('Trễ')
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="pt-3 flex items-center justify-between text-xs text-slate-500">
          <span>Camera tự động ghi log sau mỗi 200ms khi có nhận diện khuôn mặt hợp lệ.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </AppleModal>
  );
}
