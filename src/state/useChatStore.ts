import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import type { Conversation, Message } from "../types/database";

export type ConversationFilter =
  | "all"
  | "unassigned"
  | "assigned"
  | "bot"
  | "whatsapp"
  | "web"
  | "internal";

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

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  messages: {},
  activeConversationId: null,

  filter: "all",
  loading: false,

  aiToggle: {},

  unread: {},

  /* ------------------------------------------------------------------ */
  /*  FETCH CONVERSATIONS                                               */
  /* ------------------------------------------------------------------ */
  fetchConversations: async (organizationId: string) => {
    set({ loading: true });

    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("organization_id", organizationId)
      .order("last_message_at", { ascending: false });

    if (error) throw error;

    const aiToggle = Object.fromEntries(
      (data ?? []).map((c) => [c.id, c.ai_enabled])
    );

    set({
      conversations: data ?? [],
      aiToggle,
      loading: false,
    });
  },

  /* ------------------------------------------------------------------ */
  /*  FETCH MESSAGES FOR A CONVERSATION                                 */
  /* ------------------------------------------------------------------ */
  fetchMessages: async (conversationId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    set((state) => ({
      messages: { ...state.messages, [conversationId]: data ?? [] },
    }));
  },

  /* ------------------------------------------------------------------ */
  /*  REALTIME MESSAGE STREAM                                           */
  /* ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------ */
  /*  SET ACTIVE CONVERSATION                                           */
  /* ------------------------------------------------------------------ */
  setActiveConversation: (conversationId) => {
    set({ activeConversationId: conversationId });

    if (conversationId) {
      // clear unread count
      set((state) => ({
        unread: { ...state.unread, [conversationId]: 0 },
      }));
    }
  },

  /* ------------------------------------------------------------------ */
  /*  SET FILTER                                                         */
  /* ------------------------------------------------------------------ */
  setFilter: (filter) => set({ filter }),

  /* ------------------------------------------------------------------ */
  /*  TOGGLE AI ON/OFF FOR CONVERSATION                                 */
  /* ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------ */
  /*  SEND MESSAGE (USER → BOT)                                         */
  /* ------------------------------------------------------------------ */
  sendMessage: async (conversationId, payload) => {
    const state = get();

    const text = payload.text?.trim() ?? "";
    const sender = payload.sender ?? "user";
    const message_type = payload.message_type ?? "text";

    if (!text || !conversationId) return;

    /* --------------------------- 1. Insert USER Message --------------------------- */
    const { error: userError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender,
      message_type,
      text,
      media_url: payload.media_url ?? null,
      channel: payload.channel ?? "web", // ⭐ NEW: channel support
    });

    if (userError) {
      console.error("❌ Error inserting user message:", userError);
      throw userError;
    }

    await get().fetchMessages(conversationId);

    /* --------------------------- 2. AI Disabled? Stop. --------------------------- */
    const aiEnabled = state.aiToggle[conversationId];
    if (sender !== "user" || !aiEnabled) return;

    /* --------------------------- 3. Fire-and-forget AI Call ------------------------- */
    (async () => {
      try {
        const { data: aiData, error: aiError } = await supabase.functions.invoke(
          "ai-handler",
          {
            body: {
              conversation_id: conversationId,
              user_message: text,
            },
          }
        );

        if (aiError) {
          console.error("❌ AI handler failed:", aiError);
          return;
        }

        const aiText =
          (aiData as any)?.ai_response ??
          (aiData as any)?.response ??
          null;

        if (!aiText) return;

        /* --------------------------- 4. Insert BOT reply --------------------------- */
        const { error: botError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender: "bot",
          message_type: "text",
          text: aiText,
          media_url: null,
          channel: "internal", // ⭐ bot responses are internal
        });

        if (botError) {
          console.error("❌ Error inserting bot message:", botError);
          return;
        }

        await get().fetchMessages(conversationId);

        /* --------------------------- 5. Update Conversation Ordering ---------------------------- */
        const { conversations } = get();
        const orgId = conversations.find((c) => c.id === conversationId)
          ?.organization_id;

        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversationId);

        if (orgId) {
          await get().fetchConversations(orgId);
        }
      } catch (err) {
        console.error("❌ Auto-reply AI error:", err);
      }
    })();
  },
}));
