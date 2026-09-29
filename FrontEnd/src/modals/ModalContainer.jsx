import React from 'react';
import { useModal } from '../context/ModalContext';
import leaveService from '../services/leaveService';

// Common Modals
import NotificationCenterModal from './common/NotificationCenterModal';
import NotificationDetailModal from './common/NotificationDetailModal';

// Dashboard Modals
import LateAbsenceModal from './dashboard/LateAbsenceModal';
import PdfReportModal from './dashboard/PdfReportModal';
import LiveLogsModal from './dashboard/LiveLogsModal';

// Portal Modals
import OtRegisterModal from './portal/OtRegisterModal';
import NoticeDetailModal from './portal/NoticeDetailModal';
import CreateCompanyNoticeModal from './portal/CreateCompanyNoticeModal';
import NoticeManagementModal from './portal/NoticeManagementModal';
import NoticeReadersModal from './portal/NoticeReadersModal';
import PayslipPdfModal from './portal/PayslipPdfModal';
import HandbookModal from './portal/HandbookModal';

// Directory Modals
import OnboardingModal from './directory/OnboardingModal';
import Profile360Modal from './directory/Profile360Modal';
import ImportExcelModal from './directory/ImportExcelModal';
import OffboardingModal from './directory/OffboardingModal';
import DepartmentManageModal from './directory/DepartmentManageModal';
import JobTitleManageModal from './directory/JobTitleManageModal';
import ContractPdfPreviewModal from './directory/ContractPdfPreviewModal';

// Attendance Modals
import KioskGateModal from './attendance/KioskGateModal';
import TimesheetMatrixModal from './attendance/TimesheetMatrixModal';
import SnapshotLogsModal from './attendance/SnapshotLogsModal';
import AttendanceAppealModal from './attendance/AttendanceAppealModal';
import AttendanceAdjustModal from './attendance/AttendanceAdjustModal';

// Leave Modals
import LeaveCalendarModal from './leave/LeaveCalendarModal';
import MedicalClaimModal from './leave/MedicalClaimModal';
import RejectionWorkflowModal from './leave/RejectionWorkflowModal';
import CreateLeaveRequestModal from './leave/CreateLeaveRequestModal';
import LeaveDetailViewModal from './leave/LeaveDetailViewModal';

// Payroll Modals
import PayrollAnomalyModal from './payroll/PayrollAnomalyModal';
import BankTransferModal from './payroll/BankTransferModal';
import PayrollLockModal from './payroll/PayrollLockModal';
import PayrollAdjustModal from './payroll/PayrollAdjustModal';

// Analytics Modals
import TurnoverRiskModal from './analytics/TurnoverRiskModal';
import AiCopilotDrawerModal from './analytics/AiCopilotDrawerModal';
import PipPlanModal from './analytics/PipPlanModal';
import NineBoxDetailModal from './analytics/NineBoxDetailModal';

