export type BackfillClassification =
  | 'PROVABLY_ASSOCIABLE'
  | 'AMBIGUOUS'
  | 'UNMIGRATED_NEEDS_SENDER'
  | 'UNMIGRATED_INVALID_LEGACY_IDENTITY';

export interface CampaignBackfillEvaluation {
  campaignId: string;
  workspaceId: string;
  sendingIdentity: string | null;
  classification: BackfillClassification;
  reason: string;
  proposedAction: string;
}

export interface ParsedIdentity {
  raw: string;
  name: string | null;
  email: string | null;
  isValid: boolean;
}

export function parseLegacySendingIdentity(raw: string | null | undefined): ParsedIdentity {
  if (!raw || raw.trim() === '') {
    return { raw: raw ?? '', name: null, email: null, isValid: false };
  }

  const trimmed = raw.trim();

  // Pattern 1: Name <email@domain.tld> or <email@domain.tld>
  const angleMatch = trimmed.match(/^(?:(.*?)<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?$/);
  if (angleMatch) {
    const rawName = angleMatch[1]?.trim();
    const name = rawName && rawName.length > 0 ? rawName.replace(/^["']|["']$/g, '').trim() : null;
    const email = angleMatch[2]?.trim().toLowerCase() || null;
    return { raw: trimmed, name, email, isValid: !!email };
  }

  // Pattern 2: Bare email
  const bareEmailMatch = trimmed.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);
  if (bareEmailMatch) {
    return { raw: trimmed, name: null, email: trimmed.toLowerCase(), isValid: true };
  }

  return { raw: trimmed, name: null, email: null, isValid: false };
}

export async function evaluateCampaigns(prisma: any): Promise<CampaignBackfillEvaluation[]> {
  const campaigns = await prisma.campaign.findMany({
    select: {
      id: true,
      workspaceId: true,
      name: true,
      sendingIdentity: true,
      campaignSenderAccounts: {
        where: { status: 'ACTIVE' },
        select: { id: true, senderAccountId: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const evaluations: CampaignBackfillEvaluation[] = [];

  for (const campaign of campaigns) {
    const rawIdentity = campaign.sendingIdentity;

    // Case 1: NULL or empty legacy identity -> UNMIGRATED_NEEDS_SENDER
    if (!rawIdentity || rawIdentity.trim() === '') {
      evaluations.push({
        campaignId: campaign.id,
        workspaceId: campaign.workspaceId,
        sendingIdentity: rawIdentity ?? 'NULL',
        classification: 'UNMIGRATED_NEEDS_SENDER',
        reason: 'Legacy sending_identity is null or empty. Campaign has no associated sender configured.',
        proposedAction: 'Retain campaign in current state. Prompt workspace owner in UI to configure an Integration and Sender Account before dispatch.',
      });
      continue;
    }

    // Case 2: Malformed identity -> UNMIGRATED_INVALID_LEGACY_IDENTITY
    const parsed = parseLegacySendingIdentity(rawIdentity);
    if (!parsed.isValid || !parsed.email) {
      evaluations.push({
        campaignId: campaign.id,
        workspaceId: campaign.workspaceId,
        sendingIdentity: rawIdentity,
        classification: 'UNMIGRATED_INVALID_LEGACY_IDENTITY',
        reason: `Legacy identity "${rawIdentity}" is malformed and cannot be parsed into a valid email address.`,
        proposedAction: 'Retain campaign in current state. Flag for manual remediation in workspace campaign settings.',
      });
      continue;
    }

    const normalizedEmail = parsed.email;

    // Check if campaign already has an active binding
    if (campaign.campaignSenderAccounts && campaign.campaignSenderAccounts.length > 0) {
      evaluations.push({
        campaignId: campaign.id,
        workspaceId: campaign.workspaceId,
        sendingIdentity: rawIdentity,
        classification: 'PROVABLY_ASSOCIABLE',
        reason: `Campaign already has an active CampaignSenderAccount binding (${campaign.campaignSenderAccounts[0].senderAccountId}).`,
        proposedAction: 'No action needed. Campaign already bound to an active sender account.',
      });
      continue;
    }

    // Authoritative evidence inquiry:
    // Does an explicit, active SenderAccount matching this normalized email exist in this workspace?
    const matchingSenderAccounts = await prisma.senderAccount.findMany({
      where: {
        workspaceId: campaign.workspaceId,
        fromEmail: normalizedEmail,
        status: 'ACTIVE',
      },
      include: {
        integration: true,
      },
    });

    // Case 3: No authoritative sender account in workspace.
    // INVARIANT: Workspace integrations count is NOT evidence of sender ownership.
    // An integration in the workspace does NOT prove it owns or sent for this identity.
    if (matchingSenderAccounts.length === 0) {
      evaluations.push({
        campaignId: campaign.id,
        workspaceId: campaign.workspaceId,
        sendingIdentity: rawIdentity,
        classification: 'UNMIGRATED_NEEDS_SENDER',
        reason: `Legacy identity parsed as "${normalizedEmail}", but workspace has no authoritative historical SenderAccount or verified sender record for this address. Provider ownership cannot be inferred from workspace integrations alone.`,
        proposedAction: 'Retain campaign in current state. Prompt workspace owner in UI to explicitly configure a Sender Account for this identity.',
      });
      continue;
    }

    // Case 4: Multiple matching sender accounts (ambiguous)
    if (matchingSenderAccounts.length > 1) {
      evaluations.push({
        campaignId: campaign.id,
        workspaceId: campaign.workspaceId,
        sendingIdentity: rawIdentity,
        classification: 'AMBIGUOUS',
        reason: `Multiple active SenderAccounts found in workspace for email "${normalizedEmail}". Cannot deterministically select provider binding.`,
        proposedAction: 'Retain campaign in current state. Prompt workspace owner in UI to select the intended Sender Account.',
      });
      continue;
    }

    // Exactly 1 matching SenderAccount exists. Check historical EmailSend consistency.
    const senderAccount = matchingSenderAccounts[0];

    const historicalSends = await prisma.emailSend.findMany({
      where: {
        campaignId: campaign.id,
        provider: { not: null },
      },
      select: {
        provider: true,
      },
      take: 10,
    });

    const conflictingSend = historicalSends.find((s: any) => {
      if (!s.provider) return false;
      return s.provider.toUpperCase() !== senderAccount.integration.provider.toUpperCase();
    });

    if (conflictingSend) {
      evaluations.push({
        campaignId: campaign.id,
        workspaceId: campaign.workspaceId,
        sendingIdentity: rawIdentity,
        classification: 'AMBIGUOUS',
        reason: `SenderAccount ${senderAccount.id} uses provider "${senderAccount.integration.provider}", but historical EmailSends for this campaign record provider "${conflictingSend.provider}". Conflicting historical evidence.`,
        proposedAction: 'Retain campaign in current state. Require manual operator review in UI to resolve conflicting provider history.',
      });
      continue;
    }

    // Case 5: Authoritative evidence verified.
    evaluations.push({
      campaignId: campaign.id,
      workspaceId: campaign.workspaceId,
      sendingIdentity: rawIdentity,
      classification: 'PROVABLY_ASSOCIABLE',
      reason: `Authoritative evidence verified: Active SenderAccount "${senderAccount.id}" exists for "${normalizedEmail}" backed by integration "${senderAccount.integration.name}" (${senderAccount.integration.provider}), and historical sends are consistent.`,
      proposedAction: `Link existing SenderAccount (id="${senderAccount.id}") to Campaign via CampaignSenderAccount.`,
    });
  }

  return evaluations;
}

export function formatEvaluationTable(evaluations: CampaignBackfillEvaluation[]): string {
  if (evaluations.length === 0) {
    return 'No campaigns found in database.';
  }

  const headers = [
    'campaignId',
    'workspaceId',
    'sendingIdentity',
    'classification',
    'reason',
    'proposed action',
  ];

  const rows = evaluations.map((e) => [
    e.campaignId,
    e.workspaceId,
    e.sendingIdentity ?? 'NULL',
    e.classification,
    e.reason,
    e.proposedAction,
  ]);

  const colWidths = headers.map((header, idx) => {
    return Math.max(
      header.length,
      ...rows.map((row) => (row[idx] ? row[idx].length : 0)),
    );
  });

  const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ');
  const separatorRow = colWidths.map((w) => '-'.repeat(w)).join('-|-');
  const dataRows = rows.map((r) => r.map((val, i) => val.padEnd(colWidths[i])).join(' | '));

  return [headerRow, separatorRow, ...dataRows].join('\n');
}
