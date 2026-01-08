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

  // DB status only (do NOT mix with derived status)
  status: WalletDbStatus;

  low_balance_threshold: number;
  critical_balance_threshold: number;

  created_at: string;
};

/* -------------------------------------------------------------------------- */
/* WALLET TRANSACTIONS                                                         */
/* -------------------------------------------------------------------------- */
export type WalletTransaction = {
  id: string;
  organization_id?: string;
  wallet_id: string;

  type: "credit" | "debit" | "adjustment";
  direction: "in" | "out";

  amount: number;

  // Phase 5.2+
  purpose: string | null;
  reference_type: string | null;
  reference_id: string | null;

  balance_before: number | null;
  balance_after: number | null;

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

  // Derived (single source of truth for UI)
  walletStatus: WalletStatus;

  // Alerts
  activeAlerts: WalletAlertLog[];

  // Transactions
  transactions: WalletTransaction[];

  // Actions
  fetchWallet: (organizationId: string) => Promise<void>;
  fetchTransactions: (organizationId: string) => Promise<void>;
  clearWallet: () => void;
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
  transactions: [],

  /* -------------------------------------------------------------------------- */
  /* FETCH WALLET                                                               */
  /* -------------------------------------------------------------------------- */
  fetchWallet: async (organizationId: string) => {
    if (!organizationId) {
      set({
        wallet: null,
        walletStatus: "missing",
        activeAlerts: [],
        transactions: [],
        loading: false,
      });
      return;
    }

    set({ loading: true });

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
        transactions: [],
        loading: false,
      });
      return;
    }

    const walletStatus = computeWalletStatus(wallet as Wallet);

    // Load active alerts
    const { data: alerts } = await supabase
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

    set({
      wallet: wallet as Wallet,
      walletStatus,
      activeAlerts: (alerts ?? []) as WalletAlertLog[],
      loading: false,
    });

    // Sync alerts safely
    await get().syncAlerts();
  },

  /* -------------------------------------------------------------------------- */
  /* FETCH TRANSACTIONS                                                         */
  /* -------------------------------------------------------------------------- */
  fetchTransactions: async (organizationId: string) => {
    if (!organizationId) {
      set({ transactions: [] });
      return;
    }

    const { data, error } = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[Wallet] fetchTransactions error:", error);
      return;
    }

    set({
      transactions: (data ?? []) as WalletTransaction[],
    });
  },

  /* -------------------------------------------------------------------------- */
  /* SYNC ALERTS                                                                */
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

        await supabase
          .from("wallet_alert_logs")
          .update({ resolved_at: new Date().toISOString() })
          .eq("id", open.id);
      }

      if (desiredType) {
        const alreadyOpen = activeAlerts.some(
          (a) => a.alert_type === desiredType && !a.resolved_at,
        );

        if (!alreadyOpen) {
          await supabase.from("wallet_alert_logs").insert({
            organization_id: wallet.organization_id,
            wallet_id: wallet.id,
            alert_type: desiredType,
          });
        }
      }
    } catch (e) {
      console.error("[Wallet] syncAlerts fatal:", e);
    }
  },

  /* -------------------------------------------------------------------------- */
  /* CLEAR                                                                      */
  /* -------------------------------------------------------------------------- */
  clearWallet: () => {
    set({
      wallet: null,
      walletStatus: "missing",
      activeAlerts: [],
      transactions: [],
      loading: false,
    });
  },
}));
