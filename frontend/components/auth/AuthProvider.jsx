'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, locationsApi } from '@/lib/api';
import { LocationSourceProvider } from '@/components/location/LocationSourceProvider';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await authApi.me();
      setUser(data.user);
      setError(null);
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const register = useCallback(async (payload) => {
    setError(null);
    const data = await authApi.register(payload);
    setUser(data.user);
    return data;
  }, []);

  const login = useCallback(async (payload) => {
    setError(null);
    const data = await authApi.login(payload);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const setLocation = useCallback(async (payload) => {
    if (typeof payload === 'string') {
      const data = await authApi.setLocation(payload);
      setUser(data.user);
      return data;
    }
    const data = await locationsApi.setMyLocation({
      areaId: payload.areaId,
      locationId: payload.locationId,
      privateLat: payload.privateLat,
      privateLng: payload.privateLng,
      ...(payload.accuracy != null ? { accuracy: payload.accuracy } : {}),
    });
    setUser(data.user);
    return data;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      isAuthenticated: Boolean(user),
      onboardingCompleted: Boolean(user?.onboardingCompleted),
      register,
      login,
      logout,
      refresh,
      setLocation,
      setError,
    }),
    [user, loading, error, register, login, logout, refresh, setLocation]
  );

  return (
    <AuthContext.Provider value={value}>
      <LocationSourceProvider>{children}</LocationSourceProvider>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
