// src/modules/chats/ChatsModule.tsx
// FINAL VERSION – WITH TYPING INDICATOR + ANIMATIONS + JOYZ UI

import { useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  ToggleLeft,
  ToggleRight,
  Upload,
  Phone,
  Globe,
  User2,
  Paperclip,
  SendHorizonal,
} from "lucide-react";

import { useChatStore } from "../../state/useChatStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";

import { ChatMessageBubble } from "./components/ChatMessageBubble";
import { ChatSidebarItem } from "./components/ChatSidebarItem";
import type { Message } from "../../types/database";

import { supabase } from "../../lib/supabaseClient";

type HeaderContact = {
  name: string | null;
  phone: string | null;
};

const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";

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

  const subOrgKey = activeSubOrg?.id ?? "__no_suborg__";

  const [headerContact, setHeaderContact] = useState<HeaderContact | null>(null);
  const [headerLoading, setHeaderLoading] = useState(false);

  const [sending, setSending] = useState(false);

  /** NEW: Typing indicator state */
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /* -----------------------------------------------------------
   * LOAD CONVERSATIONS WHEN ORG OR SUBORG CHANGES
   * -----------------------------------------------------------*/
  useEffect(() => {
    if (currentOrganization?.id) {
      fetchConversations(currentOrganization.id).catch(console.error);
    }
  }, [currentOrganization?.id, subOrgKey]);

  /* Reset active conversation when switching divisions */
  useEffect(() => {
    setActiveConversation(null);
  }, [subOrgKey]);

  /* LOAD MESSAGES */
  useEffect(() => {
    if (!activeConversationId) return;

    if (!messages[activeConversationId]) {
      fetchMessages(activeConversationId).catch(console.error);
      subscribeToMessages(activeConversationId);
    }
  }, [activeConversationId, messages]);

  /* AUTO SCROLL */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;

    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* WHEN BOT SENDS A MESSAGE → STOP TYPING INDICATOR */
  useEffect(() => {
    if (!activeConversationId) return;
    const msgs = messages[activeConversationId];
    if (!msgs || msgs.length === 0) return;

    const last = msgs[msgs.length - 1];
    if (last.sender === "bot") {
      setIsTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
  }, [messages, activeConversationId]);

  /* LOAD CONTACT DETAILS */
  useEffect(() => {
    async function load() {
      if (!activeConversationId) {
        setHeaderContact(null);
        return;
      }

      const conv = conversations.find((c) => c.id === activeConversationId);
      if (!conv?.contact_id) return;

      try {
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
      } finally {
        setHeaderLoading(false);
      }
    }

    load();
  }, [activeConversationId]);

  /* CHANNEL BADGE */
  const ChannelBadge = () => {
    if (!activeConversationId) return null;
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv) return null;

    if (conv.channel === "whatsapp")
      return (
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
          WhatsApp
        </span>
      );
    if (conv.channel === "web")
      return (
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          Web
        </span>
      );

    return (
      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
        Internal
      </span>
    );
  };

  /* -----------------------------------------------------------
   * SEND MESSAGE (text/media)
   * -----------------------------------------------------------*/
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

    /** NEW → Show “Agent is typing…” immediately */
    setIsTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);

    try {
      /* ------------------------- WHATSAPP ------------------------- */
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
          const body: any = { to: headerContact.phone };

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

          body.organization_id = conv.organization_id;
          body.sub_organization_id = conv.sub_organization_id;

          await supabase.functions.invoke("whatsapp-send", { body });
        }
      }
      /* ------------------------- INTERNAL/WEB ------------------------- */
      else {
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

  /* -----------------------------------------------------------
   * UI — MAIN
   * -----------------------------------------------------------*/

  if (!currentOrganization) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Select an organization to continue.
      </div>
    );
  }

  const currentMessages =
    activeConversationId && messages[activeConversationId]
      ? messages[activeConversationId]
      : [];

  return (
    <div className="flex h-full w-full rounded-3xl bg-slate-100 p-5 dark:bg-slate-950/40">

      <div className="flex h-full w-full gap-5">

        {/* LEFT PANEL */}
        <div className="flex h-full w-80 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/80">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <MessageCircle size={16} />
              Conversations
            </div>

            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
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

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
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
        <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70 overflow-hidden">
          {!activeConversationId ? (
            <div className="flex flex-1 items-center justify-center text-slate-500 dark:text-slate-400">
              Select a conversation
            </div>
          ) : (
            <>
              {/* HEADER */}
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-white/10">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {headerContact?.name ||
                        headerContact?.phone ||
                        "Conversation"}
                    </h2>
                    <ChannelBadge />
                  </div>

                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {headerContact?.phone || "No phone"}
                  </div>
                </div>

                <button
                  onClick={() =>
                    toggleAI(
                      activeConversationId,
                      !aiToggle[activeConversationId]
                    )
                  }
                  className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition
                    ${
                      aiToggle[activeConversationId]
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "border-slate-300 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                    }
                  `}
                >
                  {aiToggle[activeConversationId] ? (
                    <ToggleRight size={16} />
                  ) : (
                    <ToggleLeft size={16} />
                  )}
                  AI {aiToggle[activeConversationId] ? "On" : "Off"}
                </button>
              </div>

              {/* MESSAGE LIST */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-4 dark:bg-slate-900"
              >
                {/* TYPING INDICATOR */}
                {isTyping && (
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 animate-pulse">
                    <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500"></span>
                    <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500"></span>
                    <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500"></span>
                    <span>Agent is typing…</span>
                  </div>
                )}

                {currentMessages.map((msg) => (
                  <ChatMessageBubble key={msg.id} message={msg} />
                ))}

                <div ref={bottomRef} />
              </div>

              {/* INPUT BAR */}
              <form
                onSubmit={handleSend}
                className="border-t border-slate-200 bg-white px-6 py-4 dark:border-white/10 dark:bg-slate-900 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <label className="flex cursor-pointer items-center justify-center rounded-full border border-slate-300 bg-slate-50 p-2 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200">
                    <Paperclip size={18} />
                    <input type="file" name="file" className="hidden" />
                  </label>

                  <input
                    name="message"
                    placeholder="Type your message..."
                    className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />

                  <button
                    disabled={sending}
                    className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white shadow hover:bg-accent/90 disabled:opacity-60"
                  >
                    <SendHorizonal size={16} />
                    Send
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
