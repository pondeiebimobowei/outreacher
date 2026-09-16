import { webEnv } from '../config/env.config';

export interface ApiErrorResponse {
  statusCode?: number;
  message?: string | string[];
  code?: string;
  error?: string;
  requestId?: string;
  timestamp?: string;
  path?: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly errorDetails?: string;
  public readonly path?: string;
  public readonly requestId?: string;
  public readonly rawMessage: string | string[];

  constructor(
    status: number,
    data?: ApiErrorResponse | null,
    defaultMsg?: string,
    headerRequestId?: string | null,
  ) {
    const rawMsg = data?.message ?? defaultMsg ?? 'An unexpected network error occurred';
    const displayMessage = Array.isArray(rawMsg) ? rawMsg.join(', ') : rawMsg;
    super(displayMessage);
    this.name = 'ApiError';
    this.statusCode = status;
    this.code = data?.code ?? 'UNKNOWN_ERROR';
    this.errorDetails = data?.error;
    this.path = data?.path;
    // Canonical source: response header x-request-id; fallback: response JSON requestId
    this.requestId = headerRequestId || data?.requestId || undefined;
    this.rawMessage = rawMsg;
  }
}

export function normalizeApiBaseUrl(rawOrigin: string): string {
  if (!rawOrigin || typeof rawOrigin !== 'string') {
    return 'http://localhost:3000/api/v1';
  }

  let cleaned = rawOrigin.trim();
  while (cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }

  if (cleaned.endsWith('/api/v1')) {
    return cleaned;
  }

  return `${cleaned}/api/v1`;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export class ApiClient {
  private readonly baseUrl: string;

  constructor(origin: string = webEnv.VITE_API_URL) {
    this.baseUrl = normalizeApiBaseUrl(origin);
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${this.baseUrl}${normalizedPath}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const config: RequestInit = {
      ...options,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    };

    let response: Response;
    try {
      response = await fetch(url, config);
    } catch (err) {
      throw new ApiError(0, null, err instanceof Error ? err.message : 'Network failure');
    }

    if (!response.ok) {
      let errorData: ApiErrorResponse | null = null;
      try {
        errorData = (await response.json()) as ApiErrorResponse;
      } catch {
        // Fallback for non-JSON error bodies
      }
      const headerRequestId = response.headers?.get?.('x-request-id');
      throw new ApiError(
        response.status,
        errorData,
        `HTTP ${response.status} ${response.statusText}`,
        headerRequestId,
      );
    }

    if (response.status === 24) {
      return undefined as T;
    }

    try {
      return (await response.json()) as T;
    } catch {
      return undefined as T;
    }
  }

  public async get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  public async post<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  public async put<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  public async patch<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  public async delete<T>(
    path: string,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
