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

export const authStatus = {
  LOADING: "loading",
  AUTHENTICATED: "authenticated",
  UNAUTHENTICATED: "unauthenticated",
  BOOTSTRAP_ERROR: "bootstrap_error",
} as const;

export type AuthStatus = typeof authStatus[keyof typeof authStatus];

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
  const [status, setStatus] = useState<AuthStatus>(authStatus.LOADING);
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const refetchAuth = useCallback(async () => {
    setStatus(authStatus.LOADING);
    setError(null);
    try {
      const res = await apiClient.get<{ user: User; workspace: Workspace }>('/auth/me');
      if (!res || !res.user || !res.workspace) {
        throw new ApiError(401, null, 'Invalid session data received');
      }
      setUser(res.user);
      setWorkspace(res.workspace);
      setStatus(authStatus.AUTHENTICATED);
    } catch (err: unknown) {
      setUser(null);
      setWorkspace(null);

      // Distinguish 401 (unauthenticated) from network/500 failures (bootstrap_error)
      if (err instanceof ApiError && err.statusCode === 401) {
        setStatus(authStatus.UNAUTHENTICATED);
        setError(null);
      } else {
        setStatus(authStatus.BOOTSTRAP_ERROR);
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
      setStatus(authStatus.AUTHENTICATED);
    } catch (err) {
      setStatus(authStatus.UNAUTHENTICATED);
      setError(err instanceof Error ? err : new Error('Login failed'));
      throw err;
    }
  };

  const signup = async (email: string, password: string, firstName: string, lastName: string) => {
    setStatus(authStatus.LOADING);
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
      setStatus(authStatus.AUTHENTICATED);
    } catch (err) {
      setStatus(authStatus.UNAUTHENTICATED);
      setError(err instanceof Error ? err : new Error('Signup failed'));
      throw err;
    }
  };

  const logout = async () => {
    setStatus(authStatus.LOADING);
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore logout API network failures on client
    } finally {
      setUser(null);
      setWorkspace(null);
      setError(null);
      setStatus(authStatus.UNAUTHENTICATED);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        workspace,
        isLoading: status === authStatus.LOADING,
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
