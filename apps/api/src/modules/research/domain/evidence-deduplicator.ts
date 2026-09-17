export interface ExistingEvidenceRecord {
  id: string;
  claim: string;
  classification: 'FACT' | 'INFERENCE' | 'UNKNOWN';
  sourceUrl: string | null;
}

export interface ReconciledEvidenceResult {
  toUpdate: Array<{
    id: string;
    claim: string;
    classification: 'FACT' | 'INFERENCE' | 'UNKNOWN';
    sourceName?: string | null;
    sourceUrl?: string | null;
    sourceExcerpt?: string | null;
    confidence?: string | null;
  }>;
  toCreate: Array<{
    claim: string;
    classification: 'FACT' | 'INFERENCE' | 'UNKNOWN';
    sourceName?: string | null;
    sourceUrl?: string | null;
    sourceExcerpt?: string | null;
    confidence?: string | null;
  }>;
}

export class EvidenceDeduplicator {
  static computeKey(
    claim: string,
    sourceUrl: string | null | undefined,
    classification: string,
  ): string {
    const normClaim = (claim || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const normSource = (sourceUrl || 'unknown').trim().toLowerCase();
    const normClass = (classification || 'UNKNOWN').toUpperCase();
    return `${normClaim}::${normSource}::${normClass}`;
  }

  static deduplicate(
    existing: ExistingEvidenceRecord[],
    incoming: Array<{
      claim: string;
      classification: 'FACT' | 'INFERENCE' | 'UNKNOWN';
      sourceName?: string | null;
      sourceUrl?: string | null;
      sourceExcerpt?: string | null;
      confidence?: string | null;
    }>,
  ): ReconciledEvidenceResult {
    const existingMap = new Map<string, ExistingEvidenceRecord>();
    for (const ev of existing) {
      const key = this.computeKey(ev.claim, ev.sourceUrl, ev.classification);
      existingMap.set(key, ev);
    }

    const toUpdate: ReconciledEvidenceResult['toUpdate'] = [];
    const toCreate: ReconciledEvidenceResult['toCreate'] = [];

    for (const inc of incoming) {
      const key = this.computeKey(inc.claim, inc.sourceUrl, inc.classification);
      const matched = existingMap.get(key);

      if (matched) {
        toUpdate.push({
          id: matched.id,
          ...inc,
        });
      } else {
        toCreate.push(inc);
      }
    }

    return { toUpdate, toCreate };
  }
}
