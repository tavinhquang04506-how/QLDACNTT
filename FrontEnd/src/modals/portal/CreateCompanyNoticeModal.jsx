import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { useAuth } from '../../context/AuthContext';
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
  FileCheck2,
  CheckCircle2,
  Paperclip,
  Trash2,
  FileText,
  UploadCloud,
  Building,
  Calendar,
  Eye
} from 'lucide-react';

export default function CreateCompanyNoticeModal({ isOpen, onClose, data, payload }) {
  const { currentRole } = useAuth();
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
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Pre-fill form when editing
  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
      setSuccessMessage('');
      if (isEditMode && noticeToEdit) {
        setTitle(noticeToEdit.title || '');
        setContent(noticeToEdit.content || '');
        setCategory(noticeToEdit.category || 'general');
        setPriority(noticeToEdit.priority || 'normal');
        setTargetRole(noticeToEdit.target_role || noticeToEdit.targetRole || '');
        setTargetDepartmentId(noticeToEdit.target_department_id || noticeToEdit.targetDepartmentId || '');
        setIsPinned(Boolean(noticeToEdit.is_pinned ?? noticeToEdit.isPinned));
        setExpiresAt(noticeToEdit.expires_at ? noticeToEdit.expires_at.slice(0, 10) : '');
        setAttachments(Array.isArray(noticeToEdit.attachments) ? noticeToEdit.attachments : []);
      } else {
        // Reset default values
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

  // Handle local file selection
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const newAttachments = files.map(file => {
      const sizeStr = file.size > 1024 * 1024 
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;

      return {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        size: sizeStr,
        type: file.type || 'application/octet-stream',
        url: URL.createObjectURL(file),
      };
    });

    setAttachments(prev => [...prev, ...newAttachments]);
    e.target.value = ''; // Reset input
  };

  // Add standard preset document
  const handleAddPresetDoc = (type) => {
    const presets = {
      pdf: {
        id: `att-${Date.now()}`,
        name: 'Van_Ban_Quyet_Dinh_Chinh_Thuc.pdf',
        size: '1.4 MB',
        type: 'application/pdf',
        url: 'https://example.com/docs/Quyet_Dinh_2026.pdf',
        content: `CÔNG TY CỔ PHẦN CÔNG NGHỆ FWB NEXUS\nQUYẾT ĐỊNH BAN HÀNH QUY CHẾ VÀ ĐIỀU HÀNH NỘI BỘ\nSố: 168/2026/QĐ-NEXUS\n\nNỘI DUNG VĂN BẢN:\n1. Phê duyệt định hướng vận hành và chiến lược tăng trưởng toàn diện năm 2026.\n2. Ban hành quy chế làm việc kết hợp (Hybrid Working) và chế độ phúc lợi mới cho CBNV.\n3. Các phòng ban, đơn vị trực thuộc nghiêm túc thi hành quyết định này kể từ ngày ký.\n\nTổng Giám Đốc\n(Đã ký điện tử xác thực CA)`
      },
      docx: {
        id: `att-${Date.now()}`,
        name: 'Bieu_Mau_Thuc_Hien_Huong_Dan.docx',
        size: '480 KB',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        url: 'https://example.com/docs/Bieu_Mau.docx',
        content: `CÔNG TY CỔ PHẦN CÔNG NGHỆ FWB NEXUS\nBIỂU MẪU HƯỚNG DẪN THỰC HIỆN VÀ ĐĂNG KÝ NỘI BỘ\n\n1. Hướng dẫn quy trình nộp hồ sơ xét duyệt trực tuyến.\n2. Các mốc thời gian hoàn tất thủ tục bàn giao.\n3. Danh sách thông tin liên hệ các điều phối viên phụ trách.\n\nKhối Quản Trị Nguồn Nhân Lực NEXUS HR`
      },
      xlsx: {
        id: `att-${Date.now()}`,
        name: 'Danh_Sach_Nhan_Su_Kem_Theo.xlsx',
        size: '820 KB',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        url: 'https://example.com/docs/Danh_Sach.xlsx',
        content: `Mã NV,Họ và Tên,Phòng Ban,Chức Vụ,Xếp Loại,Thưởng Đính Kèm\nNV001,Trịnh Hoàng Nam,Phát triển Phần mềm,Lead Fullstack,Xuất sắc,15000000\nNV002,Đỗ Thị Mai Hương,Khối Nhân sự,HR Manager,Xuất sắc,12000000\nNV003,Vũ Minh Đức,Kinh doanh & Tăng trưởng,Account Exec,Tốt,8000000`
      }
    };
    if (presets[type]) {
      setAttachments(prev => [...prev, presets[type]]);
    }
  };

  const handleRemoveAttachment = (id) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
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

    setLoading(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        category,
        priority,
        targetRole: targetRole || null,
        targetDepartmentId: targetDepartmentId || null,
        isPinned: Boolean(isPinned),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        attachments: attachments.map(a => ({
          id: a.id,
          name: a.name,
          size: a.size,
          type: a.type,
          url: a.url,
          content: a.content || null
        })),
      };

      if (isEditMode) {
        await noticeService.update(noticeToEdit.id, payload);
        setSuccessMessage('Đã cập nhật thông báo và đồng bộ thành công!');
      } else {
        await noticeService.create(payload);
        try {
          confetti({
            particleCount: 55,
            spread: 70,
            origin: { y: 0.6 }
          });
        } catch (err) {}
        setSuccessMessage('Đã phát hành thông báo thành công! Tệp đính kèm và thông báo đã được đồng bộ vào chuông và bảng tin.');
      }
      
      // Dispatch events to refresh views
      window.dispatchEvent(new CustomEvent('nexus:notifications-updated'));
      window.dispatchEvent(new CustomEvent('nexus:notices-updated'));

      setTimeout(() => {
        setSuccessMessage('');
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Error submitting company notice:', err);
      const msg = err.response?.data?.error?.message || err.message || 'Không thể lưu thông báo. Vui lòng kiểm tra lại.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? "Chỉnh Sửa Thông Báo Công Ty" : "Đăng Thông Báo Công Ty Mới"}
      subtitle={isEditMode ? `Cập nhật văn bản số: ${noticeToEdit?.id}` : "Phát hành quyết định, chính sách, sự kiện hoặc thông báo khẩn cấp kèm tệp đính kèm"}
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
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center gap-2">
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
            placeholder="VD: QUYẾT ĐỊNH BAN HÀNH QUY CHẾ LÀM VIỆC TỪ XA QUÝ IV/2026"
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

        {/* Row 3: Đối tượng nhận & Hạn hiệu lực */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>Phạm vi đối tượng nhận</span>
            </label>
            <select
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
            >
              <option value="">Toàn thể cán bộ nhân viên (Công ty)</option>
              <option value="EMPLOYEE">Chỉ Nhân viên thực thi (ESS)</option>
              <option value="LINE_MANAGER">Cấp Quản lý & Trưởng bộ phận</option>
              <option value="HR_DIRECTOR">Khối Nhân sự & Vận hành</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Ngày hết hiệu lực (Tùy chọn)</span>
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
          <label htmlFor="pin-notice-cb" className="text-xs font-bold text-amber-900 flex items-center gap-1.5 cursor-pointer">
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
            placeholder="Nhập toàn văn quyết định, chỉ đạo chi tiết hoặc nội dung công văn của ban lãnh đạo..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 font-medium text-xs leading-relaxed resize-y"
          />
        </div>

        {/* KHU VỰC TỆP ĐÍNH KÈM CHÍNH THỨC */}
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-blue-600" />
              <span>Tệp đính kèm chính thức ({attachments.length})</span>
            </label>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-slate-400">Thêm tệp mẫu:</span>
              <button
                type="button"
                onClick={() => handleAddPresetDoc('pdf')}
                className="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold transition"
              >
                + PDF
              </button>
              <button
                type="button"
                onClick={() => handleAddPresetDoc('docx')}
                className="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold transition"
              >
                + DOCX
              </button>
              <button
                type="button"
                onClick={() => handleAddPresetDoc('xlsx')}
                className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold transition"
              >
                + Excel
              </button>
            </div>
          </div>

          {/* Upload Dropzone */}
          <label className="flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl bg-slate-50/60 hover:bg-blue-50/30 transition cursor-pointer group">
            <UploadCloud className="w-6 h-6 text-slate-400 group-hover:text-blue-600 transition" />
            <span className="text-xs font-bold text-slate-700 mt-1">Bấm để chọn tệp tải lên từ máy tính</span>
            <span className="text-[10px] text-slate-400">Hỗ trợ PDF, DOCX, XLSX, PNG, JPG (Dung lượng tối đa 25MB)</span>
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
            />
          </label>

          {/* Attached Files List */}
          {attachments.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {attachments.map((att) => {
                const isPdf = att.name.endsWith('.pdf');
                const isDoc = att.name.endsWith('.doc') || att.name.endsWith('.docx');
                const isSheet = att.name.endsWith('.xls') || att.name.endsWith('.xlsx');

                return (
                  <div 
                    key={att.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 ${
                        isPdf ? 'bg-rose-100 text-rose-700' : isDoc ? 'bg-blue-100 text-blue-700' : isSheet ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {isPdf ? 'PDF' : isDoc ? 'DOC' : isSheet ? 'XLS' : 'FILE'}
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 block truncate">{att.name}</span>
                        <span className="text-[10px] text-slate-400">{att.size}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att.id)}
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
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            disabled={loading}
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
