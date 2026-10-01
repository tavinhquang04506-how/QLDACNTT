import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import projectService from '../services/projectService';
import employeeService from '../services/employeeService';
import { 
  FolderKanban, 
  CheckSquare, 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  Clock3, 
  User, 
  Users, 
  ChevronRight, 
  TrendingUp, 
  FileText, 
  Layers, 
  Send, 
  Edit3, 
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Check,
  X,
  Sliders,
  BarChart2,
  Kanban,
  MessageSquare,
  Lock,
  Eye,
  ShieldAlert
} from 'lucide-react';
import confetti from 'canvas-confetti';
import SquadChatDrawer from '../components/chat/SquadChatDrawer';

export default function ProjectsTasksPage() {
  const { currentRole, user } = useAuth();
  const { openModal } = useModal();
  const navigate = useNavigate();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const roleKey = currentRole?.key || 'EMPLOYEE';
  const isCeo = roleKey === 'CEO';
  const isHrd = roleKey === 'HR_DIRECTOR';
  const isLineManager = roleKey === 'LINE_MANAGER';
  const isManager = isLineManager || isCeo || isHrd;
  const isEmployee = roleKey === 'EMPLOYEE';

  // Current logged in user ID and matching helper
  const myEmployeeId = user?.employeeId || user?.employee_id || currentRole?.id;
  const myName = (user?.name || user?.full_name || currentRole?.name || '').trim().toLowerCase();

  const isTaskAssignedToMe = (task) => {
    if (!task) return false;
    const taskAssigneeId = task.assigneeId || task.assignee_id;
    if (myEmployeeId && taskAssigneeId && String(taskAssigneeId).toLowerCase() === String(myEmployeeId).toLowerCase()) {
      return true;
    }
    const taskAssigneeName = (task.assigneeName || task.assignee_name || '').trim().toLowerCase();
    if (myName && taskAssigneeName && taskAssigneeName === myName) {
      return true;
    }
    return false;
  };

  // Role Header Contents
  const roleTitle = isCeo 
    ? 'Bàn Điều Hành Chiến Lược Dự Án Toàn Doanh Nghiệp'
    : isHrd
    ? 'Giám Sát Phân Bổ Nguồn Lực và Hiệu Suất Dự Án'
    : isLineManager
    ? 'Bàn Quản Trị Dự Án và Phân Công Nhiệm Vụ Bộ Phận'
    : 'Không Gian Làm Việc và Nhiệm Vụ Của Tôi';

  const roleBadge = isCeo
    ? 'Chiến Lược Điều Hành Toàn Doanh Nghiệp'
    : isHrd
    ? 'Phân Bổ Nguồn Lực và Hiệu Suất Lao Động'
    : null;

  const roleDesc = isCeo
    ? 'Giám sát tiến độ vĩ mô, kiểm soát ngân sách giờ công và rủi ro trễ hạn của các dự án chiến lược thuộc mọi phòng ban trong công ty.'
    : isHrd
    ? 'Tối ưu hóa năng lực nhân sự, phát hiện nguy cơ quá tải (Burnout Alert) và liên kết kết quả hoàn thành task với Đánh giá KPI 9-Box.'
    : null;

  // State
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState(isEmployee ? (currentRole?.id || 'ALL') : 'ALL');
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'table'

  // Map raw task from API to standard task model
  const mapTask = (t, prjName) => ({
    id: t.id || `TSK-${Math.floor(Math.random() * 1000)}`,
    projectId: t.project_id,
    projectName: prjName || 'Dự án',
    title: t.title || 'Nhiệm vụ',
    description: t.description || 'Hoàn thành theo tiêu chuẩn kỹ thuật sprint.',
    assigneeId: t.assignee_id || '',
    assigneeName: t.assignee_name || (t.assignee_id ? `Nhân viên (${t.assignee_id})` : 'Chưa phân công'),
    assigneeRole: t.assignee_role || 'Nhân sự',
    assigneeAvatar: t.assignee_avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
    creator: t.creator_name ? `${t.creator_name} (Quản lý)` : (currentRole?.name ? `${currentRole.name} (Quản lý)` : 'Quản lý dự án'),
    deadline: t.deadline ? new Date(t.deadline).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN'),
    priority: t.priority || 'Trung bình',
    stage: t.stage || 'todo',
    progress: t.progress || 0,
    kpiWeight: t.kpi_weight || 20,
    submissionNote: t.deliverable_note || '',
    logs: [
      {
        time: new Date(t.created_at || Date.now()).toLocaleDateString('vi-VN') + ' 09:00',
        author: t.creator_name || currentRole?.name || 'Quản lý',
        note: 'Nhiệm vụ được đồng bộ trực tiếp từ CSDL PostgreSQL.',
      },
    ],
  });

  // Fetch real projects and employees from PostgreSQL via API
  useEffect(() => {
    let isMounted = true;
    async function fetchProjectsAndEmployees() {
      try {
        const [projRes, empRes] = await Promise.all([
          projectService.getAll().catch(() => null),
          employeeService.getAll().catch(() => null),
        ]);

        if (empRes?.success && Array.isArray(empRes.data) && isMounted) {
          const mappedMembers = empRes.data.map(e => ({
            id: e.id,
            name: e.full_name || e.name || 'Nhân viên',
            role: e.job_title || e.role || 'Kỹ sư Phần mềm',
            avatar: e.avatar_url || e.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
            activeTasks: 0,
            workload: 0,
            kpiCapacity: 100,
          }));
          setMembers(mappedMembers);
        }

        if (projRes?.success && Array.isArray(projRes.data) && isMounted) {
          const apiProjects = projRes.data.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            department: p.department_name || 'Phòng Phát triển Phần mềm',
            manager: p.manager_name || currentRole?.name || 'Quản lý dự án',
            managerAvatar: p.manager_avatar,
            startDate: p.start_date ? new Date(p.start_date).toLocaleDateString('vi-VN') : '-',
            endDate: p.end_date ? new Date(p.end_date).toLocaleDateString('vi-VN') : '-',
            progress: p.progress || 0,
            status: p.status || 'in_progress',
            priority: p.priority || 'Cao',
            budgetHours: p.budget_hours || 0,
            usedHours: p.used_hours || 0,
            description: p.description || '',
          }));
          setProjects(apiProjects);
        }
      } catch (err) {
        console.warn('Backend projects API notice:', err);
      }
    }
    fetchProjectsAndEmployees();
    return () => { isMounted = false; };
  }, [currentRole.key]);

  // Reactive task loading when projects or selectedProjectId change
  useEffect(() => {
    let isMounted = true;
    if (projects.length === 0) return;

    async function fetchTasks() {
      try {
        if (selectedProjectId === 'ALL') {
          const results = await Promise.all(
            projects.map(p => projectService.getTasks(p.id).catch(() => null))
          );
          if (!isMounted) return;
          const allTasks = [];
          results.forEach((res, idx) => {
            if (res?.success && Array.isArray(res.data)) {
              res.data.forEach(t => allTasks.push(mapTask(t, projects[idx]?.name)));
            }
          });
          setTasks(allTasks);
        } else {
          const res = await projectService.getTasks(selectedProjectId).catch(() => null);
          if (res?.success && Array.isArray(res.data) && isMounted) {
            const currentPrj = projects.find(p => p.id === selectedProjectId);
            setTasks(res.data.map(t => mapTask(t, currentPrj?.name)));
          }
        }
      } catch (err) {
        console.warn('Error fetching tasks:', err);
      }
    }

    fetchTasks();
    return () => { isMounted = false; };
  }, [selectedProjectId, projects.length]);

  // Modal States
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isAssignTaskOpen, setIsAssignTaskOpen] = useState(false);
  const [selectedTaskForUpdate, setSelectedTaskForUpdate] = useState(null);
  const [selectedTaskForReview, setSelectedTaskForReview] = useState(null);

  // Form States for New Project
  const [newProject, setNewProject] = useState({
    name: '',
    code: `PRJ-2026-0${projects.length + 1}`,
    department: 'Phòng Phát triển Phần mềm',
    manager: currentRole.name || 'Quản lý dự án',
    startDate: '15/09/2026',
    endDate: '30/11/2026',
    priority: 'Cao',
    description: '',
    budgetHours: 240,
    autoCreateChat: true,
  });

  // Form States for New Task
  const [newTask, setNewTask] = useState({
    projectId: projects[0]?.id || '',
    title: '',
    description: '',
    assigneeId: currentRole?.id || '',
    deadline: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    priority: 'Cao',
    kpiWeight: 20,
  });

  // Form States for Updating Task (Employee)
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateStage, setUpdateStage] = useState('in_progress');
  const [updateNote, setUpdateNote] = useState('');

  // Manager Review Note
  const [managerReviewNote, setManagerReviewNote] = useState('');

  // Filter Tasks
  const filteredTasks = tasks.filter((t) => {
    if (selectedProjectId !== 'ALL' && t.projectId !== selectedProjectId) return false;
    if (selectedAssigneeId !== 'ALL' && t.assigneeId !== selectedAssigneeId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (t.title || '').toLowerCase().includes(q);
      const matchAssignee = (t.assigneeName || '').toLowerCase().includes(q);
      const matchProject = (t.projectName || '').toLowerCase().includes(q);
      const matchId = (t.id || '').toLowerCase().includes(q);
      if (!matchTitle && !matchAssignee && !matchProject && !matchId) return false;
    }
    return true;
  });

  // Task Counts
  const todoTasks = filteredTasks.filter((t) => t.stage === 'todo');
  const inProgressTasks = filteredTasks.filter((t) => t.stage === 'in_progress');
  const reviewTasks = filteredTasks.filter((t) => t.stage === 'review');
  const doneTasks = filteredTasks.filter((t) => t.stage === 'done');

  // Overall stats
  const totalTasksCount = filteredTasks.length;
  const completedTasksCount = doneTasks.length;
  const overallRate = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;

  // Dynamic Project & HR Metrics
  const completedProjects = projects.filter((p) => p.status === 'completed');
  const runningProjects = projects.filter((p) => p.status !== 'completed');
  const totalBudgetHours = projects.reduce((acc, p) => acc + (Number(p.budgetHours) || 0), 0) || 1200;
  const totalUsedHours = projects.reduce((acc, p) => acc + (Number(p.usedHours) || 0), 0);
  const budgetPercentage = totalBudgetHours > 0 ? ((totalUsedHours / totalBudgetHours) * 100).toFixed(1) : '0.0';
  const avgPlanProgress = projects.length > 0 
    ? (projects.reduce((acc, p) => acc + (Number(p.progress) || 0), 0) / projects.length).toFixed(1) 
    : '0.0';
  const atRiskProjects = projects.filter((p) => p.status === 'at_risk' || (p.priority === 'Cao' && Number(p.progress) < 50));

  // Dynamic HRD Workload & Burnout
  const assignedEmpIds = new Set(tasks.map((t) => t.assigneeId));
  const totalTeamCount = members.length > 0 ? members.length : 20;
  const allocationRate = totalTeamCount > 0 ? ((assignedEmpIds.size / totalTeamCount) * 100).toFixed(1) : '90.0';
  const memberTaskCounts = {};
  tasks.filter((t) => t.stage !== 'done').forEach((t) => { 
    if (t.assigneeName) {
      memberTaskCounts[t.assigneeName] = (memberTaskCounts[t.assigneeName] || 0) + 1;
    }
  });
  const overloadedMembers = Object.entries(memberTaskCounts).filter(([_, count]) => count >= 3);

  // Handlers
  const handleCreateProject = (e) => {
    e.preventDefault();
    if (!newProject.name.trim()) return;

    const created = {
      ...newProject,
      id: `PRJ-${Date.now().toString().slice(-4)}`,
      progress: 0,
      status: 'in_progress',
      usedHours: 0,
    };

    setProjects([created, ...projects]);
    setIsCreateProjectOpen(false);
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });

    // Gọi API Backend lưu project vào PostgreSQL
    projectService.createProject({
      name: newProject.name,
      code: newProject.code,
      department_id: 'DEPT-IT',
      priority: newProject.priority,
      description: newProject.description,
      budget_hours: newProject.budgetHours,
    }).catch((err) => console.warn('Backend create project notice:', err));

    if (newProject.autoCreateChat) {
      window.dispatchEvent(new CustomEvent('nexus:squad-created', {
        detail: {
          id: `SQD-${Date.now().toString().slice(-4)}`,
          name: `Squad ${newProject.name}`,
          code: newProject.code,
          projectName: newProject.name,
          projectCode: newProject.code,
          leadName: currentRole?.name || 'Trưởng nhóm',
          leadRole: currentRole?.title || 'Techlead',
          target: newProject.description || 'Trao đổi và điều phối công việc dự án.',
          activeTasksCount: 0,
          members: [
            { id: currentRole?.id || 'NV-0001', name: currentRole?.name || 'Quản lý', role: currentRole?.title || 'Quản lý', avatar: currentRole?.avatar }
          ],
          chatMessages: [
            {
              id: `m-init-${Date.now()}`,
              sender: currentRole?.name || 'Quản lý',
              roleBadge: currentRole?.title || 'Trưởng phòng',
              avatar: currentRole?.avatar,
              text: `Kênh chat dự án [${newProject.code}] ${newProject.name} đã được khởi tạo tự động! Các thành viên bắt đầu trao đổi tại đây.`,
              time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
              isManager: true,
            }
          ]
        }
      }));
    }

    setNewProject({
      name: '',
      code: `PRJ-2026-0${projects.length + 2}`,
      department: 'Phòng Phát triển Phần mềm',
      manager: currentRole.name || 'Quản lý dự án',
      startDate: '15/09/2026',
      endDate: '30/11/2026',
      priority: 'Cao',
      description: '',
      budgetHours: 240,
      autoCreateChat: true,
    });
  };

  const handleAssignTask = (e) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;

    const member = members.find((m) => m.id === newTask.assigneeId) || members[0];
    const project = projects.find((p) => p.id === newTask.projectId) || projects[0];

    const createdTask = {
      id: `TSK-${tasks.length + 101}`,
      projectId: project.id,
      projectName: project.name,
      title: newTask.title,
      description: newTask.description || 'Hoàn thành theo tiêu chuẩn kỹ thuật sprint.',
      assigneeId: member.id,
      assigneeName: member.name,
      assigneeRole: member.role,
      assigneeAvatar: member.avatar,
      creator: `${currentRole.name || 'Quản trị viên'} (Trưởng phòng)`,
      deadline: newTask.deadline,
      priority: newTask.priority,
      stage: 'todo',
      progress: 0,
      kpiWeight: Number(newTask.kpiWeight) || 20,
      submissionNote: '',
      logs: [
        {
          time: new Date().toLocaleDateString('vi-VN') + ' 09:00',
          author: currentRole.name || 'Quản lý dự án',
          note: `Trưởng phòng giao task mới với trọng số KPI ${newTask.kpiWeight}%.`,
        },
      ],
    };

    setTasks([createdTask, ...tasks]);
    setIsAssignTaskOpen(false);
    confetti({ particleCount: 60, spread: 70, origin: { y: 0.5 } });

    // Gọi API Backend lưu task vào PostgreSQL
    projectService.createTask(project.id, {
      title: newTask.title,
      description: newTask.description,
      assignee_id: member.id,
      deadline: newTask.deadline,
      priority: newTask.priority,
      kpi_weight: Number(newTask.kpiWeight) || 20,
      stage: 'todo',
    }).catch((err) => console.warn('Backend create task notice:', err));

    setNewTask({
      projectId: projects[0]?.id || '',
      title: '',
      description: '',
      assigneeId: currentRole?.id || '',
      deadline: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      priority: 'Cao',
      kpiWeight: 20,
    });
  };

  const handleOpenUpdateTask = (task) => {
    setSelectedTaskForUpdate(task);
    setUpdateProgress(task.progress);
    setUpdateStage(task.stage);
    setUpdateNote(task.submissionNote || '');
  };

  const handleSaveUpdateTask = async (e) => {
    e.preventDefault();
    if (!selectedTaskForUpdate) return;

    if (!isTaskAssignedToMe(selectedTaskForUpdate)) {
      alert('Chỉ người được giao việc mới có quyền cập nhật tiến độ cho nhiệm vụ này.');
      return;
    }

    try {
      await projectService.updateTask(selectedTaskForUpdate.id, {
        progress: Number(updateProgress),
        deliverableNote: updateNote,
      }).catch((err) => console.warn('Backend update task progress notice:', err));

      if (selectedTaskForUpdate.stage !== updateStage) {
        await projectService.updateTaskStage(selectedTaskForUpdate.id, updateStage, updateNote).catch((err) => {
          console.warn('Backend update task stage notice:', err);
        });
      }
    } catch (err) {
      console.warn('Backend update task notice:', err);
    }

    const updated = tasks.map((t) => {
      if (t.id === selectedTaskForUpdate.id) {
        const newLogs = [...t.logs];
        if (updateNote.trim()) {
          newLogs.push({
            time: new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            author: currentRole.name || 'Nhân sự thực hiện',
            note: updateNote,
          });
        }
        return {
          ...t,
          progress: Number(updateProgress),
          stage: updateStage,
          submissionNote: updateNote || t.submissionNote,
          logs: newLogs,
        };
      }
      return t;
    });

    setTasks(updated);
    setSelectedTaskForUpdate(null);
    if (updateStage === 'review' || updateProgress === 100) {
      confetti({ particleCount: 40, spread: 50 });
    }
  };

  const handleOpenReviewTask = (task) => {
    setSelectedTaskForReview(task);
    setManagerReviewNote('');
  };

  const handleManagerApprove = async (isApproved) => {
    if (!selectedTaskForReview) return;

    const decision = isApproved ? 'accept' : 'reject';
    try {
      await projectService.reviewTask(selectedTaskForReview.id, decision, managerReviewNote);
    } catch (err) {
      console.warn('Backend task review notice, falling back to stage update:', err);
      const targetStage = isApproved ? 'done' : 'in_progress';
      projectService.updateTaskStage(selectedTaskForReview.id, targetStage, managerReviewNote).catch(() => null);
    }

    const updated = tasks.map((t) => {
      if (t.id === selectedTaskForReview.id) {
        const newLogs = [...t.logs];
        newLogs.push({
          time: new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          author: `${currentRole.name || 'Quản trị viên'} (Trưởng phòng)`,
          note: isApproved
            ? `Nghiệm thu ĐẠT yêu cầu: ${managerReviewNote || 'Chất lượng xuất sắc, hoàn thành đúng tiến độ sprint.'}`
            : `Yêu cầu bổ sung và chỉnh sửa: ${managerReviewNote || 'Cần bổ sung tài liệu và kiểm thử lại.'}`,
        });

        return {
          ...t,
          stage: isApproved ? 'done' : 'in_progress',
          progress: isApproved ? 100 : Math.min(t.progress, 85),
          logs: newLogs,
        };
      }
      return t;
    });

    setTasks(updated);
    setSelectedTaskForReview(null);
    if (isApproved) {
      confetti({ particleCount: 70, spread: 80, origin: { y: 0.6 } });
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-slate-50/90 rounded-3xl p-6 sm:p-8 shadow-xs border border-slate-200/90 relative overflow-hidden">
        {/* Glow decoration */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className={roleBadge || roleDesc ? 'space-y-2 max-w-2xl' : 'min-w-0'}>
            {roleBadge && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/70 border border-blue-200 text-blue-800 text-xs font-bold backdrop-blur-md">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>{roleBadge}</span>
              </div>
            )}

            <h1 className={`font-extrabold tracking-tight font-display text-slate-900 ${
              roleBadge || roleDesc ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl leading-tight xl:whitespace-nowrap'
            }`}>
              {roleTitle}
            </h1>

            {roleDesc && (
              <p className="text-sm text-slate-600 leading-relaxed font-normal">
                {roleDesc}
              </p>
            )}
          </div>

          {/* Action buttons based on Role */}
          <div className="flex flex-wrap items-center gap-3">
            {isCeo && (
              <>
                <button
                  onClick={() => openModal('modal2B', { title: 'Báo Cáo Tiến Độ Dự Án & Chiến Lược HĐQT', projects })}
                  className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200/90 transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
                  title="Xuất báo cáo tiến độ dự án định dạng PDF A4"
                >
                  <FileText className="w-4 h-4 text-purple-600" />
                  <span>Báo Cáo HĐQT (PDF)</span>
                </button>
                <button
                  onClick={() => setIsCreateProjectOpen(true)}
                  className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Phê Duyệt Khởi Động Dự Án</span>
                </button>
              </>
            )}

            {isHrd && (
              <>
                <button
                  onClick={() => openModal('modal8D', { title: 'Đồng Bộ KPI Tiến Độ Nhiệm Vụ Vào Ma Trận 9-Box' })}
                  className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200/90 transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
                  title="Đồng bộ kết quả nhiệm vụ vào ma trận 9-Box"
                >
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span>Đồng Bộ KPI 9-Box</span>
                </button>
                <button
                  onClick={() => openModal('modal4E')}
                  className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 cursor-pointer"
                  title="Quản lý và điều phối cơ cấu phòng ban"
                >
                  <Users className="w-4 h-4" />
                  <span>Điều Phối Nhân Lực</span>
                </button>
              </>
            )}

            {isLineManager && (
              <>
                <button
                  onClick={() => setIsCreateProjectOpen(true)}
                  className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200/90 transition-all flex items-center gap-2 shadow-2xs hover:scale-[1.02] active:scale-95 cursor-pointer"
                >
                  <FolderKanban className="w-4 h-4 text-blue-600" />
                  <span>Tạo Dự Án Mới</span>
                </button>

                <button
                  onClick={() => setIsAssignTaskOpen(true)}
                  className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Giao Task Cho Nhân Viên</span>
                </button>
              </>
            )}

            {isEmployee && (
              <button
                onClick={() => setSelectedAssigneeId(selectedAssigneeId === currentRole.id ? 'ALL' : currentRole.id)}
                className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                  selectedAssigneeId === currentRole.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 ring-2 ring-blue-300'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 shadow-2xs'
                }`}
              >
                <User className="w-4 h-4" />
                <span>{selectedAssigneeId === currentRole.id ? 'Đang lọc: Task của tôi' : 'Xem toàn bộ nhóm'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Key Metrics Overview (Phân Biệt Cụ Thể Theo Từng Vai Trò) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isCeo ? (
          /* CEO Metrics: Ngân Sách Giờ Công, Kế Hoạch Năm, Rủi Ro Chậm Tiến Độ */
          <>
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dự Án Chiến Lược</span>
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <FolderKanban className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-slate-900">{projects.length}</span>
                <span className="text-xs font-semibold text-slate-400">dự án toàn công ty</span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{completedProjects.length} dự án hoàn thành, {runningProjects.length} đang triển khai</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng Ngân Sách Giờ Công</span>
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-blue-600">{totalUsedHours} h</span>
                <span className="text-xs font-semibold text-slate-400">/ {totalBudgetHours} h ({budgetPercentage}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${Math.min(100, Number(budgetPercentage))}%` }} />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tiến Độ Kế Hoạch Năm</span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-emerald-600">{avgPlanProgress}%</span>
                <span className="text-xs font-semibold text-slate-400">Tiến độ trung bình</span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                <span>Đồng bộ thời gian thực từ CSDL</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dự Án Cần Lưu Ý (At-Risk)</span>
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-amber-600">{atRiskProjects.length}</span>
                <span className="text-xs font-semibold text-slate-400">dự án cần đẩy nhanh</span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 font-semibold">
                <span>{atRiskProjects[0]?.name ? `${atRiskProjects[0].name} cần hỗ trợ` : 'Tất cả dự án duy trì tiến độ tốt'}</span>
              </div>
            </div>
          </>
        ) : isHrd ? (
          /* HRD Metrics: Phân Bổ Nguồn Lực, Nguy Cơ Burnout, Điểm KPI Liên Kết */
          <>
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tỷ Lệ Phân Bổ Nhân Lực</span>
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-blue-600">{allocationRate}%</span>
                <span className="text-xs font-semibold text-slate-400">{assignedEmpIds.size}/{totalTeamCount} nhân sự tham gia</span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                <span>Tối ưu hóa nguồn lực bộ phận</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cảnh Báo Quá Tải (Burnout)</span>
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-rose-600">{overloadedMembers.length}</span>
                <span className="text-xs font-semibold text-slate-400">nhân sự tải &gt;= 3 task</span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-rose-700 font-semibold">
                <span>{overloadedMembers.length > 0 ? `${overloadedMembers[0][0]} đang gánh ${overloadedMembers[0][1]} task` : 'Cân bằng tải nhân sự ổn định'}</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Điểm KPI Dự Án TB</span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-emerald-600">88.5 / 100</span>
                <span className="text-xs font-semibold text-slate-400">Hạng A</span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                <span>Liên kết trực tiếp 9-Box Matrix</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Task Chờ Nghiệm Thu</span>
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Clock3 className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-amber-600">{reviewTasks.length}</span>
                <span className="text-xs font-semibold text-slate-400">task cần duyệt điểm</span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 font-semibold">
                <span>Sắp chốt kết quả thưởng Sprint</span>
              </div>
            </div>
          </>
        ) : (
          /* Line Manager & Employee Metrics */
          <>
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {isEmployee ? 'Dự Án Tôi Tham Gia' : 'Dự Án Đang Chạy'}
                </span>
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <FolderKanban className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-slate-900">{projects.filter(p => p.status === 'in_progress').length}</span>
                <span className="text-xs font-semibold text-slate-400">/ {projects.length} tổng dự án</span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{completedProjects.length} dự án hoàn thành, {runningProjects.length} đang thực hiện</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {isEmployee ? 'Nhiệm Vụ Của Tôi' : 'Tổng Số Nhiệm Vụ'}
                </span>
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-slate-900">{totalTasksCount}</span>
                <span className="text-xs font-semibold text-slate-400">công việc phân công</span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                <span>{inProgressTasks.length} đang thực hiện</span>
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 ml-2" />
                <span>{reviewTasks.length} chờ duyệt</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tiến Độ Sprint 38</span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-emerald-600">{overallRate}%</span>
                <span className="text-xs font-semibold text-slate-400">({completedTasksCount}/{totalTasksCount} task)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${overallRate}%` }}
                />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Chờ Nghiệm Thu</span>
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Clock3 className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-amber-600">{reviewTasks.length}</span>
                <span className="text-xs font-semibold text-slate-400">task cần duyệt</span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 font-semibold">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{isManager ? 'Cần Trưởng phòng duyệt sớm' : 'Đang chờ Trưởng phòng review'}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 3. Team Workload Capacity (Phân Bổ Tải Công Việc Thành Viên) - Dành cho Trưởng Phòng và HRD */}
      {(isLineManager || isHrd) && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-blue-600" />
                <span>Phân Bổ Tải Công Việc và Định Mức Thành Viên Bộ Phận</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Giúp Trưởng phòng và HRD cân bằng khối lượng task, phòng tránh quá tải hoặc thiếu việc</p>
            </div>
            <div className="text-xs font-semibold text-slate-500 flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Dưới 70% (Tối ưu)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> 70% - 90% (Cao)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> &gt; 90% (Quá tải)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {members.map((member) => {
              const memberTasks = tasks.filter((t) => t.assigneeId === member.id && t.stage !== 'done');
              const workload = typeof member.workload === 'number' && member.workload > 0
                ? member.workload
                : Math.min(100, memberTasks.length * 25);
              const isSelected = selectedAssigneeId === member.id;
              const loadColor =
                workload > 90
                  ? 'bg-red-500 text-red-700'
                  : workload >= 70
                  ? 'bg-amber-500 text-amber-700'
                  : 'bg-emerald-500 text-emerald-700';

              return (
                <div
                  key={member.id}
                  onClick={() => setSelectedAssigneeId(isSelected ? 'ALL' : member.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/50 shadow-sm ring-2 ring-blue-100'
                      : 'border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={member.avatar}
                      alt={member.name}
                      className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 truncate">{member.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{member.role}</div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
                      <span className="text-slate-600">{memberTasks.length} task đang làm</span>
                      <span className={loadColor.split(' ')[1]}>{workload}% tải</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${loadColor.split(' ')[0]}`}
                        style={{ width: `${workload}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Filter & Controls Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs space-y-3">
        {/* Project Selector Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-xs font-bold text-slate-400 shrink-0 uppercase tracking-wider mr-1">Dự án:</span>
          <button
            onClick={() => setSelectedProjectId('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all ${
              selectedProjectId === 'ALL'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
            }`}
          >
            Tất cả dự án ({projects.length})
          </button>

          {projects.map((proj) => (
            <button
              key={proj.id}
              onClick={() => setSelectedProjectId(proj.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-2 ${
                selectedProjectId === proj.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              <span>{proj.code}</span>
              <span className="font-normal opacity-80 max-w-[140px] truncate">{proj.name}</span>
            </button>
          ))}
        </div>

        {/* Second Row: Search, Member Filter, and View Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search Box */}
            <div className="relative min-w-[240px] flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kiếm theo tên task, người làm, mã task..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-xs bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 rounded-xl outline-none transition-all"
              />
            </div>

            {/* Assignee Filter Dropdown */}
            <select
              value={selectedAssigneeId}
              onChange={(e) => setSelectedAssigneeId(e.target.value)}
              className="h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium text-slate-700 focus:border-blue-600 cursor-pointer"
            >
              <option value="ALL">Tất cả người phụ trách</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role ? m.role.split(' ')[0] : ''})
                </option>
              ))}
            </select>
          </div>

          {/* View mode switcher */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0 self-end sm:self-auto">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'kanban'
                  ? 'bg-white text-blue-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Bảng Kanban</span>
            </button>

            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'table'
                  ? 'bg-white text-blue-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Danh Sách Chi Tiết</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5. Main Content: Kanban View or Table View */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
          {/* Column 1: Cần làm (To Do) */}
          <div className="bg-slate-100/70 rounded-2xl p-4 border border-slate-200/80 space-y-3.5 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Cần làm (To-Do)</h3>
              </div>
              <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                {todoTasks.length}
              </span>
            </div>

            <div className="space-y-3 flex-1">
              {todoTasks.map((task) => (
                <TaskKanbanCard
                  key={task.id}
                  task={task}
                  isManager={isManager}
                  isEmployee={isEmployee}
                  isAssignedToMe={isTaskAssignedToMe(task)}
                  onUpdate={() => handleOpenUpdateTask(task)}
                  onReview={() => handleOpenReviewTask(task)}
                />
              ))}

              {todoTasks.length === 0 && (
                <div className="h-32 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-xs text-slate-400">
                  Không có task nào cần làm
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Đang thực hiện (In Progress) */}
          <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-200/60 space-y-3.5 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                <h3 className="text-xs font-bold text-blue-900 uppercase tracking-wider">Đang thực hiện</h3>
              </div>
              <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-blue-200 text-blue-800">
                {inProgressTasks.length}
              </span>
            </div>

            <div className="space-y-3 flex-1">
              {inProgressTasks.map((task) => (
                <TaskKanbanCard
                  key={task.id}
                  task={task}
                  isManager={isManager}
                  isEmployee={isEmployee}
                  isAssignedToMe={isTaskAssignedToMe(task)}
                  onUpdate={() => handleOpenUpdateTask(task)}
                  onReview={() => handleOpenReviewTask(task)}
                />
              ))}

              {inProgressTasks.length === 0 && (
                <div className="h-32 border-2 border-dashed border-blue-200 rounded-xl flex items-center justify-center text-xs text-blue-400">
                  Chưa có task nào đang chạy
                </div>
              )}
            </div>
          </div>

          {/* Column 3: Chờ nghiệm thu (Review) */}
          <div className="bg-amber-50/50 rounded-2xl p-4 border border-amber-200/60 space-y-3.5 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Chờ Nghiệm Thu</h3>
              </div>
              <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">
                {reviewTasks.length}
              </span>
            </div>

            <div className="space-y-3 flex-1">
              {reviewTasks.map((task) => (
                <TaskKanbanCard
                  key={task.id}
                  task={task}
                  isManager={isManager}
                  isEmployee={isEmployee}
                  isAssignedToMe={isTaskAssignedToMe(task)}
                  onUpdate={() => handleOpenUpdateTask(task)}
                  onReview={() => handleOpenReviewTask(task)}
                />
              ))}

              {reviewTasks.length === 0 && (
                <div className="h-32 border-2 border-dashed border-amber-200 rounded-xl flex items-center justify-center text-xs text-amber-400">
                  Không có task chờ nghiệm thu
                </div>
              )}
            </div>
          </div>

          {/* Column 4: Đã hoàn thành (Done) */}
          <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-200/60 space-y-3.5 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <h3 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Đã Hoàn Thành</h3>
              </div>
              <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800">
                {doneTasks.length}
              </span>
            </div>

            <div className="space-y-3 flex-1">
              {doneTasks.map((task) => (
                <TaskKanbanCard
                  key={task.id}
                  task={task}
                  isManager={isManager}
                  isEmployee={isEmployee}
                  isAssignedToMe={isTaskAssignedToMe(task)}
                  onUpdate={() => handleOpenUpdateTask(task)}
                  onReview={() => handleOpenReviewTask(task)}
                />
              ))}

              {doneTasks.length === 0 && (
                <div className="h-32 border-2 border-dashed border-emerald-200 rounded-xl flex items-center justify-center text-xs text-emerald-400">
                  Chưa có task nào hoàn thành
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Mã Task</th>
                  <th className="py-3 px-4">Nội Dung Công Việc</th>
                  <th className="py-3 px-4">Dự Án</th>
                  <th className="py-3 px-4">Người Phụ Trách</th>
                  <th className="py-3 px-4">Hạn Chót</th>
                  <th className="py-3 px-4">Độ Ưu Tiên</th>
                  <th className="py-3 px-4">Tiến Độ</th>
                  <th className="py-3 px-4">Trạng Thái</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      Chưa có nhiệm vụ hoặc công việc nào phù hợp với bộ lọc hiện tại
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task) => {
                  const stageBadges = {
                    todo: { label: 'Cần làm', color: 'bg-slate-100 text-slate-700 border-slate-200' },
                    in_progress: { label: 'Đang làm', color: 'bg-blue-100 text-blue-800 border-blue-200' },
                    review: { label: 'Chờ duyệt', color: 'bg-amber-100 text-amber-800 border-amber-200' },
                    done: { label: 'Hoàn thành', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
                  };
                  const stageInfo = stageBadges[task.stage] || stageBadges.todo;

                  return (
                    <tr key={task.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 font-mono text-[11px]">{task.id}</td>
                      <td className="py-3.5 px-4 max-w-sm">
                        <div className="font-bold text-slate-900">{task.title}</div>
                        <div className="text-[11px] text-slate-500 line-clamp-1">{task.description}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold text-[10px]">
                          {task.projectId}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <img
                            src={task.assigneeAvatar}
                            alt={task.assigneeName}
                            className="w-6 h-6 rounded-full object-cover border border-slate-200"
                          />
                          <span className="font-bold text-slate-800">{task.assigneeName}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">{task.deadline}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            task.priority === 'Khẩn cấp'
                              ? 'bg-red-100 text-red-700'
                              : task.priority === 'Cao'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {task.priority}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 w-36">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 mb-1">
                          <span>{task.progress}%</span>
                          <span className="text-slate-400">KPI {task.kpiWeight}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${
                              task.stage === 'done'
                                ? 'bg-emerald-500'
                                : task.stage === 'review'
                                ? 'bg-amber-500'
                                : 'bg-blue-500'
                            }`}
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${stageInfo.color}`}
                        >
                          {stageInfo.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {isManager && task.stage === 'review' ? (
                          <button
                            onClick={() => handleOpenReviewTask(task)}
                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-2xs"
                          >
                            Nghiệm thu
                          </button>
                        ) : isTaskAssignedToMe(task) ? (
                          <button
                            onClick={() => handleOpenUpdateTask(task)}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-bold transition-all inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3 text-blue-600" />
                            <span>Cập nhật tiến độ</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenUpdateTask(task)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-lg text-[11px] font-bold transition-all inline-flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3 text-slate-400" />
                            <span>Xem chi tiết</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* -------------------- MODALS -------------------- */}

      {/* Modal 1: Tạo Dự Án Mới (Line Manager) */}
      {isCreateProjectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <FolderKanban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Khởi Tạo Dự Án Mới</h3>
                  <p className="text-xs text-slate-500">Phòng Phát triển Phần mềm • Phụ trách bởi Trưởng phòng</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateProjectOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tên Dự Án Chiến Lược *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Nâng cấp Cổng dịch vụ nhân sự tập trung NEXUS HR v2.0"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mã Dự Án</label>
                  <input
                    type="text"
                    value={newProject.code}
                    onChange={(e) => setNewProject({ ...newProject, code: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 font-mono text-xs bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mức Độ Ưu Tiên</label>
                  <select
                    value={newProject.priority}
                    onChange={(e) => setNewProject({ ...newProject, priority: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs bg-white"
                  >
                    <option value="Khẩn cấp">Khẩn cấp</option>
                    <option value="Cao">Cao</option>
                    <option value="Trung bình">Trung bình</option>
                    <option value="Thấp">Thấp</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ngày Bắt Đầu</label>
                  <input
                    type="text"
                    value={newProject.startDate}
                    onChange={(e) => setNewProject({ ...newProject, startDate: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hạn Hoàn Thành Dự Kiến</label>
                  <input
                    type="text"
                    value={newProject.endDate}
                    onChange={(e) => setNewProject({ ...newProject, endDate: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mục Tiêu và Mô Tả Dự Án</label>
                <textarea
                  rows={3}
                  placeholder="Mô tả phạm vi, kết quả mong đợi và tiêu chuẩn bàn giao..."
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none text-xs"
                />
              </div>

              <div className="flex items-center gap-2.5 p-3 bg-blue-50/70 rounded-xl border border-blue-200">
                <input
                  type="checkbox"
                  id="autoCreateChatCheckbox"
                  checked={newProject.autoCreateChat !== false}
                  onChange={(e) => setNewProject({ ...newProject, autoCreateChat: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="autoCreateChatCheckbox" className="text-xs font-bold text-blue-900 cursor-pointer select-none">
                  Tự động khởi tạo kênh chat riêng cho Đội nhóm dự án (Squad Channel)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateProjectOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-500/20"
                >
                  Xác Nhận Tạo Dự Án
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Giao Task Cho Nhân Viên (Line Manager) */}
      {isAssignTaskOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Phân Công Nhiệm Vụ Mới</h3>
                  <p className="text-xs text-slate-500">Giao task chi tiết, ấn định deadline và trọng số KPI cho nhân viên</p>
                </div>
              </div>
              <button
                onClick={() => setIsAssignTaskOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAssignTask} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Thuộc Dự Án *</label>
                <select
                  value={newTask.projectId}
                  onChange={(e) => setNewTask({ ...newTask, projectId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs bg-white"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code}] {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tiêu Đề Công Việc / Task *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Lập trình chức năng phân quyền bảo mật dữ liệu nhân sự"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Giao Cho Nhân Viên *</label>
                  <select
                    value={newTask.assigneeId}
                    onChange={(e) => setNewTask({ ...newTask, assigneeId: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs bg-white font-bold"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.role ? m.role.split(' ')[0] : ''}) - {m.workload || 0}% tải
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hạn Hoàn Thành (Deadline)</label>
                  <input
                    type="text"
                    value={newTask.deadline}
                    onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mức Độ Ưu Tiên</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs bg-white"
                  >
                    <option value="Khẩn cấp">Khẩn cấp (Sprint Blocker)</option>
                    <option value="Cao">Cao</option>
                    <option value="Trung bình">Trung bình</option>
                    <option value="Thấp">Thấp</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Trọng Số KPI Đánh Giá (%)</label>
                  <input
                    type="number"
                    min="5"
                    max="50"
                    value={newTask.kpiWeight}
                    onChange={(e) => setNewTask({ ...newTask, kpiWeight: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mô Tả Chi Tiết và Tiêu Chuẩn Nghiệm Thu</label>
                <textarea
                  rows={3}
                  placeholder="Yêu cầu cụ thể, kết quả cần bàn giao, link thiết kế hoặc checklist..."
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAssignTaskOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-500/20"
                >
                  Phân Công Nhiệm Vụ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Cập Nhật Tiến Độ Task (Dành cho Người nhận việc) */}
      {selectedTaskForUpdate && (() => {
        const canEdit = isTaskAssignedToMe(selectedTaskForUpdate);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-700 font-bold text-[10px] uppercase">
                      {selectedTaskForUpdate.id} • {selectedTaskForUpdate.projectId}
                    </span>
                    {!canEdit ? (
                      <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold text-[10px] flex items-center gap-1 border border-amber-200">
                        <Lock className="w-3 h-3 text-amber-700" />
                        Chế độ xem chi tiết
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center gap-1 border border-emerald-200">
                        <Check className="w-3 h-3 text-emerald-700" />
                        Nhiệm vụ của bạn
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900 mt-1">{selectedTaskForUpdate.title}</h3>
                </div>
                <button
                  onClick={() => setSelectedTaskForUpdate(null)}
                  className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!canEdit && (
                <div className="p-3.5 bg-amber-50 border border-amber-200/90 rounded-2xl text-amber-900 text-xs flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-bold">Quyền hạn chế:</span> Nhiệm vụ này được giao cho{' '}
                    <strong className="font-bold text-amber-950">{selectedTaskForUpdate.assigneeName || 'nhân sự khác'}</strong>. 
                    Chỉ người trực tiếp được giao việc mới có quyền cập nhật tiến độ và gửi báo cáo hoàn thành.
                  </div>
                </div>
              )}

              {/* Task Info Snippet */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs space-y-2">
                <div className="text-slate-600">{selectedTaskForUpdate.description}</div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-500 pt-1 border-t border-slate-200/60">
                  <span>Người thực hiện: <strong className="text-slate-900">{selectedTaskForUpdate.assigneeName}</strong></span>
                  <span>Người giao: {selectedTaskForUpdate.creator}</span>
                  <span>Hạn chót: <strong className="text-slate-900">{selectedTaskForUpdate.deadline}</strong></span>
                </div>
              </div>

              <form onSubmit={handleSaveUpdateTask} className="space-y-4 text-xs">
                {/* Progress Slider */}
                <div>
                  <div className="flex items-center justify-between font-bold text-slate-700 mb-1.5">
                    <span>Tiến Độ Công Việc Đạt Được</span>
                    <span className="text-blue-600 font-extrabold text-sm">{updateProgress}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    disabled={!canEdit}
                    value={updateProgress}
                    onChange={(e) => {
                      if (!canEdit) return;
                      const val = Number(e.target.value);
                      setUpdateProgress(val);
                      if (val === 100) setUpdateStage('review');
                      else if (val > 0 && updateStage === 'todo') setUpdateStage('in_progress');
                    }}
                    className={`w-full h-2 rounded-lg appearance-none ${
                      canEdit ? 'bg-slate-200 cursor-pointer accent-blue-600' : 'bg-slate-200 cursor-not-allowed opacity-50'
                    }`}
                  />
                </div>

                {/* Stage selector */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">Trạng Thái Thực Hiện</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { key: 'todo', label: 'Cần làm' },
                      { key: 'in_progress', label: 'Đang làm' },
                      { key: 'review', label: 'Chờ duyệt' },
                      { key: 'done', label: 'Hoàn thành' },
                    ].map((st) => (
                      <button
                        key={st.key}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => {
                          if (!canEdit) return;
                          setUpdateStage(st.key);
                          if (st.key === 'done') setUpdateProgress(100);
                          if (st.key === 'todo') setUpdateProgress(0);
                        }}
                        className={`py-2 px-3 rounded-xl font-bold text-xs border transition-all ${
                          !canEdit
                            ? updateStage === st.key
                              ? 'bg-slate-200 text-slate-700 border-slate-300 cursor-not-allowed'
                              : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                            : updateStage === st.key
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Progress log notes */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Báo Cáo Tiến Độ / Ghi Chú Nghiệm Thu
                  </label>
                  <textarea
                    rows={3}
                    readOnly={!canEdit}
                    placeholder={canEdit ? "Nhập tiến độ mới, link pull request, kết quả kiểm thử hoặc ghi chú bàn giao cho Trưởng phòng..." : "Chỉ người nhận việc mới có thể gửi báo cáo / cập nhật tiến độ."}
                    value={updateNote}
                    onChange={(e) => {
                      if (!canEdit) return;
                      setUpdateNote(e.target.value);
                    }}
                    className={`w-full p-3 rounded-xl border text-xs outline-none ${
                      canEdit
                        ? 'border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                        : 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
                    }`}
                  />
                </div>

                {/* History logs */}
                {selectedTaskForUpdate.logs && selectedTaskForUpdate.logs.length > 0 && (
                  <div>
                    <span className="block font-bold text-slate-700 mb-2">Lịch Sử Trao Đổi và Tiến Độ</span>
                    <div className="space-y-2 max-h-36 overflow-y-auto p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                      {selectedTaskForUpdate.logs.map((log, idx) => (
                        <div key={idx} className="text-[11px] pb-1.5 border-b border-slate-200/60 last:border-0">
                          <div className="flex items-center justify-between text-slate-400 text-[10px]">
                            <strong className="text-slate-700">{log.author}</strong>
                            <span>{log.time}</span>
                          </div>
                          <div className="text-slate-600 mt-0.5">{log.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSelectedTaskForUpdate(null)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
                  >
                    {canEdit ? 'Hủy Bỏ' : 'Đóng Cửa Sổ'}
                  </button>
                  {canEdit && (
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-500/20 flex items-center gap-2"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Cập Nhật Tiến Độ</span>
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Modal 4: Thẩm Duyệt Nghiệm Thu (Dành cho Trưởng phòng - Line Manager) */}
      {selectedTaskForReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Thẩm Duyệt Nghiệm Thu Công Việc</h3>
                  <p className="text-xs text-slate-500">Kiểm tra kết quả hoàn thành từ nhân viên trước khi đóng task</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTaskForReview(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200/80 space-y-2">
                <div className="font-extrabold text-amber-900 text-sm">{selectedTaskForReview.title}</div>
                <div className="text-amber-800 text-xs">{selectedTaskForReview.description}</div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-amber-700 pt-1 border-t border-amber-200">
                  <span>Người thực hiện: <strong>{selectedTaskForReview.assigneeName}</strong></span>
                  <span>Trọng số KPI: <strong>{selectedTaskForReview.kpiWeight}%</strong></span>
                </div>
              </div>

              <div>
                <span className="block font-bold text-slate-700 mb-1">Báo Cáo Nghiệm Thu Từ Nhân Viên:</span>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 italic">
                  "{selectedTaskForReview.submissionNote || 'Đã hoàn tất toàn bộ các tiêu chí nghiệm thu đề ra.'}"
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nhận Xét và Đánh Giá Của Trưởng Phòng (Tùy chọn)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú đánh giá chất lượng hoặc yêu cầu chỉnh sửa nếu chưa đạt..."
                  value={managerReviewNote}
                  onChange={(e) => setManagerReviewNote(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleManagerApprove(false)}
                  className="px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold flex items-center gap-1.5 transition-colors"
                >
                  <X className="w-4 h-4" />
                  <span>Yêu Cầu Chỉnh Sửa</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleManagerApprove(true)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>Phê Duyệt Nghiệm Thu</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Squad Real-time WebSocket Chat Drawer */}
      <SquadChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        squad={{
          id: selectedProjectId !== 'ALL' ? selectedProjectId : 'SQ-AGILE-01',
          name: selectedProjectId !== 'ALL'
            ? (projects.find((p) => p.id === selectedProjectId)?.name || 'Dự án')
            : 'Đội Ngũ Dự Án Agile (Squad FwB)',
        }}
        currentUser={currentRole}
      />
    </div>
  );
}

// -------------------- Sub-component: Task Kanban Card --------------------
function TaskKanbanCard({ task, isManager, isEmployee, isAssignedToMe, onUpdate, onReview }) {
  const priorityStyles = {
    'Khẩn cấp': 'bg-red-50 text-red-700 border-red-200',
    'Cao': 'bg-amber-50 text-amber-700 border-amber-200',
    'Trung bình': 'bg-blue-50 text-blue-700 border-blue-200',
    'Thấp': 'bg-slate-50 text-slate-700 border-slate-200',
  };

  const isPendingReview = task.stage === 'review';

  return (
    <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs hover:shadow-md transition-all space-y-3 group select-none">
      {/* Top row: Project ID & Priority */}
      <div className="flex items-center justify-between gap-1">
        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold font-mono">
          {task.id}
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            priorityStyles[task.priority] || priorityStyles['Trung bình']
          }`}
        >
          {task.priority}
        </span>
      </div>

      {/* Title & Description */}
      <div>
        <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug">
          {task.title}
        </h4>
        <p className="text-[11px] text-slate-500 line-clamp-2 mt-1 leading-relaxed">
          {task.description}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
          <span>Tiến độ</span>
          <span className="text-slate-900">{task.progress}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${
              task.stage === 'done'
                ? 'bg-emerald-500'
                : task.stage === 'review'
                ? 'bg-amber-500'
                : 'bg-blue-500'
            }`}
            style={{ width: `${task.progress}%` }}
          />
        </div>
      </div>

      {/* Assignee & Deadline */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
        <div className="flex items-center gap-1.5 min-w-0" title={task.assigneeName}>
          <img
            src={task.assigneeAvatar}
            alt={task.assigneeName}
            className="w-5 h-5 rounded-full object-cover border border-slate-200 shrink-0"
          />
          <span className="text-[11px] font-bold text-slate-700 truncate max-w-[90px]">
            {task.assigneeName ? task.assigneeName.split(' ').slice(-2).join(' ') : 'Chưa phân công'}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-slate-400 font-semibold shrink-0">
          <Clock className="w-3 h-3" />
          <span>{task.deadline ? task.deadline.slice(0, 5) : '--/--'}</span>
        </div>
      </div>

      {/* Quick Action Button */}
      <div className="pt-1 flex items-center justify-between gap-2">
        {isManager && isPendingReview ? (
          <button
            onClick={onReview}
            className="w-full py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-2xs flex items-center justify-center gap-1"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Nghiệm Thu Task</span>
          </button>
        ) : isAssignedToMe ? (
          <button
            onClick={onUpdate}
            className="w-full py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[11px] font-bold transition-colors flex items-center justify-center gap-1 border border-blue-200"
          >
            <Edit3 className="w-3 h-3 text-blue-600" />
            <span>Cập Nhật Tiến Độ</span>
          </button>
        ) : (
          <button
            onClick={onUpdate}
            className="w-full py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-[11px] font-bold transition-colors flex items-center justify-center gap-1 border border-slate-200"
          >
            <Eye className="w-3 h-3 text-slate-400" />
            <span>Xem Chi Tiết</span>
          </button>
        )}
      </div>
    </div>
  );
}
