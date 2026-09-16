import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockReturnValue(
                'postgresql://postgres:postgres@localhost:5432/outreacher_dev?schema=public',
              ),
          },
        },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should handle startup connection failure gracefully', async () => {
    jest
      .spyOn(service, '$connect')
      .mockRejectedValueOnce(new Error('Connection failed'));
    await expect(service.onModuleInit()).resolves.not.toThrow();
  });

  it('should return false on ping failure', async () => {
    jest
      .spyOn(service, '$queryRaw')
      .mockRejectedValueOnce(new Error('DB offline'));
    const isHealthy = await service.ping();
    expect(isHealthy).toBe(false);
  });

  it('should return true on ping success', async () => {
    jest.spyOn(service, '$queryRaw').mockResolvedValueOnce([{ '?column?': 1 }]);
    const isHealthy = await service.ping();
    expect(isHealthy).toBe(true);
  });
});
