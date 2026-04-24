import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/LoginPage";
import DashboardAdmin from "./pages/DashboardAdmin";
import DashboardStaff from "./pages/DashboardStaff";
import DashboardDoctor from "./pages/DashboardDoctor";
import AdminPatientManagement from "./pages/AdminPatientManagement";
import StaffPatientManagement from "./pages/StaffPatientManagement";
import DoctorPatientManagement from "./pages/DoctorPatientManagement";
import StaffAppointmentManagement from "./pages/StaffAppointmentManagement";
import StaffQueueManagement from "./pages/StaffQueueManagement";
import DoctorAppointmentSchedule from "./pages/DoctorAppointmentSchedule";
import DoctorQueueManagement from "./pages/DoctorQueueManagement";
import AdminAppointmentManagement from "./pages/AdminAppointmentManagement";
import AdminQueueManagement from "./pages/AdminQueueManagement";
import AdminClinicSettings from "./pages/AdminClinicSettings";
import AdminUserManagement from "./pages/AdminUserManagement";
import StaffPharmacyManagement from "./pages/StaffPharmacyManagement";
import AdminPharmacyManagement from "./pages/AdminPharmacyManagement";
import DoctorPharmacyView from "./pages/DoctorPharmacyView";
import StaffPOSBilling from "./pages/StaffPOSBilling";
import StaffRecords from "./pages/StaffRecords";
import AdminBillingManagement from "./pages/AdminBillingManagement";
import DoctorIncomeReport from "./pages/DoctorIncomeReport";
import DoctorRecords from "./pages/DoctorRecords";
import AdminRecords from "./pages/AdminRecords";
import DoctorPrescription from "./pages/DoctorPrescription";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          
          <Route 
            path="/dashboard-admin" 
            element={
              <ProtectedRoute allowedRole="admin">
                <DashboardAdmin />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/dashboard-staff" 
            element={
              <ProtectedRoute allowedRole="staff">
                <DashboardStaff />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/dashboard-doctor" 
            element={
              <ProtectedRoute allowedRole="doctor">
                <DashboardDoctor />
              </ProtectedRoute>
            } 
          />

          {/* Patient Management — separate for admin and staff */}
          <Route 
            path="/admin/patients" 
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminPatientManagement />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/admin/appointments" 
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminAppointmentManagement />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/admin/queue" 
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminQueueManagement />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/admin/settings" 
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminClinicSettings />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/admin/pharmacy" 
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminPharmacyManagement />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/admin/billing" 
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminBillingManagement />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/staff/patients" 
            element={
              <ProtectedRoute allowedRole="staff">
                <StaffPatientManagement />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/doctor/patients" 
            element={
              <ProtectedRoute allowedRole="doctor">
                <DoctorPatientManagement />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/doctor/appointments" 
            element={
              <ProtectedRoute allowedRole="doctor">
                <DoctorAppointmentSchedule />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/doctor/records" 
            element={
              <ProtectedRoute allowedRole="doctor">
                <DoctorRecords />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/doctor/prescriptions" 
            element={
              <ProtectedRoute allowedRole="doctor">
                <DoctorPrescription />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/doctor/pharmacy" 
            element={
              <ProtectedRoute allowedRole="doctor">
                <DoctorPharmacyView />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/doctor/queue" 
            element={
              <ProtectedRoute allowedRole="doctor">
                <DoctorQueueManagement />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/doctor/income" 
            element={
              <ProtectedRoute allowedRole="doctor">
                <DoctorIncomeReport />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/staff/appointments" 
            element={
              <ProtectedRoute allowedRole="staff">
                <StaffAppointmentManagement />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/clinic-queue" 
            element={
              <ProtectedRoute allowedRole="staff">
                <StaffQueueManagement />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/pharmacy" 
            element={
              <ProtectedRoute allowedRole="staff">
                <StaffPharmacyManagement />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/pos-billing" 
            element={
              <ProtectedRoute allowedRole="staff">
                <StaffPOSBilling />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/staff/records" 
            element={
              <ProtectedRoute allowedRole="staff">
                <StaffRecords />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/admin/users" 
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminUserManagement />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/admin/records" 
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminRecords />
              </ProtectedRoute>
            } 
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;