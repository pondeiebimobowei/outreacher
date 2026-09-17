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
            getOrThrow: jest
              .fn()
              .mockReturnValue(
                'postgresql://user:postgres@localhost:5432/outreacher_dev?schema=public',
              ),
            get: jest
              .fn()
              .mockReturnValue(
                'postgresql://user:postgres@localhost:5432/outreacher_dev?schema=public',
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

  it('should fail fast on startup connection failure', async () => {
    jest
      .spyOn(service, '$connect')
      .mockRejectedValueOnce(new Error('Connection failed'));
    await expect(service.onModuleInit()).rejects.toThrow('Connection failed');
  });

  it('should return false on ping failure', async () => {
    jest
      .spyOn(service, '$queryRaw')
      .mockRejectedValueOnce(new Error('DB offline'));
    const isHealthy = await service.ping();
    expect(isHealthy).toBe(false);
  });

  it('should forward model delegates (user, authIdentity, workspace, workspaceMember)', () => {
    expect((service as any).user).toBeDefined();
    expect((service as any).authIdentity).toBeDefined();
    expect((service as any).workspace).toBeDefined();
    expect((service as any).workspaceMember).toBeDefined();
  });

  it('should forward $transaction calls', async () => {
    const txSpy = jest
      .spyOn(service, '$transaction')
      .mockResolvedValueOnce({ success: true });

    const callback = async () => ({ success: true });
    const result = await service.$transaction(callback);

    expect(txSpy).toHaveBeenCalledWith(callback);
    expect(result).toEqual({ success: true });
  });
});
