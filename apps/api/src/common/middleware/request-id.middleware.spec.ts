import { Request, Response } from 'express';
import {
  isValidRequestId,
  RequestIdMiddleware,
  REQUEST_ID_HEADER,
} from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;
  let setHeaderMock: jest.Mock;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
    setHeaderMock = jest.fn();
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      setHeader: setHeaderMock,
    };
    nextFunction = jest.fn();
  });

  describe('isValidRequestId', () => {
    it('should validate valid alphanumeric, dot, underscore, and dash IDs', () => {
      expect(isValidRequestId('req-123.456_abc')).toBe(true);
      expect(isValidRequestId('a'.repeat(128))).toBe(true);
    });

    it('should reject non-string, empty string, or oversized strings', () => {
      expect(isValidRequestId('')).toBe(false);
      expect(isValidRequestId(null)).toBe(false);
      expect(isValidRequestId(undefined)).toBe(false);
      expect(isValidRequestId('a'.repeat(129))).toBe(false);
    });

    it('should reject hostile strings with newlines or control characters', () => {
      expect(isValidRequestId('attacker\nERROR fake log')).toBe(false);
      expect(isValidRequestId('attacker\r\nSet-Cookie: evil')).toBe(false);
      expect(isValidRequestId('<script>alert(1)</script>')).toBe(false);
      expect(isValidRequestId('id with spaces')).toBe(false);
    });
  });

  describe('use', () => {
    it('should generate a valid UUID when x-request-id header is absent', () => {
      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(mockRequest.requestId).toBeDefined();
      expect(mockRequest.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(setHeaderMock).toHaveBeenCalledWith(
        REQUEST_ID_HEADER,
        mockRequest.requestId,
      );
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should preserve a valid incoming x-request-id', () => {
      const validId = 'client-req-999_valid.1';
      mockRequest.headers = { [REQUEST_ID_HEADER]: validId };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(mockRequest.requestId).toBe(validId);
      expect(setHeaderMock).toHaveBeenCalledWith(REQUEST_ID_HEADER, validId);
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should reject a hostile incoming x-request-id and replace with fresh UUID', () => {
      const hostileId = 'attacker\nERROR fake-entry-123';
      mockRequest.headers = { [REQUEST_ID_HEADER]: hostileId };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(mockRequest.requestId).not.toBe(hostileId);
      expect(mockRequest.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(setHeaderMock).toHaveBeenCalledWith(
        REQUEST_ID_HEADER,
        mockRequest.requestId,
      );
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should always overwrite response header with req.requestId', () => {
      mockRequest.headers = { [REQUEST_ID_HEADER]: 'safe-client-id' };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect(setHeaderMock).toHaveBeenCalledWith(
        REQUEST_ID_HEADER,
        mockRequest.requestId,
      );
    });
  });
});
