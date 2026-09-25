import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient, ApiError } from '../api/client';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId?: string;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'bootstrap_error';

export interface AuthContextType {
  status: AuthStatus;
  user: User | null;
  workspace: Workspace | null;
  isLoading: boolean;
  error: Error | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => Promise<void>;
  refetchAuth: () => Promise<void>;
  retryBootstrap: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const refetchAuth = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const res = await apiClient.get<{ user: User; workspace: Workspace }>('/auth/me');
      if (!res || !res.user || !res.workspace) {
        throw new ApiError(401, null, 'Invalid session data received');
      }
      setUser(res.user);
      setWorkspace(res.workspace);
      setStatus('authenticated');
    } catch (err: unknown) {
      setUser(null);
      setWorkspace(null);

      // Distinguish 401 (unauthenticated) from network/500 failures (bootstrap_error)
      if (err instanceof ApiError && err.statusCode === 401) {
        setStatus('unauthenticated');
        setError(null);
      } else {
        setStatus('bootstrap_error');
        setError(err instanceof Error ? err : new Error('Connection to server failed'));
      }
    }
  }, []);

  useEffect(() => {
    void refetchAuth();
  }, [refetchAuth]);

  const login = async (email: string, password: string) => {
    setStatus('loading');
    setError(null);
    try {
      const res = await apiClient.post<{ user: User; workspace: Workspace }>('/auth/login', {
        email,
        password,
      });
      if (!res || !res.user || !res.workspace) {
        throw new ApiError(401, null, 'Invalid session data received on login');
      }
      setUser(res.user);
      setWorkspace(res.workspace);
      setStatus('authenticated');
    } catch (err) {
      setStatus('unauthenticated');
      setError(err instanceof Error ? err : new Error('Login failed'));
      throw err;
    }
  };

  const signup = async (email: string, password: string, firstName: string, lastName: string) => {
    setStatus('loading');
    setError(null);
    try {
      const res = await apiClient.post<{ user: User; workspace: Workspace }>('/auth/signup', {
        email,
        password,
        firstName,
        lastName,
      });
      if (!res || !res.user || !res.workspace) {
        throw new ApiError(401, null, 'Invalid session data received on signup');
      }
      setUser(res.user);
      setWorkspace(res.workspace);
      setStatus('authenticated');
    } catch (err) {
      setStatus('unauthenticated');
      setError(err instanceof Error ? err : new Error('Signup failed'));
      throw err;
    }
  };

  const logout = async () => {
    setStatus('loading');
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore logout API network failures on client
    } finally {
      setUser(null);
      setWorkspace(null);
      setError(null);
      setStatus('unauthenticated');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        workspace,
        isLoading: status === 'loading',
        error,
        login,
        signup,
        logout,
        refetchAuth,
        retryBootstrap: refetchAuth,
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
