import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './presentation/context/AuthContext.tsx';
import Login from './presentation/pages/Login.tsx';
import Register from './presentation/pages/Register.tsx';
import Dashboard from './presentation/pages/Dashboard.tsx';
import Materials from './presentation/pages/admin/Materials.tsx';
import Users from './presentation/pages/admin/Users.tsx';
import Demands from './presentation/pages/admin/Demands.tsx';
import DemandDetails from './presentation/pages/DemandDetails.tsx';
import Reports from './presentation/pages/admin/Reports.tsx';
import ProtectedRoute from './presentation/components/ProtectedRoute.tsx';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/demands/:id" element={<DemandDetails />} />
              
              {/* Admin only routes handled inside protected route or by role checks */}
              <Route path="/admin/materials" element={<Materials />} />
              <Route path="/admin/users" element={<Users />} />
              <Route path="/admin/demands" element={<Demands />} />
              <Route path="/admin/reports" element={<Reports />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
