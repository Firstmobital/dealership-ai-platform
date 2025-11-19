import { useEffect, useRef } from "react";
import {
  MessageCircle,
  ToggleLeft,
  ToggleRight,
  Upload,
  PhoneCall,
  Globe,
  MessageSquare,
} from "lucide-react";

import { useChatStore } from "../../state/useChatStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { ChatMessageBubble } from "./components/ChatMessageBubble";
import { ChatSidebarItem } from "./components/ChatSidebarItem";
import type { Message } from "../../types/database";

export function ChatsModule() {
  const {
    conversations,
    messages,
    activeConversationId,
    filter,
    aiToggle,
    unread,
    fetchConversations,
    fetchMessages,
    subscribeToMessages,
    setActiveConversation,
    setFilter,
    toggleAI,
    sendMessage,
  } = useChatStore();

  const { currentOrganization } = useOrganizationStore();

  const bottomRef = useRef<HTMLDivElement | null>(null);

  /* ------------------------------------------
   * LOAD CONVERSATIONS ON ORG CHANGE
   * ------------------------------------------ */
  useEffect(() => {
    if (currentOrganization) {
      fetchConversations(currentOrganization.id).catch(console.error);
    }
  }, [currentOrganization, fetchConversations]);

  /* ------------------------------------------
   * LOAD MESSAGES WHEN ACTIVE CONVERSATION CHANGES
   * ------------------------------------------ */
  useEffect(() => {
    if (activeConversationId && !messages[activeConversationId]) {
      fetchMessages(activeConversationId).catch(console.error);
      subscribeToMessages(activeConversationId);
    }
  }, [activeConversationId, fetchMessages, subscribeToMessages, messages]);

  /* ------------------------------------------
   * AUTO-SCROLL
   * ------------------------------------------ */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeConversationId]);

  /* ------------------------------------------
   * FILTER CONVERSATIONS (existing + new)
   * ------------------------------------------ */
  const filteredConversations = conversations.filter((conversation) => {
    if (filter === "unassigned") return !conversation.assigned_to;
    if (filter === "assigned") return Boolean(conversation.assigned_to);
    if (filter === "bot") return conversation.ai_enabled;
    if (filter === "whatsapp") return conversation.channel === "whatsapp";
    if (filter === "web") return conversation.channel === "web";
    if (filter === "internal") return conversation.channel === "internal";
    return true;
  });

  const currentMessages = activeConversationId
    ? messages[activeConversationId] ?? []
    : [];

  /* ------------------------------------------
   * SEND MESSAGE
   * ------------------------------------------ */
  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const text = fd.get("message")?.toString().trim();
    if (!text || !activeConversationId) return;

    const payload: Partial<Message> = {
      text,
      sender: "user",
      message_type: "text",
      channel: "internal",
    };

    await sendMessage(activeConversationId, payload);
    event.currentTarget.reset();
  };

  /* ------------------------------------------
   * CHANNEL ICON
   * ------------------------------------------ */
  const ChannelIcon = ({ channel }: { channel: string }) => {
    switch (channel) {
      case "whatsapp":
        return <PhoneCall size={14} className="text-green-400" />;
      case "web":
        return <Globe size={14} className="text-blue-400" />;
      default:
        return <MessageSquare size={14} className="text-purple-400" />;
    }
  };

  return (
    <div className="grid h-full grid-cols-[320px,1fr] gap-6">
      {/* SIDEBAR */}
      <div className="flex h-full flex-col rounded-2xl border border-white/5 bg-slate-900/60">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
            <MessageCircle size={16} />
            Conversations
          </div>

          <select
            className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs uppercase tracking-wide text-slate-400"
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
          >
            <option value="all">All</option>
            <option value="unassigned">Unassigned</option>
            <option value="assigned">Assigned</option>
            <option value="bot">AI On</option>
            {/* STEP-5 filters */}
            <option value="whatsapp">WhatsApp</option>
            <option value="web">Web</option>
            <option value="internal">Internal</option>
          </select>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {filteredConversations.map((conversation) => (
            <ChatSidebarItem
              key={conversation.id}
              conversation={conversation}
              contact={null} // integrate contact lookup later
            />
          ))}

          {!filteredConversations.length && (
            <div className="p-6 text-center text-sm text-slate-400">
              No conversations found.
            </div>
          )}
        </div>
      </div>

      {/* MESSAGE PANEL */}
      <div className="flex h-full flex-col rounded-2xl border border-white/5 bg-slate-900/60">
        {activeConversationId ? (
          <>
            {/* HEADER */}
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Conversation {activeConversationId.slice(0, 8)}
                </h2>
                <p className="text-xs text-slate-400">
                  Manage customer messages and AI automation.
                </p>
              </div>

              {/* AI TOGGLE */}
              <button
                onClick={() =>
                  toggleAI(
                    activeConversationId,
                    !aiToggle[activeConversationId]
                  )
                }
                className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-accent hover:text-white"
              >
                {aiToggle[activeConversationId] ? (
                  <ToggleRight size={16} />
                ) : (
                  <ToggleLeft size={16} />
                )}
                AI {aiToggle[activeConversationId] ? "On" : "Off"}
              </button>
            </div>

            {/* MESSAGES */}
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {currentMessages.map((msg) => (
                <ChatMessageBubble key={msg.id} message={msg} />
              ))}

              <div ref={bottomRef} />

              {!currentMessages.length && (
                <p className="text-sm text-slate-400">No messages yet.</p>
              )}
            </div>

            {/* INPUT */}
            <form
              onSubmit={handleSend}
              className="border-t border-white/5 px-6 py-4"
            >
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 rounded-full border border-dashed border-white/10 px-4 py-2 text-xs uppercase tracking-wide text-slate-300 cursor-pointer">
                  <Upload size={16} />
                  Attach
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
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Select a conversation to begin.
          </div>
        )}
      </div>
    </div>
  );
}
