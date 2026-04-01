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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;