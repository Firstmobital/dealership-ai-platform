// src/modules/chats/ChatsModule.tsx
// FULL + FINAL
// ORIGINAL LOGIC PRESERVED
// PHASE 7A–7C ENABLED IN UI

import { useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  ToggleLeft,
  ToggleRight,
  Paperclip,
  SendHorizonal,
  Sparkles,
  Copy,
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

  /* ---------------- PHASE 7 STATE ---------------- */
  const [campaignContext, setCampaignContext] = useState<any | null>(null);
  const [followupSuggestion, setFollowupSuggestion] = useState<string | null>(
    null,
  );
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [aiNoReply, setAiNoReply] = useState(false);

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

    setFollowupSuggestion(null);
    setAiNoReply(false);

    /* ---------------- PHASE 7A: LOAD CAMPAIGN CONTEXT ---------------- */
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv?.contact_id) {
      setCampaignContext(null);
      return;
    }

    supabase
      .from("contact_campaign_summary")
      .select("*")
      .eq("contact_id", conv.contact_id)
      .maybeSingle()
      .then(({ data }) => setCampaignContext(data ?? null));
  }, [activeConversationId]);

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
   * LOAD CONTACT HEADER
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
   * PHASE 7C — FOLLOW-UP SUGGESTION
   * ------------------------------------------------------- */
  const handleSuggestFollowup = async () => {
    if (!activeConversationId) return;

    setLoadingSuggestion(true);
    setFollowupSuggestion(null);

    const { data } = await supabase.functions.invoke("ai-handler", {
      body: {
        conversation_id: activeConversationId,
        user_message: "suggest followup",
        mode: "suggest_followup",
      },
    });

    setFollowupSuggestion(data?.suggestion ?? "No suggestion generated.");
    setLoadingSuggestion(false);
  };

  /* -------------------------------------------------------
   * SEND MESSAGE (ORIGINAL LOGIC UNCHANGED)
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

        await supabase.from("messages").insert({
          conversation_id: conv.id,
          sender: "user",
          message_type: msgType,
          text: text || null,
          media_url: url,
          channel: "whatsapp",
          sub_organization_id: conv.sub_organization_id,
        });
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
      {/* LEFT PANEL */}
      <div className="w-80 border-r p-3">
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

      {/* CENTER PANEL */}
      <div className="flex flex-1 flex-col">
        {!activeConversationId ? (
          <div className="flex flex-1 items-center justify-center text-slate-500">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="border-b px-6 py-4 flex justify-between">
              <div>
                <div className="font-semibold">
                  {headerContact?.name || headerContact?.phone}
                </div>
                <div className="text-xs text-slate-500">
                  {headerContact?.phone}
                </div>
              </div>

              <button
                onClick={handleSuggestFollowup}
                className="flex items-center gap-2 text-xs border px-3 py-1 rounded-md"
              >
                <Sparkles size={14} />
                Suggest follow-up
              </button>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-4"
            >
              {currentMessages.map((msg) => (
                <ChatMessageBubble key={msg.id} message={msg} />
              ))}

              {aiNoReply && (
                <div className="text-xs italic text-slate-400">
                  AI chose not to reply.
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSend} className="border-t px-6 py-4">
              <div className="flex gap-3">
                <input
                  name="message"
                  placeholder="Type your message..."
                  className="flex-1 border rounded-md px-4 py-2"
                />
                <button
                  disabled={sending}
                  className="bg-accent px-4 py-2 text-white rounded-md"
                >
                  <SendHorizonal size={16} />
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {/* RIGHT PANEL — PHASE 7 */}
      {activeConversationId && (
        <div className="w-80 border-l p-4 space-y-4 bg-slate-50">
          <h3 className="text-sm font-semibold">Campaign Context</h3>

          {campaignContext ? (
            <>
              <div className="text-xs">
                <strong>Delivered:</strong>{" "}
                {campaignContext.delivered_campaigns?.join(", ") || "None"}
              </div>
              <div className="text-xs">
                <strong>Failed:</strong>{" "}
                {campaignContext.failed_campaigns?.join(", ") || "None"}
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-400">
              No campaign history available
            </div>
          )}

          {loadingSuggestion && (
            <div className="text-xs text-slate-500">
              Generating follow-up…
            </div>
          )}

          {followupSuggestion && (
            <div className="relative rounded-md border bg-white p-3 text-sm">
              {followupSuggestion}
              <button
                onClick={() =>
                  navigator.clipboard.writeText(followupSuggestion)
                }
                className="absolute top-2 right-2 text-slate-400"
              >
                <Copy size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
