// src/components/wallet/LowBalanceBanner.tsx
// Phase 5 — Low / Critical Wallet Balance CTA Banner

import { AlertTriangle, XCircle } from "lucide-react";

type Props = {
  status: "low" | "critical";
  lowThreshold: number;
  criticalThreshold: number;
  onRechargeClick: () => void;
};

export default function LowBalanceBanner({
  status,
  lowThreshold,
  criticalThreshold,
  onRechargeClick,
}: Props) {
  const isCritical = status === "critical";

  return (
    <div
      className={`mb-4 flex items-start justify-between gap-4 rounded-lg border p-4 text-sm ${
        isCritical
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-yellow-200 bg-yellow-50 text-yellow-800"
      }`}
    >
      <div className="flex items-start gap-3">
        {isCritical ? <XCircle size={18} /> : <AlertTriangle size={18} />}
        <div>
          <p className="font-medium">
            {isCritical
              ? "Critical wallet balance"
              : "Low wallet balance"}
          </p>
          <p className="text-xs">
            {isCritical
              ? `Balance is below ₹${criticalThreshold}. AI responses may stop.`
              : `Balance is below ₹${lowThreshold}. Please plan a recharge.`}
          </p>
        </div>
      </div>

      <button
        onClick={onRechargeClick}
        className="whitespace-nowrap rounded bg-slate-900 px-4 py-2 text-xs font-medium text-white"
      >
        Recharge Wallet
      </button>
    </div>
  );
}
