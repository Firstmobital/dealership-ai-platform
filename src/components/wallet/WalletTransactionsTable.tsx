// src/components/wallet/WalletTransactionsTable.tsx
// FINAL — Phase 5 Wallet Ledger Table (Production)

import React from "react";
import { WalletTransaction } from "../../state/useWalletStore";

type Props = {
  transactions: WalletTransaction[];
  loading?: boolean;
};

export default function WalletTransactionsTable({
  transactions,
  loading = false,
}: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Loading wallet transactions…
      </div>
    );
  }

  if (!transactions.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        No wallet transactions found.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h3 className="text-sm font-semibold text-slate-900">
          Wallet Activity
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Purpose</th>
              <th className="px-5 py-3 text-right">Amount</th>
              <th className="px-5 py-3 text-right">Balance After</th>
            </tr>
          </thead>

          <tbody>
            {transactions.map((txn) => {
              const isDebit = txn.direction === "out";
              const amountColor = isDebit
                ? "text-red-600"
                : "text-green-600";

              return (
                <tr
                  key={txn.id}
                  className="border-t border-slate-100"
                >
                  {/* Date */}
                  <td className="px-5 py-3 text-slate-700">
                    {new Date(txn.created_at).toLocaleString()}
                  </td>

                  {/* Purpose */}
                  <td className="px-5 py-3 capitalize text-slate-700">
                    {txn.purpose
                      ? txn.purpose.replace(/_/g, " ")
                      : txn.reference_type?.replace(/_/g, " ") ?? "—"}
                  </td>

                  {/* Amount */}
                  <td
                    className={`px-5 py-3 text-right font-medium ${amountColor}`}
                  >
                    {isDebit ? "-" : "+"}₹{txn.amount.toFixed(2)}
                  </td>

                  {/* Balance After */}
                  <td className="px-5 py-3 text-right text-slate-600">
                    {txn.balance_after !== null &&
                    txn.balance_after !== undefined
                      ? `₹${txn.balance_after.toFixed(2)}`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
