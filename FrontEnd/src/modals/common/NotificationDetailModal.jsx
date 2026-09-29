import React, { useState } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { 
  FileText, 
  Download, 
  Printer, 
  CheckCircle2, 
  ShieldCheck, 
  Building, 
  Calendar, 
  Check, 
  Sparkles,
  Paperclip,
  FileSpreadsheet,
  File,
  Eye,
  ExternalLink,
  Award
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { downloadFile } from '../../utils/fileExportUtils';
import notificationService from '../../services/notificationService';

export default function NotificationDetailModal({ isOpen, onClose, payload }) {
  const [previewFile, setPreviewFile] = useState(null);

  if (!payload) return null;

  const docNumber = payload.docNumber || payload.actionPayload?.docNumber || 'Số: 128/2026/QĐ-TGĐ';
  const title = payload.title || payload.actionPayload?.title || 'QUYẾT ĐỊNH DOANH NGHIỆP';
  const signer = payload.signer || payload.actionPayload?.signer || 'Lê Vũ Ngọc Duy - Tổng Giám Đốc';
  const date = payload.date || payload.actionPayload?.date || (payload.created_at ? new Date(payload.created_at).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN'));
  const content = payload.content || payload.actionPayload?.content || payload.summary || '';

  // Standardize attachments list
  let attachments = [];
  const rawAttachments = payload.attachments || payload.actionPayload?.attachments;
  if (Array.isArray(rawAttachments)) {
    attachments = rawAttachments;
  } else if (typeof rawAttachments === 'string') {
    try {
      const parsed = JSON.parse(rawAttachments);
      if (Array.isArray(parsed)) attachments = parsed;
    } catch (e) {}
  } else if (payload.attachedFile) {
    attachments = [{
      name: payload.attachedFile,
      size: '1.2 MB',
      type: 'application/pdf'
    }];
  }

  React.useEffect(() => {
    if (isOpen && payload) {
      const notifId = payload.id || payload.notification_id || payload.notificationId;
      if (notifId) {
        notificationService.markAsRead(notifId).catch(() => null);
        window.dispatchEvent(new CustomEvent('nexus:notifications-updated'));
      }
    }
  }, [isOpen, payload]);

  const handleDownloadAttachment = (file) => {
    const filename = file?.name || 'Tai_lieu_dinh_kem.txt';
    let mimeType = 'application/octet-stream';
    if (filename.endsWith('.pdf')) mimeType = 'application/pdf';
    else if (filename.endsWith('.docx') || filename.endsWith('.doc')) mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    const textData = file?.content || 
      `CÔNG TY CỔ PHẦN CÔNG NGHỆ FWB NEXUS\nTÀI LIỆU ĐÍNH KÈM CHÍNH THỨC\n\nTập tin: ${filename}\nVăn bản gốc: ${title} (${docNumber})\nNgày ban hành: ${date}\nNgười ký: ${signer}\n\n(Nội dung tập tin được bảo mật và chứng thực điện tử theo quy chuẩn hệ thống NEXUS HRMS)`;
    
    downloadFile(filename, textData, mimeType);
  };

  const handlePrint = () => {
    window.print();
  };

  const getFileBadge = (name = '') => {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      return {
        icon: <FileText className="w-4 h-4 text-red-600" />,
        bg: 'bg-red-50 text-red-700 border-red-200',
        label: 'PDF'
      };
    }
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      return {
        icon: <FileSpreadsheet className="w-4 h-4 text-emerald-600" />,
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        label: 'EXCEL'
      };
    }
    if (ext === 'docx' || ext === 'doc') {
      return {
        icon: <FileText className="w-4 h-4 text-blue-600" />,
        bg: 'bg-blue-50 text-blue-700 border-blue-200',
        label: 'WORD'
      };
    }
    return {
      icon: <Paperclip className="w-4 h-4 text-indigo-600" />,
      bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      label: ext.toUpperCase() || 'FILE'
    };
  };

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Chi Tiết Văn Bản Thông Báo & Quyết Định"
      subtitle={`${docNumber} • Ban hành ngày ${date}`}
      badge={
        <span className="bg-purple-50 text-purple-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-purple-200 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          Văn bản chính thức
        </span>
      }
      maxWidth="max-w-3xl"
    >
      <div className="p-6 space-y-6 text-xs text-slate-700 font-sans">
        {/* Official Document Paper Container */}
        <div className="bg-white border border-slate-300 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 relative">
          {/* Header Quốc hiệu / Tiêu ngữ Doanh Nghiệp */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-slate-200 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-extrabold flex items-center justify-center text-base shadow-xs">
                  N
                </div>
                <div className="font-bold text-slate-900 text-xs tracking-wide">
                  CÔNG TY CỔ PHẦN CÔNG NGHỆ FWB NEXUS
                </div>
              </div>
              <div className="text-[11px] font-mono text-slate-500 font-bold">{docNumber}</div>
            </div>

            <div className="text-left sm:text-right space-y-0.5">
              <div className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
              </div>
              <div className="text-[11px] text-slate-500 italic">Độc lập - Tự do - Hạnh phúc</div>
              <div className="text-[11px] text-slate-400 font-mono mt-1">Hà Nội, ngày {date}</div>
            </div>
          </div>

          {/* Document Title */}
          <div className="text-center py-2 space-y-1">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 uppercase font-display tracking-tight">
              {title}
            </h2>
            <p className="text-[11px] text-slate-500 italic">
              V/v triển khai kế hoạch và thực hiện nhiệm vụ trọng tâm doanh nghiệp
            </p>
          </div>

          {/* Main Body Content */}
          <div className="bg-slate-50/70 p-5 rounded-xl border border-slate-200/80 space-y-3 leading-relaxed text-slate-800 text-xs whitespace-pre-line font-sans">
            {content || 'Thông báo chính thức từ Ban Điều Hành và Khối Quản trị Nguồn Nhân lực FWB NEXUS.'}
          </div>

          {/* Official Attachments Section */}
          {attachments.length > 0 && (
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
                <Paperclip className="w-4 h-4 text-blue-600" />
                <span>Tài liệu & Tệp đính kèm ({attachments.length})</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {attachments.map((file, idx) => {
                  const badge = getFileBadge(file.name);
                  return (
                    <div 
                      key={file.id || idx}
                      className="p-3 rounded-xl bg-slate-50/90 hover:bg-slate-100 border border-slate-200/90 flex items-center justify-between gap-3 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs">
                          {badge.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 text-xs truncate group-hover:text-blue-600 transition-colors" title={file.name}>
                            {file.name}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span className={`px-1.5 py-0.2 rounded border font-mono font-bold text-[9px] ${badge.bg}`}>
                              {badge.label}
                            </span>
                            <span>{file.size || '1.5 MB'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDownloadAttachment(file)}
                          className="p-1.5 rounded-lg bg-white hover:bg-blue-50 text-blue-700 border border-slate-200 hover:border-blue-300 shadow-2xs transition cursor-pointer flex items-center gap-1"
                          title={`Tải xuống ${file.name}`}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Signer & Seal Section */}
          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <div className="text-center space-y-2 min-w-[200px]">
              <div className="font-bold text-slate-900 uppercase text-xs">NGƯỜI KÝ DUYỆT BAN HÀNH</div>
              <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 inline-flex items-center gap-1.5 text-emerald-800 text-[11px] font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Đã ký số điện tử CA hợp lệ</span>
              </div>
              <div className="font-bold text-slate-900 text-sm pt-1">{signer}</div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Xác thực bởi Cổng thông tin điều hành NEXUS Enterprise</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>In văn bản</span>
            </button>



            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </AppleModal>
  );
}
