import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseHealthService } from '../database/database-health.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let databaseHealthService: jest.Mocked<Partial<DatabaseHealthService>>;

  beforeEach(async () => {
    databaseHealthService = {
      checkHealth: jest.fn().mockResolvedValue({ status: 'UP' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DatabaseHealthService,
          useValue: databaseHealthService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return health status including database service readiness', async () => {
    const result = await controller.getHealth();
    expect(result.status).toBe('ok');
    expect(result.services.database).toEqual({ status: 'UP' });
  });
});
