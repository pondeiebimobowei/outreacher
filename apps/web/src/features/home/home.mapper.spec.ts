import {
  formatRelativeTime,
  mapActivityItem,
  mapWorkItemToAttention,
  mapWorkItemToContinue,
  mapWorkspaceSummaryToViewModel,
} from './home.mapper';
import { WorkspaceActivityItemDto, WorkspaceSummaryDto, WorkspaceWorkItemDto } from './home.types';

describe('Home Presentation Mapper — Deterministic Routing & Value Transformations', () => {
  describe('formatRelativeTime', () => {
    it('returns — for null, undefined, or invalid dates', () => {
      expect(formatRelativeTime(null)).toBe('—');
      expect(formatRelativeTime(undefined)).toBe('—');
      expect(formatRelativeTime('invalid-date')).toBe('—');
    });

    it('formats recent timestamps accurately with progressive relative units', () => {
      const now = new Date();
      expect(formatRelativeTime(now.toISOString())).toBe('just now');

      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
      expect(formatRelativeTime(tenMinutesAgo.toISOString())).toBe('10m ago');

      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      expect(formatRelativeTime(threeHoursAgo.toISOString())).toBe('3h ago');

      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoDaysAgo.toISOString())).toBe('2d ago');
    });
  });

  describe('Deterministic Destination Rules for Attention Items', () => {
    it('routes OUTREACH_REVIEW with campaign to contextual review (/campaigns/$campaignId/review)', () => {
      const item: WorkspaceWorkItemDto = {
        id: 'work-1',
        kind: 'OUTREACH_REVIEW',
        company: { id: 'comp-1', name: 'Acme Corp' },
        campaign: { id: 'camp-1', name: 'Outreach Sprint', status: 'ACTIVE' },
        campaignMember: { id: 'cc-1', status: 'PENDING' },
        source: { domain: 'OUTREACH', state: 'PENDING' },
        destination: { type: 'CONTACT_REVIEW' },
      };

      const result = mapWorkItemToAttention(item);
      expect(result).not.toBeNull();
      expect(result?.destination).toEqual({
        to: '/campaigns/$campaignId/review',
        params: { campaignId: 'camp-1' },
      });
      expect(result?.badgeLabel).toBe('Review Required');
      expect(result?.actionLabel).toBe('Review Outreach');
    });

    it('routes OUTREACH_REVIEW without campaign deterministically to company workspace (/companies/$id)', () => {
      const item: WorkspaceWorkItemDto = {
        id: 'work-1b',
        kind: 'OUTREACH_REVIEW',
        company: { id: 'comp-1', name: 'Acme Corp' },
        source: { domain: 'OUTREACH', state: 'PENDING' },
        destination: { type: 'CONTACT_REVIEW' },
      };

      const result = mapWorkItemToAttention(item);
      expect(result).not.toBeNull();
      expect(result?.destination).toEqual({
        to: '/companies/$id',
        params: { id: 'comp-1' },
      });
      expect(result?.description).toBe('Outreach draft for Acme Corp awaits human review.');
    });

    it('routes SEND_FAILURE with campaign deterministically to campaign review hub', () => {
      const item: WorkspaceWorkItemDto = {
        id: 'work-2a',
        kind: 'SEND_FAILURE',
        company: { id: 'comp-2', name: 'Stripe' },
        campaign: { id: 'camp-2', name: 'Tech Lead Outreach', status: 'ACTIVE' },
        campaignMember: { id: 'cc-2', status: 'FAILED' },
        source: { domain: 'EMAIL', state: 'FAILED' },
        destination: { type: 'CAMPAIGN' },
      };

      const result = mapWorkItemToAttention(item);
      expect(result).not.toBeNull();
      expect(result?.destination).toEqual({
        to: '/campaigns/$campaignId/review',
        params: { campaignId: 'camp-2' },
      });
      expect(result?.badgeLabel).toBe('Send Failed');
      expect(result?.actionLabel).toBe('Investigate Failure');
    });

    it('routes SEND_FAILURE without campaign deterministically to campaigns index (/campaigns)', () => {
      const item: WorkspaceWorkItemDto = {
        id: 'work-2b',
        kind: 'SEND_FAILURE',
        company: { id: 'comp-2', name: 'Stripe' },
        source: { domain: 'EMAIL', state: 'FAILED' },
        destination: { type: 'CAMPAIGN' },
      };

      const result = mapWorkItemToAttention(item);
      expect(result).not.toBeNull();
      expect(result?.destination).toEqual({
        to: '/campaigns',
      });
    });

    it('returns null for continue-working kinds', () => {
      const incompleteResearch: WorkspaceWorkItemDto = {
        id: 'work-3',
        kind: 'RESEARCH_INCOMPLETE',
        company: { id: 'comp-3', name: 'GitHub' },
        source: { domain: 'RESEARCH', state: 'PARTIAL' },
        destination: { type: 'COMPANY' },
      };

      expect(mapWorkItemToAttention(incompleteResearch)).toBeNull();
    });
  });

  describe('Deterministic Destination Rules for Continue Working Items', () => {
    it('routes RESEARCH_INCOMPLETE deterministically to company research workflow (/companies/$id)', () => {
      const item: WorkspaceWorkItemDto = {
        id: 'work-4',
        kind: 'RESEARCH_INCOMPLETE',
        company: { id: 'comp-4', name: 'Vercel' },
        source: { domain: 'RESEARCH', state: 'RUNNING' },
        destination: { type: 'COMPANY' },
      };

      const result = mapWorkItemToContinue(item);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe('RESEARCH_INCOMPLETE');
      expect(result?.destination).toEqual({
        to: '/companies/$id',
        params: { id: 'comp-4' },
      });
      expect(result?.actionLabel).toBe('Continue Research');
    });

    it('routes CAMPAIGN_PAUSED with campaign to contextual campaign review (/campaigns/$campaignId/review)', () => {
      const item: WorkspaceWorkItemDto = {
        id: 'work-5a',
        kind: 'CAMPAIGN_PAUSED',
        company: { id: 'comp-5', name: 'OpenAI' },
        campaign: { id: 'camp-5', name: 'AI Safety Outreach', status: 'PAUSED' },
        source: { domain: 'CAMPAIGN', state: 'PAUSED' },
        destination: { type: 'CAMPAIGN' },
      };

      const result = mapWorkItemToContinue(item);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe('CAMPAIGN_PAUSED');
      expect(result?.destination).toEqual({
        to: '/campaigns/$campaignId/review',
        params: { campaignId: 'camp-5' },
      });
      expect(result?.actionLabel).toBe('Review Campaign');
    });

    it('routes CAMPAIGN_PAUSED without campaign deterministically to campaigns catalog (/campaigns)', () => {
      const item: WorkspaceWorkItemDto = {
        id: 'work-5b',
        kind: 'CAMPAIGN_PAUSED',
        company: { id: 'comp-5', name: 'OpenAI' },
        source: { domain: 'CAMPAIGN', state: 'PAUSED' },
        destination: { type: 'CAMPAIGN' },
      };

      const result = mapWorkItemToContinue(item);
      expect(result).not.toBeNull();
      expect(result?.destination).toEqual({
        to: '/campaigns',
      });
    });
  });

  describe('mapActivityItem', () => {
    it('maps all 4 authoritative activity types without fabricating events', () => {
      const past = new Date().toISOString();

      const researchAct: WorkspaceActivityItemDto = {
        id: 'act-1',
        sourceType: 'RESEARCH_RUN',
        sourceId: 'r-1',
        type: 'RESEARCH_COMPLETED',
        company: { id: 'c-1', name: 'Anthropic' },
        occurredAt: past,
      };
      expect(mapActivityItem(researchAct)).toEqual(
        expect.objectContaining({
          type: 'RESEARCH_COMPLETED',
          title: 'Research Completed',
          description: 'Completed deep company research for Anthropic.',
        }),
      );

      const contactAct: WorkspaceActivityItemDto = {
        id: 'act-2',
        sourceType: 'COMPANY_CONTACT_SELECTION',
        sourceId: 'cs-1',
        type: 'CONTACT_SELECTED',
        company: { id: 'c-2', name: 'Google' },
        occurredAt: past,
      };
      expect(mapActivityItem(contactAct)).toEqual(
        expect.objectContaining({
          type: 'CONTACT_SELECTED',
          title: 'Contact Selected',
          description: 'Selected target contact for outreach at Google.',
        }),
      );

      const emailAct: WorkspaceActivityItemDto = {
        id: 'act-3',
        sourceType: 'EMAIL_SEND',
        sourceId: 'es-1',
        type: 'EMAIL_SENT',
        company: { id: 'c-3', name: 'Meta' },
        campaign: { id: 'camp-3', name: 'Engineering Campaign' },
        occurredAt: past,
      };
      expect(mapActivityItem(emailAct)).toEqual(
        expect.objectContaining({
          type: 'EMAIL_SENT',
          title: 'Email Sent',
          description: 'Dispatched outreach email to contact at Meta (Engineering Campaign).',
        }),
      );

      const outcomeAct: WorkspaceActivityItemDto = {
        id: 'act-4',
        sourceType: 'OUTCOME',
        sourceId: 'oc-1',
        type: 'OUTCOME_RECORDED',
        company: { id: 'c-4', name: 'Apple' },
        occurredAt: past,
      };
      expect(mapActivityItem(outcomeAct)).toEqual(
        expect.objectContaining({
          type: 'OUTCOME_RECORDED',
          title: 'Outcome Recorded',
          description: 'Recorded opportunity outcome for Apple.',
        }),
      );
    });
  });

  describe('mapWorkspaceSummaryToViewModel', () => {
    it('identifies completely empty workspace when no work, activity, or degradation', () => {
      const emptySummary: WorkspaceSummaryDto = {
        workspace: { id: 'ws-empty' },
        workItems: [],
        recentActivity: [],
        generatedAt: new Date().toISOString(),
      };

      const vm = mapWorkspaceSummaryToViewModel(emptySummary);
      expect(vm.isEmptyWorkspace).toBe(true);
      expect(vm.attentionItems).toHaveLength(0);
      expect(vm.continueItems).toHaveLength(0);
      expect(vm.recentActivity).toHaveLength(0);
      expect(vm.workDegraded).toBe(false);
      expect(vm.activityDegraded).toBe(false);
    });

    it('correctly maps partial degradation flags without marking workspace as empty', () => {
      const degradedSummary: WorkspaceSummaryDto = {
        workspace: { id: 'ws-degraded' },
        workItems: [],
        recentActivity: [],
        degradedSources: [
          { source: 'WORK_SEND_FAILURE', code: 'PARTIAL_DATA_UNAVAILABLE' },
          { source: 'ACTIVITY_EMAIL_SENT', code: 'PARTIAL_DATA_UNAVAILABLE' },
        ],
        generatedAt: new Date().toISOString(),
      };

      const vm = mapWorkspaceSummaryToViewModel(degradedSummary);
      expect(vm.isEmptyWorkspace).toBe(false);
      expect(vm.workDegraded).toBe(true);
      expect(vm.activityDegraded).toBe(true);
    });

    it('correctly separates attention items from continue items', () => {
      const summary: WorkspaceSummaryDto = {
        workspace: { id: 'ws-populated' },
        workItems: [
          {
            id: 'w-1',
            kind: 'OUTREACH_REVIEW',
            company: { id: 'c-1', name: 'Company 1' },
            source: { domain: 'OUTREACH', state: 'PENDING' },
            destination: { type: 'CONTACT_REVIEW' },
          },
          {
            id: 'w-2',
            kind: 'SEND_FAILURE',
            company: { id: 'c-2', name: 'Company 2' },
            source: { domain: 'EMAIL', state: 'FAILED' },
            destination: { type: 'CAMPAIGN' },
          },
          {
            id: 'w-3',
            kind: 'RESEARCH_INCOMPLETE',
            company: { id: 'c-3', name: 'Company 3' },
            source: { domain: 'RESEARCH', state: 'RUNNING' },
            destination: { type: 'COMPANY' },
          },
          {
            id: 'w-4',
            kind: 'CAMPAIGN_PAUSED',
            company: { id: 'c-4', name: 'Company 4' },
            source: { domain: 'CAMPAIGN', state: 'PAUSED' },
            destination: { type: 'CAMPAIGN' },
          },
        ],
        recentActivity: [
          {
            id: 'a-1',
            sourceType: 'RESEARCH_RUN',
            sourceId: 'rr-1',
            type: 'RESEARCH_COMPLETED',
            company: { id: 'c-1', name: 'Company 1' },
            occurredAt: new Date().toISOString(),
          },
        ],
        generatedAt: new Date().toISOString(),
      };

      const vm = mapWorkspaceSummaryToViewModel(summary);
      expect(vm.isEmptyWorkspace).toBe(false);
      expect(vm.attentionItems).toHaveLength(2);
      expect(vm.continueItems).toHaveLength(2);
      expect(vm.recentActivity).toHaveLength(1);
    });
  });
});
