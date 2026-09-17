export interface ExistingOpportunityRecord {
  id: string;
  roleTitle: string | null;
  openingSourceUrl: string | null;
  opportunityType: 'CONFIRMED' | 'PROACTIVE' | 'UNCLASSIFIED';
  status: 'ACTIVE' | 'CLOSED' | 'SUPERSEDED';
}

export interface ReconciledOpportunitiesResult {
  toUpdate: Array<{
    id: string;
    roleTitle: string;
    openingSourceUrl?: string | null;
    opportunityType: 'CONFIRMED' | 'PROACTIVE';
  }>;
  toCreate: Array<{
    roleTitle: string;
    openingSourceUrl?: string | null;
    opportunityType: 'CONFIRMED' | 'PROACTIVE';
  }>;
  toSupersede: string[];
}

export class OpportunityReconciler {
  static computeKey(
    title: string | null | undefined,
    sourceUrl: string | null | undefined,
  ): string {
    const normTitle = (title || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const normSource = (sourceUrl || 'general').trim().toLowerCase();
    return `${normTitle}::${normSource}`;
  }

  static reconcile(
    existingActive: ExistingOpportunityRecord[],
    incoming: Array<{
      roleTitle: string;
      openingSourceUrl?: string | null;
      opportunityType: 'CONFIRMED' | 'PROACTIVE';
    }>,
  ): ReconciledOpportunitiesResult {
    const existingMap = new Map<string, ExistingOpportunityRecord>();
    for (const opp of existingActive) {
      if (opp.status === 'ACTIVE') {
        const key = this.computeKey(opp.roleTitle, opp.openingSourceUrl);
        existingMap.set(key, opp);
      }
    }

    const toUpdate: ReconciledOpportunitiesResult['toUpdate'] = [];
    const toCreate: ReconciledOpportunitiesResult['toCreate'] = [];
    const matchedExistingIds = new Set<string>();

    for (const inc of incoming) {
      const key = this.computeKey(inc.roleTitle, inc.openingSourceUrl);
      const matched = existingMap.get(key);

      if (matched) {
        toUpdate.push({
          id: matched.id,
          roleTitle: inc.roleTitle,
          openingSourceUrl: inc.openingSourceUrl,
          opportunityType: inc.opportunityType,
        });
        matchedExistingIds.add(matched.id);
      } else {
        toCreate.push(inc);
      }
    }

    const toSupersede: string[] = [];
    for (const opp of existingActive) {
      if (opp.status === 'ACTIVE' && !matchedExistingIds.has(opp.id)) {
        toSupersede.push(opp.id);
      }
    }

    return { toUpdate, toCreate, toSupersede };
  }
}
