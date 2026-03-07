import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthResponse } from '../types';
import { authAPI } from '../services/api';

interface AuthContextType {
  user: AuthResponse | null;
  loading: boolean;
  register: (role: string, name: string, phone?: string, familyCode?: string) => Promise<AuthResponse>;
  login: (phone: string, familyCode: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const saved = await authAPI.getUser();
      setUser(saved);
    } finally {
      setLoading(false);
    }
  };

  const register = async (role: string, name: string, phone?: string, familyCode?: string) => {
    const result = await authAPI.register(role, name, phone, familyCode);
    setUser(result);
    return result;
  };

  const login = async (phone: string, familyCode: string) => {
    const result = await authAPI.login(phone, familyCode);
    setUser(result);
    return result;
  };

  const logout = async () => {
    await authAPI.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
