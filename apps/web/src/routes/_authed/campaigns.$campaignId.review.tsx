import { useState, useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeftIcon } from '@hugeicons/core-free-icons';
import {
  fetchCampaignById,
  pauseCampaign,
  resumeCampaign,
} from '../../api/campaigns';
import { assignCampaignSenders } from '../../api/campaign-senders';
import { fetchCampaignRecipients } from '../../api/outreach';
import { CampaignReviewHub, type ReviewFilter } from '../../components/campaign/campaign-review-hub';
import { SenderAssignmentModal } from '../../components/campaign/sender-assignment-modal';
import { OutreachReviewDrawer } from '../../components/outreach/outreach-review-drawer';
import { LoadingState, ErrorState } from '../../components/states';
import type { CampaignRecipientSummaryDto } from '../../api/outreach';

export const Route = createFileRoute('/_authed/campaigns/$campaignId/review')({
  component: CampaignReviewHubRoute,
});

function CampaignReviewHubRoute() {
  const { campaignId } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // ── Filter state ─────────────────────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>('ALL');

  // ── Drawer state ─────────────────────────────────────────────────────────
  // openOutreachId comes directly from the live recipient query list.
  // The drawer hydrations (GET /outreaches/:id) is the authoritative source
  // for current outreach draft state when the drawer opens.
  const [openOutreachId, setOpenOutreachId] = useState<string | null>(null);

  const handleOpenRecipient = useCallback((outreachId: string) => {
    setOpenOutreachId(outreachId);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setOpenOutreachId(null);
  }, []);

  // ── Campaign data ────────────────────────────────────────────────────────
  const {
    data: campaign,
    isLoading: isCampaignLoading,
    isError: isCampaignError,
    error: campaignError,
  } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => fetchCampaignById(campaignId),
  });

  // ── Recipient queue ───────────────────────────────────────────────────────
  // Poll every 3 seconds while any recipient is ACTIVE or outreach is SENDING; stop when none are.
  const {
    data: recipients = [],
    isLoading: isRecipientsLoading,
    isError: isRecipientsError,
    error: recipientsError,
  } = useQuery({
    queryKey: ['campaign-recipients', campaignId],
    queryFn: () => fetchCampaignRecipients(campaignId),
    refetchInterval: (query) => {
      const data = query.state.data as CampaignRecipientSummaryDto[] | undefined;
      if (data?.some((r) => r.outreach?.status === 'SENDING')) return 3000;
      return false;
    },
  });

  // ── Pause / Resume mutations ──────────────────────────────────────────────
  const pauseMutation = useMutation({
    mutationFn: () => pauseCampaign(campaignId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      void queryClient.invalidateQueries({ queryKey: ['campaign-recipients', campaignId] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeCampaign(campaignId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      void queryClient.invalidateQueries({ queryKey: ['campaign-recipients', campaignId] });
    },
  });

  const [isSenderModalOpen, setIsSenderModalOpen] = useState(false);

  const assignSendersMutation = useMutation({
    mutationFn: (senderIds: string[]) => assignCampaignSenders(campaignId, senderIds),
    onSuccess: () => {
      setIsSenderModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    },
  });

  const isPauseResumeLoading = pauseMutation.isPending || resumeMutation.isPending;

  // ── Loading / error states ────────────────────────────────────────────────
  if (isCampaignLoading || isRecipientsLoading) {
    return <LoadingState />;
  }

  if (isCampaignError || !campaign) {
    const msg =
      campaignError instanceof Error
        ? campaignError.message
        : 'Failed to load campaign.';
    return <ErrorState message={msg} />;
  }

  if (isRecipientsError) {
    const msg =
      recipientsError instanceof Error
        ? recipientsError.message
        : 'Failed to load campaign recipients.';
    return <ErrorState message={msg} />;
  }

  // ── Resolve company name for the drawer from the campaign ─────────────────
  const companyName = campaign.name.startsWith('Outreach — ')
    ? campaign.name.slice('Outreach — '.length)
    : campaign.name;

  return (
    <div className="max-w-5xl space-y-6">
      <button
        type="button"
        onClick={() => navigate({ to: '/campaigns' })}
        className="flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-900  cursor-pointer"
        style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
      >
        <HugeiconsIcon icon={ArrowLeftIcon} size={14} /> Campaigns
      </button>

      <CampaignReviewHub
        campaign={campaign}
        recipients={recipients}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onOpenRecipient={handleOpenRecipient}
        onPause={() => pauseMutation.mutate()}
        onResume={() => resumeMutation.mutate()}
        isPauseResumeLoading={isPauseResumeLoading}
        companyName={companyName}
        onOpenAssignSenders={() => setIsSenderModalOpen(true)}
      />

      <SenderAssignmentModal
        isOpen={isSenderModalOpen}
        onClose={() => setIsSenderModalOpen(false)}
        onSave={(senderIds) => assignSendersMutation.mutate(senderIds)}
        isSaving={assignSendersMutation.isPending}
        initialSelectedIds={
          campaign.senders
            ?.filter((s) => s.assignmentStatus === 'ACTIVE')
            .map((s) => s.senderAccountId) ?? []
        }
      />

      {/*
        Drawer receives the live recipient list to enable sequential cycling.
        The drawer's own GET /outreaches/:id hydration is the authoritative source
        for opened draft state.
      */}
      <OutreachReviewDrawer
        isOpen={openOutreachId !== null}
        onClose={handleCloseDrawer}
        outreachId={openOutreachId}
        recipients={recipients}
        onSelectRecipient={handleOpenRecipient}
        companyName={companyName}
      />
    </div>
  );
}
