import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AppleModal from '../../components/motion/AppleModal';
import Avatar from '../../components/common/Avatar';
import { useModal } from '../../context/ModalContext';
import { useAuth } from '../../context/AuthContext';
import analyticsService from '../../services/analyticsService';
import employeeService from '../../services/employeeService';
import { generateCSVContent, downloadFile } from '../../utils/fileExportUtils';
import { CELL_META, GRID_ORDER, PIP_CELLS, cellOf, periodLabel } from '../../utils/nineBox';
import {
  BarChart3, Search, Download, Eye, X, Loader2, Edit3, History, Target, ChevronDown, ChevronUp, Lightbulb, CheckCircle2, AlertCircle, ArrowUpDown,
} from 'lucide-react';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');

/**
 * Modal chi tiết một ô 9-Box (hoặc toàn bộ ma trận khi không truyền `cell`).
 * payload:
 *  - cell?: number                       ô đang xem (1..9). Không có → chế độ tổng quan.
 *  - period?: string                     kỳ đánh giá (vd 2026-Q4)
 *  - employees?: Array                   nhân viên trong ô (đã kèm điểm đánh giá)
 *  - canPip?: boolean                    HR/CEO lập PIP, Trưởng phòng đề xuất PIP
 *  - activePipEmployeeIds?: string[]     nhân viên đang có PIP mở (chờ duyệt hoặc đang thực hiện)
 *  - onReview?: (employeeId) => void     mở form đánh giá trên trang
 *  - onChanged?: () => void              tải lại dữ liệu trang sau khi lập PIP
 */
