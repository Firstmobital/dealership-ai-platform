import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import type { Campaign, CampaignMessage } from '../types/database';

type CsvRow = {
  phone: string;
  variables: Record<string, unknown>;
};

type CampaignState = {
  campaigns: Campaign[];
  messages: Record<string, CampaignMessage[]>;
  loading: boolean;

  fetchCampaigns: (organizationId: string) => Promise<void>;
  fetchCampaignMessages: (campaignId: string) => Promise<void>;

  createCampaignWithMessages: (args: {
    organizationId: string;
    name: string;
    description?: string;
    templateBody: string;
    templateVariables: string[];
    scheduledAt: string | null;
    rows: CsvRow[];
  }) => Promise<string>;

  launchCampaign: (campaignId: string, scheduledAt?: string | null) => Promise<void>;
};

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaigns: [],
  messages: {},
  loading: false,

  fetchCampaigns: async (organizationId: string) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[useCampaignStore] fetchCampaigns error', error);
      set({ loading: false });
      throw error;
    }

    set({ campaigns: data ?? [], loading: false });
  },

  fetchCampaignMessages: async (campaignId: string) => {
    const { data, error } = await supabase
      .from('campaign_messages')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[useCampaignStore] fetchCampaignMessages error', error);
      throw error;
    }

    set((state) => ({
      messages: {
        ...state.messages,
        [campaignId]: (data ?? []) as CampaignMessage[],
      },
    }));
  },

  createCampaignWithMessages: async ({
    organizationId,
    name,
    description,
    templateBody,
    templateVariables,
    scheduledAt,
    rows,
  }) => {
    const status = scheduledAt ? 'scheduled' : 'draft';
    const totalRecipients = rows.length;

    // 1) Create campaign
    const { data: campaignData, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        organization_id: organizationId,
        name,
        description: description ?? null,
        channel: 'whatsapp',
        status,
        scheduled_at: scheduledAt,
        template_body: templateBody,
        template_variables: templateVariables,
        total_recipients: totalRecipients,
      })
      .select('id')
      .single();

    if (campaignError || !campaignData) {
      console.error('[useCampaignStore] createCampaign error', campaignError);
      throw campaignError ?? new Error('Failed to create campaign');
    }

    const campaignId = campaignData.id as string;

    // 2) Insert campaign_messages
    if (rows.length > 0) {
      const messagesPayload = rows.map((row) => ({
        organization_id: organizationId,
        campaign_id: campaignId,
        phone: row.phone,
        variables: row.variables,
        status: 'pending',
      }));

      const { error: messagesError } = await supabase
        .from('campaign_messages')
        .insert(messagesPayload);

      if (messagesError) {
        console.error('[useCampaignStore] insert campaign_messages error', messagesError);
        throw messagesError;
      }
    }

    // 3) Refresh campaigns + messages in store
    await get().fetchCampaigns(organizationId);
    await get().fetchCampaignMessages(campaignId);

    return campaignId;
  },

  launchCampaign: async (campaignId, scheduledAt) => {
    const effectiveScheduledAt = scheduledAt ?? new Date().toISOString();

    const { error } = await supabase
      .from('campaigns')
      .update({
        status: 'scheduled',
        scheduled_at: effectiveScheduledAt,
      })
      .eq('id', campaignId);

    if (error) {
      console.error('[useCampaignStore] launchCampaign error', error);
      throw error;
    }

    // Optimistic update in store
    set((state) => ({
      campaigns: state.campaigns.map((c) =>
        c.id === campaignId
          ? { ...c, status: 'scheduled', scheduled_at: effectiveScheduledAt }
          : c
      ),
    }));
  },
}));
