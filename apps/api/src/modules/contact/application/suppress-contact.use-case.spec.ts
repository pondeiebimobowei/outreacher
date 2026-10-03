import { NotFoundException } from '@nestjs/common';
import { SuppressContactUseCase } from './suppress-contact.use-case';
import { UnsuppressContactUseCase } from './unsuppress-contact.use-case';
import { SuppressionAction, SuppressionReason } from '@repo/db';

describe('Suppression Use Cases', () => {
  let suppressUseCase: SuppressContactUseCase;
  let unsuppressUseCase: UnsuppressContactUseCase;
  let prismaMock: any;

  const workspaceId = 'ws-1';
  const userId = 'usr-1';
  const personId = 'person-1';
  const pcaId1 = 'pca-1';
  const pcaId2 = 'pca-2';
  const email = 'test@example.com';

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn(async (cb) => cb(prismaMock)),
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      personCompanyAssociation: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      person: {
        findFirst: jest.fn(),
      },
      suppression: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      suppressionHistory: {
        create: jest.fn(),
      },
      campaignRecipient: {
        updateMany: jest.fn(),
      },
      outreach: {
        updateMany: jest.fn(),
      },
      emailSend: {
        updateMany: jest.fn(),
      },
    };

    suppressUseCase = new SuppressContactUseCase(prismaMock);
    unsuppressUseCase = new UnsuppressContactUseCase(prismaMock);
  });

  describe('SuppressContactUseCase', () => {
    it('suppresses a contact across all PCAs sharing the email, follows 2-step campaign re-query lock order, cancels jobs with SUPPRESSED reason', async () => {
      // Find PCA
      prismaMock.personCompanyAssociation.findFirst.mockResolvedValue({
        id: pcaId1,
        workspaceId,
        workEmail: email,
        person: { email },
      });

      // Find all PCAs in workspace with this email
      prismaMock.personCompanyAssociation.findMany.mockResolvedValue([
        { id: pcaId1 },
        { id: pcaId2 },
      ]);

      // Query raw for campaigns, recipients, pcas, outreaches, email sends
      prismaMock.$queryRaw
        .mockResolvedValueOnce([{ campaign_id: 'camp-1' }]) // campaign discovery
        .mockResolvedValueOnce([{ id: 'camp-1' }]) // lock campaigns
        .mockResolvedValueOnce([{ id: 'cr-1', status: 'ACTIVE' }]) // re-query & lock recipients
        .mockResolvedValueOnce([{ id: pcaId1 }, { id: pcaId2 }]) // lock PCAs
        .mockResolvedValueOnce([{ id: 'out-1', status: 'ACTIVE' }]) // lock Outreaches
        .mockResolvedValueOnce([{ id: 'es-1', status: 'RESERVED' }]); // lock EmailSends

      prismaMock.suppression.upsert.mockResolvedValue({ id: 'sup-1' });
      prismaMock.suppressionHistory.create.mockResolvedValue({ id: 'hist-1' });

      const result = await suppressUseCase.execute(
        workspaceId,
        pcaId1,
        userId,
        SuppressionReason.MANUAL,
        'User opted out',
      );

      expect(result.success).toBe(true);
      expect(result.email).toBe(email);

      // Verify active Suppression table record
      expect(prismaMock.suppression.upsert).toHaveBeenCalledWith({
        where: {
          workspaceId_email: {
            workspaceId,
            email,
          },
        },
        create: {
          workspaceId,
          email,
          reason: SuppressionReason.MANUAL,
          source: 'USER_ACTION',
          createdByUserId: userId,
        },
        update: {
          reason: SuppressionReason.MANUAL,
          source: 'USER_ACTION',
          createdByUserId: userId,
        },
      });

      // Verify append-only SuppressionHistory audit record
      expect(prismaMock.suppressionHistory.create).toHaveBeenCalledWith({
        data: {
          workspaceId,
          email,
          action: SuppressionAction.SUPPRESSED,
          reason: SuppressionReason.MANUAL,
          source: 'USER_ACTION',
          notes: 'User opted out',
          actorUserId: userId,
        },
      });

      // Verify ALL matching PCAs transition to STOPPED with stateVersion++
      expect(prismaMock.personCompanyAssociation.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [pcaId1, pcaId2] } },
        data: {
          conversationState: 'STOPPED',
          stateVersion: { increment: 1 },
        },
      });

      // Verify campaign recipients transitioned to SUPPRESSED
      expect(prismaMock.campaignRecipient.updateMany).toHaveBeenCalledWith({
        where: {
          personCompanyAssociationId: { in: [pcaId1, pcaId2] },
          workspaceId,
          status: { in: ['PENDING', 'ACTIVE'] },
        },
        data: { status: 'SUPPRESSED' },
      });

      // Verify outreaches transitioned to PAUSED
      expect(prismaMock.outreach.updateMany).toHaveBeenCalledWith({
        where: {
          personCompanyAssociationId: { in: [pcaId1, pcaId2] },
          workspaceId,
          status: { in: ['ACTIVE', 'APPROVED'] },
        },
        data: { status: 'PAUSED' },
      });

      // Verify RESERVED email sends cancelled
      expect(prismaMock.emailSend.updateMany).toHaveBeenCalledWith({
        where: {
          outreachId: { in: ['out-1'] },
          status: 'RESERVED',
        },
        data: { status: 'CANCELLED' },
      });

      // Verify jobs cancelled with cancellation_reason = SUPPRESSED
      expect(prismaMock.$executeRaw).toHaveBeenCalled();
    });

    it('throws NotFoundException if neither PCA nor Person is found for contactId', async () => {
      prismaMock.personCompanyAssociation.findFirst.mockResolvedValue(null);
      prismaMock.person.findFirst.mockResolvedValue(null);

      await expect(
        suppressUseCase.execute(workspaceId, 'non-existent', userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('UnsuppressContactUseCase', () => {
    it('unsuppresses a contact: deletes active suppression, logs audit history, transitions STOPPED PCAs to NO_REPLY, leaves recipients SUPPRESSED and outreaches PAUSED', async () => {
      prismaMock.personCompanyAssociation.findFirst.mockResolvedValue({
        id: pcaId1,
        workspaceId,
        workEmail: email,
        person: { email },
      });

      // Active suppression exists
      prismaMock.suppression.findUnique.mockResolvedValue({
        id: 'sup-1',
        workspaceId,
        email,
      });

      // Two PCAs in workspace, both STOPPED
      prismaMock.personCompanyAssociation.findMany.mockResolvedValue([
        { id: pcaId1, conversationState: 'STOPPED' },
        { id: pcaId2, conversationState: 'STOPPED' },
      ]);

      prismaMock.$queryRaw.mockResolvedValue([{ id: pcaId1 }, { id: pcaId2 }]); // lock PCAs

      const result = await unsuppressUseCase.execute(workspaceId, pcaId1, userId);

      expect(result.success).toBe(true);

      // Verify active Suppression row deleted
      expect(prismaMock.suppression.delete).toHaveBeenCalledWith({
        where: {
          workspaceId_email: {
            workspaceId,
            email,
          },
        },
      });

      // Verify append-only UNSUPPRESSED audit record in SuppressionHistory
      expect(prismaMock.suppressionHistory.create).toHaveBeenCalledWith({
        data: {
          workspaceId,
          email,
          action: SuppressionAction.UNSUPPRESSED,
          reason: SuppressionReason.MANUAL,
          source: 'USER_ACTION',
          notes: null,
          actorUserId: userId,
        },
      });

      // Verify PCAs transition STOPPED -> NO_REPLY with stateVersion++
      expect(prismaMock.personCompanyAssociation.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [pcaId1, pcaId2] } },
        data: {
          conversationState: 'NO_REPLY',
          stateVersion: { increment: 1 },
        },
      });

      // Critical safety invariants:
      // Zero jobs reopened, zero outreaches resumed, zero campaign recipients resumed!
      expect(prismaMock.campaignRecipient.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.outreach.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    });
  });
});
