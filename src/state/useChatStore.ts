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

  fetchConversations: (organizationId: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  subscribeToMessages: (conversationId: string) => void;

  setActiveConversation: (conversationId: string | null) => void;
  setFilter: (filter: ConversationFilter) => void;

  toggleAI: (conversationId: string, enabled: boolean) => Promise<void>;
  sendMessage: (
    conversationId: string,
    payload: Partial<Message>
  ) => Promise<void>;
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
  /* FETCH CONVERSATIONS (ORG + SUB ORG AWARE)                                 */
  /* -------------------------------------------------------------------------- */
  fetchConversations: async (organizationId: string) => {
    const { activeSubOrg } = useSubOrganizationStore.getState();

    set({ loading: true });

    let query = supabase
      .from("conversations")
      .select("*, contacts(*)")
      .eq("organization_id", organizationId)
      .order("last_message_at", { ascending: false });

    // Filter by department / division
    if (activeSubOrg) {
      query = query.eq("sub_organization_id", activeSubOrg.id);
    } else {
      query = query.is("sub_organization_id", null);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[useChatStore] fetchConversations error", error);
      set({ loading: false });
      return;
    }

    const aiToggle = Object.fromEntries(
      (data ?? []).map((c) => [c.id, c.ai_enabled])
    );

    set({
      conversations: (data ?? []) as Conversation[],
      aiToggle,
      loading: false,
    });
  },

  /* -------------------------------------------------------------------------- */
  /* FETCH MESSAGES (RLS SAFE—FILTERS BY CONVERSATION ID)                      */
  /* -------------------------------------------------------------------------- */
  fetchMessages: async (conversationId: string) => {
    const { activeSubOrg } = useSubOrganizationStore.getState();

    let query = supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    // Filter by sub-org (should already be enforced at conversation level)
    if (activeSubOrg) {
      query = query.eq("sub_organization_id", activeSubOrg.id);
    } else {
      query = query.is("sub_organization_id", null);
    }

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
  /* REALTIME SUBSCRIPTION                                                      */
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
          const message = payload.new as Message;
          const state = get();
          const existing = state.messages[conversationId] ?? [];

          const isActive = state.activeConversationId === conversationId;
          const unreadCount = isActive
            ? 0
            : (state.unread[conversationId] ?? 0) + 1;

          set({
            messages: {
              ...state.messages,
              [conversationId]: [...existing, message],
            },
            unread: {
              ...state.unread,
              [conversationId]: unreadCount,
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

  /* -------------------------------------------------------------------------- */
  /* SET FILTER                                                                  */
  /* -------------------------------------------------------------------------- */
  setFilter: (filter) => set({ filter }),

  /* -------------------------------------------------------------------------- */
  /* TOGGLE AI                                                                   */
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
  /* SEND MESSAGE (WEB ONLY — NO WHATSAPP)                                      */
  /* -------------------------------------------------------------------------- */
  sendMessage: async (conversationId, payload) => {
    const state = get();
    const { activeSubOrg } = useSubOrganizationStore.getState();

    const text = payload.text?.trim() ?? "";
    if (!text) return;

    const sender = payload.sender ?? "user";
    const message_type = payload.message_type ?? "text";
    const channel = payload.channel ?? "web";

    // ❌ Prevent frontend sending WhatsApp messages
    if (channel === "whatsapp") {
      console.warn("[useChatStore] Cannot send WhatsApp messages from frontend");
      return;
    }

    /* ---------------------------------------------------------------------- */
    /* 1. INSERT USER MESSAGE                                                 */
    /* ---------------------------------------------------------------------- */
    const { error: userError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender,
      message_type,
      text,
      media_url: payload.media_url ?? null,
      channel, // web or internal
      sub_organization_id: activeSubOrg?.id ?? null,
    });

    if (userError) {
      console.error("❌ Error inserting user message:", userError);
      throw userError;
    }

    await get().fetchMessages(conversationId);

    /* ---------------------------------------------------------------------- */
    /* 2. AI DISABLED? THEN EXIT                                              */
    /* ---------------------------------------------------------------------- */
    const aiEnabled = state.aiToggle[conversationId];
    if (!aiEnabled || sender !== "user") return;

    /* ---------------------------------------------------------------------- */
    /* 3. CALL AI-HANDLER                                                     */
    /* ---------------------------------------------------------------------- */
    (async () => {
      try {
        const { data: aiResp, error: invokeError } =
          await supabase.functions.invoke("ai-handler", {
            body: {
              conversation_id: conversationId,
              user_message: text,
            },
          });

        if (invokeError) {
          console.error("❌ AI handler failed:", invokeError);
          return;
        }

        const aiText =
          (aiResp as any)?.ai_response ??
          (aiResp as any)?.response ??
          null;

        if (!aiText) return;

        /* ------------------------------------------------------------------ */
        /* 4. INSERT BOT REPLY (WEB INTERNAL ONLY)                            */
        /* ------------------------------------------------------------------ */
        const { error: botError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender: "bot",
          message_type: "text",
          text: aiText,
          media_url: null,
          channel: "internal",
          sub_organization_id: activeSubOrg?.id ?? null,
        });

        if (botError) {
          console.error("❌ Error inserting bot reply:", botError);
          return;
        }

        await get().fetchMessages(conversationId);

        /* ------------------------------------------------------------------ */
        /* 5. BUMP conversation timestamp + REFRESH list                      */
        /* ------------------------------------------------------------------ */
        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversationId);

        const conversations = get().conversations;
        const orgId = conversations.find((c) => c.id === conversationId)
          ?.organization_id;

        if (orgId) {
          await get().fetchConversations(orgId);
        }
      } catch (err) {
        console.error("❌ Auto-reply error:", err);
      }
    })();
  },
}));

