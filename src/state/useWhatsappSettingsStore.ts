// src/state/useWhatsappSettingsStore.ts
import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";
import { useSubOrganizationStore } from "./useSubOrganizationStore";
import type { WhatsappSettings } from "../types/database";

type WhatsappSettingsState = {
  settings: WhatsappSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;

  /**
   * true = we are currently using ORG-LEVEL settings as a fallback
   * even though a sub-org is selected.
   */
  isOrgFallback: boolean;

  fetchSettings: () => Promise<void>;
  saveSettings: (params: {
    phone_number: string;
    api_token: string;
    verify_token: string;
    whatsapp_phone_id: string;
    whatsapp_business_id: string;
    is_active: boolean;
  }) => Promise<void>;
  clearError: () => void;
};

function normalizeSettings(raw: any | null): WhatsappSettings | null {
  if (!raw) return null;
  return {
    ...raw,
    phone_number: raw.phone_number ?? "",
    api_token: raw.api_token ?? "",
    verify_token: raw.verify_token ?? "",
    whatsapp_phone_id: raw.whatsapp_phone_id ?? "",
    whatsapp_business_id: raw.whatsapp_business_id ?? "",
    is_active: raw.is_active ?? true,
  } as WhatsappSettings;
}

export const useWhatsappSettingsStore = create<WhatsappSettingsState>(
  (set, get) => ({
    settings: null,
    loading: false,
    saving: false,
    error: null,
    isOrgFallback: false,

    clearError: () => set({ error: null }),

    /**
     * Load WhatsApp settings using hybrid logic:
     * - If sub-org selected: try sub-org row first, else fallback to org-level row
     * - If no sub-org: use org-level row only
     */
    fetchSettings: async () => {
      const { currentOrganization } = useOrganizationStore.getState();
      const { activeSubOrg } = useSubOrganizationStore.getState();

      if (!currentOrganization) {
        set({
          error: "Select an organization to configure WhatsApp settings.",
          settings: null,
          isOrgFallback: false,
        });
        return;
      }

      set({ loading: true, error: null });

      try {
        const orgId = currentOrganization.id;
        const subOrgId = activeSubOrg?.id ?? null;

        // 1) Try sub-org specific config when sub-org is selected
        if (subOrgId) {
          let subQuery = supabase
            .from("whatsapp_settings")
            .select("*")
            .eq("organization_id", orgId)
            .eq("sub_organization_id", subOrgId)
            .maybeSingle();

          const { data: subData, error: subError } = await subQuery;

          if (subError) {
            console.error("[WA-SETTINGS] Load sub-org error:", subError);
          }

          if (subData) {
            set({
              loading: false,
              settings: normalizeSettings(subData),
              isOrgFallback: false,
              error: null,
            });
            return;
          }

          // 2) Fallback: org-level settings (sub_organization_id IS NULL)
          const { data: orgData, error: orgError } = await supabase
            .from("whatsapp_settings")
            .select("*")
            .eq("organization_id", orgId)
            .is("sub_organization_id", null)
            .maybeSingle();

          if (orgError) {
            console.error(
              "[WA-SETTINGS] Load org-level fallback error:",
              orgError
            );
          }

          if (orgData) {
            set({
              loading: false,
              settings: normalizeSettings(orgData),
              isOrgFallback: true,
              error: null,
            });
            return;
          }

          // 3) Nothing at sub-org or org-level
          set({
            loading: false,
            settings: null,
            isOrgFallback: false,
            error: null,
          });
          return;
        }

        // 4) No sub-org selected: load only org-level settings
        const { data, error } = await supabase
          .from("whatsapp_settings")
          .select("*")
          .eq("organization_id", orgId)
          .is("sub_organization_id", null)
          .maybeSingle();

        if (error) {
          console.error("[WA-SETTINGS] Load org-level error:", error);
        }

        set({
          loading: false,
          settings: normalizeSettings(data),
          isOrgFallback: false,
          error: null,
        });
      } catch (err: any) {
        console.error("[WA-SETTINGS] fetchSettings exception:", err);
        set({
          loading: false,
          settings: null,
          isOrgFallback: false,
          error:
            err?.message ?? "Unexpected error while loading WhatsApp settings.",
        });
      }
    },

    /**
     * Save settings for the CURRENT context:
     * - If sub-org selected: creates/updates a SUB-ORG row (override)
     * - If no sub-org: creates/updates ORG-LEVEL row
     *
     * Any org-level fallback that was being shown is NOT overwritten unless
     * we are actually in org-level context.
     */
    saveSettings: async ({
      phone_number,
      api_token,
      verify_token,
      whatsapp_phone_id,
      whatsapp_business_id,
      is_active,
    }) => {
      const { currentOrganization } = useOrganizationStore.getState();
      const { activeSubOrg } = useSubOrganizationStore.getState();
      const { settings } = get();

      if (!currentOrganization) {
        set({
          error: "Select an organization before saving WhatsApp settings.",
        });
        return;
      }

      set({ saving: true, error: null });

      try {
        const orgId = currentOrganization.id;
        const subOrgId = activeSubOrg?.id ?? null;

        const payload: any = {
          organization_id: orgId,
          sub_organization_id: subOrgId,
          phone_number: phone_number.trim(),
          api_token: api_token.trim(),
          verify_token: verify_token.trim(),
          whatsapp_phone_id: whatsapp_phone_id.trim(),
          whatsapp_business_id: whatsapp_business_id.trim(),
          is_active,
        };

        // If we already have a row for EXACT scope (org + subOrg), include id
        if (
          settings &&
          settings.organization_id === orgId &&
          settings.sub_organization_id === subOrgId
        ) {
          payload.id = settings.id;
        }

        const { data, error } = await supabase
          .from("whatsapp_settings")
          .upsert(payload, {
            onConflict: "organization_id,sub_organization_id",
          })
          .select("*")
          .single();

        if (error) {
          console.error("[WA-SETTINGS] saveSettings error:", error);
          set({
            saving: false,
            error: error.message ?? "Failed to save WhatsApp settings.",
          });
          return;
        }

        set({
          saving: false,
          settings: normalizeSettings(data),
          isOrgFallback: false, // we now have a specific row for this scope
          error: null,
        });
      } catch (err: any) {
        console.error("[WA-SETTINGS] saveSettings exception:", err);
        set({
          saving: false,
          error:
            err?.message ?? "Unexpected error while saving WhatsApp settings.",
        });
      }
    },
  })
);