export default function ModalContainer() {
  const { activeModal, closeModal, modalPayload } = useModal();

  const handleApproveLeave = async (id, note) => {
    try {
      await leaveService.approve(id, note);
      window.dispatchEvent(new CustomEvent('nexus:leave-updated', { detail: { id, status: 'approved' } }));
    } catch (e) {
      console.warn('Approve leave API notice:', e);
    }
  };

  const handleRejectLeave = async (id, note) => {
    try {
      await leaveService.reject(id, note);
      window.dispatchEvent(new CustomEvent('nexus:leave-updated', { detail: { id, status: 'rejected' } }));
    } catch (e) {
      console.warn('Reject leave API notice:', e);
    }
  };

  if (!activeModal) return null;

  return (
    <>
      {/* Global Notification Modals */}
      <NotificationCenterModal
        isOpen={activeModal === 'modalNotificationCenter' || activeModal === 'notificationCenter'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <NotificationDetailModal
        isOpen={activeModal === 'modalNotificationDetail' || activeModal === 'notificationDetail'}
        onClose={closeModal}
        payload={modalPayload}
      />

      {/* Dashboard Modals */}
      <LateAbsenceModal
        isOpen={activeModal === 'modal2A' || activeModal === 'lateAbsence'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <PdfReportModal
        isOpen={activeModal === 'modal2B' || activeModal === 'pdfReport'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <LiveLogsModal
        isOpen={activeModal === 'modal2C' || activeModal === 'liveLogs'}
        onClose={closeModal}
        payload={modalPayload}
      />

      {/* Portal Modals */}
      <OtRegisterModal
        isOpen={activeModal === 'modal3A' || activeModal === 'otRegister'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <NoticeDetailModal
        isOpen={activeModal === 'modal3B' || activeModal === 'noticeDetail'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <PayslipPdfModal
        isOpen={activeModal === 'modal3C' || activeModal === 'payslipPdf'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <HandbookModal
        isOpen={activeModal === 'modal3D' || activeModal === 'handbook'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <CreateCompanyNoticeModal
        isOpen={activeModal === 'modalCreateNotice' || activeModal === 'createNotice'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <NoticeManagementModal
        isOpen={activeModal === 'modalNoticeManagement' || activeModal === 'noticeManagement'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <NoticeReadersModal
        isOpen={activeModal === 'modalNoticeReaders' || activeModal === 'noticeReaders'}
        onClose={closeModal}
        payload={modalPayload}
      />

      {/* Directory Modals */}
      <OnboardingModal
        isOpen={activeModal === 'modal4A' || activeModal === 'onboarding'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <Profile360Modal
        isOpen={activeModal === 'modal4B' || activeModal === 'profile360'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <ImportExcelModal
        isOpen={activeModal === 'modal4C' || activeModal === 'importExcel'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <OffboardingModal
        isOpen={activeModal === 'modal4D' || activeModal === 'offboarding'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <DepartmentManageModal
        isOpen={activeModal === 'modal4E' || activeModal === 'departmentManage'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <JobTitleManageModal
        isOpen={activeModal === 'modal4F' || activeModal === 'jobTitleManage'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <ContractPdfPreviewModal
        isOpen={activeModal === 'modal4G' || activeModal === 'contractPdfPreview'}
        onClose={closeModal}
        payload={modalPayload}
        emp={modalPayload}
      />

      {/* Attendance Modals */}
      <KioskGateModal
        isOpen={activeModal === 'modal5A' || activeModal === 'kioskGate'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <TimesheetMatrixModal
        isOpen={activeModal === 'modal5B' || activeModal === 'timesheetMatrix'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <SnapshotLogsModal
        isOpen={activeModal === 'modal5C' || activeModal === 'snapshotLogs'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <AttendanceAppealModal
        isOpen={activeModal === 'attendanceAppeal'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <AttendanceAdjustModal
        isOpen={activeModal === 'attendanceAdjust'}
        onClose={closeModal}
        payload={modalPayload}
        onAdjustSuccess={() => {
          window.dispatchEvent(new CustomEvent('nexus:attendance-updated'));
        }}
      />

      {/* Leave Modals */}
      <LeaveCalendarModal
        isOpen={activeModal === 'modal6A' || activeModal === 'leaveCalendar'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <MedicalClaimModal
        isOpen={activeModal === 'modal6B' || activeModal === 'medicalClaim'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <RejectionWorkflowModal
        isOpen={activeModal === 'modal6C' || activeModal === 'rejectionWorkflow'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <CreateLeaveRequestModal
        isOpen={activeModal === 'modal6D' || activeModal === 'createLeaveRequest'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <LeaveDetailViewModal
        isOpen={activeModal === 'modal6E' || activeModal === 'leaveDetailView'}
        onClose={closeModal}
        payload={modalPayload}
        onApprove={handleApproveLeave}
        onReject={handleRejectLeave}
      />

      {/* Payroll Modals */}
      <PayrollAnomalyModal
        isOpen={activeModal === 'modal7A' || activeModal === 'payrollAnomaly'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <PayrollAdjustModal
        isOpen={activeModal === 'payrollAdjust'}
        onClose={closeModal}
        payload={modalPayload}
        onAdjustSuccess={() => {
          window.dispatchEvent(new CustomEvent('nexus:payroll-locked'));
        }}
      />
      <BankTransferModal
        isOpen={activeModal === 'modal7B' || activeModal === 'bankTransfer'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <PayrollLockModal
        isOpen={activeModal === 'modal7C' || activeModal === 'payrollLock'}
        onClose={closeModal}
        payload={modalPayload}
      />

      {/* Analytics Modals */}
      <TurnoverRiskModal
        isOpen={activeModal === 'modal8A' || activeModal === 'turnoverRisk'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <AiCopilotDrawerModal
        isOpen={activeModal === 'modal8B' || activeModal === 'aiCopilotDrawer'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <PipPlanModal
        isOpen={activeModal === 'modal8C' || activeModal === 'pipPlan'}
        onClose={closeModal}
        payload={modalPayload}
      />
      <NineBoxDetailModal
        isOpen={activeModal === 'modal8D' || activeModal === 'nineBoxDetail'}
        onClose={closeModal}
        payload={modalPayload}
      />
    </>
  );
}
