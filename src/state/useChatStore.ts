import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";

import type { Conversation, Message } from "../types/database";
import { useSubOrganizationStore } from "./useSubOrganizationStore";

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

  // --- Core actions ---
  fetchConversations: (organizationId: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;

  // Realtime
  initRealtime: (organizationId: string) => void;
  subscribeToMessages: (conversationId: string) => void;

  setActiveConversation: (conversationId: string | null) => void;
  setFilter: (filter: ConversationFilter) => void;

  toggleAI: (conversationId: string, enabled: boolean) => Promise<void>;

  // 🔵 UPDATED
  sendMessage: (
    conversationId: string,
    payload: Partial<Message>
  ) => Promise<{ noReply: boolean }>;

  // 🟢 Phase 7C
  suggestFollowup: (conversationId: string) => Promise<string>;
};

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

    let query = supabase
      .from("conversations")
      .select("*, contacts(*)")
      .eq("organization_id", organizationId)
      .order("last_message_at", { ascending: false });

    if (activeSubOrg) query = query.eq("sub_organization_id", activeSubOrg.id);
    else query = query.is("sub_organization_id", null);

    const { data, error } = await query;

    if (error) {
      console.error("[useChatStore] fetchConversations error", error);
      set({ loading: false });
      return;
    }

    const aiToggle = Object.fromEntries(
      (data ?? []).map((c) => [c.id, c.ai_enabled !== false])
    );

    set({
      conversations: (data ?? []) as Conversation[],
      aiToggle,
      loading: false,
    });
  },

  /* -------------------------------------------------------------------------- */
  /* FETCH MESSAGES                                                             */
  /* -------------------------------------------------------------------------- */
  fetchMessages: async (conversationId: string) => {
    const { activeSubOrg } = useSubOrganizationStore.getState();

    let query = supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (activeSubOrg) query = query.eq("sub_organization_id", activeSubOrg.id);
    else query = query.is("sub_organization_id", null);

    const { data, error } = await query;

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
  /* REALTIME: GLOBAL SUBSCRIPTION                                              */
  /* -------------------------------------------------------------------------- */
  initRealtime: (organizationId: string) => {
    const { activeSubOrg } = useSubOrganizationStore.getState();

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
          const conv = payload.new as Conversation;

          if (activeSubOrg && conv.sub_organization_id !== activeSubOrg.id) return;
          if (!activeSubOrg && conv.sub_organization_id !== null) return;

          const existing = get().conversations;
          if (!existing.some((c) => c.id === conv.id)) {
            set({ conversations: [conv, ...existing] });
          }
        }
      )
      .subscribe();

    supabase
      .channel("rt-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          const existing = get().messages[msg.conversation_id] ?? [];
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
  /* PER CONVERSATION REALTIME                                                  */
  /* -------------------------------------------------------------------------- */
  subscribeToMessages: (conversationId: string) => {
    supabase
      .channel(`conv-${conversationId}`)
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
          const existing = get().messages[conversationId] ?? [];
          const isActive = get().activeConversationId === conversationId;

          set({
            messages: {
              ...get().messages,
              [conversationId]: [...existing, msg],
            },
            unread: {
              ...get().unread,
              [conversationId]: isActive
                ? 0
                : (get().unread[conversationId] ?? 0) + 1,
            },
          });
        }
      )
      .subscribe();
  },

  /* -------------------------------------------------------------------------- */
  /* SET ACTIVE CONVERSATION                                                    */
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
  /* TOGGLE AI                                                                 */
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
  /* SEND MESSAGE (AI HANDLER IS SOURCE OF TRUTH)                               */
  /* -------------------------------------------------------------------------- */
  sendMessage: async (conversationId, payload) => {
    const { activeSubOrg } = useSubOrganizationStore.getState();
    const text = payload.text?.trim() ?? "";

    if (!text) return { noReply: false };

    const sender = payload.sender ?? "user";
    const channel = payload.channel ?? "web";

    if (channel === "whatsapp") {
      console.warn("WhatsApp messages cannot be sent from frontend");
      return { noReply: false };
    }

    // 1️⃣ Insert user message
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender,
      message_type: payload.message_type ?? "text",
      text,
      channel,
      sub_organization_id: activeSubOrg?.id ?? null,
    });

    await get().fetchMessages(conversationId);

    // 2️⃣ AI disabled?
    const aiEnabled = get().aiToggle[conversationId];
    if (!aiEnabled || sender !== "user") return { noReply: false };

    // 3️⃣ Call ai-handler (AI HANDLER inserts bot reply)
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

    // 4️⃣ Phase 7B — AI chose not to reply
    if (data?.no_reply) {
      return { noReply: true };
    }

    // 5️⃣ Refresh from DB
    await get().fetchMessages(conversationId);

    const orgId = get().conversations.find((c) => c.id === conversationId)
      ?.organization_id;

    if (orgId) await get().fetchConversations(orgId);

    return { noReply: false };
  },

  /* -------------------------------------------------------------------------- */
  /* PHASE 7C — FOLLOW-UP SUGGESTION                                            */
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
