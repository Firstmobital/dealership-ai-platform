// src/pages/settings/WalletPage.tsx

import { useEffect } from "react";
import { AlertTriangle, XCircle, Wallet as WalletIcon } from "lucide-react";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useWalletStore } from "../../state/useWalletStore";

export default function WalletPage() {
  const { currentOrganization } = useOrganizationStore();
  const {
    wallet,
    walletStatus,
    loading,
    fetchWallet,
  } = useWalletStore();

  /* -------------------------------------------------------------------------- */
  /* LOAD WALLET                                                                */
  /* -------------------------------------------------------------------------- */
  useEffect(() => {
    if (currentOrganization?.id) {
      fetchWallet(currentOrganization.id);
    }
  }, [currentOrganization?.id, fetchWallet]);

  if (loading) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Loading wallet…
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* ALERT BANNER                                                               */
  /* -------------------------------------------------------------------------- */
  const renderAlert = () => {
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

    if (walletStatus === "critical") {
      return (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <XCircle size={18} />
          <div>
            <p className="font-medium">Critical wallet balance</p>
            <p className="text-xs">
              Balance is below ₹{wallet.critical_balance_threshold}.
              AI may stop responding soon.
            </p>
          </div>
        </div>
      );
    }

    if (walletStatus === "low") {
      return (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <AlertTriangle size={18} />
          <div>
            <p className="font-medium">Low wallet balance</p>
            <p className="text-xs">
              Balance is below ₹{wallet.low_balance_threshold}.
              Please plan a recharge.
            </p>
          </div>
        </div>
      );
    }

    return null;
  };

  /* -------------------------------------------------------------------------- */
  /* PAGE                                                                       */
  /* -------------------------------------------------------------------------- */
  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <WalletIcon className="text-slate-700" />
        <h1 className="text-lg font-semibold text-slate-900">
          Wallet
        </h1>
      </div>

      {renderAlert()}

      {wallet && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4">
            <p className="text-sm text-slate-500">
              Current Balance
            </p>
            <p className="text-2xl font-semibold text-slate-900">
              ₹{wallet.balance.toFixed(2)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm text-slate-600">
            <div>
              <p className="text-xs uppercase text-slate-400">
                Low balance threshold
              </p>
              <p>
                ₹{wallet.low_balance_threshold}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase text-slate-400">
                Critical balance threshold
              </p>
              <p>
                ₹{wallet.critical_balance_threshold}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
