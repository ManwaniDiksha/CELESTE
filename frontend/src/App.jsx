import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import BookAppointmentPage from './pages/BookAppointmentPage.jsx';
import HomePage from './pages/HomePage.jsx';
import JoinQueuePage from './pages/JoinQueuePage.jsx';
import MyStatusPage from './pages/MyStatusPage.jsx';
import OwnerSettingsPage from './pages/OwnerSettingsPage.jsx';
import ReceptionDashboardPage from './pages/ReceptionDashboardPage.jsx';
import StaffViewPage from './pages/StaffViewPage.jsx';
import WaitingAreaDisplayPage from './pages/WaitingAreaDisplayPage.jsx';

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/join" element={<JoinQueuePage />} />
            <Route path="/appointments" element={<BookAppointmentPage />} />
            <Route path="/status/:id" element={<MyStatusPage />} />
            <Route path="/reception" element={<ReceptionDashboardPage />} />
            <Route path="/barber/:name" element={<StaffViewPage />} />
            <Route path="/display" element={<WaitingAreaDisplayPage />} />
            <Route path="/admin" element={<OwnerSettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
