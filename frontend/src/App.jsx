import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import './App.css';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { I18nProvider, useT } from './i18n/I18nContext.jsx';
import Header from './components/Header.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ActivitiesPage from './pages/ActivitiesPage.jsx';
import ActivityDetailPage from './pages/ActivityDetailPage.jsx';
import StatsPage from './pages/StatsPage.jsx';

function ProtectedLayout() {
  const { loading, authenticated } = useAuth();
  const { t } = useT();
  if (loading) return <div className="loading-screen"><span>{t('app.loading')}</span></div>;
  if (!authenticated) return <Navigate to="/login" replace />;
  return (
    <>
      <Header />
      <Outlet />
    </>
  );
}

function AppRoutes() {
  const { authenticated, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={!loading && authenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<ActivitiesPage />} />
        <Route path="/activities/:id" element={<ActivityDetailPage />} />
        <Route path="/stats" element={<StatsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
