import { Test, TestingModule } from '@nestjs/testing';
import {
  AppConflictException,
  AppValidationException,
} from '../../common/errors/application.exception';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { SendEmailUseCase } from './application/send-email.use-case';
import { EmailController } from './email.controller';

describe('EmailController', () => {
  let controller: EmailController;
  let mockSendEmailUseCase: { execute: jest.Mock };

  beforeEach(async () => {
    mockSendEmailUseCase = {
      execute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailController],
      providers: [
        {
          provide: SendEmailUseCase,
          useValue: mockSendEmailUseCase,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(WorkspaceGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EmailController>(EmailController);
  });

  it('delegates POST /api/v1/campaign-contacts/:id/send to SendEmailUseCase with trimmed idempotency key', async () => {
    mockSendEmailUseCase.execute.mockResolvedValue({
      jobId: 'job-999',
      message: 'Dispatch enqueued',
    });

    const result = await controller.sendEmail(
      { id: 'ws-123' },
      'cc-456',
      '  key-abc-123  ',
    );

    expect(result).toEqual({
      jobId: 'job-999',
      message: 'Dispatch enqueued',
    });
    expect(mockSendEmailUseCase.execute).toHaveBeenCalledWith({
      workspaceId: 'ws-123',
      campaignContactId: 'cc-456',
      clientKey: 'key-abc-123',
    });
  });

  it('throws AppValidationException when Idempotency-Key header is missing', async () => {
    await expect(
      controller.sendEmail({ id: 'ws-123' }, 'cc-456', undefined),
    ).rejects.toThrow(
      new AppValidationException('Missing required Idempotency-Key header'),
    );

    expect(mockSendEmailUseCase.execute).not.toHaveBeenCalled();
  });

  it('throws AppValidationException when Idempotency-Key header is empty string or only whitespace', async () => {
    await expect(
      controller.sendEmail({ id: 'ws-123' }, 'cc-456', '   '),
    ).rejects.toThrow(
      new AppValidationException('Missing required Idempotency-Key header'),
    );

    expect(mockSendEmailUseCase.execute).not.toHaveBeenCalled();
  });

  it('propagates domain/conflict exceptions thrown by SendEmailUseCase', async () => {
    mockSendEmailUseCase.execute.mockRejectedValue(
      new AppConflictException('Contact already sending'),
    );

    await expect(
      controller.sendEmail({ id: 'ws-123' }, 'cc-456', 'key-123'),
    ).rejects.toThrow(AppConflictException);
  });
});
