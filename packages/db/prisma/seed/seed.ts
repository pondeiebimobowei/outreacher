import { createPrismaClient } from '../../src/client.js';
import {
  CampaignRecipientStatus,
  CampaignStatus,
  ContentSource,
  ConversationState,
  EmailSendStatus,
  EmailSendType,
  IntegrationProvider,
  IntegrationStatus,
  OpportunityStatus,
  OpportunityType,
  OutreachStatus,
  PersonKind,
  SenderStatus,
  WorkspaceRole,
} from '../../generated/prisma/client.js';

const { prisma, pool } = createPrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // 1. Workspace
  const workspace = await prisma.workspace.upsert({
    where: { id: 'ws-seed-default' },
    update: {},
    create: {
      id: 'ws-seed-default',
      name: 'Acme Growth Workspace',
    },
  });

  // 2. User & Workspace Member
  const user = await prisma.user.upsert({
    where: { email: 'admin@acmegrowth.com' },
    update: {},
    create: {
      id: 'usr-seed-admin',
      email: 'admin@acmegrowth.com',
      firstName: 'Alex',
      lastName: 'Mercer',
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: WorkspaceRole.OWNER,
    },
  });

  // 3. Integration & SenderAccount
  const integration = await prisma.integration.upsert({
    where: {
      workspaceId_name: {
        workspaceId: workspace.id,
        name: 'Resend Production',
      },
    },
    update: {},
    create: {
      id: 'int-seed-resend',
      workspaceId: workspace.id,
      name: 'Resend Production',
      provider: IntegrationProvider.RESEND,
      status: IntegrationStatus.ACTIVE,
      secretReference: 'sec_seed_resend_api_key',
    },
  });

  const senderAccount = await prisma.senderAccount.upsert({
    where: {
      workspaceId_fromEmail: {
        workspaceId: workspace.id,
        fromEmail: 'alex@acmegrowth.com',
      },
    },
    update: {},
    create: {
      id: 'sender-seed-alex',
      workspaceId: workspace.id,
      integrationId: integration.id,
      fromName: 'Alex Mercer',
      fromEmail: 'alex@acmegrowth.com',
      status: SenderStatus.ACTIVE,
      dailyLimit: 100,
    },
  });

  // 4. Companies
  const acmeClient1 = await prisma.company.upsert({
    where: {
      workspaceId_normalizedName: {
        workspaceId: workspace.id,
        normalizedName: 'stripe',
      },
    },
    update: {},
    create: {
      id: 'comp-seed-stripe',
      workspaceId: workspace.id,
      name: 'Stripe',
      normalizedName: 'stripe',
      domain: 'stripe.com',
      websiteUrl: 'https://stripe.com',
      industry: 'Fintech',
    },
  });

  const acmeClient2 = await prisma.company.upsert({
    where: {
      workspaceId_normalizedName: {
        workspaceId: workspace.id,
        normalizedName: 'vercel',
      },
    },
    update: {},
    create: {
      id: 'comp-seed-vercel',
      workspaceId: workspace.id,
      name: 'Vercel',
      normalizedName: 'vercel',
      domain: 'vercel.com',
      websiteUrl: 'https://vercel.com',
      industry: 'Developer Tools',
    },
  });

  // 5. People & Contacts
  const person1 = await prisma.person.upsert({
    where: {
      workspaceId_email: {
        workspaceId: workspace.id,
        email: 'john@stripe.com',
      },
    },
    update: {},
    create: {
      id: 'person-seed-john',
      workspaceId: workspace.id,
      personKind: PersonKind.PERSON,
      firstName: 'John',
      lastName: 'Collison',
      email: 'john@stripe.com',
      title: 'President',
    },
  });

  const person2 = await prisma.person.upsert({
    where: {
      workspaceId_email: {
        workspaceId: workspace.id,
        email: 'guillermo@vercel.com',
      },
    },
    update: {},
    create: {
      id: 'person-seed-guillermo',
      workspaceId: workspace.id,
      personKind: PersonKind.PERSON,
      firstName: 'Guillermo',
      lastName: 'Rauch',
      email: 'guillermo@vercel.com',
      title: 'CEO',
    },
  });

  // 6. PersonCompanyAssociations
  const pca1 = await prisma.personCompanyAssociation.upsert({
    where: {
      workspaceId_personId_companyId: {
        workspaceId: workspace.id,
        personId: person1.id,
        companyId: acmeClient1.id,
      },
    },
    update: {},
    create: {
      id: 'pca-seed-john-stripe',
      workspaceId: workspace.id,
      personId: person1.id,
      companyId: acmeClient1.id,
      workEmail: 'john@stripe.com',
      role: 'President & Co-founder',
      conversationState: ConversationState.NO_REPLY,
      stateVersion: 0,
    },
  });

  const pca2 = await prisma.personCompanyAssociation.upsert({
    where: {
      workspaceId_personId_companyId: {
        workspaceId: workspace.id,
        personId: person2.id,
        companyId: acmeClient2.id,
      },
    },
    update: {},
    create: {
      id: 'pca-seed-guillermo-vercel',
      workspaceId: workspace.id,
      personId: person2.id,
      companyId: acmeClient2.id,
      workEmail: 'guillermo@vercel.com',
      role: 'Chief Executive Officer',
      conversationState: ConversationState.NO_REPLY,
      stateVersion: 0,
    },
  });

  // 7. Opportunities
  const opp1 = await prisma.opportunity.upsert({
    where: { id: 'opp-seed-stripe-infra' },
    update: {},
    create: {
      id: 'opp-seed-stripe-infra',
      workspaceId: workspace.id,
      companyId: acmeClient1.id,
      roleTitle: 'Payments Infrastructure Scale',
      opportunityType: OpportunityType.CONFIRMED,
      status: OpportunityStatus.ACTIVE,
    },
  });

  const opp2 = await prisma.opportunity.upsert({
    where: { id: 'opp-seed-vercel-edge' },
    update: {},
    create: {
      id: 'opp-seed-vercel-edge',
      workspaceId: workspace.id,
      companyId: acmeClient2.id,
      roleTitle: 'Edge Rendering Architecture',
      opportunityType: OpportunityType.CONFIRMED,
      status: OpportunityStatus.ACTIVE,
    },
  });

  // 8. Reusable Workspace Email Template & Steps
  const template = await prisma.emailTemplate.upsert({
    where: {
      workspaceId_name: {
        workspaceId: workspace.id,
        name: 'Executive Introduction Sequence',
      },
    },
    update: {},
    create: {
      id: 'tmpl-seed-executive-intro',
      workspaceId: workspace.id,
      name: 'Executive Introduction Sequence',
      isArchived: false,
    },
  });

  await prisma.emailTemplateStep.deleteMany({
    where: { templateId: template.id },
  });

  await prisma.emailTemplateStep.createMany({
    data: [
      {
        id: 'step-seed-0',
        templateId: template.id,
        sequence: 0,
        subjectTemplate: 'Exploring collaboration with {{company.name}}',
        bodyTemplate:
          'Hi {{contact.firstName}},\n\nI have been following {{company.name}} closely regarding {{opportunity.title}}.\n\nWould love to connect this week.\n\nBest,\nAlex',
      },
      {
        id: 'step-seed-1',
        templateId: template.id,
        sequence: 1,
        subjectTemplate: 'Re: Exploring collaboration with {{company.name}}',
        bodyTemplate:
          'Hi {{contact.firstName}},\n\nFollowing up on my previous note. How does your calendar look for a brief 10-minute sync?\n\nBest,\nAlex',
      },
      {
        id: 'step-seed-2',
        templateId: template.id,
        sequence: 2,
        subjectTemplate: 'Final follow up regarding {{company.name}}',
        bodyTemplate:
          'Hi {{contact.firstName}},\n\nClosing the loop on this. Let me know if you would like to revisit later.\n\nBest regards,\nAlex',
      },
    ],
  });

  // 9. Multi-Company Workspace Campaign
  const campaign = await prisma.campaign.upsert({
    where: {
      workspaceId_name: {
        workspaceId: workspace.id,
        name: 'Q4 Enterprise Founders',
      },
    },
    update: {},
    create: {
      id: 'camp-seed-q4-founders',
      workspaceId: workspace.id,
      name: 'Q4 Enterprise Founders',
      status: CampaignStatus.ACTIVE,
      contentSource: ContentSource.TEMPLATE,
      templateId: template.id,
      followUpDelayBusinessDays: 3,
      maxFollowUps: 2,
    },
  });

  await prisma.campaignSenderAccount.upsert({
    where: {
      campaignId_senderAccountId: {
        campaignId: campaign.id,
        senderAccountId: senderAccount.id,
      },
    },
    update: {},
    create: {
      id: 'csa-seed-1',
      workspaceId: workspace.id,
      campaignId: campaign.id,
      senderAccountId: senderAccount.id,
    },
  });

  // 10. Multi-Company Campaign Recipients (Stripe & Vercel)
  const recipient1 = await prisma.campaignRecipient.upsert({
    where: {
      workspaceId_campaignId_personCompanyAssociationId: {
        workspaceId: workspace.id,
        campaignId: campaign.id,
        personCompanyAssociationId: pca1.id,
      },
    },
    update: {},
    create: {
      id: 'rec-seed-john',
      workspaceId: workspace.id,
      campaignId: campaign.id,
      personCompanyAssociationId: pca1.id,
      status: CampaignRecipientStatus.ACTIVE,
      targetRole: 'President',
      selectedOpportunityId: opp1.id,
    },
  });

  const recipient2 = await prisma.campaignRecipient.upsert({
    where: {
      workspaceId_campaignId_personCompanyAssociationId: {
        workspaceId: workspace.id,
        campaignId: campaign.id,
        personCompanyAssociationId: pca2.id,
      },
    },
    update: {},
    create: {
      id: 'rec-seed-guillermo',
      workspaceId: workspace.id,
      campaignId: campaign.id,
      personCompanyAssociationId: pca2.id,
      status: CampaignRecipientStatus.PENDING,
      targetRole: 'CEO',
      selectedOpportunityId: opp2.id,
    },
  });

  // 11. Campaign-Linked Outreach (Recipient 1 - Stripe)
  const campaignOutreach = await prisma.outreach.upsert({
    where: {
      campaignRecipientId: recipient1.id,
    },
    update: {},
    create: {
      id: 'outreach-seed-stripe',
      workspaceId: workspace.id,
      personCompanyAssociationId: pca1.id,
      campaignRecipientId: recipient1.id,
      senderAccountId: senderAccount.id,
      contentSource: ContentSource.TEMPLATE,
      templateId: template.id,
      subject: 'Exploring collaboration with Stripe',
      message:
        'Hi John,\n\nI have been following Stripe closely regarding Payments Infrastructure Scale.\n\nWould love to connect this week.\n\nBest,\nAlex',
      status: OutreachStatus.ACTIVE,
      maxFollowUps: 2,
    },
  });

  // EmailSend for Initial Outreach
  await prisma.emailSend.upsert({
    where: {
      outreachId_sequence: {
        outreachId: campaignOutreach.id,
        sequence: 0,
      },
    },
    update: {},
    create: {
      id: 'send-seed-stripe-init',
      workspaceId: workspace.id,
      outreachId: campaignOutreach.id,
      senderAccountId: senderAccount.id,
      sequence: 0,
      type: EmailSendType.INITIAL,
      subject: campaignOutreach.subject,
      body: campaignOutreach.message,
      status: EmailSendStatus.SENT,
      sentAt: new Date(),
      replyToToken: 'token-seed-stripe-init',
    },
  });

  // 12. One-Off Direct Outreach (Recipient 2 - Vercel)
  await prisma.outreach.upsert({
    where: { id: 'outreach-seed-vercel-direct' },
    update: {},
    create: {
      id: 'outreach-seed-vercel-direct',
      workspaceId: workspace.id,
      personCompanyAssociationId: pca2.id,
      campaignRecipientId: null,
      senderAccountId: senderAccount.id,
      contentSource: ContentSource.MANUAL,
      templateId: null,
      subject: 'Personal note to Guillermo',
      message: 'Hi Guillermo, loved your keynote at Next.js Conf!',
      status: OutreachStatus.DRAFT,
      maxFollowUps: 1,
    },
  });

  console.log('✅ Seed completed successfully with modern domain entities!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
