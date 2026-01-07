// src/state/useChatStore.ts
import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";

import type { Conversation, Message } from "../types/database";

/* ========================================================================== */
/*  REALTIME INIT GUARD (CRITICAL)                                             */
/* ========================================================================== */

let realtimeInitialized = false;

/* ========================================================================== */
/*  FILTER TYPES                                                              */
/* ========================================================================== */

export type ConversationFilter =
  | "all"
  | "assigned"
  | "unassigned"
  | "bot"
  | "whatsapp"
  | "web"
  | "internal"
  | "psf";

/* ========================================================================== */
/*  CHAT STORE TYPE                                                           */
/* ========================================================================== */

type ChatState = {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  activeConversationId: string | null;

  filter: ConversationFilter;
  loading: boolean;

  // 🔍 Phase 1B — Search & Filters
  search: string;
  intentFilter: string | null;
  assignedFilter: string | null;

  aiToggle: Record<string, boolean>;
  unread: Record<string, number>;

  fetchConversations: (
    organizationId: string,
    params?: {
      search?: string;
      intent?: string | null;
      assignedTo?: string | null;
    }
  ) => Promise<void>;

  fetchMessages: (conversationId: string) => Promise<void>;

  initRealtime: (organizationId: string) => void;

  setActiveConversation: (conversationId: string | null) => void;
  setFilter: (filter: ConversationFilter) => void;

  // 🔍 setters
  setSearch: (q: string) => void;
  setIntentFilter: (intent: string | null) => void;
  setAssignedFilter: (userId: string | null) => void;

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

    const { data } = await supabase
      .from("contacts")
      .select("id, phone, name, first_name, last_name")
      .eq("id", contactId)
      .maybeSingle();

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

  // 🔍 Phase 1B
  search: "",
  intentFilter: null,
  assignedFilter: null,

  aiToggle: {},
  unread: {},

  /* -------------------------------------------------------------------------- */
  /* FETCH CONVERSATIONS (ORG ONLY)                                             */
  /* -------------------------------------------------------------------------- */
  fetchConversations: async (organizationId, params) => {
    const search = (params?.search ?? "").trim();
    const intent = params?.intent ?? null;
    const assignedTo = params?.assignedTo ?? null;

    set({ loading: true });

    let query = supabase
      .from("conversations")
      .select("*, contacts(*)")
      .eq("organization_id", organizationId)
      .order("last_message_at", { ascending: false })
      .limit(200);

    if (intent) query = query.eq("intent", intent);
    if (assignedTo) query = query.eq("assigned_to", assignedTo);

    if (search) {
      const digits = search.replace(/\D/g, "");
      const nameTerm = `%${search}%`;

      if (digits) {
        query = query.or(
          `contacts.name.ilike.${nameTerm},contacts.phone.ilike.%${digits}%`
        );
      } else {
        query = query.or(`contacts.name.ilike.${nameTerm}`);
      }
    }

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
  fetchMessages: async (conversationId) => {
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
  /* REALTIME                                                                  */
  /* -------------------------------------------------------------------------- */
  initRealtime: (organizationId) => {
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
          const convRaw = payload.new as any;

          if (get().conversations.some((c) => c.id === convRaw.id)) return;

          void (async () => {
            const contact = await fetchContactForConversation(convRaw);
            const conv = normalizeConversation({
              ...convRaw,
              contacts: contact,
            });
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

          if (existing.some((m) => m.id === msg.id)) return;

          const isActive =
            get().activeConversationId === msg.conversation_id;

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

  // 🔍 setters
  setSearch: (q) => set({ search: q }),
  setIntentFilter: (intent) => set({ intentFilter: intent }),
  setAssignedFilter: (userId) => set({ assignedFilter: userId }),

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
        c.id === conversationId
          ? { ...c, ai_enabled: enabled }
          : c
      ),
    }));
  },

  /* -------------------------------------------------------------------------- */
  /* SEND MESSAGE                                                               */
  /* -------------------------------------------------------------------------- */
  sendMessage: async (conversationId, payload) => {
    const text = payload.text?.trim() ?? "";
    if (!text) return { noReply: false };

    if (payload.channel === "whatsapp") {
      console.warn("WhatsApp messages cannot be sent from frontend");
      return { noReply: false };
    }

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: payload.sender ?? "agent",
      message_type: payload.message_type ?? "text",
      text,
      channel: payload.channel ?? "web",
    });

    const aiEnabled = get().aiToggle[conversationId];
    if (!aiEnabled) return { noReply: false };

    const { data } = await supabase.functions.invoke("ai-handler", {
      body: { conversation_id: conversationId, user_message: text },
    });

    if (data?.no_reply) return { noReply: true };
    return { noReply: false };
  },

  /* -------------------------------------------------------------------------- */
  /* FOLLOW-UP SUGGESTION                                                       */
  /* -------------------------------------------------------------------------- */
  suggestFollowup: async (conversationId) => {
    const { data } = await supabase.functions.invoke("ai-handler", {
      body: {
        conversation_id: conversationId,
        user_message: "Suggest follow-up",
        mode: "suggest_followup",
      },
    });

    return (data?.suggestion ?? "").toString();
  },
}));
