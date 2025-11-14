import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import type { Organization } from '../types/database';

type OrganizationState = {
  organizations: Organization[];
  currentOrganization: Organization | null;
  loading: boolean;
  fetchOrganizations: () => Promise<void>;
  switchOrganization: (organizationId: string) => void;
};

export const useOrganizationStore = create<OrganizationState>((set, get) => ({
  organizations: [],
  currentOrganization: null,
  loading: false,
  fetchOrganizations: async () => {
    set({ loading: true });
    const { data, error } = await supabase.from('organizations').select('*');
    if (error) throw error;
    set({ organizations: data ?? [], currentOrganization: data?.[0] ?? null, loading: false });
  },
  switchOrganization: (organizationId: string) => {
    const org = get().organizations.find((item) => item.id === organizationId) ?? null;
    set({ currentOrganization: org });
  }
}));
