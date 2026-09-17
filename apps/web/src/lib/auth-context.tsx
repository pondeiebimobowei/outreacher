import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export interface User {
  id: string;
  email: string;
  name?: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId?: string;
}

export interface AuthContextType {
  user: User | null;
  workspace: Workspace | null;
  isLoading: boolean;
  error: Error | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refetchAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const refetchAuth = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ user: User; workspace: Workspace }>('/auth/me');
      setUser(res.user);
      setWorkspace(res.workspace);
    } catch (err) {
      setUser(null);
      setWorkspace(null);
      setError(err instanceof Error ? err : new Error('Authentication failed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetchAuth();
  }, [refetchAuth]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<{ user: User; workspace: Workspace }>('/auth/login', {
        email,
        password,
      });
      setUser(res.user);
      setWorkspace(res.workspace);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Login failed'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (email: string, password: string, name?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<{ user: User; workspace: Workspace }>('/auth/signup', {
        email,
        password,
        name,
      });
      setUser(res.user);
      setWorkspace(res.workspace);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Signup failed'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore logout API failures on client
    } finally {
      setUser(null);
      setWorkspace(null);
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        workspace,
        isLoading,
        error,
        login,
        signup,
        logout,
        refetchAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
