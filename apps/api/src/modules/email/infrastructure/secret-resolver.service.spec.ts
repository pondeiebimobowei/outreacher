import { SecretResolverService } from './secret-resolver.service';
import { AppValidationException } from '../../../common/errors/application.exception';

describe('SecretResolverService', () => {
  let service: SecretResolverService;

  beforeEach(() => {
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

  describe('Vault parsing and security boundaries', () => {
    it('should PASS a valid workspace path', async () => {
      // It will throw SecretResolutionException because the mock SDK call will fail or SDK won't find it,
      // but it should NOT throw AppValidationException for validation.
      await expect(service.resolve('ws-123', 'vault:///workspaces/ws-123/integrations/i-456#API_KEY', 'SMTP'))
        .rejects.toThrow('SecretResolutionException');
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
      // Technically split array will fail if length !== 2, let's provide a valid grammar but invalid path
      await expect(service.resolve('ws-123', 'vault:///workspaces/ws-123#API_KEY', 'SMTP'))
        .rejects.toThrow(AppValidationException);
    });

    it('should REJECT empty path', async () => {
      await expect(service.resolve('ws-123', 'vault://#API_KEY', 'SMTP'))
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
