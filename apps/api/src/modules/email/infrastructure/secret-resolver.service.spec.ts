import { SecretResolverService } from './secret-resolver.service';
import { AppValidationException, SystemConfigurationException, SecretResolutionException } from '../../../common/errors/application.exception';

// Mock the Infisical SDK
const mockLogin = jest.fn();
const mockGetSecret = jest.fn();

jest.mock('@infisical/sdk', () => {
  return {
    InfisicalSDK: jest.fn().mockImplementation(() => {
      return {
        auth: () => ({
          universalAuth: {
            login: mockLogin,
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
    
    // Set a predictable "now" by default if needed, but for expiry we can just use Date.now() mocking
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00Z').getTime());
  });

  afterEach(() => {
    delete process.env.INFISICAL_CLIENT_ID;
    delete process.env.INFISICAL_CLIENT_SECRET;
    delete process.env.INFISICAL_PROJECT_ID;
    delete process.env.INFISICAL_ENVIRONMENT;
    jest.useRealTimers();
  });

  describe('Auth Lifecycle & Expiry', () => {
    it('should authenticate once and reuse the session for multiple resolves', async () => {
      mockLogin.mockResolvedValue({ expiresIn: 7200 });
      mockGetSecret.mockResolvedValue({ secretValue: 'resend-api-key' });

      await service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND');
      await service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND');
      await service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND');

      expect(mockLogin).toHaveBeenCalledTimes(1);
      expect(mockGetSecret).toHaveBeenCalledTimes(3);
    });

    it('should re-authenticate after token expiry', async () => {
      mockLogin.mockResolvedValue({ expiresIn: 3600 }); // 1 hour
      mockGetSecret.mockResolvedValue({ secretValue: 'resend-api-key' });

      await service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND');
      
      expect(mockLogin).toHaveBeenCalledTimes(1);
      expect(mockGetSecret).toHaveBeenCalledTimes(1);

      // Advance time by 30 minutes
      jest.advanceTimersByTime(30 * 60 * 1000);
      await service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND');
      
      expect(mockLogin).toHaveBeenCalledTimes(1); // Still reused
      expect(mockGetSecret).toHaveBeenCalledTimes(2);

      // Advance time past expiry (another 31 minutes)
      jest.advanceTimersByTime(31 * 60 * 1000);
      
      await service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND');
      
      expect(mockLogin).toHaveBeenCalledTimes(2); // Relogin triggered
      expect(mockGetSecret).toHaveBeenCalledTimes(3);
    });
    
    it('should throw SystemConfigurationException if bootstrap credentials are missing', async () => {
      delete process.env.INFISICAL_CLIENT_ID;
      await expect(service.resolve('ws-123', 'vault:///workspaces/ws-123/resend#API_KEY', 'RESEND'))
        .rejects.toThrow(SystemConfigurationException);
    });
  });

  describe('Provider Credential Mapping', () => {
    beforeEach(() => {
      mockLogin.mockResolvedValue({ expiresIn: 7200 });
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
      mockLogin.mockResolvedValue({ expiresIn: 7200 });
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
