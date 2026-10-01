import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ModalContainer from '../../modals/ModalContainer';

export default function AppShell() {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  const isKioskFullscreen = location.pathname === '/kiosk';

  // If login or kiosk full-screen, render without standard sidebar
  if (isLoginPage || isKioskFullscreen) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
        <main className="flex-1 flex flex-col">
          <Outlet />
        </main>
        <ModalContainer />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#F8FAFC] flex flex-col overflow-hidden">
      {/* Main App Layout: Left Sidebar + Right Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar 260px */}
        <Sidebar />

        {/* Right Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Topbar 64px */}
          <Topbar />

          {/* Main Page Content */}
          <main className="flex-1 overflow-y-auto bg-[#F8FAFC]">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Global Modals & Drawers Container */}
      <ModalContainer />
    </div>
  );
}
