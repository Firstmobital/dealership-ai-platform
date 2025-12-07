// src/lib/aiHandlerClient.ts
import { supabase } from "./supabaseClient";

export type AiHandlerRequest = {
  conversation_id: string;
  user_message: string;
};

export type AiHandlerResponse = {
  conversation_id: string;
  user_message: string;
  ai_response: string;
};

export async function sendToAiHandler(
  payload: AiHandlerRequest
): Promise<AiHandlerResponse> {
  const { data, error } = await supabase.functions.invoke("ai-handler", {
    body: payload,
  });

  if (error) {
    console.error("ai-handler invoke error", error);
    throw error;
  }

  // You can tighten this type if you like
  return data as AiHandlerResponse;
}

