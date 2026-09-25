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
  AddCampaignContactsResponse,
  addContactsToCampaign,
  CampaignContactDto,
  CampaignDto,
  resolveCanonicalCompanyCampaign,
} from '../../api/campaigns';

export function useContactDiscovery(companyId: string, companyName?: string) {
  const queryClient = useQueryClient();
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [boundCampaignContact, setBoundCampaignContact] = useState<CampaignContactDto | null>(null);
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

  // Track discrete status s for accessibility announcements
  useEffect(() => {
    if (!contactsData) return;
    const currentStatus = contactsData.status;
    const prevStatus = prevStatusRef.current;

    if (prevStatus !== null && prevStatus !== currentStatus) {
      if (currentStatus === 'QUEUED' || currentStatus === 'RUNNING') {
        setAriaAnnouncement('Contact discovery started.');
      } else if (currentStatus === 'COMPLETED') {
        const count = contactsData.contacts.length;
        setAriaAnnouncement(
          count > 0
            ? `Contact discovery completed. ${count} candidate contacts found.`
            : 'Contact discovery completed. No suitable contacts identified.',
        );
      } else if (currentStatus === 'FAILED') {
        setAriaAnnouncement('Contact discovery failed.');
      }
    }

    prevStatusRef.current = currentStatus;
  }, [contactsData]);

  const discoverMutation = useMutation({
    mutationFn: (options?: { forceRefresh?: boolean }) =>
      discoverCompanyContacts(companyId, options),
    onSuccess: (res) => {
      setRateLimitError(null);
      setPollingDuration(0);
      queryClient.invalidateQueries({ queryKey: ['company-contacts', companyId] });
      if (res.reused) {
        setAriaAnnouncement('Contact discovery findings reused from 24 hour cache.');
      } else {
        setAriaAnnouncement('Contact discovery started.');
      }
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.statusCode === 429) {
        setRateLimitError(
          'Maximum 3 forced contact discovery refreshes per company per 24 hours reached. Existing contacts remain visible.',
        );
        setAriaAnnouncement('Contact discovery rate limit reached.');
      } else if (err instanceof ApiError) {
        setRateLimitError(err.message);
        setAriaAnnouncement(`Contact discovery failed: ${err.message}`);
      } else {
        setRateLimitError('Failed to execute contact discovery.');
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

      // 3. Bind contact to campaign via POST /api/v1/campaigns/:id/contacts
      const bindRes: AddCampaignContactsResponse = await addContactsToCampaign(campaign.id, [
        contactId,
      ]);

      const boundContact = bindRes.bound[0] ?? null;

      return {
        selection: selectionRes,
        campaign,
        boundContact,
        ignoredDuplicateCount: bindRes.ignoredDuplicateCount,
      };
    },
    onSuccess: (result) => {
      setActiveCampaign(result.campaign);
      setBoundCampaignContact(result.boundContact);
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
    boundCampaignContact,
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
