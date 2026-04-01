import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function ProtectedRoute({ children, allowedRole }) {
  const { currentUser, userRole, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  if (allowedRole && userRole !== allowedRole) {
    // Redirect to their correct dashboard if they have a different role
    if (userRole === 'admin') return <Navigate to="/dashboard-admin" replace />;
    if (userRole === 'staff') return <Navigate to="/dashboard-staff" replace />;
    if (userRole === 'doctor') return <Navigate to="/dashboard-doctor" replace />;
    
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;
