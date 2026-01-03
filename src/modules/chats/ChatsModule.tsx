// src/modules/chats/ChatsModule.tsx
// FULL + FINAL — PATCHED
// SEARCH + PHONE-FIRST + DIVISION SAFE + AI MODE HEADER

import { useEffect, useRef, useState } from "react";
import { Sparkles, Copy, SendHorizonal } from "lucide-react";

import { useChatStore } from "../../state/useChatStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";

import { ChatMessageBubble } from "./components/ChatMessageBubble";
import { ChatSidebarItem } from "./components/ChatSidebarItem";
import { ChatHeader } from "./components/ChatHeader";

import type { Conversation } from "../../types/database";
import { supabase } from "../../lib/supabaseClient";

const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";

export function ChatsModule() {
  const {
    conversations,
    messages,
    activeConversationId,
    filter,
    unread,
    fetchConversations,
    fetchMessages,
    initRealtime,
    setActiveConversation,
    sendMessage,
  } = useChatStore();

  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  const subOrgKey = activeSubOrg?.id ?? "__all__";

  /* ---------------- UI STATE ---------------- */
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);

  /* ---------------- PHASE 7 STATE ---------------- */
  const [campaignContext, setCampaignContext] = useState<any | null>(null);
  const [followupSuggestion, setFollowupSuggestion] = useState<string | null>(
    null
  );
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [aiNoReply, setAiNoReply] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /* -------------------------------------------------------
   * INIT REALTIME (ONCE PER ORG)
   * ------------------------------------------------------- */
  useEffect(() => {
    if (!currentOrganization?.id) return;
    initRealtime(currentOrganization.id);
  }, [currentOrganization?.id]);

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
    }

    setFollowupSuggestion(null);
    setAiNoReply(false);

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
   * SCROLL
   * ------------------------------------------------------- */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;

    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  /* -------------------------------------------------------
   * FOLLOW-UP SUGGESTION
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
   * FILTER + SEARCH
   * ------------------------------------------------------- */
  const filteredConversations: Conversation[] = conversations
    .filter((c) => {
      if (filter === "unassigned") return !c.assigned_to;
      if (filter === "assigned") return Boolean(c.assigned_to);
      if (filter === "bot") return c.ai_enabled;
      if (filter === "whatsapp") return c.channel === "whatsapp";
      if (filter === "web") return c.channel === "web";
      if (filter === "internal") return c.channel === "internal";
      return true;
    })
    .filter((c) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        c.contact?.phone?.toLowerCase().includes(q) ||
        c.contact?.name?.toLowerCase().includes(q)
      );
    });

  const currentMessages =
    activeConversationId && messages[activeConversationId]
      ? messages[activeConversationId]
      : [];

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );

  /* -------------------------------------------------------
   * UI
   * ------------------------------------------------------- */
  return (
    <div className="flex h-full w-full bg-white">
      {/* LEFT PANEL */}
      <div className="w-80 border-r border-slate-200 p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by phone or name…"
          className="mb-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

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
            {/* 🔥 CHAT HEADER — AI MODE TOGGLE */}
            {activeConversation && (
              <ChatHeader conversation={activeConversation} />
            )}

            {/* CONVERSATION INFO BAR */}
            <div className="flex justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <div className="font-semibold">
                  {activeConversation?.contact?.name ||
                    activeConversation?.contact?.phone}
                </div>
                <div className="text-xs text-slate-500">
                  {activeConversation?.contact?.phone}
                </div>
              </div>

              <button
                onClick={handleSuggestFollowup}
                className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50"
              >
                <Sparkles size={14} />
                Suggest follow-up
              </button>
            </div>

            {/* MESSAGES */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-4 overflow-y-auto p-6"
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

            {/* COMPOSER */}
            <form
              onSubmit={handleSend}
              className="border-t border-slate-200 px-6 py-4"
            >
              <div className="flex gap-3">
                <input
                  name="message"
                  placeholder="Type your message..."
                  className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  disabled={sending}
                  className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
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
        <div className="w-80 space-y-4 border-l border-slate-200 bg-slate-50 p-4">
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
            <div className="relative rounded-md border border-slate-200 bg-white p-3 text-sm">
              {followupSuggestion}
              <button
                onClick={() =>
                  navigator.clipboard.writeText(followupSuggestion)
                }
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
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
