// src/modules/chats/ChatsModule.tsx
// JOYZ-STYLE LIGHT MODE + EXISTING DARK MODE
// LOGIC 100% UNCHANGED

import { useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  ToggleLeft,
  ToggleRight,
  Paperclip,
  SendHorizonal,
} from "lucide-react";

import { useChatStore } from "../../state/useChatStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";
import { useThemeStore } from "../../state/useThemeStore";

import { ChatMessageBubble } from "./components/ChatMessageBubble";
import { ChatSidebarItem } from "./components/ChatSidebarItem";

import type { Conversation } from "../../types/database";
import { supabase } from "../../lib/supabaseClient";

/* -------------------------------------------------------
 * TYPES
 * ------------------------------------------------------- */
type HeaderContact = {
  name: string | null;
  phone: string | null;
};

const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";

/* -------------------------------------------------------
 * COMPONENT
 * ------------------------------------------------------- */
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
  const { activeSubOrg } = useSubOrganizationStore();
  const { theme } = useThemeStore();

  const isDark = theme === "dark";
  const subOrgKey = activeSubOrg?.id ?? "__no_suborg__";

  const [headerContact, setHeaderContact] =
    useState<HeaderContact | null>(null);
  const [headerLoading, setHeaderLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /* -------------------------------------------------------
   * LOAD CONVERSATIONS
   * ------------------------------------------------------- */
  useEffect(() => {
    if (currentOrganization?.id) {
      fetchConversations(currentOrganization.id).catch(console.error);
    }
  }, [currentOrganization?.id, subOrgKey]);

  useEffect(() => {
    setActiveConversation(null);
  }, [subOrgKey]);

  useEffect(() => {
    if (!activeConversationId) return;
    if (!messages[activeConversationId]) {
      fetchMessages(activeConversationId).catch(console.error);
      subscribeToMessages(activeConversationId);
    }
  }, [activeConversationId, messages]);

  /* -------------------------------------------------------
   * SCROLL + TYPING
   * ------------------------------------------------------- */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;

    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!activeConversationId) return;
    const msgs = messages[activeConversationId];
    if (!msgs?.length) return;

    if (msgs[msgs.length - 1].sender === "bot") {
      setIsTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
  }, [messages, activeConversationId]);

  /* -------------------------------------------------------
   * LOAD CONTACT
   * ------------------------------------------------------- */
  useEffect(() => {
    async function load() {
      if (!activeConversationId) return setHeaderContact(null);
      const conv = conversations.find((c) => c.id === activeConversationId);
      if (!conv?.contact_id) return setHeaderContact(null);

      setHeaderLoading(true);
      const { data } = await supabase
        .from("contacts")
        .select("name, phone")
        .eq("id", conv.contact_id)
        .maybeSingle();

      setHeaderContact({
        name: data?.name ?? null,
        phone: data?.phone ?? null,
      });

      setHeaderLoading(false);
    }
    load();
  }, [activeConversationId, conversations]);

  /* -------------------------------------------------------
   * SEND MESSAGE (UNCHANGED)
   * ------------------------------------------------------- */
  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeConversationId) return;

    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv) return;

    const fd = new FormData(e.currentTarget);
    const text = fd.get("message")?.toString().trim() || "";
    const file = fd.get("file") as File | null;

    if (!text && !file) return;
    setSending(true);

    setIsTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);

    try {
      if (conv.channel === "whatsapp") {
        let url: string | null = null;
        let msgType = "text";

        if (file) {
          const path = `org_${conv.organization_id}/${activeConversationId}/${Date.now()}_${file.name}`;
          await supabase.storage
            .from(WHATSAPP_MEDIA_BUCKET)
            .upload(path, file);

          const { data } = supabase.storage
            .from(WHATSAPP_MEDIA_BUCKET)
            .getPublicUrl(path);

          url = data?.publicUrl;
          msgType = file.type.startsWith("image/") ? "image" : "document";
        }

        const display =
          text ||
          (msgType === "image"
            ? "Sent an image"
            : msgType === "document"
            ? "Sent a document"
            : "");

        await supabase.from("messages").insert({
          conversation_id: conv.id,
          sender: "user",
          message_type: msgType,
          text: display,
          media_url: url,
          channel: "whatsapp",
          sub_organization_id: conv.sub_organization_id,
        });

        await fetchMessages(conv.id);

        if (headerContact?.phone) {
          const body: any = {
            organization_id: conv.organization_id,
            sub_organization_id: conv.sub_organization_id,
            to: headerContact.phone,
          };

          if (msgType === "image") {
            body.type = "image";
            body.image_url = url;
            if (text) body.image_caption = text;
          } else if (msgType === "document") {
            body.type = "document";
            body.document_url = url;
            body.filename = file?.name;
            if (text) body.document_caption = text;
          } else {
            body.type = "text";
            body.text = text;
          }

          await supabase.functions.invoke("whatsapp-send", { body });
        }
      } else {
        await sendMessage(activeConversationId, {
          text,
          sender: "user",
          message_type: "text",
          channel: conv.channel,
          sub_organization_id: conv.sub_organization_id,
        });
      }

      e.currentTarget.reset();
    } finally {
      setSending(false);
    }
  };

  /* -------------------------------------------------------
   * FILTER
   * ------------------------------------------------------- */
  const filteredConversations: Conversation[] = conversations.filter((c) => {
    if (filter === "unassigned") return !c.assigned_to;
    if (filter === "assigned") return Boolean(c.assigned_to);
    if (filter === "bot") return c.ai_enabled;
    if (filter === "whatsapp") return c.channel === "whatsapp";
    if (filter === "web") return c.channel === "web";
    if (filter === "internal") return c.channel === "internal";
    return true;
  });

  if (!currentOrganization) {
    return (
      <div className="flex h-full items-center justify-center text-slate-600">
        Select an organization to continue.
      </div>
    );
  }

  const currentMessages =
    activeConversationId && messages[activeConversationId]
      ? messages[activeConversationId]
      : [];

  /* -------------------------------------------------------
   * UI
   * ------------------------------------------------------- */
  return (
    <div className={`flex h-full w-full ${isDark ? "bg-slate-900" : "bg-white"}`}>
      <div className="flex h-full w-full">
        {/* LEFT PANEL */}
        <div
          className={`w-80 border-r ${
            isDark
              ? "bg-slate-900 border-white/10"
              : "bg-white border-slate-200"
          }`}
        >
          <div
            className={`flex items-center justify-between border-b px-4 py-3 ${
              isDark ? "border-white/10" : "border-slate-200"
            }`}
          >
            <div
              className={`flex items-center gap-2 text-sm font-semibold ${
                isDark ? "text-white" : "text-slate-900"
              }`}
            >
              <MessageCircle size={16} />
              Conversations
            </div>

            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className={`rounded-md border px-2 py-1 text-xs ${
                isDark
                  ? "bg-slate-900 border-white/10 text-slate-300"
                  : "bg-white border-slate-200 text-slate-800"
              }`}
            >
              <option value="all">All</option>
              <option value="unassigned">Unassigned</option>
              <option value="assigned">Assigned</option>
              <option value="bot">AI On</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="web">Web</option>
              <option value="internal">Internal</option>
            </select>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {filteredConversations.map((c) => (
              <ChatSidebarItem
                key={c.id}
                conversation={c}
                isActive={c.id === activeConversationId}
                unreadCount={unread[c.id] ?? 0}
                onClick={() => setActiveConversation(c.id)}
              />
            ))}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div
          className={`flex flex-1 flex-col ${
            isDark ? "bg-slate-900" : "bg-white"
          }`}
        >
          {!activeConversationId ? (
            <div className="flex flex-1 items-center justify-center text-slate-500">
              Select a conversation
            </div>
          ) : (
            <>
              <div
                className={`flex items-center justify-between border-b px-6 py-4 ${
                  isDark ? "border-white/10" : "border-slate-200"
                }`}
              >
                <div>
                  <h2
                    className={`text-base font-semibold ${
                      isDark ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {headerContact?.name || headerContact?.phone}
                  </h2>
                  <div
                    className={`text-xs ${
                      isDark ? "text-slate-400" : "text-slate-600"
                    }`}
                  >
                    {headerContact?.phone}
                    {headerLoading ? " (loading…)" : ""}
                  </div>
                </div>

                <button
                  onClick={() =>
                    toggleAI(
                      activeConversationId,
                      !aiToggle[activeConversationId]
                    )
                  }
                  className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold ${
                    aiToggle[activeConversationId]
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : isDark
                      ? "border-white/10 bg-slate-800 text-slate-200"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  {aiToggle[activeConversationId] ? (
                    <ToggleRight size={16} />
                  ) : (
                    <ToggleLeft size={16} />
                  )}
                  AI {aiToggle[activeConversationId] ? "On" : "Off"}
                </button>
              </div>

              <div
                ref={scrollRef}
                className={`flex-1 overflow-y-auto p-6 space-y-4 ${
                  isDark ? "bg-slate-900" : "bg-white"
                }`}
              >
                {isTyping && (
                  <div
                    className={`text-sm ${
                      isDark ? "text-slate-400" : "text-slate-600"
                    }`}
                  >
                    Agent is typing…
                  </div>
                )}

                {currentMessages.map((msg) => (
                  <ChatMessageBubble key={msg.id} message={msg} />
                ))}

                <div ref={bottomRef} />
              </div>

              <form
                onSubmit={handleSend}
                className={`border-t px-6 py-4 ${
                  isDark
                    ? "border-white/10 bg-slate-900"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <label
                    className={`flex cursor-pointer items-center justify-center rounded-full border p-2 ${
                      isDark
                        ? "border-white/10 bg-slate-800 text-slate-200"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <Paperclip size={18} />
                    <input type="file" name="file" className="hidden" />
                  </label>

                  <input
                    name="message"
                    placeholder="Type your message..."
                    className={`flex-1 rounded-full border px-4 py-2 text-sm ${
                      isDark
                        ? "bg-slate-800 border-white/10 text-white"
                        : "bg-white border-slate-200 text-slate-900"
                    }`}
                  />

                  <button
                    disabled={sending}
                    className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    <SendHorizonal size={16} />
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
