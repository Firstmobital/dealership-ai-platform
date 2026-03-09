// filepath: /Users/air/dealership-ai-platform/supabase/functions/ai-handler/llm/completion.ts
import { openai, gemini } from "../clients.ts";
import { createLogger } from "../logging.ts";
import type { ChatMsg } from "../history.ts";

type AICompletionResult = {
  text: string | null;
  inputTokens: number;
  outputTokens: number;
  provider: "openai" | "gemini";
  model: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asRecord(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : {};
}

export async function runOpenAICompletion(params: {
  model: string;
  systemPrompt: string;
  historyMessages: ChatMsg[];
  logger: ReturnType<typeof createLogger>;
}): Promise<AICompletionResult | null> {
  const { model, systemPrompt, historyMessages, logger } = params;

  try {
    const resp = await openai.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [{ role: "system", content: systemPrompt }, ...historyMessages],
    });

    const text = resp.choices?.[0]?.message?.content?.trim() ?? null;

    return {
      text,
      inputTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
      provider: "openai",
      model,
    };
  } catch (err) {
    logger.error("[openai] completion error", { error: err, model });
    return null;
  }
}

export async function runGeminiCompletion(params: {
  model: string;
  systemPrompt: string;
  historyMessages: ChatMsg[];
  logger: ReturnType<typeof createLogger>;
}): Promise<AICompletionResult | null> {
  const { model, systemPrompt, historyMessages, logger } = params;

  if (!gemini) {
    logger.warn("[gemini] missing GEMINI_API_KEY; fallback to OpenAI");
    return null;
  }

  try {
    const genModel = gemini.getGenerativeModel({
      model,
      systemInstruction: systemPrompt,
    });

    // Gemini format: role "user" / "model"
    const history = historyMessages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastUser = historyMessages[historyMessages.length - 1]?.content ?? "";

    const chat = genModel.startChat({ history });
    const resp = await chat.sendMessage(lastUser);
    const text = resp.response.text()?.trim() ?? null;

    const usageMeta: unknown =
      (resp as unknown as { response?: { usageMetadata?: unknown } }).response
        ?.usageMetadata;
    const usage = asRecord(usageMeta);

    return {
      text,
      inputTokens:
        typeof usage.promptTokenCount === "number" ? usage.promptTokenCount : 0,
      outputTokens:
        typeof usage.candidatesTokenCount === "number"
          ? usage.candidatesTokenCount
          : 0,
      provider: "gemini",
      model,
    };
  } catch (err) {
    logger.error("[gemini] completion error", { error: err, model });
    return null;
  }
}

export async function runAICompletion(params: {
  provider: "openai" | "gemini";
  model: string;
  systemPrompt: string;
  historyMessages: ChatMsg[];
  logger: ReturnType<typeof createLogger>;
}): Promise<AICompletionResult | null> {
  if (params.provider === "gemini") {
    const gem = await runGeminiCompletion(params);
    if (gem) return gem;
    return runOpenAICompletion(params);
  }
  return runOpenAICompletion(params);
}
