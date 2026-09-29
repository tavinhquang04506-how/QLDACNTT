import React, { useState, useEffect } from "react";
import AppleModal from "../../components/motion/AppleModal";
import { Briefcase, Plus, Trash2, Loader2 } from "lucide-react";
import confetti from "canvas-confetti";
import api from "../../services/api";

export default function Modal4F_JobTitleManage({ isOpen, onClose }) {
  const [jobTitles, setJobTitles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchJobTitles = async () => {
    try {
      setIsLoading(true);
      const [posRes, empRes] = await Promise.allSettled([
        api.get('/positions'),
        api.get('/employees'),
      ]);

      const positions = posRes.status === 'fulfilled' && posRes.value?.data ? posRes.value.data : [];
      const employees = empRes.status === 'fulfilled' && empRes.value?.data ? empRes.value.data : [];

      if (Array.isArray(positions)) {
        const mapped = positions.map((p) => {
          const empCount = Array.isArray(employees)
            ? employees.filter(
                (e) => e.position_id === p.id || (e.job_title && e.job_title.toLowerCase() === p.name.toLowerCase())
              ).length
            : 0;

          let levelLabel = "Cấp 3 - Nhân viên";
          if (p.level >= 10 || p.name.toLowerCase().includes('ceo') || p.name.toLowerCase().includes('tổng giám đốc')) {
            levelLabel = "Cấp 1 - Lãnh đạo tối cao";
          } else if (p.level >= 7 || p.name.toLowerCase().includes('chro') || p.name.toLowerCase().includes('giám đốc')) {
            levelLabel = "Cấp 2A - Quản trị C&B";
          } else if (p.level >= 5 || p.name.toLowerCase().includes('trưởng') || p.name.toLowerCase().includes('lead')) {
            levelLabel = "Cấp 2B - Trưởng bộ phận";
          }

          let salaryRange = p.description || "Thỏa thuận theo năng lực";
          if (!p.description || p.description.length < 5) {
            salaryRange = p.level >= 10 ? "80 - 150 triệu" : p.level >= 7 ? "40 - 70 triệu" : p.level >= 5 ? "35 - 55 triệu" : "15 - 35 triệu";
          }

          return {
            id: p.id,
            title: p.name,
            code: p.id?.replace('POS-', '') || p.code || 'JOB',
            level: levelLabel,
            salaryRange,
            count: empCount,
          };
        });
        setJobTitles(mapped);
      }
    } catch (err) {
      console.error('Error fetching job titles:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchJobTitles();
    }
  }, [isOpen]);

  const [formData, setFormData] = useState({
    title: "",
    code: "",
    level: "Cấp 3 - Nhân viên",
    salaryRange: "",
  });

  const [filterLevel, setFilterLevel] = useState("all");

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    const code = formData.code ? formData.code.toUpperCase().replace(/\s+/g, '') : `JOB-${Math.floor(100 + Math.random() * 900)}`;
    const lvlNum = formData.level.includes("Cấp 1") ? 10 : formData.level.includes("Cấp 2A") ? 8 : formData.level.includes("Cấp 2B") ? 6 : 3;

    try {
      await api.post('/positions', {
        code,
        name: formData.title,
        level: lvlNum,
        description: formData.salaryRange || "Thỏa thuận theo năng lực",
      });
      fetchJobTitles();
    } catch (err) {
      console.warn('API add position fallback:', err);
      const newJob = {
        id: `POS-${code}`,
        title: formData.title,
        code,
        level: formData.level,
        salaryRange: formData.salaryRange || "Thỏa thuận theo năng lực",
        count: 0,
      };
      setJobTitles([newJob, ...jobTitles]);
    }

    setFormData({ title: "", code: "", level: "Cấp 3 - Nhân viên", salaryRange: "" });

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
      await api.delete(`/positions/${id}`);
      setJobTitles(jobTitles.filter(j => j.id !== id));
    } catch (err) {
      console.warn('API delete position fallback:', err);
      setJobTitles(jobTitles.filter(j => j.id !== id));
    }
  };

  const filtered = jobTitles.filter(j => {
    if (filterLevel === "all") return true;
    return j.level.startsWith(filterLevel);
  });

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Quản lý Danh mục Chức danh và Khung Cấp bậc"
      subtitle="Chuẩn hóa hệ thống chức danh nghề nghiệp, phân tầng vai trò và khung lương chuẩn"
      maxWidth="max-w-4xl"
    >
      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
        {/* Add Job Title Form */}
        <div className="md:col-span-1 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Plus className="w-4 h-4 text-purple-600" /> Thêm Chức Danh Mới
          </h3>
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Tên Chức Danh *
              </label>
              <input
                type="text"
                required
                placeholder="VD: Senior DevOps Engineer"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Mã Chức Danh
              </label>
              <input
                type="text"
                placeholder="VD: JOB-DEVOPS"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Cấp Bậc và Vai Trò (Phân quyền)
              </label>
              <select
                value={formData.level}
                onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="Cấp 1 - Lãnh đạo tối cao">Cấp 1 - Lãnh đạo tối cao (CEO/BOD)</option>
                <option value="Cấp 2A - Quản trị C&B">Cấp 2A - Quản trị C&B / Trưởng HR</option>
                <option value="Cấp 2B - Trưởng bộ phận">Cấp 2B - Trưởng Bộ Phận / Line Manager</option>
                <option value="Cấp 3 - Nhân viên">Cấp 3 - Nhân viên tiêu chuẩn</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Dải Lương Tham Chiếu
              </label>
              <input
                type="text"
                placeholder="VD: 25 - 40 triệu"
                value={formData.salaryRange}
                onChange={(e) => setFormData({ ...formData, salaryRange: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Thêm chức danh</span>
            </button>
          </form>
        </div>

        {/* Job Titles List */}
        <div className="md:col-span-2 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-800">
              Danh sách chức danh ({filtered.length})
            </span>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Lọc cấp bậc:</span>
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-slate-700 focus:outline-none"
              >
                <option value="all">Tất cả cấp bậc</option>
                <option value="Cấp 1">Cấp 1 (Lãnh đạo)</option>
                <option value="Cấp 2A">Cấp 2A (Quản trị HR)</option>
                <option value="Cấp 2B">Cấp 2B (Trưởng phòng)</option>
                <option value="Cấp 3">Cấp 3 (Nhân viên)</option>
              </select>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center p-8 text-slate-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                <span className="text-xs">Đang đồng bộ danh mục chức danh từ cơ sở dữ liệu...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center p-8 text-slate-400 text-xs">Chưa có chức danh nào trong hệ thống.</div>
            ) : (
              filtered.map((item) => (
                <div key={item.id} className="p-3.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900 truncate">
                      {item.title}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-medium border border-slate-200">
                      {item.code}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium border ${
                      item.level.includes("Cấp 1")
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : item.level.includes("Cấp 2A")
                        ? "bg-blue-50 text-blue-800 border-blue-200"
                        : item.level.includes("Cấp 2B")
                        ? "bg-purple-50 text-purple-800 border-purple-200"
                        : "bg-emerald-50 text-emerald-800 border-emerald-200"
                    }`}>
                      {item.level.split(" - ")[0]}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-slate-500">
                    <span>Khung lương: <strong className="text-slate-800 font-medium">{item.salaryRange}</strong></span>
                    <span>Số lượng: <strong className="text-slate-800 font-medium">{item.count} nhân sự</strong></span>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Xóa chức danh"
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
