import { ConflictException, NotFoundException } from '@nestjs/common';
import { ResumeOutreachUseCase } from './resume-outreach.use-case';
import { AppUnprocessableEntityException } from '../../../common/errors/application.exception';

describe('ResumeOutreachUseCase', () => {
  let useCase: ResumeOutreachUseCase;
  let prismaMock: any;

  const workspaceId = 'ws-1';
  const outreachId = 'out-1';
  const pcaId = 'pca-1';

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn(async (cb) => cb(prismaMock)),
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      outreach: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      emailSend: {
        findMany: jest.fn(),
      },
      suppression: {
        findUnique: jest.fn(),
      },
      personCompanyAssociation: {
        findUnique: jest.fn(),
      },
      job: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    useCase = new ResumeOutreachUseCase(prismaMock);
  });

  it('resumes a PAUSED outreach to ACTIVE when initial send was completed, and reopens CANCELLED(PAUSED) jobs', async () => {
    prismaMock.outreach.findFirst.mockResolvedValue({
      id: outreachId,
      workspaceId,
      status: 'PAUSED',
      personCompanyAssociationId: pcaId,
      personCompanyAssociation: {
        id: pcaId,
        conversationState: 'ACTIVE',
        workEmail: 'lead@example.com',
        person: { email: 'lead@example.com' },
      },
    });

    prismaMock.$queryRaw.mockResolvedValue([{ id: pcaId }]);
    prismaMock.suppression.findUnique.mockResolvedValue(null);

    // Initial send was sent
    prismaMock.emailSend.findMany.mockResolvedValue([
      { id: 'es-1', sequence: 0, status: 'SENT' },
    ]);

    prismaMock.outreach.update.mockResolvedValue({
      id: outreachId,
      status: 'ACTIVE',
    });

    const result = await useCase.execute(workspaceId, outreachId);

    expect(result.status).toBe('ACTIVE');
    expect(prismaMock.outreach.update).toHaveBeenCalledWith({
      where: { id: outreachId },
      data: { status: 'ACTIVE' },
    });

    // Reopens CANCELLED(PAUSED) jobs
    expect(prismaMock.$executeRaw).toHaveBeenCalled();
  });

  it('resumes a PAUSED outreach to APPROVED when initial send was not sent yet', async () => {
    prismaMock.outreach.findFirst.mockResolvedValue({
      id: outreachId,
      workspaceId,
      status: 'PAUSED',
      personCompanyAssociationId: pcaId,
      personCompanyAssociation: {
        id: pcaId,
        conversationState: 'NO_REPLY',
        workEmail: 'lead@example.com',
        person: { email: 'lead@example.com' },
      },
    });

    prismaMock.$queryRaw.mockResolvedValue([{ id: pcaId }]);
    prismaMock.suppression.findUnique.mockResolvedValue(null);

    // No sent email
    prismaMock.emailSend.findMany.mockResolvedValue([]);

    prismaMock.outreach.update.mockResolvedValue({
      id: outreachId,
      status: 'APPROVED',
    });

    const result = await useCase.execute(workspaceId, outreachId);

    expect(result.status).toBe('APPROVED');
    expect(prismaMock.outreach.update).toHaveBeenCalledWith({
      where: { id: outreachId },
      data: { status: 'APPROVED' },
    });
  });

  it('strictly refuses to reopen jobs with cancellation_reason = SUPPRESSED', async () => {
    prismaMock.outreach.findFirst.mockResolvedValue({
      id: outreachId,
      workspaceId,
      status: 'PAUSED',
      personCompanyAssociationId: pcaId,
      personCompanyAssociation: {
        id: pcaId,
        conversationState: 'ACTIVE',
        workEmail: 'lead@example.com',
        person: { email: 'lead@example.com' },
      },
    });

    prismaMock.$queryRaw.mockResolvedValue([{ id: pcaId }]);
    prismaMock.suppression.findUnique.mockResolvedValue(null);
    prismaMock.emailSend.findMany.mockResolvedValue([
      { id: 'es-1', sequence: 0, status: 'SENT' },
    ]);
    prismaMock.outreach.update.mockResolvedValue({
      id: outreachId,
      status: 'ACTIVE',
    });

    await useCase.execute(workspaceId, outreachId);

    // The update statement MUST ONLY reopen jobs where cancellation_reason = 'PAUSED', NOT 'SUPPRESSED'
    expect(prismaMock.$executeRaw).toHaveBeenCalled();
    const queryArg = prismaMock.$executeRaw.mock.calls[0][0];
    const rawSqlString = typeof queryArg === 'string' ? queryArg : queryArg.strings ? queryArg.strings.join('') : JSON.stringify(queryArg);
    expect(rawSqlString).toContain("'PAUSED'");
    expect(rawSqlString).not.toContain("cancellation_reason = 'SUPPRESSED'");
  });

  it('throws AppUnprocessableEntityException if PCA is STOPPED or contact is suppressed', async () => {
    prismaMock.outreach.findFirst.mockResolvedValue({
      id: outreachId,
      workspaceId,
      status: 'PAUSED',
      personCompanyAssociationId: pcaId,
      personCompanyAssociation: {
        id: pcaId,
        conversationState: 'STOPPED',
        workEmail: 'lead@example.com',
        person: { email: 'lead@example.com' },
      },
    });

    prismaMock.$queryRaw.mockResolvedValue([{ id: pcaId }]);

    await expect(
      useCase.execute(workspaceId, outreachId),
    ).rejects.toThrow(AppUnprocessableEntityException);

    expect(prismaMock.outreach.update).not.toHaveBeenCalled();
  });

  describe('Campaign-linked Outreach Resume Rules', () => {
    const campaignId = 'camp-1';
    const recipientId = 'recip-1';

    const mockCampaignOutreach = (campaignStatus: string, recipientStatus: string) => ({
      id: outreachId,
      workspaceId,
      status: 'PAUSED',
      personCompanyAssociationId: pcaId,
      campaignRecipientId: recipientId,
      personCompanyAssociation: {
        id: pcaId,
        conversationState: 'ACTIVE',
        workEmail: 'lead@example.com',
        person: { email: 'lead@example.com' },
      },
      campaignRecipient: {
        id: recipientId,
        campaignId,
        status: recipientStatus,
        campaign: { id: campaignId, status: campaignStatus },
      },
    });

    it('rejects resume if Campaign is PAUSED (cannot bypass campaign pause)', async () => {
      prismaMock.outreach.findFirst.mockResolvedValue(
        mockCampaignOutreach('PAUSED', 'PAUSED'),
      );
      prismaMock.campaign = { findUnique: jest.fn().mockResolvedValue({ id: campaignId, status: 'PAUSED' }) };
      prismaMock.campaignRecipient = { findUnique: jest.fn().mockResolvedValue({ id: recipientId, status: 'PAUSED' }) };

      await expect(
        useCase.execute(workspaceId, outreachId),
      ).rejects.toThrow(ConflictException);

      expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
      expect(prismaMock.outreach.update).not.toHaveBeenCalled();
    });

    it('rejects resume if CampaignRecipient is in terminal/ineligible status (COMPLETED, SUPPRESSED, FAILED, REMOVED)', async () => {
      for (const ineligibleStatus of ['COMPLETED', 'SUPPRESSED', 'FAILED', 'REMOVED']) {
        prismaMock.outreach.findFirst.mockResolvedValue(
          mockCampaignOutreach('ACTIVE', ineligibleStatus),
        );
        prismaMock.campaign = { findUnique: jest.fn().mockResolvedValue({ id: campaignId, status: 'ACTIVE' }) };
        prismaMock.campaignRecipient = { findUnique: jest.fn().mockResolvedValue({ id: recipientId, status: ineligibleStatus }) };

        await expect(
          useCase.execute(workspaceId, outreachId),
        ).rejects.toThrow(ConflictException);
      }
    });

    it('succeeds when Campaign is ACTIVE and Recipient was PAUSED (restores recipient and jobs)', async () => {
      prismaMock.outreach.findFirst.mockResolvedValue(
        mockCampaignOutreach('ACTIVE', 'PAUSED'),
      );
      prismaMock.campaign = { findUnique: jest.fn().mockResolvedValue({ id: campaignId, status: 'ACTIVE' }) };
      prismaMock.campaignRecipient = {
        findUnique: jest.fn().mockResolvedValue({ id: recipientId, status: 'PAUSED' }),
        update: jest.fn().mockResolvedValue({ id: recipientId, status: 'ACTIVE' }),
      };
      prismaMock.$queryRaw.mockResolvedValue([{ id: campaignId }]);
      prismaMock.suppression.findUnique.mockResolvedValue(null);
      prismaMock.emailSend.findMany.mockResolvedValue([
        { id: 'es-1', sequence: 0, status: 'SENT' },
      ]);
      prismaMock.outreach.update.mockResolvedValue({
        id: outreachId,
        status: 'ACTIVE',
      });

      const result = await useCase.execute(workspaceId, outreachId);

      expect(result.status).toBe('ACTIVE');
      expect(prismaMock.campaignRecipient.update).toHaveBeenCalledWith({
        where: { id: recipientId },
        data: { status: 'ACTIVE' },
      });
      expect(prismaMock.$executeRaw).toHaveBeenCalled();
    });
  });
});
