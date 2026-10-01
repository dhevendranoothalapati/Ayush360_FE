import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/core/authentication/AuthContext';
import { AppRoutes } from '@/core/routing/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
