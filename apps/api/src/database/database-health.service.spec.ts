import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseHealthService } from './database-health.service';
import { PrismaService } from './prisma.service';

describe('DatabaseHealthService', () => {
  let service: DatabaseHealthService;
  let prismaService: jest.Mocked<Partial<PrismaService>>;

  beforeEach(async () => {
    prismaService = {
      ping: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseHealthService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
      ],
    }).compile();

    service = module.get<DatabaseHealthService>(DatabaseHealthService);
  });

  it('should return UP when prisma ping succeeds', async () => {
    (prismaService.ping as jest.Mock).mockResolvedValueOnce(true);

    const result = await service.checkHealth();
    expect(result).toEqual({ status: 'UP' });
  });

  it('should return DOWN with safe message when ping returns false', async () => {
    (prismaService.ping as jest.Mock).mockResolvedValueOnce(false);

    const result = await service.checkHealth();
    expect(result).toEqual({
      status: 'DOWN',
      message: 'Database unavailable',
    });
  });

  it('should return DOWN with safe message and mask raw error details when ping throws', async () => {
    (prismaService.ping as jest.Mock).mockRejectedValueOnce(
      new Error(
        'Sensitive DB credentials error at postgresql://user:pass@host:5432/db',
      ),
    );

    const result = await service.checkHealth();
    expect(result).toEqual({
      status: 'DOWN',
      message: 'Database unavailable',
    });
    expect(result.message).not.toContain('user:pass');
  });
});
