import React, { useState, useEffect, useRef } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import noticeService from '../../services/noticeService';
import confetti from 'canvas-confetti';
import {
  Megaphone,
  Send,
  Pin,
  AlertCircle,
  Users,
  Tag,
  Flame,
  Loader2,
  CheckCircle2,
  Paperclip,
  Trash2,
  UploadCloud,
  Building,
  Calendar,
} from 'lucide-react';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

export default function CreateCompanyNoticeModal({ isOpen, onClose, data, payload }) {
  const actualData = data || payload || {};

  const isEditMode = actualData?.mode === 'edit' && Boolean(actualData?.notice?.id);
  const noticeToEdit = actualData?.notice || null;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('normal');
  const [targetRole, setTargetRole] = useState('');
  const [targetDepartmentId, setTargetDepartmentId] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const newlyUploadedIdsRef = useRef(new Set());

  // Pre-fill form when editing
  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
      setSuccessMessage('');
      setUploadingCount(0);
      newlyUploadedIdsRef.current.clear();
      if (isEditMode && noticeToEdit) {
        setTitle(noticeToEdit.title || '');
        setContent(noticeToEdit.content || '');
        setCategory(noticeToEdit.category || 'general');
        setPriority(noticeToEdit.priority || 'normal');
        setTargetRole(noticeToEdit.target_role || noticeToEdit.targetRole || '');
        setTargetDepartmentId(noticeToEdit.target_department_id || noticeToEdit.targetDepartmentId || '');
        setIsPinned(Boolean(noticeToEdit.is_pinned ?? noticeToEdit.isPinned));
        setExpiresAt(noticeToEdit.expires_at ? noticeToEdit.expires_at.slice(0, 10) : '');
        const rawAtts = Array.isArray(noticeToEdit.attachments) ? noticeToEdit.attachments : [];
        setAttachments(
          rawAtts.map((a) => ({
            ...a,
            legacyUnavailable:
              Boolean(a.legacyUnavailable) ||
              a.available === false ||
              !a.id ||
              !/^NATT-/.test(String(a.id)),
          }))
        );
      } else {
        setTitle('');
        setContent('');
        setCategory('general');
        setPriority('normal');
        setTargetRole('');
        setTargetDepartmentId('');
        setIsPinned(false);
        setExpiresAt('');
        setAttachments([]);
      }
    }
  }, [isOpen, isEditMode, noticeToEdit]);

  const cleanupTempUploads = () => {
    const ids = Array.from(newlyUploadedIdsRef.current);
    newlyUploadedIdsRef.current.clear();
    for (const id of ids) {
      noticeService.deleteAttachment(id).catch(() => null);
    }
  };

  const handleModalCancel = () => {
    cleanupTempUploads();
    onClose();
  };

  // Upload real files to server
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    setErrorMessage('');

    for (const file of files) {
      if (file.size === 0) {
        setErrorMessage(`Tệp "${file.name}" rỗng (0 byte), không thể tải lên.`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setErrorMessage(
          `Tệp "${file.name}" vượt quá giới hạn tối đa 5MB (${(file.size / (1024 * 1024)).toFixed(1)} MB).`
        );
        continue;
      }

      setUploadingCount((c) => c + 1);
      try {
        const res = await noticeService.uploadAttachment(file);
        const uploaded = res?.data || res;
        if (!uploaded || !uploaded.id || !/^NATT-/.test(uploaded.id)) {
          throw new Error('Máy chủ không trả về mã tệp đính kèm hợp lệ.');
        }
        newlyUploadedIdsRef.current.add(uploaded.id);
        setAttachments((prev) => [
          ...prev,
          {
            id: uploaded.id,
            name: uploaded.name || file.name,
            size: uploaded.size,
            sizeBytes: uploaded.sizeBytes || file.size,
            type: uploaded.type || file.type || 'application/octet-stream',
            sha256: uploaded.sha256 || null,
            available: true,
            legacyUnavailable: false,
            isNewlyUploaded: true,
          },
        ]);
      } catch (err) {
        const msg =
          err?.message ||
          err?.error?.message ||
          `Không thể tải tệp "${file.name}" lên máy chủ. Vui lòng thử lại.`;
        setErrorMessage(msg);
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1));
      }
    }
  };

  const handleRemoveAttachment = (att) => {
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    if (att?.id && newlyUploadedIdsRef.current.has(att.id)) {
      newlyUploadedIdsRef.current.delete(att.id);
      noticeService.deleteAttachment(att.id).catch(() => null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!title.trim()) {
      setErrorMessage('Vui lòng nhập tiêu đề thông báo.');
      return;
    }
    if (!content.trim()) {
      setErrorMessage('Vui lòng nhập nội dung chi tiết thông báo.');
      return;
    }
    if (uploadingCount > 0) {
      setErrorMessage('Đang tải tệp đính kèm lên máy chủ, vui lòng chờ hoàn tất.');
      return;
    }

    const legacyLeft = attachments.filter((a) => a.legacyUnavailable);
    if (legacyLeft.length > 0) {
      setErrorMessage(
        'Thông báo có tệp đính kèm cũ không còn khả dụng. Vui lòng gỡ tệp cũ hoặc tải lên lại tệp mới trước khi lưu.'
      );
      return;
    }

    setLoading(true);
    try {
      const validAttachments = attachments.map((a) => ({
        id: a.id,
        name: a.name,
        size: a.size,
        sizeBytes: a.sizeBytes,
        type: a.type,
        sha256: a.sha256 || undefined,
      }));

      const submitPayload = {
        title: title.trim(),
        content: content.trim(),
        category,
        priority,
        targetRole: targetRole || null,
        targetDepartmentId: targetDepartmentId || null,
        isPinned: Boolean(isPinned),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        attachments: validAttachments,
      };

      if (isEditMode) {
        await noticeService.update(noticeToEdit.id, submitPayload);
        newlyUploadedIdsRef.current.clear();
        setSuccessMessage('Đã cập nhật thông báo và đồng bộ tệp đính kèm thành công!');
      } else {
        await noticeService.create(submitPayload);
        newlyUploadedIdsRef.current.clear();
        try {
          confetti({
            particleCount: 55,
            spread: 70,
            origin: { y: 0.6 },
          });
        } catch (_err) {}
        setSuccessMessage(
          'Đã phát hành thông báo thành công! Tệp đính kèm đã được lưu trữ trên máy chủ và đồng bộ vào bảng tin.'
        );
      }

      window.dispatchEvent(new CustomEvent('nexus:notifications-updated'));
      window.dispatchEvent(new CustomEvent('nexus:notices-updated'));

      setTimeout(() => {
        setSuccessMessage('');
        onClose();
      }, 900);
    } catch (err) {
      console.error('Error submitting company notice:', err);
      const msg =
        err?.message ||
        err?.error?.message ||
        err?.response?.data?.error?.message ||
        'Không thể lưu thông báo. Vui lòng kiểm tra lại.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={handleModalCancel}
      title={isEditMode ? 'Chỉnh Sửa Thông Báo Công Ty' : 'Đăng Thông Báo Công Ty Mới'}
      subtitle={
        isEditMode
          ? `Cập nhật văn bản số: ${noticeToEdit?.id}`
          : 'Phát hành quyết định, chính sách, sự kiện hoặc thông báo kèm tệp đính kèm thực'
      }
      badge={
        <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
          <Megaphone className="w-3.5 h-3.5" />
          {isEditMode ? 'Chế độ Chỉnh sửa' : 'Ban Quản Trị & HR'}
        </span>
      }
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs font-sans max-h-[82vh] overflow-y-auto">
        {errorMessage && (
          <div
            data-testid="notice-modal-error"
            className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div
            data-testid="notice-modal-success"
            className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Tiêu đề thông báo */}
        <div className="space-y-1.5">
          <label className="font-bold text-slate-800 flex items-center gap-1.5">
            <span>Tiêu đề thông báo / Quyết định</span>
            <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            data-testid="notice-title-input"
            placeholder="VD: QUYẾT ĐỊNH BAN HÀNH QUY CHẾ LÀM VIỆC QUÝ IV/2026"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 font-semibold text-xs placeholder:text-slate-400 placeholder:font-normal"
          />
        </div>

        {/* Row 2: Danh mục & Mức độ ưu tiên */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-500" />
              <span>Phân loại danh mục</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
            >
              <option value="general">Thông báo chung</option>
              <option value="policy">Quy định & Chính sách</option>
              <option value="event">Sự kiện & Hoạt động</option>
              <option value="urgent">Khẩn cấp / Hỏa tốc</option>
              <option value="benefit">Chế độ & Đãi ngộ</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-slate-500" />
              <span>Mức độ ưu tiên</span>
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
            >
              <option value="normal">Tiêu chuẩn (Bình thường)</option>
              <option value="high">Hỏa tốc / Khẩn cấp 🔥</option>
              <option value="low">Tham khảo (Thấp)</option>
            </select>
          </div>
        </div>

        {/* Row 3: Đối tượng nhận (Vai trò & Phòng ban) + Hạn hiệu lực */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>Vai trò nhận</span>
            </label>
            <select
              data-testid="notice-target-role-select"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
            >
              <option value="">Toàn thể vai trò</option>
              <option value="EMPLOYEE">Chỉ Nhân viên (ESS)</option>
              <option value="LINE_MANAGER">Cấp Quản lý</option>
              <option value="HR_DIRECTOR">Khối Nhân sự</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-slate-500" />
              <span>Phòng ban nhận</span>
            </label>
            <select
              data-testid="notice-target-dept-select"
              value={targetDepartmentId}
              onChange={(e) => setTargetDepartmentId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
            >
              <option value="">Toàn bộ phòng ban</option>
              <option value="DEPT-IT">Khối Công nghệ (DEPT-IT)</option>
              <option value="DEPT-HR">Khối Nhân sự (DEPT-HR)</option>
              <option value="DEPT-FIN">Khối Tài chính (DEPT-FIN)</option>
              <option value="DEPT-MKT">Khối Marketing (DEPT-MKT)</option>
              <option value="DEPT-SALES">Khối Kinh doanh (DEPT-SALES)</option>
              <option value="DEPT-OPS">Khối Vận hành (DEPT-OPS)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Ngày hết hiệu lực</span>
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
            />
          </div>
        </div>

        {/* Checkbox: Ghim lên đầu */}
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50/60 border border-amber-200/80">
          <input
            type="checkbox"
            id="pin-notice-cb"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
            className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
          />
          <label
            htmlFor="pin-notice-cb"
            className="text-xs font-bold text-amber-900 flex items-center gap-1.5 cursor-pointer"
          >
            <Pin className="w-3.5 h-3.5 text-amber-700" />
            <span>Ghim thông báo này lên đầu Bảng tin trang chủ</span>
          </label>
        </div>

        {/* Nội dung chi tiết */}
        <div className="space-y-1.5">
          <label className="font-bold text-slate-800 flex items-center gap-1.5">
            <span>Nội dung văn bản chỉ đạo</span>
            <span className="text-rose-500">*</span>
          </label>
          <textarea
            required
            rows={5}
            data-testid="notice-content-input"
            placeholder="Nhập toàn văn quyết định, chỉ đạo chi tiết hoặc nội dung công văn..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 font-medium text-xs leading-relaxed resize-y"
          />
        </div>

        {/* KHU VỰC TỆP ĐÍNH KÈM THỰC */}
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-blue-600" />
              <span>Tệp đính kèm thực ({attachments.length})</span>
            </label>
            {uploadingCount > 0 && (
              <span className="text-[11px] font-bold text-blue-600 flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang tải lên máy chủ ({uploadingCount})...</span>
              </span>
            )}
          </div>

          {/* Upload Dropzone */}
          <label className="flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl bg-slate-50/60 hover:bg-blue-50/30 transition cursor-pointer group">
            <UploadCloud className="w-6 h-6 text-slate-400 group-hover:text-blue-600 transition" />
            <span className="text-xs font-bold text-slate-700 mt-1">
              Bấm để chọn tệp tải lên máy chủ từ máy tính
            </span>
            <span className="text-[10px] text-slate-400">
              Hỗ trợ PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, TXT, CSV (Dung lượng tối đa 5MB)
            </span>
            <input
              type="file"
              multiple
              data-testid="notice-file-input"
              onChange={handleFileSelect}
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt,.csv"
            />
          </label>

          {/* Attached Files List */}
          {attachments.length > 0 && (
            <div className="space-y-1.5 pt-1" data-testid="notice-attachments-list">
              {attachments.map((att) => {
                const nameLower = String(att.name || '').toLowerCase();
                const isPdf = nameLower.endsWith('.pdf');
                const isDoc = nameLower.endsWith('.doc') || nameLower.endsWith('.docx');
                const isSheet =
                  nameLower.endsWith('.xls') || nameLower.endsWith('.xlsx') || nameLower.endsWith('.csv');

                return (
                  <div
                    key={att.id}
                    data-testid={`notice-attachment-item-${att.id}`}
                    className={`flex items-center justify-between p-2.5 rounded-xl border shadow-2xs text-xs ${
                      att.legacyUnavailable
                        ? 'bg-amber-50/70 border-amber-300'
                        : 'bg-white border-slate-200/90'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 ${
                          isPdf
                            ? 'bg-rose-100 text-rose-700'
                            : isDoc
                              ? 'bg-blue-100 text-blue-700'
                              : isSheet
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isPdf ? 'PDF' : isDoc ? 'DOC' : isSheet ? 'XLS' : 'FILE'}
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 block truncate">{att.name}</span>
                        {att.legacyUnavailable ? (
                          <span className="text-[10px] font-bold text-amber-800">
                            Không khả dụng — cần gỡ hoặc tải lên lại
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            {att.size} • Đã lưu máy chủ ({att.id})
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      data-testid={`remove-attachment-${att.id}`}
                      onClick={() => handleRemoveAttachment(att)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                      title="Gỡ tệp này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Nút hành động */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleModalCancel}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            data-testid="notice-submit-btn"
            disabled={loading || uploadingCount > 0}
            className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer disabled:opacity-75"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>{isEditMode ? 'Lưu thay đổi văn bản' : 'Phát hành thông báo'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </AppleModal>
  );
}
