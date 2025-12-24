// src/components/wallet/WalletTransactionsTable.tsx
import React from "react";
import { WalletTransaction } from "../../state/useWalletStore";

type Props = {
  transactions: WalletTransaction[];
  loading?: boolean;
};

export default function WalletTransactionsTable({
  transactions,
  loading,
}: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-5 text-sm text-gray-500">
        Loading wallet transactions…
      </div>
    );
  }

  if (!transactions.length) {
    return (
      <div className="rounded-xl border bg-white p-5 text-sm text-gray-500">
        No wallet transactions found.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="border-b px-5 py-3">
        <h3 className="text-sm font-semibold">Recent Wallet Activity</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Amount</th>
              <th className="px-5 py-3">Reference</th>
            </tr>
          </thead>

          <tbody>
            {transactions.map((txn) => (
              <tr key={txn.id} className="border-t">
                <td className="px-5 py-3">
                  {new Date(txn.created_at).toLocaleString()}
                </td>

                <td className="px-5 py-3 capitalize">
                  {txn.type === "debit" ? "Debit" : txn.type}
                </td>

                <td className="px-5 py-3 font-medium text-red-600">
                  -₹{txn.amount.toFixed(2)}
                </td>

                <td className="px-5 py-3 text-gray-500">
                  {txn.reference_type === "ai_usage"
                    ? "AI usage"
                    : txn.reference_type ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
