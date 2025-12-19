// src/state/useChatStore.ts

import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";

import type { Conversation, Message } from "../types/database";
import { useSubOrganizationStore } from "./useSubOrganizationStore";

/* ========================================================================== */
/*  REALTIME INIT GUARD (CRITICAL)                                             */
/* ========================================================================== */

let realtimeInitialized = false;

/* ========================================================================== */
/*  FILTER TYPES                                                              */
/* ========================================================================== */

export type ConversationFilter =
  | "all"
  | "unassigned"
  | "assigned"
  | "bot"
  | "whatsapp"
  | "web"
  | "internal";

/* ========================================================================== */
/*  CHAT STORE TYPE                                                           */
/* ========================================================================== */

type ChatState = {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  activeConversationId: string | null;

  filter: ConversationFilter;
  loading: boolean;

  aiToggle: Record<string, boolean>;
  unread: Record<string, number>;

  fetchConversations: (organizationId: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;

  initRealtime: (organizationId: string) => void;

  setActiveConversation: (conversationId: string | null) => void;
  setFilter: (filter: ConversationFilter) => void;

  toggleAI: (conversationId: string, enabled: boolean) => Promise<void>;

  sendMessage: (
    conversationId: string,
    payload: Partial<Message>
  ) => Promise<{ noReply: boolean }>;

  suggestFollowup: (conversationId: string) => Promise<string>;
};

/* ========================================================================== */
/*  HELPERS                                                                   */
/* ========================================================================== */

function normalizeConversation(row: any): Conversation {
  // Your select uses `contacts(*)` so Supabase returns `contacts` as an object/array.
  // Normalize to a predictable `contact` field (safe for UI).
  const contact = row?.contacts
    ? Array.isArray(row.contacts)
      ? row.contacts[0] ?? null
      : row.contacts
    : null;

  return {
    ...row,
    contact,
  } as Conversation;
}

async function fetchContactForConversation(conversation: any) {
  try {
    const contactId = conversation?.contact_id;
    if (!contactId) return null;

    const { data, error } = await supabase
      .from("contacts")
      .select("id, phone, name, first_name, last_name")
      .eq("id", contactId)
      .maybeSingle();

    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

/* ========================================================================== */
/*  STORE IMPLEMENTATION                                                      */
/* ========================================================================== */

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  messages: {},
  activeConversationId: null,

  filter: "all",
  loading: false,

  aiToggle: {},
  unread: {},

  /* -------------------------------------------------------------------------- */
  /* FETCH CONVERSATIONS                                                        */
  /* -------------------------------------------------------------------------- */
  fetchConversations: async (organizationId: string) => {
    const { activeSubOrg } = useSubOrganizationStore.getState();

    set({ loading: true });

    // ✅ All divisions = DO NOT filter by sub_organization_id at all
    // ✅ Specific division = filter by that division id
    let query = supabase
      .from("conversations")
      .select("*, contacts(*)")
      .eq("organization_id", organizationId)
      .order("last_message_at", { ascending: false });

    if (activeSubOrg) query = query.eq("sub_organization_id", activeSubOrg.id);

    const { data, error } = await query;

    if (error) {
      console.error("[useChatStore] fetchConversations error", error);
      set({ loading: false });
      return;
    }

    const normalized = (data ?? []).map(normalizeConversation);

    const aiToggle = Object.fromEntries(
      normalized.map((c: any) => [c.id, c.ai_enabled !== false])
    );

    set({
      conversations: normalized as Conversation[],
      aiToggle,
      loading: false,
    });
  },

  /* -------------------------------------------------------------------------- */
  /* FETCH MESSAGES                                                             */
  /* -------------------------------------------------------------------------- */
  fetchMessages: async (conversationId: string) => {
    // ✅ IMPORTANT: messages should be fetched only by conversation_id
    // because chat ownership is by conversation, not by selected division filter.
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[useChatStore] fetchMessages error", error);
      return;
    }

    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: (data ?? []) as Message[],
      },
    }));
  },

  /* -------------------------------------------------------------------------- */
  /* REALTIME (SINGLE SOURCE OF TRUTH)                                          */
  /* -------------------------------------------------------------------------- */
  initRealtime: (organizationId: string) => {
    if (realtimeInitialized) return;
    realtimeInitialized = true;

    /* ------------------ CONVERSATIONS ------------------ */
    supabase
      .channel("rt-conversations")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversations",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          // NOTE: payload.new does NOT include joined contacts, so we enrich it.
          const convRaw = payload.new as any;

          // ✅ Read activeSubOrg dynamically (division can change after initRealtime)
          const { activeSubOrg } = useSubOrganizationStore.getState();

          // Chats rule:
          // - If a division selected → only accept that division's conversations
          // - If ALL divisions selected → accept everything under org
          if (activeSubOrg && convRaw.sub_organization_id !== activeSubOrg.id)
            return;

          const existing = get().conversations;
          if (existing.some((c) => c.id === convRaw.id)) return;

          // Enrich contact asynchronously
          void (async () => {
            const contact = await fetchContactForConversation(convRaw);
            const conv = normalizeConversation({ ...convRaw, contacts: contact });

            set({ conversations: [conv, ...get().conversations] });
          })();
        }
      )
      .subscribe();

    /* ------------------ MESSAGES ------------------ */
    supabase
      .channel("rt-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          const existing = get().messages[msg.conversation_id] ?? [];

          // 🔒 HARD DEDUPE
          if (existing.some((m) => m.id === msg.id)) return;

          // ✅ If division selected, we only want unread counts / UI updates
          // for conversations that are currently visible (division filtered).
          const { activeSubOrg } = useSubOrganizationStore.getState();
          if (activeSubOrg) {
            const conv = get().conversations.find(
              (c) => c.id === msg.conversation_id
            );
            // If that conversation isn't in the current list, ignore
            // (prevents cross-division noise).
            if (!conv) return;
          }

          const isActive = get().activeConversationId === msg.conversation_id;

          set({
            messages: {
              ...get().messages,
              [msg.conversation_id]: [...existing, msg],
            },
            unread: {
              ...get().unread,
              [msg.conversation_id]: isActive
                ? 0
                : (get().unread[msg.conversation_id] ?? 0) + 1,
            },
          });
        }
      )
      .subscribe();
  },

  /* -------------------------------------------------------------------------- */
  /* UI STATE                                                                   */
  /* -------------------------------------------------------------------------- */
  setActiveConversation: (conversationId) => {
    set({ activeConversationId: conversationId });

    if (conversationId) {
      set((state) => ({
        unread: { ...state.unread, [conversationId]: 0 },
      }));
    }
  },

  setFilter: (filter) => set({ filter }),

  /* -------------------------------------------------------------------------- */
  /* TOGGLE AI                                                                  */
  /* -------------------------------------------------------------------------- */
  toggleAI: async (conversationId, enabled) => {
    const { error } = await supabase
      .from("conversations")
      .update({ ai_enabled: enabled })
      .eq("id", conversationId);

    if (error) throw error;

    set((state) => ({
      aiToggle: { ...state.aiToggle, [conversationId]: enabled },
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, ai_enabled: enabled } : c
      ),
    }));
  },

  /* -------------------------------------------------------------------------- */
  /* SEND MESSAGE                                                               */
  /* -------------------------------------------------------------------------- */
  sendMessage: async (conversationId, payload) => {
    const text = payload.text?.trim() ?? "";
    if (!text) return { noReply: false };

    const sender = payload.sender ?? "user";
    const channel = payload.channel ?? "web";

    if (channel === "whatsapp") {
      console.warn("WhatsApp messages cannot be sent from frontend");
      return { noReply: false };
    }

    // ✅ Always send messages under the SAME division as the conversation.
    // This is critical when "All divisions" is selected (activeSubOrg = null).
    const conv = get().conversations.find((c) => c.id === conversationId);
    const subOrgId =
      (conv as any)?.sub_organization_id ??
      useSubOrganizationStore.getState().activeSubOrg?.id ??
      null;

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender,
      message_type: payload.message_type ?? "text",
      text,
      channel,
      sub_organization_id: subOrgId,
    });

    // realtime will deliver the message

    const aiEnabled = get().aiToggle[conversationId];
    if (!aiEnabled || sender !== "user") return { noReply: false };

    const { data, error } = await supabase.functions.invoke("ai-handler", {
      body: {
        conversation_id: conversationId,
        user_message: text,
        mode: "reply",
      },
    });

    if (error) {
      console.error("ai-handler error", error);
      return { noReply: false };
    }

    if (data?.no_reply) return { noReply: true };

    return { noReply: false };
  },

  /* -------------------------------------------------------------------------- */
  /* FOLLOW-UP SUGGESTION                                                       */
  /* -------------------------------------------------------------------------- */
  suggestFollowup: async (conversationId) => {
    const { data, error } = await supabase.functions.invoke("ai-handler", {
      body: {
        conversation_id: conversationId,
        user_message: "Suggest follow-up",
        mode: "suggest_followup",
      },
    });

    if (error) {
      console.error("suggestFollowup error", error);
      return "";
    }

    return (data?.suggestion ?? "").toString();
  },
}));
