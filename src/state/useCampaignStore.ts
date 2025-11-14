import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import type { Campaign, CampaignContact, CampaignLog } from '../types/database';

type CampaignState = {
  campaigns: Campaign[];
  contacts: Record<string, CampaignContact[]>;
  logs: Record<string, CampaignLog[]>;
  loading: boolean;
  fetchCampaigns: (organizationId: string) => Promise<void>;
  fetchCampaignContacts: (campaignId: string) => Promise<void>;
  fetchCampaignLogs: (campaignId: string) => Promise<void>;
  saveCampaign: (payload: Partial<Campaign>) => Promise<void>;
};

export const useCampaignStore = create<CampaignState>((set) => ({
  campaigns: [],
  contacts: {},
  logs: {},
  loading: false,
  fetchCampaigns: async (organizationId) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    set({ campaigns: data ?? [], loading: false });
  },
  fetchCampaignContacts: async (campaignId) => {
    const { data, error } = await supabase
      .from('campaign_contacts')
      .select('*')
      .eq('campaign_id', campaignId);
    if (error) throw error;
    set((state) => ({ contacts: { ...state.contacts, [campaignId]: data ?? [] } }));
  },
  fetchCampaignLogs: async (campaignId) => {
    const { data, error } = await supabase
      .from('campaign_logs')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    set((state) => ({ logs: { ...state.logs, [campaignId]: data ?? [] } }));
  },
  saveCampaign: async (payload) => {
    const { id, ...rest } = payload;
    if (id) {
      const { error } = await supabase.from('campaigns').update(rest).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('campaigns').insert(rest);
      if (error) throw error;
    }
    if (payload.organization_id) {
      await useCampaignStore.getState().fetchCampaigns(payload.organization_id);
    }
  }
}));
