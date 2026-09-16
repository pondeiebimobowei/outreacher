import { ApiClient, ApiError, normalizeApiBaseUrl } from './client';

describe('normalizeApiBaseUrl', () => {
  it('should normalize server origin without trailing slash', () => {
    expect(normalizeApiBaseUrl('http://localhost:3000')).toBe('http://localhost:3000/api/v1');
  });

  it('should strip trailing slashes from server origin', () => {
    expect(normalizeApiBaseUrl('http://localhost:3000/')).toBe('http://localhost:3000/api/v1');
    expect(normalizeApiBaseUrl('http://localhost:3000///')).toBe('http://localhost:3000/api/v1');
  });

  it('should not duplicate /api/v1 if origin already includes it', () => {
    expect(normalizeApiBaseUrl('http://localhost:3000/api/v1')).toBe(
      'http://localhost:3000/api/v1',
    );
    expect(normalizeApiBaseUrl('http://localhost:3000/api/v1/')).toBe(
      'http://localhost:3000/api/v1',
    );
  });

  it('should fallback gracefully if raw origin is empty', () => {
    expect(normalizeApiBaseUrl('')).toBe('http://localhost:3000/api/v1');
  });
});

describe('ApiClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should construct with normalized base URL', () => {
    const client = new ApiClient('http://api.example.com/');
    expect(client.getBaseUrl()).toBe('http://api.example.com/api/v1');
  });

  it('should perform GET request correctly', async () => {
    const mockResponse = { status: 'ok' };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as unknown as Response);

    const client = new ApiClient('http://localhost:3000');
    const result = await client.get('/health');

    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/health',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('should perform POST request with JSON payload', async () => {
    const mockResponse = { id: '123' };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockResponse,
    } as unknown as Response);

    const client = new ApiClient('http://localhost:3000');
    const body = { name: 'Test' };
    const result = await client.post('/test', body);

    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/test',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  });

  it('should parse structured NestJS ApiError response on HTTP failure', async () => {
    const errorPayload = {
      statusCode: 400,
      message: ['name must be a string'],
      code: 'VALIDATION_ERROR',
      error: 'Bad Request',
      timestamp: '2026-09-16T06:00:00.000Z',
      path: '/api/v1/test',
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => errorPayload,
    } as unknown as Response);

    const client = new ApiClient('http://localhost:3000');

    await expect(client.get('/test')).rejects.toThrow('name must be a string');

    try {
      await client.get('/test');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.statusCode).toBe(400);
      expect(apiErr.code).toBe('VALIDATION_ERROR');
      expect(apiErr.path).toBe('/api/v1/test');
    }
  });

  it('should capture x-request-id header as canonical correlation ID on error', async () => {
    const errorPayload = {
      statusCode: 502,
      message: 'Email provider unavailable',
      code: 'PROVIDER_FAILURE',
      requestId: 'json-fallback-id',
    };

    const mockHeaders = new Headers({
      'x-request-id': 'canonical-header-request-id-123',
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      headers: mockHeaders,
      json: async () => errorPayload,
    } as unknown as Response);

    const client = new ApiClient('http://localhost:3000');

    try {
      await client.post('/email/send', {});
      fail('Expected post to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.statusCode).toBe(502);
      expect(apiErr.code).toBe('PROVIDER_FAILURE');
      // Response header is canonical
      expect(apiErr.requestId).toBe('canonical-header-request-id-123');
    }
  });

  it('should fallback to JSON requestId when x-request-id header is absent', async () => {
    const errorPayload = {
      statusCode: 409,
      message: 'Workspace conflict',
      code: 'CONFLICT',
      requestId: 'json-fallback-id-999',
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      headers: new Headers(),
      json: async () => errorPayload,
    } as unknown as Response);

    const client = new ApiClient('http://localhost:3000');

    try {
      await client.post('/workspaces', {});
      fail('Expected post to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.requestId).toBe('json-fallback-id-999');
    }
  });

  it('should handle network connection failure as ApiError', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Failed to fetch'));

    const client = new ApiClient('http://localhost:3000');

    await expect(client.get('/health')).rejects.toThrow('Failed to fetch');
  });
});
