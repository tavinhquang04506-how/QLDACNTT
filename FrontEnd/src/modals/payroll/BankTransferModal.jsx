import React, { useState, useEffect } from 'react';
import AppleModal from '../../components/motion/AppleModal';
import { Building2, FileSpreadsheet, X, FileText, AlertTriangle } from 'lucide-react';
import payrollService from '../../services/payrollService';
import { generateCSVContent, downloadFile } from '../../utils/fileExportUtils';
import { parsePeriodCode } from '../../utils/payrollPeriodState';

export default function Modal7B_BankTransfer({ isOpen, onClose, payload }) {
  const [selectedBank, setSelectedBank] = useState('vcb'); // 'vcb', 'tcb', 'napas'
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [fetchedList, setFetchedList] = useState([]);
  const [missingList, setMissingList] = useState([]);
  const [batchError, setBatchError] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [loadedSnapshotToken, setLoadedSnapshotToken] = useState(null);

  const periodId = payload?.periodId || payload?.period?.id || null;
  const periodName = payload?.period?.period || payload?.period?.name || payload?.period || 'Kỳ lương hiện tại';
  const periodCode = payload?.periodCode || parsePeriodCode(periodName);
  const expectedSnapshotTokenFromParent = payload?.expectedSnapshotToken || null;
  const expectedTotalNetFromParent =
    payload?.expectedTotalNet !== undefined && payload?.expectedTotalNet !== null
      ? Number(payload.expectedTotalNet)
      : payload?.totalNet !== undefined && payload?.totalNet !== null
      ? Number(payload.totalNet)
      : null;

  useEffect(() => {
    if (!isOpen) return;
    setBatchError('');
    setMissingList([]);
    setFetchedList([]);
    setDownloadSuccess(false);
    setLoadedSnapshotToken(expectedSnapshotTokenFromParent);

    if (!periodId) {
      setBatchError('Kỳ lương chưa được khởi tạo hoặc chưa tải xong dữ liệu kỳ lương. Không thể kết xuất lệnh chi.');
      return;
    }

    let isMounted = true;
    (async () => {
      setBatchLoading(true);
      try {
        if (!periodCode) {
          throw new Error('Thiếu mã kỳ lương để tải danh sách chi trả.');
        }

        // R22 + R26: Always load and validate all pages with duplicate/metadata/snapshot consistency checks
        const allPages = await payrollService.getAllPayslipsForPeriod(periodCode, 500, {
          expectedSnapshotToken: expectedSnapshotTokenFromParent,
          expectedTotalNet: expectedTotalNetFromParent,
        });

        if (
          payload?.expectedTotal != null &&
          Array.isArray(allPages.data) &&
          allPages.data.length !== Number(payload.expectedTotal)
        ) {
          throw new Error(
            `Danh sách phiếu lương tải về (${allPages.data.length}) không khớp tổng số bản ghi của kỳ (${payload.expectedTotal}).`
          );
        }

        if (isMounted) {
          setFetchedList(allPages.data || []);
          setLoadedSnapshotToken(allPages.snapshotToken || expectedSnapshotTokenFromParent || null);
          setBatchLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setFetchedList([]);
          setBatchError(err?.message || 'Không thể tải đầy đủ danh sách chi lương từ máy chủ.');
          setBatchLoading(false);
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [isOpen, periodId, periodCode, expectedSnapshotTokenFromParent, expectedTotalNetFromParent, payload?.expectedTotal]);

  const rawList = !batchError && !batchLoading ? fetchedList : [];

  const displayAccounts = rawList.map((item, idx) => {
    const rawNet = Number(item.net_salary ?? item.netSalary ?? item.amount ?? 0);
    const hasBank = Boolean(
      item.bank_account &&
        String(item.bank_account).trim() &&
        item.bank_name &&
        String(item.bank_name).trim()
    );
    const isPayable = hasBank && rawNet > 0;
    return {
      stt: idx + 1,
      id: item.code || item.employee_code || item.employee_id || item.id || '',
      name: item.name || item.employee_name || item.full_name || 'Nhân sự',
      account: item.bank_account || 'Chưa cập nhật',
      bank: item.bank_name || 'Chưa có thông tin',
      amount: `${rawNet.toLocaleString('vi-VN')} đ`,
      rawAmount: rawNet,
      isValid: isPayable,
      status: !hasBank ? 'Thiếu STK' : rawNet <= 0 ? 'Thực lĩnh 0đ' : 'Hợp lệ',
    };
  });

  const validAccounts = displayAccounts.filter((a) => a.isValid);
  const invalidCount = displayAccounts.filter((a) => !a.account || a.account === 'Chưa cập nhật').length;
  const totalEmp = displayAccounts.length;
  const totalAmount = validAccounts.reduce((acc, curr) => acc + (curr.rawAmount || 0), 0);
  const totalAmountStr = `${totalAmount.toLocaleString('vi-VN')} đ`;
  const canExportBatch = Boolean(periodId && !batchLoading && !batchError && validAccounts.length > 0);

  const handleExport = async () => {
    if (!canExportBatch) return;
    setBatchError('');
    setDownloadSuccess(false);
    try {
      // R26: Re-verify multi-page snapshot consistency right before generating the financial CSV
      const verified = await payrollService.getAllPayslipsForPeriod(periodCode, 500, {
        expectedSnapshotToken: loadedSnapshotToken,
        expectedTotalNet: expectedTotalNetFromParent,
      });
      const verifiedRows = (verified.data || []).filter((item) => {
        const rawNet = Number(item.net_salary ?? item.netSalary ?? item.amount ?? 0);
        const hasBank = Boolean(
          item.bank_account &&
            String(item.bank_account).trim() &&
            item.bank_name &&
            String(item.bank_name).trim()
        );
        return hasBank && rawNet > 0;
      });
      if (verifiedRows.length === 0) {
        throw new Error('Không có hồ sơ nhân sự hợp lệ để xuất lệnh chi ngân hàng.');
      }

      const headers = [
        'STT',
        'Mã Nhân Viên',
        'Họ Và Tên',
        'Số Tài Khoản',
        'Ngân Hàng Thụ Hưởng',
        'Số Tiền Thực Nhận (VNĐ)',
        'Trạng Thái',
      ];
      const rows = verifiedRows.map((item, idx) => [
        idx + 1,
        item.code || item.employee_code || item.employee_id || item.id || '',
        item.name || item.employee_name || item.full_name || 'Nhân sự',
        item.bank_account,
        item.bank_name,
        Number(item.net_salary ?? item.netSalary ?? item.amount ?? 0),
        'Hợp lệ',
      ]);
      const csv = generateCSVContent(headers, rows);
      const bankLabel =
        selectedBank === 'vcb' ? 'Vietcombank' : selectedBank === 'tcb' ? 'Techcombank' : 'NAPAS247';
      const safePeriod = String(periodName).replace(/[^a-zA-Z0-9_-]/g, '_');
      downloadFile(`Lenh_Chi_Luong_${bankLabel}_${safePeriod}.csv`, csv);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      setBatchError(
        err?.message ||
          'Dữ liệu bảng lương đã thay đổi hoặc không hợp lệ khi kết xuất lệnh chi. Vui lòng tải lại kỳ lương.'
      );
    }
  };

  return (
    <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-4xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Xuất lệnh chi lương Ngân hàng và Ủy nhiệm chi (UNC)</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {batchLoading ? 'Đang tải...' : batchError ? 'Lỗi dữ liệu' : 'Sẵn sàng kết xuất'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Kỳ lương: <strong className="text-slate-800">{periodName}</strong> • Đơn vị chi trả: <strong className="text-slate-800">CÔNG TY CP CÔNG NGHỆ FWB NEXUS</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bank Tabs */}
        <div className="mt-4 flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setSelectedBank('vcb')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              selectedBank === 'vcb'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Vietcombank iB@nk ({validAccounts.length} NV - {totalAmountStr})
          </button>
          <button
            onClick={() => setSelectedBank('tcb')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              selectedBank === 'tcb'
                ? 'bg-rose-50 text-rose-800 border border-rose-300 shadow-xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Techcombank Business
          </button>
          <button
            onClick={() => setSelectedBank('napas')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              selectedBank === 'napas'
                ? 'bg-blue-50 text-blue-800 border border-blue-300 shadow-xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            NAPAS 24/7 Liên ngân hàng
          </button>
        </div>

        {/* Batch Info Card */}
        <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-slate-400 block text-[11px]">Số hồ sơ đủ điều kiện chi:</span>
              <span className="font-mono font-bold text-slate-800">{validAccounts.length} / {totalEmp} nhân sự</span>
            </div>
            <div className="h-7 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 block text-[11px]">Tổng số tiền đợt chi hợp lệ:</span>
              <span className="font-bold text-emerald-700 text-sm">{totalAmountStr}</span>
            </div>
            <div className="h-7 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 block text-[11px]">Kỳ chi lương:</span>
              <span className="font-mono font-semibold text-slate-700">{periodName}</span>
            </div>
          </div>
          {invalidCount > 0 ? (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              {invalidCount} nhân sự thiếu STK
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              {totalEmp > 0 ? 'Đủ thông tin tài khoản thụ hưởng' : 'Chưa có dữ liệu phiếu lương'}
            </span>
          )}
        </div>

        {batchError && (
          <div data-testid="bank-transfer-batch-error" className="mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold">
            {batchError}
          </div>
        )}

        {/* Account Table Preview */}
        <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden shadow-xs max-h-64 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">STT</th>
                <th className="py-2.5 px-3">Mã NV</th>
                <th className="py-2.5 px-3">Họ và tên</th>
                <th className="py-2.5 px-3 font-mono">Số tài khoản thụ hưởng</th>
                <th className="py-2.5 px-3">Chi nhánh ngân hàng</th>
                <th className="py-2.5 px-3 text-right">Thực nhận (VND)</th>
                <th className="py-2.5 px-3 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayAccounts.map((acc) => (
                <tr key={acc.stt} className="hover:bg-slate-50/70 transition">
                  <td className="py-2 px-3 text-slate-400">{acc.stt}</td>
                  <td className="py-2 px-3 font-mono font-semibold text-slate-800">{acc.id}</td>
                  <td className="py-2 px-3 font-bold text-slate-900">{acc.name}</td>
                  <td className="py-2 px-3 font-mono text-slate-700">{acc.account}</td>
                  <td className="py-2 px-3 text-slate-500">{acc.bank}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{acc.amount}</td>
                  <td className="py-2 px-3 text-center">
                    {acc.isValid ? (
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded text-[10px] border border-emerald-200">
                        Hợp lệ ✓
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 font-bold rounded text-[10px] border border-amber-200">
                        {acc.status} ⚠️
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {downloadSuccess && (
          <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-center font-bold text-xs">
            ✓ Đã tải xuống file CSV danh sách chuyển khoản lương ({validAccounts.length} bản ghi hợp lệ).
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Dữ liệu được kiểm tra tính nhất quán snapshot và mã nhân viên duy nhất trước khi kết xuất.
          </div>

          <div className="flex items-center gap-2.5">
            <button
              disabled={!canExportBatch}
              onClick={handleExport}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-800 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
            >
              <FileText className="w-3.5 h-3.5 text-slate-600" />
              In Ủy nhiệm chi (PDF)
            </button>
            <button
              data-testid="bank-transfer-export-csv-btn"
              disabled={!canExportBatch}
              onClick={handleExport}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs shadow-sm transition active:scale-95 flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Xuất File CSV Lệnh Chi Ngân Hàng
            </button>
          </div>
        </div>
      </div>
    </AppleModal>
  );
}
