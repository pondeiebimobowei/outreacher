import { useState, useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import {
  fetchCampaignById,
  pauseCampaign,
  resumeCampaign,
} from '../../api/campaigns';
import { assignCampaignSenders } from '../../api/campaign-senders';
import { fetchCampaignContacts } from '../../api/outreach';
import { CampaignReviewHub, type ReviewFilter } from '../../components/campaign/campaign-review-hub';
import { SenderAssignmentModal } from '../../components/campaign/sender-assignment-modal';
import { OutreachReviewDrawer } from '../../components/outreach/outreach-review-drawer';
import { LoadingState, ErrorState } from '../../components/states';
import type { CampaignContactSummaryDto } from '../../api/outreach';

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
  // campaignContactId comes from the live query contact list — never a stale
  // local object. The drawer's own hydration (GET /campaign-contacts/:id) is
  // the authoritative source for current contact state when the drawer opens.
  const [openContactId, setOpenContactId] = useState<string | null>(null);

  const handleOpenContact = useCallback((id: string) => {
    setOpenContactId(id);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setOpenContactId(null);
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

  // ── Contact queue ─────────────────────────────────────────────────────────
  // Poll every 3 seconds while any contact is SENDING; stop when none are.
  const {
    data: contacts = [],
    isLoading: isContactsLoading,
    isError: isContactsError,
    error: contactsError,
  } = useQuery({
    queryKey: ['campaign-contacts', campaignId],
    queryFn: () => fetchCampaignContacts(campaignId),
    refetchInterval: (query) => {
      const data = query.state.data as CampaignContactSummaryDto[] | undefined;
      if (data?.some((c) => c.status === 'SENDING')) return 3000;
      return false;
    },
  });

  // ── Pause / Resume mutations ──────────────────────────────────────────────
  const pauseMutation = useMutation({
    mutationFn: () => pauseCampaign(campaignId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      void queryClient.invalidateQueries({ queryKey: ['campaign-contacts', campaignId] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeCampaign(campaignId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      void queryClient.invalidateQueries({ queryKey: ['campaign-contacts', campaignId] });
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
  if (isCampaignLoading || isContactsLoading) {
    return <LoadingState />;
  }

  if (isCampaignError || !campaign) {
    const msg =
      campaignError instanceof Error
        ? campaignError.message
        : 'Failed to load campaign.';
    return <ErrorState message={msg} />;
  }

  if (isContactsError) {
    const msg =
      contactsError instanceof Error
        ? contactsError.message
        : 'Failed to load campaign contacts.';
    return <ErrorState message={msg} />;
  }

  // ── Resolve company name for the drawer from the campaign ─────────────────
  // The campaign name follows the canonical "Outreach — {Company Name}" pattern.
  // Extract the company name portion for the drawer header.
  const companyName = campaign.name.startsWith('Outreach — ')
    ? campaign.name.slice('Outreach — '.length)
    : campaign.name;

  return (
    <div className="max-w-5xl space-y-6">
      <button
        type="button"
        onClick={() => navigate({ to: '/campaigns' })}
        className="flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
        style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
      >
        <ArrowLeft size={14} /> Campaigns
      </button>

      <CampaignReviewHub
        campaign={campaign}
        contacts={contacts}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onOpenContact={handleOpenContact}
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
        Drawer receives the live contact list as boundContacts to enable
        sequential cycling. The drawer's own GET /campaign-contacts/:id
        hydration is the authoritative source for opened contact state.
        campaignContactId comes directly from the query — never a stale
        locally constructed object.
      */}
      <OutreachReviewDrawer
        isOpen={openContactId !== null}
        onClose={handleCloseDrawer}
        campaignContactId={openContactId}
        boundContacts={contacts}
        onSelectCampaignContact={handleOpenContact}
        companyName={companyName}
      />
    </div>
  );
}
