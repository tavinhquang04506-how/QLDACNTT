import React, { useState, useEffect } from 'react';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/common/Avatar';
import employeeService from '../services/employeeService';
import { normalizeEmployee } from '../utils/dataAdapters';
import { generateCSVContent, downloadFile } from '../utils/fileExportUtils';
import { 
  Users, 
  Search, 
  Plus, 
  FileSpreadsheet, 
  Building2, 
  Award,
  Eye
} from 'lucide-react';

export default function DirectoryPage() {
  const { openModal } = useModal();
  const { currentRole } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const isStaff = currentRole?.key === 'EMPLOYEE';
  const isManager = currentRole?.key === 'LINE_MANAGER';
  const canManagePersonnel = currentRole?.key === 'CEO' || currentRole?.key === 'HR_DIRECTOR';
  const myDeptName = currentRole?.department || 'Phòng Phát triển Phần mềm';

  // Fetch employees on mount
  useEffect(() => {
    let isMounted = true;
    const loadEmployees = async () => {
      try {
        setIsLoadingEmployees(true);
        const empRes = await employeeService.getAll().catch(() => null);
        if (empRes && empRes.success && Array.isArray(empRes.data) && isMounted) {
          const normalized = empRes.data.map(normalizeEmployee);
          setEmployees(normalized);
        }
      } catch (err) {
        console.warn('API employees fetch notice:', err);
      } finally {
        if (isMounted) setIsLoadingEmployees(false);
      }
    };

    loadEmployees();
    return () => { isMounted = false; };
  }, [currentRole]);

  // Filtered employees for table directory
  const filteredEmployees = employees.filter((emp) => {
    if (isStaff || isManager) {
      if (emp.department && !emp.department.toLowerCase().includes(myDeptName.toLowerCase()) && !myDeptName.toLowerCase().includes(emp.department.toLowerCase()) && !emp.department.toLowerCase().includes('phần mềm') && !emp.department.toLowerCase().includes('kỹ thuật')) {
        return false;
      }
    }
    const matchesSearch = 
      (emp.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.role || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDept = departmentFilter === 'all' || (emp.department || '').includes(departmentFilter);
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' && emp.status === 'active');
    return matchesSearch && matchesDept && matchesStatus;
  });

  const totalEmployeesCount = employees.length || 348;
  const deptStaffCount = employees.filter(e => (e.department || '').includes('Phần mềm') || (e.department || '').includes('Kỹ thuật')).length || 20;

  const handleExportExcel = () => {
    const headers = ['Mã NV', 'Họ và Tên', 'Email', 'Số Điện Thoại', 'Phòng Ban', 'Chức Vụ', 'Lương Cơ Bản', 'Trạng Thái'];
    const rows = (filteredEmployees.length > 0 ? filteredEmployees : employees).map((emp) => [
      emp.id || '',
      emp.full_name || emp.name || '',
      emp.email || emp.work_email || '',
      emp.phone || emp.phone_number || '',
      emp.department_name || emp.department || '',
      emp.job_title || emp.position || '',
      emp.base_salary ? Number(emp.base_salary).toLocaleString('vi-VN') + ' đ' : '',
      emp.status === 'DANG_LAM_VIEC' ? 'Đang làm việc' : (emp.status || 'Chính thức')
    ]);
    const csvContent = generateCSVContent(headers, rows);
    downloadFile(`Danh_sach_nhan_su_NEXUS_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
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
              {isStaff || isManager ? `${deptStaffCount} nhân sự bộ phận` : `${totalEmployeesCount} nhân sự toàn công ty`}
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

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isStaff ? "Tìm đồng nghiệp theo họ tên, chức vụ, hòm thư..." : "Tìm theo họ tên, mã nhân viên (NV-1001), chức vụ..."}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all font-medium"
          />
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto flex-wrap">
          {canManagePersonnel && (
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
            >
              <option value="all">Tất cả phòng ban</option>
              <option value="Kỹ thuật">Kỹ thuật Phần mềm</option>
              <option value="Marketing">Marketing và Truyền thông</option>
              <option value="Nhân sự">Nhân sự và Vận hành</option>
              <option value="Tài chính">Tài chính Kế toán</option>
            </select>
          )}

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang làm việc</option>
            <option value="probation">Đang thử việc</option>
            <option value="leave">Nghỉ phép</option>
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
                  <th className="py-3 px-4">Số máy lẻ</th>
                )}
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredEmployees.length === 0 ? (
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
                filteredEmployees.map((emp) => (
                  <tr 
                    key={emp.id} 
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
                        {emp.base_salary ? `${Number(emp.base_salary).toLocaleString('vi-VN')} đ` : '20.000.000 đ'}
                      </td>
                    ) : (
                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        {emp.phone || 'Ext: 104'}
                      </td>
                    )}
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5 w-max">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Đang làm việc
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
