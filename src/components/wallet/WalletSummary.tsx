// src/components/wallet/WalletSummary.tsx
import React from "react";
import { Wallet } from "../../state/useWalletStore";

type Props = {
  wallet: Wallet;
};

export default function WalletSummary({ wallet }: Props) {
  const isActive = wallet.status === "active";
  const isLowBalance = wallet.balance < 50;

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Wallet</h2>

        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            isActive
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {isActive ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="mt-4">
        <p className="text-sm text-gray-500">Available Balance</p>
        <p className="mt-1 text-3xl font-bold">
          ₹{wallet.balance.toFixed(2)}
        </p>
      </div>

      {!isActive && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Wallet is inactive. AI replies are blocked until reactivated.
        </div>
      )}

      {isActive && isLowBalance && (
        <div className="mt-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          Wallet balance is running low. AI replies may stop soon.
        </div>
      )}
    </div>
  );
}
