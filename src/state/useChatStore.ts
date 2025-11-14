import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import type { Conversation, Message } from '../types/database';

export type ConversationFilter = 'all' | 'unassigned' | 'assigned' | 'bot';

type ChatState = {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  activeConversationId: string | null;
  filter: ConversationFilter;
  loading: boolean;
  aiToggle: Record<string, boolean>;
  fetchConversations: (organizationId: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  setActiveConversation: (conversationId: string | null) => void;
  setFilter: (filter: ConversationFilter) => void;
  toggleAI: (conversationId: string, enabled: boolean) => Promise<void>;
  sendMessage: (conversationId: string, payload: Partial<Message>) => Promise<void>;
};

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  messages: {},
  activeConversationId: null,
  filter: 'all',
  loading: false,
  aiToggle: {},
  fetchConversations: async (organizationId: string) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false });
    if (error) throw error;
    const aiToggle = Object.fromEntries((data ?? []).map((conversation) => [conversation.id, conversation.ai_enabled]));
    set({ conversations: data ?? [], loading: false, aiToggle });
  },
  fetchMessages: async (conversationId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    set((state) => ({ messages: { ...state.messages, [conversationId]: data ?? [] } }));
  },
  setActiveConversation: (conversationId) => set({ activeConversationId: conversationId }),
  setFilter: (filter) => set({ filter }),
  toggleAI: async (conversationId, enabled) => {
    const { error } = await supabase.from('conversations').update({ ai_enabled: enabled }).eq('id', conversationId);
    if (error) throw error;
    set((state) => ({
      aiToggle: { ...state.aiToggle, [conversationId]: enabled },
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, ai_enabled: enabled } : conversation
      )
    }));
  },
  sendMessage: async (conversationId, payload) => {
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender: payload.sender ?? 'user',
      message_type: payload.message_type ?? 'text',
      text: payload.text ?? '',
      media_url: payload.media_url ?? null
    });
    if (error) throw error;
    await get().fetchMessages(conversationId);
  }
}));
