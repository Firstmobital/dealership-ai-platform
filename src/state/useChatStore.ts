// src/state/useChatStore.ts
import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";

import type { Conversation, Message } from "../types/database";

/* ========================================================================== */
/*  REALTIME STATE (P0-B — ORG SAFE + CLEANUP)                                 */
/* ========================================================================== */

let realtimeOrgId: string | null = null;

let rtConversations:
  | ReturnType<typeof supabase.channel>
  | null = null;

let rtMessages:
  | ReturnType<typeof supabase.channel>
  | null = null;

function teardownRealtime() {
  try {
    if (rtMessages) supabase.removeChannel(rtMessages);
  } catch {
    // ignore
  }
  try {
    if (rtConversations) supabase.removeChannel(rtConversations);
  } catch {
    // ignore
  }

  rtMessages = null;
  rtConversations = null;
  realtimeOrgId = null;
}

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

  // Cleanup (used on logout / org switch)
  reset: () => void;

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

  reset: () => {
    teardownRealtime();
    set({
      conversations: [],
      messages: {},
      activeConversationId: null,
      filter: "all",
      loading: false,
      search: "",
      intentFilter: null,
      assignedFilter: null,
      aiToggle: {},
      unread: {},
    });
  },

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
      // Phase 3: canonical ordering key (messages.order_at)
      .order("order_at", { ascending: true });

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
    // P0-B: Make realtime deterministic and org-safe.
    // If org changes, teardown everything and re-init.
    if (!organizationId) return;
    if (realtimeOrgId && realtimeOrgId !== organizationId) {
      // Global cleanup prevents cross-org listeners.
      try {
        supabase.removeAllChannels();
      } catch {
        // ignore
      }
      teardownRealtime();
    }

    if (realtimeOrgId === organizationId && rtConversations) {
      return;
    }

    realtimeOrgId = organizationId;

    /* ------------------ CONVERSATIONS ------------------ */
    rtConversations = supabase
      .channel(`rt-conversations:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const next = payload.new as any;
          const prev = payload.old as any;

          // Reorder + update the conversation in store.
          set((state) => {
            const existing = state.conversations;
            const idx = existing.findIndex((c) => c.id === next.id);
            if (idx === -1) return state;

            const updated = normalizeConversation({
              ...existing[idx],
              ...next,
              contacts: (existing[idx] as any).contact ?? (existing[idx] as any).contacts,
            });

            const reordered = [
              updated,
              ...existing.slice(0, idx),
              ...existing.slice(idx + 1),
            ];

            // Unread bump: only when last_message_at changes and convo isn't active.
            const lastChanged =
              (prev?.last_message_at ?? null) !== (next?.last_message_at ?? null);
            const isActive = state.activeConversationId === next.id;

            const unreadNext = { ...state.unread };
            if (lastChanged && !isActive) {
              unreadNext[next.id] = (unreadNext[next.id] ?? 0) + 1;
            }

            return {
              ...state,
              conversations: reordered as any,
              unread: unreadNext,
            };
          });
        },
      )
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

    // P0-B: Subscribe to messages for the active conversation only.
    try {
      if (rtMessages) supabase.removeChannel(rtMessages);
    } catch {
      // ignore
    }
    rtMessages = null;

    if (!conversationId) return;

    rtMessages = supabase
      .channel(`rt-messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          const existing = get().messages[msg.conversation_id] ?? [];
          if (existing.some((m) => m.id === msg.id)) return;

          set({
            messages: {
              ...get().messages,
              [msg.conversation_id]: [...existing, msg],
            },
            unread: {
              ...get().unread,
              [msg.conversation_id]: 0,
            },
          });
        },
      )
      .subscribe();
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

    // ✅ WhatsApp agent send (Edge Function)
    if (payload.channel === "whatsapp") {
      const messageType = (payload.message_type ?? "text").toString();
      const type =
        messageType === "image" ||
        messageType === "document" ||
        messageType === "video" ||
        messageType === "audio"
          ? messageType
          : "text";

      if (type === "text" && !text) return { noReply: false };
      if (type !== "text" && !payload.media_url) return { noReply: false };

      const { data, error } = await supabase.functions.invoke("whatsapp-send", {
        body: {
          conversation_id: conversationId,
          type,
          text: text || null,
          media_url: payload.media_url ?? null,
          mime_type: payload.mime_type ?? null,
          filename: (payload as any).filename ?? null,
          message_type: messageType,
        },
      });

      if (error) {
        console.error("[useChatStore] whatsapp-send invoke error", error);
      } else if (data?.error) {
        console.error("[useChatStore] whatsapp-send failed", data);
      }

      return { noReply: false };
    }

    if (!text) return { noReply: false };

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
