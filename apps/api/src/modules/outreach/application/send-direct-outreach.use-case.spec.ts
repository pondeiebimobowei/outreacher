import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../database/prisma.service';
import { SendEligibilityService } from '../../email/domain/send-eligibility.service';
import { JobQueueService } from '../../../infrastructure/queue/job-queue.service';
import { SendDirectOutreachUseCase } from './send-direct-outreach.use-case';
import {
  AppValidationException,
  AppNotFoundException,
} from '../../../common/errors/application.exception';

describe('SendDirectOutreachUseCase', () => {
  let useCase: SendDirectOutreachUseCase;
  let prisma: any;
  let sendEligibilityService: any;
  let queue: any;

  beforeEach(async () => {
    prisma = {
      outreach: { findUnique: jest.fn(), update: jest.fn() },
      emailSend: { findFirst: jest.fn() },
    };
    sendEligibilityService = {
      checkOutreachEligibility: jest.fn(),
      reserveSenderCapacityAndCreateEmailSendForOutreach: jest.fn(),
    };
    queue = { enqueue: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SendDirectOutreachUseCase,
        { provide: PrismaService, useValue: prisma },
        { provide: SendEligibilityService, useValue: sendEligibilityService },
        { provide: JobQueueService, useValue: queue },
      ],
    }).compile();

    useCase = module.get(SendDirectOutreachUseCase);
  });

  it('throws AppNotFoundException if outreach is not found', async () => {
    prisma.outreach.findUnique.mockResolvedValue(null);
    await expect(useCase.execute('ws', 'o1')).rejects.toThrow(
      AppNotFoundException,
    );
  });

  it('is idempotent if already sending/sent', async () => {
    prisma.outreach.findUnique.mockResolvedValue({ id: 'o1', status: 'SENT' });
    prisma.emailSend.findFirst.mockResolvedValue({ id: 'es1', status: 'SENT' });
    const result = await useCase.execute('ws', 'o1');
    expect(result.status).toBe('SENT');
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('queues a send job if eligible', async () => {
    prisma.outreach.findUnique.mockResolvedValue({
      id: 'o1',
      status: 'DRAFT',
      currentSubject: 'Sub',
      currentBody: 'Bod',
    });
    sendEligibilityService.checkOutreachEligibility.mockResolvedValue({
      isEligible: true,
    });
    sendEligibilityService.reserveSenderCapacityAndCreateEmailSendForOutreach.mockResolvedValue(
      { emailSendId: 'es1' },
    );
    prisma.outreach.update.mockResolvedValue({ id: 'o1', status: 'SENDING' });

    await useCase.execute('ws', 'o1');

    expect(queue.enqueue).toHaveBeenCalledWith('ws', 'EMAIL_DISPATCH', {
      emailSendId: 'es1',
      outreachId: 'o1',
    });
    expect(prisma.outreach.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { status: 'SENDING' },
    });
  });
});
