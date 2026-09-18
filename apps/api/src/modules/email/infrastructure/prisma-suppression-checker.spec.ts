import { PrismaService } from '../../../database/prisma.service';
import { PrismaSuppressionChecker } from './prisma-suppression-checker';

describe('PrismaSuppressionChecker', () => {
  let checker: PrismaSuppressionChecker;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      suppression: {
        findUnique: jest.fn(),
      },
    };
    checker = new PrismaSuppressionChecker(mockPrisma as PrismaService);
  });

  it('canonicalizes email with trim().toLowerCase() when querying suppression store', async () => {
    mockPrisma.suppression.findUnique.mockResolvedValue({
      id: 'sup-1',
      workspaceId: 'ws-1',
      email: 'user@example.com',
    });

    const result = await checker.isSuppressed('ws-1', '  User@Example.COM  ');

    expect(result).toBe(true);
    expect(mockPrisma.suppression.findUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_email: {
          workspaceId: 'ws-1',
          email: 'user@example.com',
        },
      },
    });
  });

  it('returns false when no suppression record is found', async () => {
    mockPrisma.suppression.findUnique.mockResolvedValue(null);

    const result = await checker.isSuppressed('ws-1', 'clean@example.com');

    expect(result).toBe(false);
    expect(mockPrisma.suppression.findUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_email: {
          workspaceId: 'ws-1',
          email: 'clean@example.com',
        },
      },
    });
  });
});