export default function Modal8D_NineBoxDetail({ isOpen, onClose, payload }) {
  const { openModal } = useModal();
  const { currentRole, user } = useAuth();
  const navigate = useNavigate();

  const cellNo = Number(payload?.cell) || null;
  const meta = cellNo ? CELL_META[cellNo] : null;
  const isExecRole = currentRole?.key === 'CEO' || currentRole?.key === 'HR_DIRECTOR';
  const isManager = currentRole?.key === 'LINE_MANAGER';
  const canPip = payload?.canPip ?? (isExecRole || isManager);
  const myId = user?.employeeId || currentRole?.id;

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('perf_desc');
  const [cellFilter, setCellFilter] = useState('all');
  const [members, setMembers] = useState([]);
  const [period, setPeriod] = useState(payload?.period || null);
  const [activePipIds, setActivePipIds] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [history, setHistory] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    setSearchTerm('');
    setExpandedId(null);
    setCellFilter('all');
    setLoadError('');
    setPeriod(payload?.period || null);
    setActivePipIds(Array.isArray(payload?.activePipEmployeeIds) ? payload.activePipEmployeeIds : []);

    if (cellNo) {
      setMembers(Array.isArray(payload?.employees) ? payload.employees : []);
      return;
    }

    // Chế độ tổng quan: lấy kết quả 9-Box kỳ gần nhất trực tiếp từ API (không suy diễn).
    let alive = true;
    setIsLoading(true);
    Promise.all([
      analyticsService.getNineBox(),
      employeeService.getAll({ limit: 200 }).catch(() => null),
      analyticsService.getPip({ limit: 200 }).catch(() => null),
    ])
      .then(([boxRes, empRes, pipRes]) => {
        if (!alive) return;
        const empMap = new Map((Array.isArray(empRes?.data) ? empRes.data : []).map((e) => [e.id, e]));
        const rows = (Array.isArray(boxRes?.data) ? boxRes.data : []).flatMap((c) =>
          (c.employees || []).map((e) => ({
            ...(empMap.get(e.employee_id) || {}),
            id: e.employee_id,
            full_name: e.full_name,
            performance_score: e.performance_score,
            potential_score: e.potential_score,
            cell: c.cell,
          }))
        );
        setMembers(rows);
        setPeriod(boxRes?.period || null);
        setActivePipIds((Array.isArray(pipRes?.data) ? pipRes.data : []).filter((p) => ['proposed', 'active'].includes(p.status)).map((p) => p.employee_id));
      })
      .catch((err) => { if (alive) { setMembers([]); setLoadError(err?.message || 'Không tải được dữ liệu 9-Box'); } })
      .finally(() => { if (alive) setIsLoading(false); });
    return () => { alive = false; };
  }, [isOpen, payload]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    const list = members
      .map((m) => ({
        ...m,
        cell: m.cell || (m.performance_score != null ? cellOf(Number(m.performance_score), Number(m.potential_score)) : cellNo),
      }))
      .filter((m) => (cellFilter === 'all' ? true : m.cell === Number(cellFilter)))
      .filter((m) => !q
        || (m.full_name || '').toLowerCase().includes(q)
        || (m.id || '').toLowerCase().includes(q)
        || (m.job_title || '').toLowerCase().includes(q)
        || (m.department_name || '').toLowerCase().includes(q));
    const by = {
      perf_desc: (a, b) => Number(b.performance_score) - Number(a.performance_score),
      perf_asc: (a, b) => Number(a.performance_score) - Number(b.performance_score),
      pot_desc: (a, b) => Number(b.potential_score) - Number(a.potential_score),
      name: (a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'vi'),
    }[sortBy];
    return [...list].sort(by);
  }, [members, searchTerm, sortBy, cellFilter, cellNo]);

  const toggleHistory = async (emp) => {
    if (expandedId === emp.id) { setExpandedId(null); return; }
    setExpandedId(emp.id);
    if (history[emp.id]) return;
    setHistory((h) => ({ ...h, [emp.id]: { loading: true, items: [] } }));
    try {
      const res = await analyticsService.getReviews({ employeeId: emp.id, limit: 50 });
      setHistory((h) => ({ ...h, [emp.id]: { loading: false, items: Array.isArray(res?.data) ? res.data : [] } }));
    } catch (err) {
      setHistory((h) => ({ ...h, [emp.id]: { loading: false, items: [], error: err?.message || 'Không tải được lịch sử' } }));
    }
  };

  const handleReview = (emp) => {
    onClose();
    if (typeof payload?.onReview === 'function') payload.onReview(emp.id);
    else navigate(`/ai-analytics?review=${encodeURIComponent(emp.id)}`);
  };

  const handleProfile = (emp) => {
    onClose();
    openModal('modal4B', emp);
  };

  const handlePip = (emp) => {
    openModal('modal8C', {
      employee: emp,
      onChanged: () => { if (typeof payload?.onChanged === 'function') payload.onChanged(); },
    });
  };

  const handleExport = () => {
    const headers = ['Mã NV', 'Họ và Tên', 'Chức Vụ', 'Phòng Ban', 'Điểm Hiệu Suất', 'Điểm Tiềm Năng', 'Ô 9-Box', 'Định Hướng', 'Nhận Xét', 'Kỳ'];
    const data = rows.map((m) => {
      const cm = CELL_META[m.cell] || {};
      return [
        m.id, m.full_name || '', m.job_title || '', m.department_name || '',
        m.performance_score ?? '', m.potential_score ?? '', cm.title || '', cm.tag || '', m.comments || '', period || '',
      ];
    });
    const name = meta ? meta.title : 'Toan_bo_ma_tran';
    downloadFile(`Nhom_9_Box_${name.replace(/\s+/g, '_')}_${period || 'ky'}.csv`, generateCSVContent(headers, data));
  };

  return (
    <AppleModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-5xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100 gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center font-display font-extrabold text-lg shrink-0 ${meta ? meta.badge : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
              {meta ? meta.cell : <BarChart3 className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 font-display">
                  {meta ? meta.title : (payload?.title || 'Toàn bộ ma trận 9-Box')}
                </h3>
                <span className="bg-blue-50 text-blue-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-blue-200">
                  {members.length} nhân sự
                </span>
                {period && (
                  <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-slate-200">
                    {periodLabel(period)}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {meta ? <>{meta.desc} • Định hướng: <strong className="text-slate-800">{meta.tag}</strong></> : 'Kết quả đánh giá kỳ gần nhất được lưu trong hệ thống'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Strategy panel */}
        {meta && (
          <div className={`mt-4 p-4 rounded-2xl border bg-gradient-to-br ${meta.card.split(' hover:')[0]}`}>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <Lightbulb className="w-4 h-4 text-amber-500" /> Chiến lược hành động khuyến nghị cho nhóm này
            </div>
            <ul className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
              {meta.actions.map((a) => (
                <li key={a} className="text-[11px] text-slate-700 bg-white/80 rounded-xl px-3 py-2 border border-white flex items-start gap-1.5 shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" /> {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mt-4">
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm theo tên, mã NV, chức danh, phòng ban..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />
            </div>
            {!cellNo && (
              <select value={cellFilter} onChange={(e) => setCellFilter(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer">
                <option value="all">Tất cả các ô</option>
                {GRID_ORDER.map((c) => <option key={c} value={c}>Ô {c} — {CELL_META[c].title}</option>)}
              </select>
            )}
            <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="bg-transparent font-semibold text-slate-700 focus:outline-none cursor-pointer">
                <option value="perf_desc">Hiệu suất cao → thấp</option>
                <option value="perf_asc">Hiệu suất thấp → cao</option>
                <option value="pot_desc">Tiềm năng cao → thấp</option>
                <option value="name">Tên A → Z</option>
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={rows.length === 0}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" /> Xuất CSV
          </button>
        </div>

        {/* Members table */}
        <div className="mt-4 border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs">
          <div className="overflow-x-auto max-h-[46vh] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[10px] uppercase tracking-wider">
                  <th className="py-3 px-4">Nhân sự</th>
                  <th className="py-3 px-3">Chức vụ & Phòng ban</th>
                  <th className="py-3 px-3 text-center">Hiệu suất</th>
                  <th className="py-3 px-3 text-center">Tiềm năng</th>
                  {!cellNo && <th className="py-3 px-3 text-center">Ô 9-Box</th>}
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={6} className="py-10 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /> Đang tải dữ liệu 9-Box...</div>
                  </td></tr>
                ) : loadError ? (
                  <tr><td colSpan={6} className="py-8 text-center text-rose-600"><span className="inline-flex items-center gap-1.5"><AlertCircle className="w-4 h-4" /> {loadError}</span></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-slate-400">
                    {members.length === 0
                      ? <>Chưa có nhân sự nào thuộc {meta ? 'nhóm này' : 'ma trận'}{period ? ` trong ${periodLabel(period)}` : ''}.<div className="mt-1 text-slate-500">Nhân sự sẽ xuất hiện tại đây sau khi được đánh giá hiệu suất.</div></>
                      : 'Không có nhân sự phù hợp bộ lọc tìm kiếm.'}
                  </td></tr>
                ) : rows.map((emp) => {
                  const cm = CELL_META[emp.cell];
                  const hasActivePip = activePipIds.includes(emp.id);
                  const showPip = canPip && PIP_CELLS.includes(emp.cell) && emp.id !== myId;
                  const h = history[emp.id];
                  return (
                    <React.Fragment key={emp.id}>
                      <tr className="hover:bg-slate-50/70 transition-colors group">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <Avatar src={emp.avatar_url} name={emp.full_name} id={emp.id} size="sm" shape="rounded" />
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">{emp.full_name}</div>
                              <div className="text-[10px] font-mono text-slate-400">{emp.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-800">{emp.job_title || '—'}</div>
                          <div className="text-[10px] text-slate-400">{emp.department_name || emp.department_id || '—'}</div>
                        </td>
                        <td className="py-3 px-3 text-center"><span className="font-extrabold text-slate-900">{Number(emp.performance_score)}</span><span className="text-slate-400">/100</span></td>
                        <td className="py-3 px-3 text-center"><span className="font-extrabold text-slate-900">{Number(emp.potential_score)}</span><span className="text-slate-400">/100</span></td>
                        {!cellNo && (
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${cm?.badge || ''}`}>{emp.cell}. {cm?.title}</span>
                          </td>
                        )}
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button type="button" onClick={() => handleReview(emp)} className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-sm shadow-blue-500/20" title="Cập nhật điểm và nhận xét đánh giá">
                              <Edit3 className="w-3.5 h-3.5" /> Đánh giá
                            </button>
                            {showPip && (
                              hasActivePip ? (
                                <button
                                  type="button"
                                  onClick={() => handlePip(emp)}
                                  className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-bold cursor-pointer"
                                  title="Xem kế hoạch PIP đang mở"
                                >
                                  Đã có PIP
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handlePip(emp)}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                                  title={isExecRole ? 'Lập kế hoạch cải thiện hiệu suất (có hiệu lực ngay)' : 'Gửi đề xuất PIP tới HR phê duyệt'}
                                >
                                  <Target className="w-3.5 h-3.5" /> {isExecRole ? 'Lập PIP' : 'Đề xuất PIP'}
                                </button>
                              )
                            )}
                            <button type="button" onClick={() => toggleHistory(emp)} className={`p-1.5 rounded-lg border transition cursor-pointer ${expandedId === emp.id ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`} title="Lịch sử đánh giá các kỳ">
                              <History className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" onClick={() => handleProfile(emp)} className="p-1.5 rounded-lg text-blue-600 border border-slate-200 hover:bg-blue-50 transition cursor-pointer" title="Xem Hồ sơ 360">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {(emp.comments || expandedId === emp.id) && (
                        <tr className="bg-slate-50/40">
                          <td colSpan={6} className="px-4 pb-3 pt-0">
                            {emp.comments && (
                              <p className="text-[11px] text-slate-600 italic border-l-2 border-blue-200 pl-2.5 py-0.5">
                                “{emp.comments}” {emp.reviewer_name && <span className="not-italic text-slate-400">— {emp.reviewer_name}, {fmtDate(emp.updated_at)}</span>}
                              </p>
                            )}
                            {expandedId === emp.id && (
                              <div className="mt-2 rounded-xl border border-indigo-100 bg-white p-3">
                                <div className="text-[11px] font-bold text-indigo-800 mb-2 flex items-center gap-1.5">
                                  <History className="w-3.5 h-3.5" /> Lịch sử đánh giá
                                  <button type="button" onClick={() => setExpandedId(null)} className="ml-auto text-slate-400 hover:text-slate-600 cursor-pointer"><ChevronUp className="w-3.5 h-3.5" /></button>
                                </div>
                                {h?.loading ? (
                                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải...</div>
                                ) : h?.error ? (
                                  <div className="text-[11px] text-rose-600">{h.error}</div>
                                ) : (h?.items || []).length === 0 ? (
                                  <div className="text-[11px] text-slate-400">Chưa có lịch sử đánh giá.</div>
                                ) : (
                                  <div className="flex gap-2 overflow-x-auto pb-1">
                                    {h.items.map((r) => {
                                      const rm = CELL_META[r.nine_box_cell] || {};
                                      return (
                                        <div key={r.id} className="min-w-[170px] rounded-xl border border-slate-200 p-2.5 text-[11px]">
                                          <div className="flex items-center justify-between font-bold text-slate-800">
                                            <span>{periodLabel(r.period)}</span>
                                            <span className={`px-1.5 rounded border text-[10px] ${rm.badge || ''}`}>Ô {r.nine_box_cell}</span>
                                          </div>
                                          <div className="mt-1 text-slate-600">HS <strong>{Number(r.performance_score)}</strong> • TN <strong>{Number(r.potential_score)}</strong></div>
                                          <div className="text-slate-400 truncate" title={r.reviewer_name}>{r.reviewer_name || '—'} • {fmtDate(r.updated_at)}</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 gap-3">
          <span className="flex items-center gap-1.5">
            <ChevronDown className="w-3.5 h-3.5 rotate-[-90deg]" />
            {period ? `Dữ liệu đánh giá ${periodLabel(period)}` : 'Chưa có kỳ đánh giá nào'} • Phân loại theo mô hình 9-Box chuẩn
          </span>
          <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition cursor-pointer">
            Đóng
          </button>
        </div>
      </div>
    </AppleModal>
  );
}
