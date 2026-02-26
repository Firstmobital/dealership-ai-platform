import { supabase } from "./clients.ts";
import type { createLogger } from "./logging.ts";

/* ============================================================================
   WALLET HELPERS — PHASE 5
============================================================================ */
export async function loadWalletForOrg(organizationId: string) {
  const { data, error } = await supabase
    .from("wallets")
    .select("id, balance, status")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) return null;
  if (data.status !== "active") return null;

  return data;
}

export async function createWalletDebit(params: {
  walletId: string;
  organizationId: string;
  amount: number;
  aiUsageId: string;
}) {
  if (!params.organizationId) {
    console.error(
      "[wallet] missing organizationId in createWalletDebit",
      params
    );
    return null;
  }

  const { data, error } = await supabase
    .from("wallet_transactions")
    .insert({
      wallet_id: params.walletId,
      organization_id: params.organizationId, // ✅ ADD THIS LINE
      type: "debit",
      direction: "out",
      amount: params.amount,
      reference_type: "ai_usage",
      reference_id: params.aiUsageId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[wallet] debit insert error", error);
    return null;
  }

  return data.id;
}

/* ============================================================================
   PHASE 4 — PRICING (CUSTOMER) + COST (PLATFORM)
============================================================================ */
const MODEL_CHARGED_PRICE: Record<string, number> = {
  "gpt-4o-mini": 2.5,
  "gemini-2.5-pro": 3.0,
  "gemini-1.5-flash": 2.0,
};

export function getChargedAmountForModel(model?: string | null): number {
  const key = (model || "").trim();
  return MODEL_CHARGED_PRICE[key] ?? 2.5;
}

export function estimateActualCost(params: {
  provider: "openai" | "gemini";
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  const { provider, model, inputTokens, outputTokens } = params;

  // Approx internal cost estimation for analytics (not customer billing).
  if (provider === "openai") {
    if (model === "gpt-4o-mini") {
      const cost =
        (inputTokens / 1_000_000) * 0.15 + (outputTokens / 1_000_000) * 0.6;
      return Number(cost.toFixed(4));
    }
  }

  if (provider === "gemini") {
    if (model === "gemini-2.5-pro") {
      const cost =
        (inputTokens / 1_000_000) * 1.25 + (outputTokens / 1_000_000) * 3.75;
      return Number(cost.toFixed(4));
    }

    if (model === "gemini-1.5-flash") {
      const cost =
        (inputTokens / 1_000_000) * 0.35 + (outputTokens / 1_000_000) * 1.05;
      return Number(cost.toFixed(4));
    }
  }

  return 0;
}

export async function resolveAISettings(params: {
  organizationId: string;
  logger: ReturnType<typeof createLogger>;
}): Promise<{ provider: "openai" | "gemini"; model: string }> {
  const { organizationId, logger } = params;

  const { data } = await supabase
    .from("ai_settings")
    .select("provider, model")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (data?.provider && data?.model) {
    return { provider: data.provider, model: data.model };
  }

  logger.warn("[ai-settings] fallback to default");
  return { provider: "openai", model: "gpt-4o-mini" };
}
