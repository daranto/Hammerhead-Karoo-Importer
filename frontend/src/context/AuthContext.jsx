import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ loading: true, authenticated: false, userId: null, email: null });

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status', { credentials: 'include' });
      const data = await res.json();
      setAuth({ loading: false, ...data });
    } catch {
      setAuth({ loading: false, authenticated: false, userId: null, email: null });
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    // After session logout, re-check status (auto-login may restore session via stored credentials)
    await checkStatus();
  }, [checkStatus]);

  const removeCredentials = useCallback(async () => {
    await fetch('/api/auth/remove-credentials', { method: 'POST', credentials: 'include' });
    setAuth({ loading: false, authenticated: false, userId: null, email: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...auth, checkStatus, logout, removeCredentials }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
