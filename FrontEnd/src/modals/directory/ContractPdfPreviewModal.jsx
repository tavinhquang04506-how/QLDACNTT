import React from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { Download, Printer, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { formatDateVN } from '../../utils/dataAdapters';

export default function Modal4G_ContractPdfPreview({ isOpen, onClose, emp, payload }) {
  const { currentRole } = useAuth();
  const targetEmp = payload || emp || {};
  const contractSalaryRaw = targetEmp.contractSalary ?? targetEmp.baseSalary ?? targetEmp.base_salary ?? null;
  const contractSalary =
    contractSalaryRaw !== null && contractSalaryRaw !== undefined && contractSalaryRaw !== ''
      ? Number(contractSalaryRaw)
      : null;

  const data = {
    id: targetEmp.id || targetEmp.employeeId || currentRole?.id || 'Chưa cập nhật',
    name: targetEmp.name || targetEmp.fullName || currentRole?.name || 'Chưa cập nhật',
    role: targetEmp.role || targetEmp.jobTitle || currentRole?.title || 'Chưa cập nhật',
    department: targetEmp.department || targetEmp.departmentName || currentRole?.department || 'Chưa cập nhật',
    contractSalary,
    contractNo: targetEmp.contractNo || (targetEmp.id ? `HDLD-${targetEmp.id}` : 'Chưa cập nhật'),
    startDate: targetEmp.contractStartDate || targetEmp.joinedDate || '',
    cccd: targetEmp.citizenId || targetEmp.cccd || 'Chưa cập nhật',
    bankAccount: targetEmp.bankAccount || 'Chưa cập nhật',
    bankName: targetEmp.bankName || 'Chưa cập nhật',
  };

  const salaryText =
    data.contractSalary !== null && !Number.isNaN(data.contractSalary)
      ? `${data.contractSalary.toLocaleString('vi-VN')} VNĐ/tháng`
      : 'Chưa cập nhật';

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([
      `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\n\nHỢP ĐỒNG LAO ĐỘNG\nSố: ${data.contractNo}\n\nBên A: Công ty Cổ phần Công nghệ Nexus\nBên B: ${data.name} (Mã NV: ${data.id} - Chức danh: ${data.role})\nMức lương cơ bản: ${salaryText}`
    ], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `Hop_dong_lao_dong_${data.id}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Bản Xem Trước Hợp Đồng Lao Động"
      subtitle={`Trích xuất từ hồ sơ hợp đồng trong CSDL • Số hợp đồng: ${data.contractNo}`}
      badge={
        <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Bản lưu hệ thống
        </span>
      }
      maxWidth="max-w-3xl"
    >
      <div className="p-6 space-y-6 text-xs text-slate-800">
        <div className="bg-white border border-slate-300 rounded-xl p-8 shadow-sm font-admin leading-relaxed space-y-6 max-h-[65vh] overflow-y-auto">
          <div className="text-center space-y-1 pb-4 border-b border-slate-200">
            <h3 className="font-bold uppercase text-sm tracking-wider">Cộng Hòa Xã Hội Chủ Nghĩa Việt Nam</h3>
            <p className="font-semibold text-xs text-slate-700">Độc lập - Tự do - Hạnh phúc</p>
            <div className="w-32 h-[1px] bg-slate-400 mx-auto mt-1" />
          </div>

          <div className="text-center space-y-1">
            <h2 className="text-base font-bold uppercase text-slate-900 tracking-wide">
              Hợp Đồng Lao Động
            </h2>
            <p className="text-[11px] text-slate-500 italic">
              Số: {data.contractNo} • Ngày hiệu lực: {data.startDate ? formatDateVN(data.startDate) : 'Chưa cập nhật'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-4 rounded-lg border border-slate-200 text-slate-700">
            <div className="space-y-1.5">
              <h4 className="font-bold text-slate-900 uppercase text-[11px] border-b border-slate-200 pb-1">
                Bên A: Người Sử Dụng Lao Động
              </h4>
              <p><strong>Công ty:</strong> CÔNG TY CP CÔNG NGHỆ NEXUS</p>
              <p><strong>Đại diện:</strong> Ban Giám Đốc</p>
              <p><strong>Trụ sở:</strong> Tòa nhà NEXUS Tower</p>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-bold text-slate-900 uppercase text-[11px] border-b border-slate-200 pb-1">
                Bên B: Người Lao Động
              </h4>
              <p><strong>Họ và tên:</strong> {data.name}</p>
              <p><strong>Mã nhân viên:</strong> {data.id}</p>
              <p><strong>Số CCCD:</strong> {data.cccd}</p>
              <p><strong>Chức danh:</strong> {data.role}</p>
              <p><strong>Phòng ban:</strong> {data.department}</p>
            </div>
          </div>

          <div className="space-y-3 text-slate-700">
            <div>
              <h5 className="font-bold text-slate-900 text-xs">Điều 1: Công việc và Phòng ban</h5>
              <p className="mt-0.5 text-slate-600">
                - Thực hiện nhiệm vụ chuyên môn theo chức danh <strong>{data.role}</strong> thuộc {data.department}.
              </p>
            </div>

            <div>
              <h5 className="font-bold text-slate-900 text-xs">Điều 2: Tiền lương và Tài khoản nhận lương</h5>
              <p className="mt-0.5 text-slate-600">
                - Mức lương cơ bản theo hợp đồng: <strong className="text-blue-700 font-mono text-sm">{salaryText}</strong>.<br />
                - Tài khoản nhận lương đăng ký: <strong>{data.bankAccount} ({data.bankName})</strong>.
              </p>
            </div>

            <div>
              <h5 className="font-bold text-slate-900 text-xs">Điều 3: Bảo hiểm và Quyền lợi</h5>
              <p className="mt-0.5 text-slate-600">
                - Trích nộp BHXH, BHYT, BHTN và Thuế TNCN theo quy định của pháp luật hiện hành.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>In hợp đồng</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Download className="w-4 h-4 text-blue-600" />
              <span>Tải bản tóm tắt (.txt)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-xs transition-colors cursor-pointer shadow-sm"
          >
            Đóng cửa sổ
          </button>
        </div>
      </div>
    </AppleModal>
  );
}
