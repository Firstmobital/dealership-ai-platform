import { create } from 'zustand';
import type { WhatsappSettings } from '../types/database';
import { fetchWhatsappSettings, upsertWhatsappSettings } from '../lib/api/whatsapp';

type WhatsappSettingsState = {
  settings: WhatsappSettings | null;
  loading: boolean;
  error: string | null;
  loadSettings: (organizationId: string) => Promise<void>;
  saveSettings: (
    organizationId: string,
    values: Partial<WhatsappSettings>
  ) => Promise<void>;
};

export const useWhatsappSettingsStore = create<WhatsappSettingsState>((set) => ({
  settings: null,
  loading: false,
  error: null,

  loadSettings: async (organizationId: string) => {
    set({ loading: true, error: null });

    try {
      const data = await fetchWhatsappSettings(organizationId);
      set({ settings: data, loading: false });
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message ?? 'Failed to load WhatsApp settings'
      });
      throw error;
    }
  },

  saveSettings: async (organizationId: string, values) => {
    set({ loading: true, error: null });

    try {
      const data = await upsertWhatsappSettings(organizationId, values);
      set({ settings: data, loading: false });
    } catch (error: any) {
      console.error('[WA-SETTINGS] Save error:', error);
      set({
        loading: false,
        error: error?.message ?? 'Failed to save WhatsApp settings'
      });
      throw error;
    }
  }
}));
