// src/components/wallet/RechargeWalletModal.tsx
// Phase 5 — Step 4: Razorpay Checkout (client) + fallback instructions

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { supabase } from "../../lib/supabaseClient";

type Props = {
  open: boolean;
  onClose: () => void;
};

declare global {
  interface Window {
    Razorpay?: any;
  }
}

async function loadRazorpayScript(): Promise<boolean> {
  if (window.Razorpay) return true;

  return await new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function RechargeWalletModal({ open, onClose }: Props) {
  const { activeOrganization } = useOrganizationStore();

  const quickAmounts = useMemo(() => [499, 999, 1999, 4999, 9999], []);
  const [amount, setAmount] = useState<number>(999);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const startPayment = async () => {
    if (!activeOrganization?.id) return;

    setLoading(true);
    setError(null);

    try {
      const ok = await loadRazorpayScript();
      if (!ok) {
        setError("Razorpay Checkout failed to load. Please try again.");
        setLoading(false);
        return;
      }

      // Call Edge Function to create Razorpay order
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/razorpay-create-order`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            organization_id: activeOrganization.id,
            amount_rupees: amount,
          }),
        }
      );

      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(json?.error || "Failed to create order");
      }

      const options = {
        key: json.key_id,
        amount: json.amount_paise,
        currency: json.currency,
        name: "Techwheels AI",
        description: "Wallet Recharge",
        order_id: json.order_id,
        handler: function () {
          // Webhook will credit wallet.
          // This handler confirms client-side success UI only.
          onClose();
        },
        theme: { color: "#0f172a" },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e: any) {
      setError(e?.message || "Payment failed");
    }

    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recharge Wallet</h2>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 text-sm text-slate-700">
          <div>
            <p className="text-xs text-slate-500 mb-2">Choose amount</p>
            <div className="flex flex-wrap gap-2">
              {quickAmounts.map((a) => (
                <button
                  key={a}
                  onClick={() => setAmount(a)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    amount === a
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  ₹{a}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            onClick={startPayment}
            disabled={loading}
            className="w-full rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {loading ? "Opening Razorpay…" : `Pay ₹${amount} with Razorpay`}
          </button>

          <div className="rounded border bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-medium mb-1">Note</p>
            <p>
              Wallet credit is confirmed after payment is captured. If you close the
              payment window, your balance will update once Razorpay confirms via webhook.
            </p>
          </div>
        </div>

        <div className="mt-5 text-right">
          <button
            onClick={onClose}
            className="rounded border border-slate-300 px-4 py-2 text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
