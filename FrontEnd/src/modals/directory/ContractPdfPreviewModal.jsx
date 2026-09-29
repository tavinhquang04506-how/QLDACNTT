import React from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { FileText, Download, Printer, CheckCircle2, ShieldCheck, Stamp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Modal4G_ContractPdfPreview({ isOpen, onClose, emp, payload }) {
  const { currentRole } = useAuth();
  const targetEmp = payload || emp;
  const data = targetEmp ? {
    id: targetEmp.id || targetEmp.employeeId || currentRole?.id || 'NV-0001',
    name: targetEmp.name || targetEmp.fullName || currentRole?.name || 'Nhân viên',
    role: targetEmp.role || targetEmp.jobTitle || currentRole?.title || 'Kỹ sư Phần mềm',
    department: targetEmp.department || targetEmp.departmentName || currentRole?.department || 'Phòng Kỹ thuật Phần mềm',
    contractSalary: targetEmp.contractSalary || targetEmp.baseSalary || targetEmp.base_salary || currentRole?.baseSalary || 28000000,
    cccd: targetEmp.cccd || targetEmp.citizenId || currentRole?.citizenId || '079196004004',
    bankAccount: targetEmp.bankAccount || currentRole?.bankAccount || '1903 4455 66',
    bankName: targetEmp.bankName || currentRole?.bankName || 'Techcombank',
  } : {
    id: currentRole?.id || 'NV-0001',
    name: currentRole?.name || 'Lê Vũ Ngọc Duy',
    role: currentRole?.title || 'Tổng Giám Đốc',
    department: currentRole?.department || 'Ban Điều Hành',
    contractSalary: currentRole?.baseSalary || 50000000,
    cccd: currentRole?.citizenId || '079185001001',
    bankAccount: currentRole?.bankAccount || '0071 0008 89988',
    bankName: currentRole?.bankName || 'Vietcombank',
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([
      `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\n\nHỢP ĐỒNG LAO ĐỘNG\nSố: HĐLĐ-2023/0315-NEXUS\n\nBên A: Công ty Cổ phần Công nghệ Nexus (Đại diện: Ông Lê Vũ Ngọc Duy - Tổng Giám Đốc)\nBên B: ${data.name} (Chức danh: ${data.role})\nMức lương: ${data.contractSalary ? data.contractSalary.toLocaleString('vi-VN') : '35.000.000'} VNĐ/tháng`
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
      title="Bản Xem Trước Hợp Đồng Lao Động Điện Tử"
      subtitle={`Hợp đồng điện tử có hiệu lực pháp lý • Mã hồ sơ: HĐLĐ-2023/0315-NEXUS`}
      badge={
        <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Đã ký số điện tử
        </span>
      }
      maxWidth="max-w-3xl"
    >
      <div className="p-6 space-y-6 text-xs text-slate-800">
        {/* PDF Document Paper Frame */}
        <div className="bg-white border border-slate-300 rounded-xl p-8 shadow-sm font-admin leading-relaxed space-y-6 max-h-[65vh] overflow-y-auto">
          {/* Header Quốc hiệu Tiêu ngữ */}
          <div className="text-center space-y-1 pb-4 border-b border-slate-200">
            <h3 className="font-bold uppercase text-sm tracking-wider">Cộng Hòa Xã Hội Chủ Nghĩa Việt Nam</h3>
            <p className="font-semibold text-xs text-slate-700">Độc lập - Tự do - Hạnh phúc</p>
            <div className="w-32 h-[1px] bg-slate-400 mx-auto mt-1" />
          </div>

          {/* Title Hợp đồng */}
          <div className="text-center space-y-1">
            <h2 className="text-base font-bold uppercase text-slate-900 tracking-wide">
              Hợp Đồng Lao Động
            </h2>
            <p className="text-[11px] text-slate-500 italic">
              Số: HĐLĐ-2023/0315-NEXUS • Loại hợp đồng: Không xác định thời hạn
            </p>
          </div>

          <p className="italic text-slate-600 text-[11px]">
            Hôm nay, ngày 15 tháng 03 năm 2023, tại trụ sở Công ty Cổ phần Công nghệ Nexus, chúng tôi gồm các bên:
          </p>

          {/* Bên A & Bên B */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-4 rounded-lg border border-slate-200 text-slate-700">
            <div className="space-y-1.5">
              <h4 className="font-bold text-slate-900 uppercase text-[11px] border-b border-slate-200 pb-1">
                Bên A: Người Sử Dụng Lao Động
              </h4>
              <p><strong>Công ty:</strong> CÔNG TY CP CÔNG NGHỆ NEXUS</p>
              <p><strong>Đại diện bởi:</strong> Ông Lê Vũ Ngọc Duy</p>
              <p><strong>Chức vụ:</strong> Tổng Giám Đốc (CEO)</p>
              <p><strong>Mã số thuế:</strong> 0316892011</p>
              <p><strong>Địa chỉ:</strong> Tòa nhà Nexus Tower, TP. Hồ Chí Minh</p>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-bold text-slate-900 uppercase text-[11px] border-b border-slate-200 pb-1">
                Bên B: Người Lao Động
              </h4>
              <p><strong>Họ và tên:</strong> {data.name}</p>
              <p><strong>Mã nhân viên:</strong> {data.id}</p>
              <p><strong>Số CCCD:</strong> {data.cccd || '079198001234'}</p>
              <p><strong>Chức danh:</strong> {data.role}</p>
              <p><strong>Phòng ban:</strong> {data.department}</p>
            </div>
          </div>

          {/* Các điều khoản chính */}
          <div className="space-y-3 text-slate-700">
            <div>
              <h5 className="font-bold text-slate-900 text-xs">Điều 1: Công việc và Địa điểm làm việc</h5>
              <p className="mt-0.5 text-slate-600">
                - Thực hiện nhiệm vụ chuyên môn theo chức danh <strong>{data.role}</strong> thuộc {data.department}.<br />
                - Địa điểm làm việc: Trụ sở chính Công ty và chế độ làm việc linh hoạt (Hybrid Work) theo quy chế.
              </p>
            </div>

            <div>
              <h5 className="font-bold text-slate-900 text-xs">Điều 2: Thời hạn hợp đồng</h5>
              <p className="mt-0.5 text-slate-600">
                - Hợp đồng lao động không xác định thời hạn, có hiệu lực kể từ ngày 15/03/2023.
              </p>
            </div>

            <div>
              <h5 className="font-bold text-slate-900 text-xs">Điều 3: Tiền lương và Các khoản phụ cấp</h5>
              <p className="mt-0.5 text-slate-600">
                - Mức lương chính: <strong className="text-blue-700 font-mono text-sm">{data.contractSalary ? data.contractSalary.toLocaleString('vi-VN') : '35.000.000'} VNĐ/tháng</strong>.<br />
                - Hình thức trả lương: Chuyển khoản ngân hàng định kỳ vào ngày 05 hàng tháng qua tài khoản <strong>{data.bankAccount || '0071 9384 11'} ({data.bankName || 'Vietcombank'})</strong>.<br />
                - Chế độ thưởng: Thưởng hiệu suất công việc (KPI) theo quý và tháng lương thứ 13.
              </p>
            </div>

            <div>
              <h5 className="font-bold text-slate-900 text-xs">Điều 4: Quyền lợi và Bảo hiểm xã hội</h5>
              <p className="mt-0.5 text-slate-600">
                - Được đóng đầy đủ các khoản Bảo hiểm xã hội, BHYT, BHTN theo đúng quy định của Bộ luật Lao động hiện hành.<br />
                - Chế độ nghỉ phép năm: 12 ngày phép có hưởng lương hàng năm.
              </p>
            </div>
          </div>

          {/* Chữ ký và Con dấu điện tử */}
          <div className="pt-6 border-t border-slate-200 grid grid-cols-2 gap-8 text-center">
            <div className="space-y-2">
              <p className="font-bold text-slate-900">ĐẠI DIỆN NGƯỜI SỬ DỤNG LAO ĐỘNG</p>
              <p className="text-[10px] text-slate-500 italic">Đã ký số điện tử xác thực</p>
              
              {/* Con dấu đỏ điện tử */}
              <div className="py-2 flex flex-col items-center justify-center">
                <div className="w-24 h-24 rounded-full border-2 border-dashed border-rose-500 bg-rose-50/60 flex flex-col items-center justify-center text-rose-700 p-1 relative rotate-[-6deg] shadow-2xs">
                  <div className="text-[8px] font-bold uppercase text-center leading-tight">
                    CÔNG TY CP CÔNG NGHỆ NEXUS
                  </div>
                  <div className="text-[7px] text-rose-600 font-mono mt-0.5">MSDN: 0316892011</div>
                  <div className="text-[8px] font-bold text-rose-800 uppercase mt-0.5">ĐÃ CHỨNG THỰC</div>
                  <div className="text-[7px] text-rose-500 font-mono">15-03-2023</div>
                </div>
                <div className="font-bold text-slate-900 text-xs mt-1">Lê Vũ Ngọc Duy</div>
                <div className="text-[10px] text-slate-500">Tổng Giám Đốc</div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-bold text-slate-900">NGƯỜI LAO ĐỘNG</p>
              <p className="text-[10px] text-slate-500 italic">Đã ký xác nhận eKYC</p>
              
              <div className="py-4 flex flex-col items-center justify-center">
                <div className="italic font-serif text-base text-blue-800 font-bold border-b border-slate-400 px-6 py-1">
                  {data.name}
                </div>
                <div className="font-bold text-slate-900 text-xs mt-2">{data.name}</div>
                <div className="text-[10px] text-slate-500 font-mono">Mã NV: {data.id}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
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
              <span>Tải file về máy</span>
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
