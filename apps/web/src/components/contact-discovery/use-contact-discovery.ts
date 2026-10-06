import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import {
  CompanyContactsResponse,
  discoverCompanyContacts,
  fetchCompanyContacts,
  selectCompanyContact,
} from '../../api/contacts';

import {
  addRecipientsToCampaign,
  CampaignRecipientDto,
  CampaignDto,
  resolveCanonicalCompanyCampaign,
} from '../../api/campaigns';

export function useContactDiscovery(companyId: string, companyName?: string) {
  const queryClient = useQueryClient();
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [boundCampaignRecipient, setBoundCampaignRecipient] = useState<CampaignRecipientDto | null>(null);
  const [activeCampaign, setActiveCampaign] = useState<CampaignDto | null>(null);
  const [ariaAnnouncement, setAriaAnnouncement] = useState<string>('');
  const [pollingDuration, setPollingDuration] = useState<number>(0);

  const prevStatusRef = useRef<string | null>(null);

  const {
    data: contactsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<CompanyContactsResponse>({
    queryKey: ['company-contacts', companyId],
    queryFn: () => fetchCompanyContacts(companyId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === 'QUEUED' || data.status === 'RUNNING')) {
        // Bounded Polling: Stop polling after 30s (15 polling attempts at 2s interval)
        if (pollingDuration >= 30000) {
          return false;
        }
        return 2000;
      }
      return false;
    },
  });

  const rawStatus = contactsData?.status ?? 'NOT_STARTED';
  const isPollingActive = rawStatus === 'QUEUED' || rawStatus === 'RUNNING';
  const isStillRunningTimeout = isPollingActive && pollingDuration >= 30000;

  // Track polling duration
  useEffect(() => {
    let intervalHandle: NodeJS.Timeout | null = null;
    if (isPollingActive) {
      intervalHandle = setInterval(() => {
        setPollingDuration((prev) => prev + 2000);
      }, 2000);
    } else {
      setPollingDuration(0);
    }

    return () => {
      if (intervalHandle) clearInterval(intervalHandle);
    };
  }, [isPollingActive]);

  // Handle terminal status transitions for ARIA announcements
  useEffect(() => {
    if (prevStatusRef.current !== rawStatus) {
      if (rawStatus === 'COMPLETED') {
        const count = contactsData?.contacts?.length ?? 0;
        setAriaAnnouncement(`Contact discovery complete. Found ${count} contacts.`);
      } else if (rawStatus === 'FAILED') {
        setAriaAnnouncement('Contact discovery failed.');
      }
      prevStatusRef.current = rawStatus;
    }
  }, [rawStatus, contactsData?.contacts?.length]);

  const discoverMutation = useMutation({
    onMutate: () => {
      setRateLimitError(null);
      setPollingDuration(0);
    },
    mutationFn: (options?: { forceRefresh?: boolean }) =>
      discoverCompanyContacts(companyId, options),
    onSuccess: () => {
      setAriaAnnouncement('Contact discovery initiated.');
      queryClient.invalidateQueries({ queryKey: ['company-contacts', companyId] });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.statusCode === 429) {
        const msg = 'Discovery limit reached. Please wait a few moments before trying again.';
        setRateLimitError(msg);
        setAriaAnnouncement(msg);
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to discover contacts.';
        setRateLimitError(msg);
        setAriaAnnouncement('Contact discovery failed.');
      }
    },
  });

  const selectMutation = useMutation({
    onMutate: () => {
      setBindingError(null);
    },
    mutationFn: async (contactId: string) => {
      // 1. Select the company contact
      const selectionRes = await selectCompanyContact(companyId, contactId);

      // 2. Resolve canonical company campaign using existing retrieval contract
      const campaign = await resolveCanonicalCompanyCampaign(companyId, companyName);
      if (!campaign) {
        throw new Error('No campaign found for this company. Please create a campaign first.');
      }

      // 3. Bind recipient to campaign via POST /api/v1/campaigns/:id/recipients
      const boundRecipients = await addRecipientsToCampaign(campaign.id, [
        { personCompanyAssociationId: contactId },
      ]);

      const boundRecipient = boundRecipients[0] ?? null;

      return {
        selection: selectionRes,
        campaign,
        boundRecipient,
      };
    },
    onSuccess: (result) => {
      setActiveCampaign(result.campaign);
      setBoundCampaignRecipient(result.boundRecipient);
      queryClient.invalidateQueries({ queryKey: ['company-contacts', companyId] });
      const campaignTitle = result.campaign.name;
      setAriaAnnouncement(`Target contact selected and bound to ${campaignTitle}.`);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to bind contact to campaign.';
      setBindingError(msg);
      setAriaAnnouncement(`Failed to bind contact: ${msg}`);
    },
  });

  return {
    contactsData,
    isLoading,
    isError,
    error,
    rateLimitError,
    bindingError,
    boundCampaignRecipient,
    activeCampaign,
    ariaAnnouncement,
    setAriaAnnouncement,
    isPollingActive,
    isStillRunningTimeout,
    setRateLimitError,
    refetch,
    discoverContacts: (options?: { forceRefresh?: boolean }) => discoverMutation.mutate(options),
    isDiscoverPending: discoverMutation.isPending,
    selectContact: (contactId: string) => selectMutation.mutate(contactId),
    selectContactAsync: (contactId: string) => selectMutation.mutateAsync(contactId),
    isSelectPending: selectMutation.isPending,
  };
}
