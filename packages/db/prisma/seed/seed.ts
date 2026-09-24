// prisma/seed/seed.ts
import { PrismaClient, CampaignStatus } from '@repo/db';   // adjust import path if needed
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  // ---- 1️⃣  Sender Account (required by Campaign) ----
  const senderAccount = await prisma.senderAccount.create({
    data: {
      id: uuidv4(),
      workspaceId: 'workspace_dummy',
      fromEmail: 'sender@email.com',
      
      // name: 'Dummy Sender',

      // add any other required fields (e.g. apiKey, provider)
      // provider: 'RESEND',
      // providerApiKey: 'dummy-key',
    },
  });

  // ---- 2️⃣  Email Template (required by Campaign) ----
  const emailTemplate = await prisma.emailTemplate.create({
    data: {
      id: uuidv4(),
      workspaceId: 'workspace_dummy',
      name: 'Dummy Template',
      subject: 'Hello {{firstName}}',
      body: '<p>This is a dummy email body.</p>',
    },
  });

  // ---- 3️⃣  Campaign ----
  const campaign = await prisma.campaign.create({
    data: {
      id: uuidv4(),
      workspaceId: 'workspace_dummy',
      companyId: 'company_dummy',
      senderAccountId: senderAccount.id,
      templateId: emailTemplate.id,
      name: 'Dummy Campaign',
      normalizedName: 'dummy-campaign',
      status: CampaignStatus.DRAFT,   // <-- enum import above
      followUpDelayBusinessDays: 4,
    },
  });

  // ---- 4️⃣  Optional: Add a few EmailSend rows linked to the campaign ----
  await prisma.emailSend.createMany({
    data: [
      {
        id: uuidv4(),
        workspaceId: 'workspace_dummy',
        campaignId: campaign.id,
        type: 'INITIAL',
        subject: emailTemplate.subject,
        body: emailTemplate.body,
        status: 'PENDING',   // adjust to actual enum value if needed
      },
      {
        id: uuidv4(),
        workspaceId: 'workspace_dummy',
        campaignId: campaign.id,
        type: 'FOLLOW_UP',
        subject: emailTemplate.subject,
        body: emailTemplate.body,
        status: 'PENDING',
      },
    ],
  });

  console.log('🌱 Dummy data seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

