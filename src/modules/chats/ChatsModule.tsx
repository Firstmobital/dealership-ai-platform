import { useEffect } from 'react';
import { MessageCircle, ToggleLeft, ToggleRight, Upload } from 'lucide-react';
import { useChatStore } from '../../state/useChatStore';
import { useOrganizationStore } from '../../state/useOrganizationStore';
import type { Message } from '../../types/database';

export function ChatsModule() {
  const {
    conversations,
    messages,
    activeConversationId,
    filter,
    aiToggle,
    fetchConversations,
    fetchMessages,
    setActiveConversation,
    setFilter,
    toggleAI,
    sendMessage
  } = useChatStore();
  const { currentOrganization } = useOrganizationStore();

  useEffect(() => {
    if (currentOrganization) {
      fetchConversations(currentOrganization.id).catch(console.error);
    }
  }, [currentOrganization, fetchConversations]);

  useEffect(() => {
    if (activeConversationId && !messages[activeConversationId]) {
      fetchMessages(activeConversationId).catch(console.error);
    }
  }, [activeConversationId, fetchMessages, messages]);

  const filteredConversations = conversations.filter((conversation) => {
    if (filter === 'unassigned') return !conversation.assigned_to;
    if (filter === 'assigned') return Boolean(conversation.assigned_to);
    if (filter === 'bot') return conversation.ai_enabled;
    return true;
  });

  const currentMessages = activeConversationId ? messages[activeConversationId] ?? [] : [];

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const text = formData.get('message')?.toString().trim();
    if (!text || !activeConversationId) return;
    const payload: Partial<Message> = { text, sender: 'user', message_type: 'text' };
    await sendMessage(activeConversationId, payload);
    event.currentTarget.reset();
  };

  return (
    <div className="grid h-full grid-cols-[320px,1fr] gap-6">
      <div className="flex h-full flex-col rounded-2xl border border-white/5 bg-slate-900/60">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
            <MessageCircle size={16} />
            Conversations
          </div>
          <select
            className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs uppercase tracking-wide text-slate-400"
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
          >
            <option value="all">All</option>
            <option value="unassigned">Unassigned</option>
            <option value="assigned">Assigned</option>
            <option value="bot">AI On</option>
          </select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map((conversation) => {
            const isActive = activeConversationId === conversation.id;
            return (
              <button
                key={conversation.id}
                onClick={() => setActiveConversation(conversation.id)}
                className={`flex w-full flex-col gap-1 border-b border-white/5 px-4 py-3 text-left transition hover:bg-white/5 ${
                  isActive ? 'bg-accent/10' : ''
                }`}
              >
                <span className="text-sm font-medium text-white">Conversation #{conversation.id.slice(0, 6)}</span>
                <span className="text-xs text-slate-400">
                  Last message: {conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleString() : 'N/A'}
                </span>
              </button>
            );
          })}
          {!filteredConversations.length && (
            <div className="p-6 text-center text-sm text-slate-400">No conversations found.</div>
          )}
        </div>
      </div>

      <div className="flex h-full flex-col rounded-2xl border border-white/5 bg-slate-900/60">
        {activeConversationId ? (
          <>
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Conversation {activeConversationId.slice(0, 8)}</h2>
                <p className="text-xs text-slate-400">Manage customer messages and AI automation.</p>
              </div>
              <button
                onClick={() => toggleAI(activeConversationId, !aiToggle[activeConversationId])}
                className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-accent hover:text-white"
              >
                {aiToggle[activeConversationId] ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                AI {aiToggle[activeConversationId] ? 'On' : 'Off'}
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {currentMessages.map((message) => (
                <div key={message.id} className="flex flex-col gap-1">
                  <div className="text-xs uppercase tracking-wide text-slate-400">{message.sender}</div>
                  <div className="w-fit max-w-xl rounded-2xl bg-slate-800 px-4 py-2 text-sm text-slate-100">
                    {message.text}
                  </div>
                  <span className="text-[10px] text-slate-500">{new Date(message.created_at).toLocaleString()}</span>
                </div>
              ))}
              {!currentMessages.length && <p className="text-sm text-slate-400">No messages yet.</p>}
            </div>
            <form onSubmit={handleSend} className="border-t border-white/5 px-6 py-4">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 rounded-full border border-dashed border-white/10 px-4 py-2 text-xs uppercase tracking-wide text-slate-300">
                  <Upload size={16} /> Attach
                  <input type="file" className="hidden" />
                </label>
                <input
                  type="text"
                  name="message"
                  placeholder="Type a message..."
                  className="flex-1 rounded-full border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent/80"
                >
                  Send
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Select a conversation to begin.</div>
        )}
      </div>
    </div>
  );
}
