import React, { useState } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import {
  FileText,
  Download,
  Printer,
  ShieldCheck,
  Paperclip,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import notificationService from '../../services/notificationService';
import noticeService from '../../services/noticeService';

export default function NotificationDetailModal({ isOpen, onClose, payload }) {
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadError, setDownloadError] = useState('');
  const [liveNotice, setLiveNotice] = useState(null);
  const [verifyingAccess, setVerifyingAccess] = useState(false);
  const [accessDeniedError, setAccessDeniedError] = useState('');

  React.useEffect(() => {
    let isMounted = true;
    setDownloadError('');
    setDownloadingId(null);
    setLiveNotice(null);
    setAccessDeniedError('');

    if (isOpen && payload) {
      const rawId = payload.id || payload.actionPayload?.id || '';
      const resolvedNoticeId = String(rawId).replace(/^NOTIF-/, '');
      const notifId = payload.notification_id || payload.notificationId || payload.id;

      if (/^NT-/i.test(resolvedNoticeId)) {
        setVerifyingAccess(true);
        noticeService
          .getById(resolvedNoticeId)
          .then((res) => {
            if (!isMounted) return;
            const data = res?.data || res;
            setLiveNotice(data);
            setVerifyingAccess(false);
            if (notifId) {
              notificationService.markAsRead(notifId).catch(() => null);
              window.dispatchEvent(new CustomEvent('nexus:notifications-updated'));
            }
          })
          .catch((err) => {
            if (!isMounted) return;
            setVerifyingAccess(false);
            setAccessDeniedError(
              err?.message ||
                'Bạn không thuộc phạm vi đối tượng nhận của văn bản thông báo này hoặc văn bản đã hết hiệu lực.'
            );
          });
      } else if (notifId) {
        notificationService.markAsRead(notifId).catch(() => null);
        window.dispatchEvent(new CustomEvent('nexus:notifications-updated'));
      }
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, payload]);

  if (!isOpen || !payload) return null;

  const rawNoticeId = payload.id || payload.actionPayload?.id || '';
  const noticeId = String(rawNoticeId).replace(/^NOTIF-/, '');
  const isCompanyNoticeId = /^NT-/i.test(noticeId);

  const docNumber =
    payload.docNumber || payload.actionPayload?.docNumber || `Số: ${noticeId || 'TB'}/2026/TB-NEXUS`;
  const title =
    liveNotice?.title ||
    (!isCompanyNoticeId ? payload.title || payload.actionPayload?.title : '') ||
    'THÔNG BÁO DOANH NGHIỆP';
  const signer =
    (liveNotice?.author_name ? `${liveNotice.author_name}` : null) ||
    payload.signer ||
    payload.actionPayload?.signer ||
    'Ban Điều Hành NEXUS';
  const date =
    (liveNotice?.published_at
      ? new Date(liveNotice.published_at).toLocaleDateString('vi-VN')
      : null) ||
    payload.date ||
    payload.actionPayload?.date ||
    (payload.created_at
      ? new Date(payload.created_at).toLocaleDateString('vi-VN')
      : new Date().toLocaleDateString('vi-VN'));
  const content =
    liveNotice?.content ||
    (!isCompanyNoticeId ? payload.content || payload.actionPayload?.content || payload.summary : '') ||
    '';

  // Standardize attachments list
  let attachments = [];
  const rawAttachments =
    liveNotice?.attachments ??
    (!isCompanyNoticeId ? payload.attachments || payload.actionPayload?.attachments : []);
  if (Array.isArray(rawAttachments)) {
    attachments = rawAttachments;
  } else if (typeof rawAttachments === 'string') {
    try {
      const parsed = JSON.parse(rawAttachments);
      if (Array.isArray(parsed)) attachments = parsed;
    } catch (_e) {}
  }

  const isLegacyOrUnavailableAttachment = (file) => {
    if (!file || typeof file !== 'object') return true;
    if (file.legacyUnavailable === true || file.available === false) return true;
    if (!file.id || !/^NATT-[A-Za-z0-9-]+$/.test(String(file.id))) return true;
    return false;
  };

  const handleDownloadAttachment = async (file) => {
    setDownloadError('');
    if (isLegacyOrUnavailableAttachment(file)) {
      setDownloadError('Tệp đính kèm cũ không khả dụng — cần người đăng tải lên lại tệp thực.');
      return;
    }
    if (!noticeId) {
      setDownloadError('Không xác định được mã văn bản thông báo để tải tệp đính kèm.');
      return;
    }

    setDownloadingId(file.id);
    try {
      const { blob } = await noticeService.downloadAttachment(noticeId, file.id);
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = file.name || `${file.id}.bin`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      setDownloadError(err?.message || 'Không thể tải tệp đính kèm từ máy chủ.');
    } finally {
      setDownloadingId(null);
    }
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
        label: 'PDF',
      };
    }
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      return {
        icon: <FileSpreadsheet className="w-4 h-4 text-emerald-600" />,
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        label: 'EXCEL',
      };
    }
    if (ext === 'docx' || ext === 'doc') {
      return {
        icon: <FileText className="w-4 h-4 text-blue-600" />,
        bg: 'bg-blue-50 text-blue-700 border-blue-200',
        label: 'WORD',
      };
    }
    return {
      icon: <Paperclip className="w-4 h-4 text-indigo-600" />,
      bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      label: ext.toUpperCase() || 'FILE',
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
          Văn bản nội bộ
        </span>
      }
      maxWidth="max-w-3xl"
    >
      <div className="p-6 space-y-6 text-xs text-slate-700 font-sans">
        {verifyingAccess ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-center gap-2 text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <span>Đang xác minh quyền truy cập văn bản thông báo...</span>
          </div>
        ) : accessDeniedError ? (
          <div
            data-testid="notice-access-denied"
            className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 space-y-2"
          >
            <div className="flex items-center gap-2 font-bold text-sm">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>Không thể hiển thị văn bản thông báo</span>
            </div>
            <p className="text-xs leading-relaxed">{accessDeniedError}</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-300 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 relative">
            {/* Header Doanh Nghiệp */}
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
                <div className="text-[11px] text-slate-400 font-mono mt-1">Ngày {date}</div>
              </div>
            </div>

            {/* Document Title */}
            <div className="text-center py-2 space-y-1">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 uppercase font-display tracking-tight">
                {title}
              </h2>
            </div>

            {/* Main Body Content */}
            <div className="bg-slate-50/70 p-5 rounded-xl border border-slate-200/80 space-y-3 leading-relaxed text-slate-800 text-xs whitespace-pre-line font-sans">
              {content || 'Thông báo từ Ban Điều Hành và Khối Quản trị Nguồn Nhân lực FWB NEXUS.'}
            </div>

            {/* Attachments Section */}
            {attachments.length > 0 && (
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
                  <Paperclip className="w-4 h-4 text-blue-600" />
                  <span>Tài liệu & Tệp đính kèm ({attachments.length})</span>
                </div>

                {downloadError && (
                  <div
                    data-testid="notice-download-error"
                    className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2 text-xs"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{downloadError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {attachments.map((file, idx) => {
                    const badge = getFileBadge(file.name);
                    const unavailable = isLegacyOrUnavailableAttachment(file);
                    return (
                      <div
                        key={file.id || idx}
                        data-testid={`notice-detail-attachment-${file.id || idx}`}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                          unavailable
                            ? 'bg-amber-50/60 border-amber-200'
                            : 'bg-slate-50/90 hover:bg-slate-100 border-slate-200/90 group'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs">
                            {badge.icon}
                          </div>
                          <div className="min-w-0">
                            <div
                              className="font-semibold text-slate-800 text-xs truncate"
                              title={file.name}
                            >
                              {file.name}
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span
                                className={`px-1.5 py-0.2 rounded border font-mono font-bold text-[9px] ${badge.bg}`}
                              >
                                {badge.label}
                              </span>
                              {unavailable ? (
                                <span
                                  data-testid={`notice-attachment-unavailable-${file.id || idx}`}
                                  className="text-amber-800 font-bold"
                                >
                                  Không khả dụng — cần tải lên lại
                                </span>
                              ) : (
                                <span>{file.size || ''}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            data-testid={`download-notice-attachment-${file.id || idx}`}
                            disabled={unavailable || downloadingId === file.id}
                            onClick={() => handleDownloadAttachment(file)}
                            className={`p-1.5 rounded-lg border shadow-2xs transition flex items-center gap-1 ${
                              unavailable
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                : 'bg-white hover:bg-blue-50 text-blue-700 border-slate-200 hover:border-blue-300 cursor-pointer'
                            }`}
                            title={
                              unavailable
                                ? 'Tệp đính kèm cũ không khả dụng — cần tải lên lại'
                                : `Tải xuống ${file.name}`
                            }
                          >
                            {downloadingId === file.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Signer Section */}
            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <div className="text-center space-y-1.5 min-w-[200px]">
                <div className="font-bold text-slate-900 uppercase text-xs">
                  NGƯỜI PHÁT HÀNH THÔNG BÁO
                </div>
                <div className="font-bold text-slate-900 text-sm pt-1">{signer}</div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Bottom Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Lưu trữ nội bộ trên hệ thống NEXUS HRMS</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {!accessDeniedError && (
              <button
                type="button"
                onClick={handlePrint}
                className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                <span>In văn bản</span>
              </button>
            )}

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
