import { SecretResolverService } from './secret-resolver.service';
import { AppValidationException, SystemConfigurationException, SecretResolutionException } from '../../../common/errors/application.exception';

const mockLogin = jest.fn();
const mockRenew = jest.fn();
const mockGetSecret = jest.fn();

jest.mock('@infisical/sdk', () => {
  return {
    InfisicalSDK: jest.fn().mockImplementation(() => {
      return {
        auth: () => ({
          universalAuth: {
            login: mockLogin,
            renew: mockRenew,
          }
        }),
        secrets: () => ({
          getSecret: mockGetSecret,
        })
      };
    })
  };
});

describe('SecretResolverService', () => {
  let service: SecretResolverService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SecretResolverService();
    process.env.INFISICAL_CLIENT_ID = 'test-client-id';
    process.env.INFISICAL_CLIENT_SECRET = 'test-client-secret';
    process.env.INFISICAL_PROJECT_ID = 'test-project-id';
    process.env.INFISICAL_ENVIRONMENT = 'test-environment';
  });

  afterEach(() => {
    delete process.env.INFISICAL_CLIENT_ID;
    delete process.env.INFISICAL_CLIENT_SECRET;
    delete process.env.INFISICAL_PROJECT_ID;
    delete process.env.INFISICAL_ENVIRONMENT;
  });

  describe('Auth Lifecycle & Opaque Recovery', () => {
    it('should authenticate once and reuse the session for multiple resolves', async () => {
      mockLogin.mockResolvedValue({});
      mockGetSecret.mockResolvedValue({ secretValue: 'resend-api-key' });

      await service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND');
      await service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND');
      await service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND');

      expect(mockLogin).toHaveBeenCalledTimes(1);
      expect(mockRenew).toHaveBeenCalledTimes(0);
      expect(mockGetSecret).toHaveBeenCalledTimes(3);
    });

    it('should recover using renew() when getSecret throws 401', async () => {
      mockLogin.mockResolvedValue({});
      mockRenew.mockResolvedValue({});
      
      mockGetSecret
        .mockRejectedValueOnce({ status: 401 }) // simulate auth failure
        .mockResolvedValueOnce({ secretValue: 'resend-api-key' }); // success on retry

      const creds = await service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND');
      
      expect(creds.apiKey).toBe('resend-api-key');
      expect(mockLogin).toHaveBeenCalledTimes(1);
      expect(mockRenew).toHaveBeenCalledTimes(1); // Triggered renew
      expect(mockGetSecret).toHaveBeenCalledTimes(2); // Initial try + retry
    });

    it('should gracefully fallback to full login() when renew() fails for 401', async () => {
      mockLogin.mockResolvedValue({});
      
      mockGetSecret
        .mockRejectedValueOnce({ status: 401 }) // simulate auth failure
        .mockResolvedValueOnce({ secretValue: 'resend-api-key' }); // success on retry

      // Make renew fail to trigger fallback
      mockRenew.mockRejectedValue(new Error('Renew failure'));

      const creds = await service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND');
      
      expect(creds.apiKey).toBe('resend-api-key');
      expect(mockRenew).toHaveBeenCalledTimes(1); // Attempted renew
      expect(mockLogin).toHaveBeenCalledTimes(2); // Fell back to login
      expect(mockGetSecret).toHaveBeenCalledTimes(2); // Initial try + retry
    });

    it('should NO renew for 404 (Secret missing)', async () => {
      mockLogin.mockResolvedValue({});
      mockGetSecret.mockRejectedValueOnce({ status: 404 });

      await expect(service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND'))
        .rejects.toThrow(SecretResolutionException);
      
      expect(mockLogin).toHaveBeenCalledTimes(1);
      expect(mockRenew).toHaveBeenCalledTimes(0); // NO renew
      expect(mockGetSecret).toHaveBeenCalledTimes(1);
    });

    it('should NO renew for 403 (Forbidden)', async () => {
      mockLogin.mockResolvedValue({});
      mockGetSecret.mockRejectedValueOnce({ status: 403 });

      await expect(service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND'))
        .rejects.toThrow(SecretResolutionException);
      
      expect(mockLogin).toHaveBeenCalledTimes(1);
      expect(mockRenew).toHaveBeenCalledTimes(0); // NO renew
      expect(mockGetSecret).toHaveBeenCalledTimes(1);
    });

    it('should NO renew for 500 (Server Error)', async () => {
      mockLogin.mockResolvedValue({});
      mockGetSecret.mockRejectedValueOnce({ status: 500 });

      await expect(service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND'))
        .rejects.toThrow(SecretResolutionException);
      
      expect(mockLogin).toHaveBeenCalledTimes(1);
      expect(mockRenew).toHaveBeenCalledTimes(0); // NO renew
      expect(mockGetSecret).toHaveBeenCalledTimes(1);
    });

    it('should NO renew for arbitrary network failure', async () => {
      mockLogin.mockResolvedValue({});
      mockGetSecret.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND'))
        .rejects.toThrow(SecretResolutionException);
      
      expect(mockLogin).toHaveBeenCalledTimes(1);
      expect(mockRenew).toHaveBeenCalledTimes(0); // NO renew
      expect(mockGetSecret).toHaveBeenCalledTimes(1);
    });
    
    it('should manage concurrent 401 auth recovery correctly (only one renew call)', async () => {
      mockLogin.mockResolvedValue({});
      
      // We'll delay renew slightly to simulate concurrency pileup
      mockRenew.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));

      // Warmup should succeed directly
      mockGetSecret.mockResolvedValueOnce({ secretValue: 'resend-api-key' });

      // Then 3 failures for the concurrent calls
      mockGetSecret.mockRejectedValueOnce({ status: 401 });
      mockGetSecret.mockRejectedValueOnce({ status: 401 });
      mockGetSecret.mockRejectedValueOnce({ status: 401 });
      
      // Then all succeed on retry
      mockGetSecret.mockResolvedValue({ secretValue: 'resend-api-key' }); 

      // First warm it up so client is initialized
      await service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND');
      
      // Now trigger 3 concurrent resolves that will all fail getSecret
      const promises = [
        service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND'),
        service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND'),
        service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND')
      ];

      await Promise.all(promises);

      expect(mockLogin).toHaveBeenCalledTimes(1); // Only the initial warmup login
      expect(mockRenew).toHaveBeenCalledTimes(1); // Exactly one renew despite 3 concurrent failures
      expect(mockGetSecret).toHaveBeenCalledTimes(1 + 3 + 3); // 1 warmup + 3 failures + 3 retries
    });
    
    it('should NOT manage concurrent non-auth failures with recovery (no renew call)', async () => {
      mockLogin.mockResolvedValue({});

      // Warmup should succeed directly
      mockGetSecret.mockResolvedValueOnce({ secretValue: 'resend-api-key' });

      // Then 3 non-auth failures
      mockGetSecret.mockRejectedValueOnce({ status: 500 });
      mockGetSecret.mockRejectedValueOnce({ status: 503 });
      mockGetSecret.mockRejectedValueOnce(new Error('Network Exploded'));
      
      // First warm it up so client is initialized
      await service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND');
      
      // Now trigger 3 concurrent resolves that will all fail getSecret
      const promises = [
        service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND').catch(e => e),
        service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND').catch(e => e),
        service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND').catch(e => e)
      ];

      await Promise.all(promises);

      expect(mockLogin).toHaveBeenCalledTimes(1); // Only the initial warmup login
      expect(mockRenew).toHaveBeenCalledTimes(0); // NO renew
      expect(mockGetSecret).toHaveBeenCalledTimes(1 + 3); // 1 warmup + 3 failures, no retries
    });
    
    it('should throw SystemConfigurationException if bootstrap credentials are missing', async () => {
      delete process.env.INFISICAL_CLIENT_ID;
      await expect(service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND'))
        .rejects.toThrow(SystemConfigurationException);
    });
  });

  describe('Provider Credential Mapping', () => {
    beforeEach(() => {
      mockLogin.mockResolvedValue({});
    });

    it('should map RESEND correctly', async () => {
      mockGetSecret.mockResolvedValue({ secretValue: 'resend-key-123' });
      const creds = await service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND');
      
      expect(mockGetSecret).toHaveBeenCalledWith({
        environment: 'test-environment',
        projectId: 'test-project-id',
        path: '/workspaces/ws-123/resend',
        secretName: 'API_KEY'
      });
      expect(creds).toEqual({ provider: 'RESEND', apiKey: 'resend-key-123' });
    });

    it('should map SES correctly', async () => {
      const payload = JSON.stringify({ accessKeyId: 'AKIA', secretAccessKey: 'SECRET', region: 'us-east-1' });
      mockGetSecret.mockResolvedValue({ secretValue: payload });
      const creds = await service.resolve('ws-123', 'vault:///workspaces/ws-123/ses#API_KEY', 'SES');
      
      expect(creds).toEqual({
        provider: 'SES',
        accessKeyId: 'AKIA',
        secretAccessKey: 'SECRET',
        region: 'us-east-1'
      });
    });

    it('should map SMTP correctly', async () => {
      const payload = JSON.stringify({ host: 'smtp.mail.com', port: 587, user: 'user1', pass: 'pass1', secure: false });
      mockGetSecret.mockResolvedValue({ secretValue: payload });
      const creds = await service.resolve('ws-123', 'vault:///workspaces/ws-123/smtp#API_KEY', 'SMTP');
      
      expect(creds).toEqual({
        provider: 'SMTP',
        host: 'smtp.mail.com',
        port: 587,
        user: 'user1',
        pass: 'pass1',
        secure: false
      });
    });
  });

  describe('Vault parsing and security boundaries', () => {
    beforeEach(() => {
      mockLogin.mockResolvedValue({});
      mockGetSecret.mockResolvedValue({ secretValue: 'key' });
    });

    it('should REJECT unsupported formats generically without leaking reference', async () => {
      await expect(service.resolve('ws-123', 'invalid://format', 'SMTP'))
        .rejects.toThrow(new AppValidationException('Unsupported secret reference format'));
    });

    it('should REJECT /workspaces/ws-1234/... for ws-123', async () => {
      await expect(service.resolve('ws-123', 'vault:///workspaces/ws-1234/integrations/i-456#API_KEY', 'SMTP'))
        .rejects.toThrow(AppValidationException);
    });

    it('should REJECT arbitrary other paths', async () => {
      await expect(service.resolve('ws-123', 'vault:///other/integrations/i-456#API_KEY', 'SMTP'))
        .rejects.toThrow(AppValidationException);
    });

    it('should REJECT paths with prefix spoofing', async () => {
      await expect(service.resolve('ws-123', 'vault:///other-prefix/workspaces/ws-123/integrations/i-456#API_KEY', 'SMTP'))
        .rejects.toThrow(AppValidationException);
    });

    it('should REJECT exact workspace match but missing trailing slash', async () => {
      await expect(service.resolve('ws-123', 'vault:///workspaces/ws-123#API_KEY', 'SMTP'))
        .rejects.toThrow(AppValidationException);
    });

    it('should REJECT empty path', async () => {
      await expect(service.resolve('ws-123', 'vault://#API_KEY', 'SMTP'))
        .rejects.toThrow(AppValidationException);
    });

    it('should REJECT empty secretName', async () => {
      await expect(service.resolve('ws-123', 'vault:///workspaces/ws-123/integrations/i-456#', 'SMTP'))
        .rejects.toThrow(AppValidationException);
    });

    it('should REJECT whitespace secretName', async () => {
      await expect(service.resolve('ws-123', 'vault:///workspaces/ws-123/integrations/i-456#   ', 'SMTP'))
        .rejects.toThrow(AppValidationException);
    });

    it('should REJECT paths with traversal (..)', async () => {
      await expect(service.resolve('ws-123', 'vault:///workspaces/ws-123/../other#API_KEY', 'SMTP'))
        .rejects.toThrow(AppValidationException);
    });

    it('should REJECT paths with backslashes', async () => {
      await expect(service.resolve('ws-123', 'vault:///workspaces/ws-123\\other#API_KEY', 'SMTP'))
        .rejects.toThrow(AppValidationException);
    });

    it('should REJECT paths with consecutive forward slashes', async () => {
      await expect(service.resolve('ws-123', 'vault:///workspaces/ws-123//other#API_KEY', 'SMTP'))
        .rejects.toThrow(AppValidationException);
    });
  });
});
