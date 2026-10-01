import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './components/common/ProtectedRoute';
import ErrorBoundary from './components/common/ErrorBoundary';
import { useAuth } from './context/AuthContext';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EmployeePortalPage from './pages/EmployeePortalPage';
import DirectoryPage from './pages/DirectoryPage';
import AttendancePage from './pages/AttendancePage';
import LeaveManagementPage from './pages/LeaveManagementPage';
import PayrollPage from './pages/PayrollPage';
import AiAnalyticsPage from './pages/AiAnalyticsPage';
import ProjectsTasksPage from './pages/ProjectsTasksPage';
import KioskFullscreenPage from './pages/KioskFullscreenPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const { currentRole } = useAuth();
  const defaultHome = currentRole?.key === 'EMPLOYEE' ? '/portal' : '/dashboard';

  return (
    <ErrorBoundary>
      <Routes>
        {/* Standalone Login Route */}
        <Route path="/login" element={<LoginPage />} />

        {/* Standalone Fullscreen Kiosk Route */}
        <Route path="/kiosk" element={<KioskFullscreenPage />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to={defaultHome} replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/portal" element={<EmployeePortalPage />} />
            <Route path="/tasks" element={<ProjectsTasksPage />} />
            <Route path="/directory" element={<DirectoryPage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/leaves" element={<LeaveManagementPage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            <Route path="/ai-analytics" element={<AiAnalyticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to={defaultHome} replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
