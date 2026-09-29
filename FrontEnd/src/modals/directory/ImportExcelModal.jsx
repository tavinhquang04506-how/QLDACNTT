import React, { useState, useRef } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { Upload, FileSpreadsheet, Download, CheckCircle2, AlertCircle, RefreshCw, X, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getEmployeeTemplateCSV, downloadFile, parseCSVToEmployeeRows } from '../../utils/fileExportUtils';
import api from '../../services/api';

export default function Modal4C_ImportExcel({ isOpen, onClose, onImportSuccess }) {
  const [fileUploaded, setFileUploaded] = useState(false);
  const [fileName, setFileName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [parsedRows, setParsedRows] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef(null);

  const handleDownloadTemplate = () => {
    downloadFile('NEXUS_HR_Mau_Nhap_Nhan_Su.csv', getEmployeeTemplateCSV());
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileUploaded(true);
    setIsProcessing(true);
    setErrorMessage('');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        const rows = parseCSVToEmployeeRows(text);
        if (rows.length === 0) {
          setErrorMessage('Tệp rỗng hoặc không đúng định dạng các cột theo mẫu chuẩn.');
          setIsProcessing(false);
          return;
        }
        setParsedRows(rows);
      } catch (err) {
        setErrorMessage('Không thể phân tích dữ liệu tệp: ' + err.message);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.onerror = () => {
      setErrorMessage('Đã xảy ra lỗi khi đọc tệp từ thiết bị.');
      setIsProcessing(false);
    };

    reader.readAsText(file, 'utf-8');
  };

  const handleConfirmImport = async () => {
    if (parsedRows.length === 0) return;
    setIsSubmitting(true);
    try {
      const res = await api.post('/employees/import', {
        rows: parsedRows,
        dryRun: false,
      });

      setSuccess(true);
      try {
        confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
      } catch (e) {}

      if (typeof onImportSuccess === 'function') {
        onImportSuccess(res);
      }

      setTimeout(() => {
        setSuccess(false);
        setFileUploaded(false);
        setParsedRows([]);
        onClose();
      }, 1800);
    } catch (err) {
      setErrorMessage(err.message || 'Lỗi khi nhập danh sách nhân viên vào CSDL.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFileUploaded(false);
    setFileName('');
    setParsedRows([]);
    setErrorMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Nhập danh sách nhân sự từ file Microsoft Excel / CSV"
      subtitle="Hỗ trợ định dạng .csv, .xlsx • Tự động ánh xạ và kiểm tra dữ liệu vào PostgreSQL"
      maxWidth="max-w-2xl"
    >
      <div className="p-6 space-y-4 text-xs">
        {/* Template download link */}
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-900 font-medium">
            <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Chưa có biểu mẫu chuẩn? Tải về file mẫu NEXUS HR Template (10 cột chuẩn).</span>
          </div>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="text-blue-700 font-bold hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải file mẫu (.csv)</span>
          </button>
        </div>

        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".csv,.txt"
          className="hidden"
        />

        {/* Error Notice */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Upload Dropzone */}
        {!fileUploaded ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-8 text-center cursor-pointer transition-all bg-slate-50/50 hover:bg-blue-50/20 flex flex-col items-center justify-center gap-3 group"
          >
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xs">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm">
                Nhấp để chọn file CSV / Excel mẫu từ máy tính
              </p>
              <p className="text-slate-400 text-[11px] mt-1">
                Dung lượng tối đa: 10MB • Tự động mã hóa UTF-8 tiếng Việt có dấu
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-emerald-900">{fileName}</div>
                  <div className="text-[11px] text-emerald-700 mt-0.5">
                    {isProcessing ? 'Đang phân tích cấu trúc dữ liệu...' : `Đã đọc thành công ${parsedRows.length} dòng nhân sự`}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Preview Parsed Table */}
            {parsedRows.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                    <tr>
                      <th className="p-2">Mã NV</th>
                      <th className="p-2">Họ và Tên</th>
                      <th className="p-2">Email</th>
                      <th className="p-2">Phòng Ban</th>
                      <th className="p-2">Lương Cơ Bản</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2 font-mono font-bold text-slate-700">{r.code}</td>
                        <td className="p-2 font-semibold text-slate-900">{r.name}</td>
                        <td className="p-2 text-slate-500">{r.email}</td>
                        <td className="p-2 text-slate-600">{r.department_id}</td>
                        <td className="p-2 font-mono text-emerald-700 font-bold">
                          {Number(r.base_salary).toLocaleString('vi-VN')} đ
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={!fileUploaded || parsedRows.length === 0 || isSubmitting}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang nhập vào CSDL...</span>
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Đã nhập thành công!</span>
              </>
            ) : (
              <span>Xác nhận nạp dữ liệu ({parsedRows.length})</span>
            )}
          </button>
        </div>
      </div>
    </AppleModal>
  );
}
