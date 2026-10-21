import React, { useState, useEffect, useCallback } from 'react';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/common/Avatar';
import employeeService from '../services/employeeService';
import { normalizeEmployee } from '../utils/dataAdapters';
import { generateCSVContent, downloadFile } from '../utils/fileExportUtils';
import { 
  Search, 
  Plus, 
  FileSpreadsheet, 
  Building2, 
  Award,
  Eye,
  ChevronLeft,
  ChevronRight,
  AlertCircle
} from 'lucide-react';

const STATUS_META = {
  DANG_LAM_VIEC: {
    label: 'Đang làm việc',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  THU_VIEC: {
    label: 'Đang thử việc',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-500',
  },
  TAM_HOAN: {
    label: 'Tạm hoãn HĐ',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-500',
  },
  DA_NGHI_VIEC: {
    label: 'Đã nghỉ việc',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    dotClass: 'bg-rose-500',
  },
};

export default function DirectoryPage() {
  const { openModal } = useModal();
  const { currentRole } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });

  const isStaff = currentRole?.key === 'EMPLOYEE';
  const isManager = currentRole?.key === 'LINE_MANAGER';
  const canManagePersonnel = currentRole?.key === 'CEO' || currentRole?.key === 'HR_DIRECTOR';

  const loadDepartments = useCallback(async () => {
    try {
      const res = await employeeService.getDepartments();
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setDepartments(list);
    } catch {
      // ignore if departments endpoint fails
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    setIsLoadingEmployees(true);
    setErrorMsg('');
    try {
      const params = {
        page: String(page),
        limit: String(limit),
      };
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (departmentFilter !== 'all') params.department = departmentFilter;
      if (statusFilter !== 'all') params.status = statusFilter;

      const empRes = await employeeService.getAll(params);
      if (!empRes?.success || !Array.isArray(empRes.data)) {
        throw new Error(empRes?.message || 'Không thể tải danh sách nhân sự');
      }
      const normalized = empRes.data.map(normalizeEmployee);
      setEmployees(normalized);
      if (empRes.pagination) {
        setPagination({
          total: Number(empRes.pagination.total ?? normalized.length),
          page: Number(empRes.pagination.page ?? page),
          limit: Number(empRes.pagination.limit ?? limit),
          totalPages: Math.max(1, Number(empRes.pagination.totalPages ?? 1)),
        });
      } else {
        setPagination({
          total: normalized.length,
          page: 1,
          limit,
          totalPages: 1,
        });
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Lỗi khi tải danh bạ nhân sự từ máy chủ.');
      setEmployees([]);
    } finally {
      setIsLoadingEmployees(false);
    }
  }, [page, limit, searchTerm, departmentFilter, statusFilter]);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees, currentRole?.key]);

  useEffect(() => {
    const onRefresh = () => {
      loadDepartments();
      loadEmployees();
    };
    window.addEventListener('nexus:employees-updated', onRefresh);
    window.addEventListener('nexus:departments-updated', onRefresh);
    window.addEventListener('nexus:positions-updated', onRefresh);
    return () => {
      window.removeEventListener('nexus:employees-updated', onRefresh);
      window.removeEventListener('nexus:departments-updated', onRefresh);
      window.removeEventListener('nexus:positions-updated', onRefresh);
    };
  }, [loadDepartments, loadEmployees]);

  const totalEmployeesCount = pagination.total ?? employees.length;

  const handleExportExcel = async () => {
    try {
      const exportParams = { page: '1', limit: '200' };
      if (searchTerm.trim()) exportParams.search = searchTerm.trim();
      if (departmentFilter !== 'all') exportParams.department = departmentFilter;
      if (statusFilter !== 'all') exportParams.status = statusFilter;

      const res = await employeeService.getAll(exportParams).catch(() => null);
      const exportRowsSource =
        res?.success && Array.isArray(res.data) ? res.data.map(normalizeEmployee) : employees;

      const headers = ['Mã NV', 'Họ và Tên', 'Email', 'Số Điện Thoại', 'Phòng Ban', 'Chức Vụ', 'Lương Cơ Bản', 'Trạng Thái'];
      const rows = exportRowsSource.map((emp) => {
        const statusInfo = STATUS_META[emp.status] || STATUS_META.DANG_LAM_VIEC;
        return [
          emp.id || '',
          emp.full_name || emp.name || '',
          emp.email || emp.work_email || '',
          emp.phone || emp.phone_number || '',
          emp.department_name || emp.department || '',
          emp.job_title || emp.role || '',
          emp.baseSalary !== null && emp.baseSalary !== undefined
            ? `${Number(emp.baseSalary).toLocaleString('vi-VN')} đ`
            : 'Bảo mật / Chưa cập nhật',
          statusInfo.label,
        ];
      });
      const csvContent = generateCSVContent(headers, rows);
      downloadFile(`Danh_sach_nhan_su_NEXUS_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
    } catch (err) {
      setErrorMsg(err?.message || 'Không thể xuất file danh sách nhân sự.');
    }
  };

  return (
    <div className="w-full min-h-full p-6 flex flex-col space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 font-display tracking-tight">
              {canManagePersonnel
                ? 'Hồ Sơ & Danh Bạ Nhân Sự Doanh Nghiệp'
                : isManager
                ? 'Danh Bạ Nhân Sự Bộ Phận'
                : 'Hồ Sơ & Danh Bạ Nhân Sự'}
            </h1>
            <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full border border-blue-200">
              {isManager ? `${totalEmployeesCount} nhân sự bộ phận` : `${totalEmployeesCount} nhân sự`}
            </span>
          </div>
          {canManagePersonnel && (
            <p className="text-xs text-slate-500 mt-1">
              Cơ sở dữ liệu quản trị tập trung {totalEmployeesCount} hồ sơ nhân sự, phân cấp phòng ban và chức danh toàn doanh nghiệp.
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {!isStaff && (
            <button
              type="button"
              onClick={handleExportExcel}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-2 transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Xuất file Excel</span>
            </button>
          )}

          {canManagePersonnel && (
            <>
              <button
                type="button"
                onClick={() => openModal('departmentManage')}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-2 transition-all cursor-pointer"
              >
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>Quản lý phòng ban</span>
              </button>
              <button
                type="button"
                onClick={() => openModal('jobTitleManage')}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-2xs flex items-center gap-2 transition-all cursor-pointer"
              >
                <Award className="w-4 h-4 text-indigo-600" />
                <span>Quản lý chức danh</span>
              </button>
              <button
                type="button"
                onClick={() => openModal('modal4A')}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tiếp nhận nhân sự mới</span>
              </button>
            </>
          )}
        </div>
      </div>

      {errorMsg && (
        <div
          data-testid="directory-error-banner"
          className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder={isStaff ? 'Tìm đồng nghiệp theo họ tên, mã NV, hòm thư...' : 'Tìm theo họ tên, mã nhân viên (NV-1001), email, SĐT...'}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all font-medium"
          />
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto flex-wrap">
          {!isManager && (
            <select
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
                setPage(1);
              }}
              className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
            >
              <option value="all">Tất cả phòng ban</option>
              {departments.length > 0 ? (
                departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="DEPT-IT">Phòng Kỹ thuật Phần mềm</option>
                  <option value="DEPT-MKT">Phòng Kinh doanh & Tiếp thị</option>
                  <option value="DEPT-HR">Phòng Quản trị Nhân sự</option>
                  <option value="DEPT-FIN">Phòng Tài chính & Kế toán</option>
                  <option value="DEPT-EXEC">Ban Điều Hành & Lãnh Đạo</option>
                </>
              )}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="DANG_LAM_VIEC">Đang làm việc</option>
            <option value="THU_VIEC">Đang thử việc</option>
            <option value="TAM_HOAN">Tạm hoãn HĐ</option>
            <option value="DA_NGHI_VIEC">Đã nghỉ việc</option>
          </select>
        </div>
      </div>

      {/* Directory Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Nhân viên</th>
                <th className="py-3 px-4">Mã NV</th>
                <th className="py-3 px-4">Phòng ban</th>
                <th className="py-3 px-4">Chức danh</th>
                {canManagePersonnel ? (
                  <th className="py-3 px-4">Lương cơ bản</th>
                ) : (
                  <th className="py-3 px-4">Số điện thoại</th>
                )}
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    {isLoadingEmployees ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span>Đang tải danh sách nhân sự...</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-600">Không tìm thấy nhân sự phù hợp</p>
                        <p className="text-xs text-slate-400">Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc</p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                employees.map((emp) => {
                  const statusInfo = STATUS_META[emp.status] || STATUS_META.DANG_LAM_VIEC;
                  return (
                    <tr 
                      key={emp.id} 
                      data-testid="directory-row"
                      data-emp-id={emp.id}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      onClick={() => openModal('modal4B', emp)}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar src={emp.avatar} name={emp.name} id={emp.id} size="md" />
                          <div>
                            <div className="font-bold text-slate-900">{emp.name}</div>
                            <div className="text-[11px] text-slate-400">{emp.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-600">
                        {emp.id}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">
                        {emp.department}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {emp.role}
                        </span>
                      </td>
                      {canManagePersonnel ? (
                        <td className="py-3.5 px-4 font-mono font-semibold text-slate-900">
                          {emp.baseSalary !== null && emp.baseSalary !== undefined
                            ? `${Number(emp.baseSalary).toLocaleString('vi-VN')} đ`
                            : 'Chưa cập nhật'}
                        </td>
                      ) : (
                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          {emp.phone || 'Chưa cập nhật'}
                        </td>
                      )}
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1.5 w-max ${statusInfo.badgeClass}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`} />
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openModal('modal4B', emp);
                          }}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Hồ sơ</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 bg-slate-50/70 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div data-testid="directory-pagination-info">
            Hiển thị <strong>{employees.length}</strong> trên tổng số <strong>{totalEmployeesCount}</strong> nhân sự
            {pagination.totalPages > 1 ? ` (Trang ${pagination.page} / ${pagination.totalPages})` : ''}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="directory-prev-page"
              disabled={page <= 1 || isLoadingEmployees}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Trước</span>
            </button>
            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold border border-blue-200">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              type="button"
              data-testid="directory-next-page"
              disabled={page >= pagination.totalPages || isLoadingEmployees}
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>Sau</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
