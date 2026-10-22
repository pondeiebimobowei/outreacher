export enum AuthProvider {
  PASSWORD = 'PASSWORD',
  GOOGLE = 'GOOGLE',
}

export enum WorkspaceRole {
  OWNER = 'OWNER',
}

export enum CompanyStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum ResearchRunStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
}

export enum OpportunityType {
  CONFIRMED = 'CONFIRMED',
  PROACTIVE = 'PROACTIVE',
  UNCLASSIFIED = 'UNCLASSIFIED',
}

export enum OpportunityStatus {
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  SUPERSEDED = 'SUPERSEDED',
}

export enum EvidenceClassification {
  FACT = 'FACT',
  INFERENCE = 'INFERENCE',
  UNKNOWN = 'UNKNOWN',
}

export enum PersonKind {
  PERSON = 'PERSON',
  ROLE_ADDRESS = 'ROLE_ADDRESS',
}

export enum JobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
}

export enum CampaignStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

export enum CampaignMemberStatus {
  PENDING = 'PENDING',
  READY = 'READY',
  SCHEDULED = 'SCHEDULED',
  SENDING = 'SENDING',
  SENT = 'SENT',
  FOLLOW_UP_DUE = 'FOLLOW_UP_DUE',
  REPLIED = 'REPLIED',
  COMPLETED = 'COMPLETED',
  SUPPRESSED = 'SUPPRESSED',
  FAILED = 'FAILED',
  ARCHIVED = 'ARCHIVED',
}

export enum EmailSendType {
  INITIAL = 'INITIAL',
  FOLLOW_UP = 'FOLLOW_UP',
}

export enum EmailSendStatus {
  PENDING = 'PENDING',
  RESERVED = 'RESERVED',
  SENDING = 'SENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum EmailEventType {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  OPENED = 'OPENED',
  CLICKED = 'CLICKED',
  BOUNCED = 'BOUNCED',
  COMPLAINED = 'COMPLAINED',
}

export enum SuppressionReason {
  MANUAL = 'MANUAL',
  UNSUBSCRIBE = 'UNSUBSCRIBE',
  BOUNCE = 'BOUNCE',
  COMPLAINT = 'COMPLAINT',
}

export enum IntegrationProvider {
  RESEND = 'RESEND',
  SES = 'SES',
  SMTP = 'SMTP',
}

export enum IntegrationStatus {
  ACTIVE = 'ACTIVE',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  DISABLED = 'DISABLED',
}

export enum SenderStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  DISABLED = 'DISABLED',
}

export enum AssignmentStatus {
  ACTIVE = 'ACTIVE',
  REMOVED = 'REMOVED',
}

export class PrismaClient {
  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);
  $queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
  $executeRaw = jest.fn().mockResolvedValue(1);
  $transaction = jest.fn().mockImplementation((cbOrArr: any) => {
    if (typeof cbOrArr === 'function') {
      return cbOrArr(this);
    }
    return Promise.all(cbOrArr);
  });

  user = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  authIdentity = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  workspace = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  workspaceMember = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  company = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  researchRun = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  opportunity = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  contact = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
  };

  companyContactSelection = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  };

  evidence = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  job = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  campaign = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  };

  campaignMember = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  };

  suppression = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  emailSend = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  idempotencyRecord = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  integration = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  senderAccount = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  campaignSenderAccount = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  outcome = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

export enum OutcomeType {
  QUALIFIED_CONVERSATION = 'QUALIFIED_CONVERSATION',
  REFERRAL = 'REFERRAL',
  MEETING_BOOKED = 'MEETING_BOOKED',
  NOT_INTERESTED = 'NOT_INTERESTED',
  NO_REPLY = 'NO_REPLY',
  BOUNCED = 'BOUNCED',
  OTHER = 'OTHER',
}
