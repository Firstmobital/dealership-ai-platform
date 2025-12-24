// src/state/useWalletStore.ts
import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";

/* ============================================================================
   TYPES
============================================================================ */

export type WalletDbStatus = "active" | "inactive";

export type WalletStatus = "missing" | "inactive" | "ok" | "low" | "critical";

export type Wallet = {
  id: string;
  organization_id: string;
  balance: number;

  // ✅ DB status only (do NOT mix with derived status)
  status: WalletDbStatus;

  low_balance_threshold: number;
  critical_balance_threshold: number;

  created_at: string;
};

/* -------------------------------------------------------------------------- */
/* WALLET TRANSACTIONS (🔥 MISSING TYPE — FIXES BUILD)                         */
/* -------------------------------------------------------------------------- */
export type WalletTransaction = {
  id: string;
  wallet_id: string;

  type: "debit" | "credit";
  direction: "in" | "out";

  amount: number;

  reference_type: "ai_usage" | "manual" | "adjustment";
  reference_id: string | null;

  created_at: string;
};

/* -------------------------------------------------------------------------- */
/* ALERTS                                                                      */
/* -------------------------------------------------------------------------- */
export type WalletAlertType = "low" | "critical" | "inactive";

export type WalletAlertLog = {
  id: string;
  organization_id: string;
  wallet_id: string;
  alert_type: WalletAlertType;
  triggered_at: string;
  resolved_at: string | null;
  created_at: string;
};

/* ============================================================================
   STORE STATE
============================================================================ */

type WalletState = {
  wallet: Wallet | null;
  loading: boolean;

  // ✅ Derived (single source of truth for UI)
  walletStatus: WalletStatus;

  // ✅ Active alerts (unresolved)
  activeAlerts: WalletAlertLog[];

  // Actions
  fetchWallet: (organizationId: string) => Promise<void>;
  clearWallet: () => void;

  // Optional: keep alert logs in sync with current walletStatus
  syncAlerts: () => Promise<void>;
};

/* ============================================================================
   HELPERS
============================================================================ */

function computeWalletStatus(wallet: Wallet | null): WalletStatus {
  if (!wallet) return "missing";
  if (wallet.status !== "active") return "inactive";

  if (wallet.balance <= wallet.critical_balance_threshold) return "critical";
  if (wallet.balance <= wallet.low_balance_threshold) return "low";

  return "ok";
}

/* ============================================================================
   STORE
============================================================================ */

export const useWalletStore = create<WalletState>((set, get) => ({
  wallet: null,
  loading: false,
  walletStatus: "missing",
  activeAlerts: [],

  /* -------------------------------------------------------------------------- */
  /* FETCH WALLET + ACTIVE ALERTS                                               */
  /* -------------------------------------------------------------------------- */
  fetchWallet: async (organizationId: string) => {
    if (!organizationId) {
      set({
        wallet: null,
        walletStatus: "missing",
        activeAlerts: [],
        loading: false,
      });
      return;
    }

    set({ loading: true });

    // 1) Load wallet
    const { data: wallet, error: walletErr } = await supabase
      .from("wallets")
      .select(
        `
          id,
          organization_id,
          balance,
          status,
          low_balance_threshold,
          critical_balance_threshold,
          created_at
        `,
      )
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (walletErr || !wallet) {
      console.error("[Wallet] fetchWallet error:", walletErr);
      set({
        wallet: null,
        walletStatus: "missing",
        activeAlerts: [],
        loading: false,
      });
      return;
    }

    const walletStatus = computeWalletStatus(wallet as Wallet);

    // 2) Load active alerts (unresolved)
    const { data: alerts, error: alertErr } = await supabase
      .from("wallet_alert_logs")
      .select(
        `
          id,
          organization_id,
          wallet_id,
          alert_type,
          triggered_at,
          resolved_at,
          created_at
        `,
      )
      .eq("organization_id", organizationId)
      .eq("wallet_id", wallet.id)
      .is("resolved_at", null)
      .order("triggered_at", { ascending: false });

    if (alertErr) {
      console.error("[Wallet] fetch activeAlerts error:", alertErr);
    }

    set({
      wallet: wallet as Wallet,
      walletStatus,
      activeAlerts: (alerts ?? []) as WalletAlertLog[],
      loading: false,
    });

    // Keep DB alerts in sync (safe + idempotent)
    await get().syncAlerts();
  },

  /* -------------------------------------------------------------------------- */
  /* SYNC ALERTS (CREATE / RESOLVE)                                             */
  /* -------------------------------------------------------------------------- */
  syncAlerts: async () => {
    const { wallet, walletStatus, activeAlerts } = get();
    if (!wallet) return;

    try {
      const desiredType: WalletAlertType | null =
        walletStatus === "critical"
          ? "critical"
          : walletStatus === "low"
          ? "low"
          : walletStatus === "inactive"
          ? "inactive"
          : null;

      const resolveTypes = new Set<WalletAlertType>();

      if (!desiredType) {
        activeAlerts.forEach((a) => resolveTypes.add(a.alert_type));
      } else {
        activeAlerts.forEach((a) => {
          if (a.alert_type !== desiredType) resolveTypes.add(a.alert_type);
        });
      }

      for (const t of resolveTypes) {
        const open = activeAlerts.find(
          (a) => a.alert_type === t && !a.resolved_at,
        );
        if (!open) continue;

        const { error } = await supabase
          .from("wallet_alert_logs")
          .update({ resolved_at: new Date().toISOString() })
          .eq("id", open.id);

        if (error) console.error("[Wallet] resolve alert error:", error);
      }

      if (desiredType) {
        const alreadyOpen = activeAlerts.some(
          (a) => a.alert_type === desiredType && !a.resolved_at,
        );

        if (!alreadyOpen) {
          const { error } = await supabase
            .from("wallet_alert_logs")
            .insert({
              organization_id: wallet.organization_id,
              wallet_id: wallet.id,
              alert_type: desiredType,
            });

          if (error) console.error("[Wallet] create alert error:", error);
        }
      }
    } catch (e) {
      console.error("[Wallet] syncAlerts fatal:", e);
    }
  },

  /* -------------------------------------------------------------------------- */
  /* CLEAR WALLET                                                               */
  /* -------------------------------------------------------------------------- */
  clearWallet: () => {
    set({
      wallet: null,
      walletStatus: "missing",
      activeAlerts: [],
      loading: false,
    });
  },
}));
