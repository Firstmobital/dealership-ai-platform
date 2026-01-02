// src/pages/settings/WalletPage.tsx
// FINAL — Phase 5 Wallet Page (Manual Credit + Transactions + Recharge CTA)

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  XCircle,
  Wallet as WalletIcon,
  PlusCircle,
} from "lucide-react";

import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useWalletStore } from "../../state/useWalletStore";
import { useAuthStore } from "../../state/useAuthStore";
import { supabase } from "../../lib/supabase";

import LowBalanceBanner from "../../components/wallet/LowBalanceBanner";
import RechargeWalletModal from "../../components/wallet/RechargeWalletModal";

export default function WalletPage() {
  const { currentOrganization } = useOrganizationStore();
  const { user } = useAuthStore();

  const {
    wallet,
    walletStatus,
    loading,
    transactions,
    fetchWallet,
    fetchTransactions,
  } = useWalletStore();

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRechargeModal, setShowRechargeModal] = useState(false);

  const isAdmin =
    user?.organization_role === "owner" ||
    user?.organization_role === "admin";

  /* -------------------------------------------------------------------------- */
  /* LOAD WALLET + TRANSACTIONS                                                  */
  /* -------------------------------------------------------------------------- */
  useEffect(() => {
    if (currentOrganization?.id) {
      fetchWallet(currentOrganization.id);
      fetchTransactions(currentOrganization.id);
    }
  }, [currentOrganization?.id, fetchWallet, fetchTransactions]);

  /* -------------------------------------------------------------------------- */
  /* MANUAL CREDIT HANDLER                                                       */
  /* -------------------------------------------------------------------------- */
  const handleManualCredit = async () => {
    if (!currentOrganization?.id || !amount) return;

    setSubmitting(true);
    setError(null);

    const { error } = await supabase.rpc(
      "phase5_wallet_manual_credit",
      {
        p_organization_id: currentOrganization.id,
        p_amount: Number(amount),
        p_note: note || null,
      }
    );

    if (error) {
      setError(error.message);
    } else {
      setAmount("");
      setNote("");
      await fetchWallet(currentOrganization.id);
      await fetchTransactions(currentOrganization.id);
    }

    setSubmitting(false);
  };

  /* -------------------------------------------------------------------------- */
  /* BLOCKING / SYSTEM ALERTS (NON-CTA)                                          */
  /* -------------------------------------------------------------------------- */
  const renderSystemAlert = () => {
    if (!wallet || walletStatus === "missing") {
      return (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <AlertTriangle size={18} />
          <div>
            <p className="font-medium">Wallet not found</p>
            <p className="text-xs text-slate-500">
              Please contact an administrator to set up billing.
            </p>
          </div>
        </div>
      );
    }

    if (walletStatus === "inactive") {
      return (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-slate-300 bg-slate-100 p-4 text-sm text-slate-700">
          <XCircle size={18} />
          <div>
            <p className="font-medium">Wallet inactive</p>
            <p className="text-xs text-slate-500">
              AI responses are currently disabled.
            </p>
          </div>
        </div>
      );
    }

    return null;
  };

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading wallet…</div>;
  }

  /* -------------------------------------------------------------------------- */
  /* PAGE                                                                       */
  /* -------------------------------------------------------------------------- */
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <WalletIcon className="text-slate-700" />
        <h1 className="text-lg font-semibold text-slate-900">Wallet</h1>
      </div>

      {/* Low / Critical Balance CTA */}
      {wallet &&
        (walletStatus === "low" || walletStatus === "critical") && (
          <LowBalanceBanner
            status={walletStatus}
            lowThreshold={wallet.low_balance_threshold}
            criticalThreshold={wallet.critical_balance_threshold}
            onRechargeClick={() => setShowRechargeModal(true)}
          />
        )}

      {/* System Alerts */}
      {renderSystemAlert()}

      {/* Wallet Summary */}
      {wallet && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Current Balance</p>
          <p className="text-2xl font-semibold text-slate-900">
            ₹{wallet.balance.toFixed(2)}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm text-slate-600">
            <div>
              <p className="text-xs uppercase text-slate-400">
                Low balance threshold
              </p>
              <p>₹{wallet.low_balance_threshold}</p>
            </div>

            <div>
              <p className="text-xs uppercase text-slate-400">
                Critical balance threshold
              </p>
              <p>₹{wallet.critical_balance_threshold}</p>
            </div>
          </div>
        </div>
      )}

      {/* Manual Credit (Admin / Owner only) */}
      {isAdmin && wallet && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <PlusCircle size={18} />
            <h2 className="text-sm font-semibold">Manual Wallet Credit</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              type="number"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            />

            <input
              type="text"
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            />

            <button
              onClick={handleManualCredit}
              disabled={submitting}
              className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {submitting ? "Adding…" : "Add Credit"}
            </button>
          </div>

          {error && (
            <p className="mt-2 text-xs text-red-600">{error}</p>
          )}
        </div>
      )}

      {/* Transactions */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold">
          Wallet Transactions
        </h2>

        {transactions.length === 0 ? (
          <p className="text-sm text-slate-500">
            No transactions yet.
          </p>
        ) : (
          <div className="space-y-2 text-sm">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between border-b pb-2 last:border-b-0"
              >
                <div>
                  <p className="font-medium capitalize">
                    {tx.purpose?.replace(/_/g, " ") || tx.type}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(tx.created_at).toLocaleString()}
                  </p>
                </div>

                <div
                  className={
                    tx.direction === "out"
                      ? "text-red-600"
                      : "text-green-600"
                  }
                >
                  {tx.direction === "out" ? "-" : "+"}₹
                  {tx.amount.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recharge Modal */}
      <RechargeWalletModal
        open={showRechargeModal}
        onClose={() => setShowRechargeModal(false)}
      />
    </div>
  );
}
