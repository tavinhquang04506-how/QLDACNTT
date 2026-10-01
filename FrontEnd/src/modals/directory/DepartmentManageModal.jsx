import React, { useState, useEffect } from "react";
import AppleModal from "../../components/motion/AppleModal";
import { Building2, Plus, Users, Trash2, CheckCircle2, Loader2 } from "lucide-react";
import confetti from "canvas-confetti";
import api from "../../services/api";

export default function Modal4E_DepartmentManage({ isOpen, onClose }) {
  const [departments, setDepartments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchDepartments = async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/departments');
      if (res && res.data && Array.isArray(res.data)) {
        setDepartments(res.data.map(d => ({
          id: d.id,
          name: d.name,
          code: d.id?.replace('DEPT-', '') || d.code || 'DEPT',
          manager: d.manager_name || 'Chưa bổ nhiệm',
          staffCount: parseInt(d.employee_count) || 0,
          division: d.name.toLowerCase().includes('giám đốc') ? 'Điều Hành'
            : (d.name.toLowerCase().includes('phần mềm') || d.name.toLowerCase().includes('kỹ thuật') || d.name.toLowerCase().includes('công nghệ')) ? 'Sản Phẩm'
            : (d.name.toLowerCase().includes('kinh doanh') || d.name.toLowerCase().includes('tiếp thị')) ? 'Tăng Trưởng'
            : 'Vận Hành',
        })));
      }
    } catch (err) {
      console.error('Error fetching departments:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDepartments();
    }
  }, [isOpen]);

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    manager: "",
    division: "Vận Hành",
    quota: "10",
  });

  const [filterDivision, setFilterDivision] = useState("all");

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const code = formData.code ? formData.code.toUpperCase().replace(/\s+/g, '') : `D${Math.floor(100 + Math.random() * 900)}`;
    try {
      await api.post('/departments', {
        code,
        name: formData.name,
        description: `Khối ${formData.division}`,
      });
      fetchDepartments();
    } catch (err) {
      console.warn('API add department fallback:', err);
      const newDept = {
        id: `DEPT-${code}`,
        name: formData.name,
        code,
        manager: formData.manager || "Chưa bổ nhiệm",
        staffCount: parseInt(formData.quota) || 0,
        division: formData.division,
      };
      setDepartments([newDept, ...departments]);
    }

    setFormData({ name: "", code: "", manager: "", division: "Vận Hành", quota: "10" });

    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });
    } catch (e) {}
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/departments/${id}`);
      setDepartments(departments.filter(d => d.id !== id));
    } catch (err) {
      console.warn('API delete department fallback:', err);
      setDepartments(departments.filter(d => d.id !== id));
    }
  };

  const filtered = departments.filter(d => {
    if (filterDivision === "all") return true;
    return d.division === filterDivision;
  });

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Thiết lập và Quản lý Cơ cấu Phòng ban"
      subtitle="Quản lý cấu trúc tổ chức, mã phòng ban, quản lý trực tiếp và định biên nhân sự"
      maxWidth="max-w-4xl"
    >
      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
        {/* Form add department */}
        <div className="md:col-span-1 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-600" /> Thêm Phòng Ban Mới
          </h3>
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Tên Phòng Ban *
              </label>
              <input
                type="text"
                required
                placeholder="VD: Phòng Trí Tuệ Nhân Tạo (AI Lab)"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Mã Phòng Ban (Viết tắt)
              </label>
              <input
                type="text"
                placeholder="VD: AI-LAB"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Khối Trực Thuộc
              </label>
              <select
                value={formData.division}
                onChange={(e) => setFormData({ ...formData, division: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Điều Hành">Khối Điều Hành</option>
                <option value="Sản Phẩm">Khối Sản Phẩm và Công Nghệ</option>
                <option value="Vận Hành">Khối Vận Hành (HR/Finance)</option>
                <option value="Tăng Trưởng">Khối Kinh Doanh và Tiếp Thị</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Trưởng Phòng Phụ Trách
              </label>
              <input
                type="text"
                placeholder="VD: TS. Nguyễn Minh Tuấn"
                value={formData.manager}
                onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Định Biên Nhân Sự Ban Đầu
              </label>
              <input
                type="number"
                min="1"
                value={formData.quota}
                onChange={(e) => setFormData({ ...formData, quota: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Tạo phòng ban</span>
            </button>
          </form>
        </div>

        {/* List of departments */}
        <div className="md:col-span-2 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-800">
              Danh sách phòng ban ({filtered.length})
            </span>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Lọc khối:</span>
              <select
                value={filterDivision}
                onChange={(e) => setFilterDivision(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-slate-700 focus:outline-none"
              >
                <option value="all">Tất cả các khối</option>
                <option value="Điều Hành">Khối Điều Hành</option>
                <option value="Sản Phẩm">Khối Sản Phẩm</option>
                <option value="Vận Hành">Khối Vận Hành</option>
                <option value="Tăng Trưởng">Khối Kinh Doanh</option>
              </select>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center p-8 text-slate-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <span className="text-xs">Đang đồng bộ cơ cấu phòng ban từ cơ sở dữ liệu...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center p-8 text-slate-400 text-xs">Chưa có phòng ban nào trong danh mục.</div>
            ) : (
              filtered.map((dept) => (
                <div key={dept.id} className="p-3.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900 truncate">
                      {dept.name}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono font-medium border border-blue-100">
                      {dept.code}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {dept.division}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-slate-500">
                    <span>Quản lý: <strong className="text-slate-800 font-medium">{dept.manager}</strong></span>
                    <span>Quy mô: <strong className="text-slate-800 font-medium">{dept.staffCount} người</strong></span>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(dept.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Xóa phòng ban"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
        </div>
      </div>
    </AppleModal>
  );
}
