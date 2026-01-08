// src/modules/chats/ChatsModule.tsx
// SEARCH + PHONE-FIRST + DIVISION SAFE + AI MODE HEADER + PSF SUPPORT

import { useEffect, useRef, useState } from "react";
import { Sparkles, Copy, SendHorizonal, ThumbsUp } from "lucide-react";

import { useChatStore } from "../../state/useChatStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
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

  const { activeOrganization } = useOrganizationStore();

  /* ---------------- UI STATE ---------------- */
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // Typing indicators (internal)
  const [typingAgents, setTypingAgents] = useState<string[]>([]);
  const [aiTyping, setAiTyping] = useState(false);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingExpiryRef = useRef<Record<string, number>>({});
  const typingHeartbeatRef = useRef<number>(0);
  const selfStopTimerRef = useRef<number>(0);

  /* ---------------- AI TAKEOVER ---------------- */
  const handleTakeOverAI = async () => {
    if (!activeConversationId) return;

    const { data: user } = await supabase.auth.getUser();

    await supabase
      .from("conversations")
      .update({
        ai_locked: true,
        ai_lock_reason: "agent_takeover",
        ai_locked_at: new Date().toISOString(),
        ai_locked_by: user?.user?.id ?? null,
      })
      .eq("id", activeConversationId);

    if (activeOrganization?.id) {
      await fetchConversations(activeOrganization.id);
    }
  };

  const handleUnlockAI = async () => {
    if (!activeConversationId) return;

    await supabase
      .from("conversations")
      .update({
        ai_locked: false,
        ai_locked_by: null,
        ai_locked_at: null,
        ai_lock_reason: null,
      })
      .eq("id", activeConversationId);

    if (activeOrganization?.id) {
      await fetchConversations(activeOrganization.id);
    }
  };

  /* ---------------- PSF + CAMPAIGN CONTEXT ---------------- */
  const [campaignContext, setCampaignContext] = useState<any | null>(null);
  const [followupSuggestion, setFollowupSuggestion] = useState<string | null>(
    null
  );
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [aiNoReply, setAiNoReply] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* -------------------------------------------------------
     INIT REALTIME
  ------------------------------------------------------- */
  useEffect(() => {
    if (!activeOrganization?.id) return;
    initRealtime(activeOrganization.id);
  }, [activeOrganization?.id, initRealtime]);

  /* -------------------------------------------------------
     LOAD CONVERSATIONS
  ------------------------------------------------------- */
  useEffect(() => {
    if (activeOrganization?.id) {
      fetchConversations(activeOrganization.id).catch(console.error);
    }
  }, [activeOrganization?.id, fetchConversations]);

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
  }, [activeConversationId, conversations, messages, fetchMessages]);

  /* -------------------------------------------------------
     TYPING INDICATORS (INTERNAL)
  ------------------------------------------------------- */
  useEffect(() => {
    // cleanup previous channel
    if (typingChannelRef.current) {
      supabase.removeChannel(typingChannelRef.current);
      typingChannelRef.current = null;
    }

    setTypingAgents([]);

    if (!activeConversationId) return;

    const channel = supabase
      .channel(`typing:${activeConversationId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const actor = String(payload?.actor ?? "");
        const name = String(payload?.name ?? "").trim() || "Agent";
        const state = String(payload?.state ?? "");

        if (actor === "ai") {
          setAiTyping(state === "start");
          return;
        }

        if (actor !== "agent") return;

        setTypingAgents((prev) => {
          const next = new Set(prev);
          if (state === "start") next.add(name);
          if (state === "stop") next.delete(name);
          return Array.from(next);
        });

        // auto-expire in case stop isn't sent
        const key = `${name}`;
        if (typingExpiryRef.current[key]) {
          window.clearTimeout(typingExpiryRef.current[key]);
        }
        typingExpiryRef.current[key] = window.setTimeout(() => {
          setTypingAgents((prev) => prev.filter((n) => n !== name));
        }, 3000);
      })
      .subscribe();

    typingChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
    };
  }, [activeConversationId]);

  const broadcastTyping = async (state: "start" | "stop") => {
    if (!activeConversationId) return;
    if (!typingChannelRef.current) return;

    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    const name =
      (user?.user_metadata as any)?.full_name ||
      user?.email ||
      "Agent";

    typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        actor: "agent",
        state,
        name,
      },
    });
  };

  const broadcastAiTyping = (state: "start" | "stop") => {
    if (!activeConversationId) return;
    if (!typingChannelRef.current) return;
    typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { actor: "ai", state },
    });
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);

    // Throttle typing signals
    const now = Date.now();
    if (now - typingHeartbeatRef.current > 1500) {
      typingHeartbeatRef.current = now;
      void broadcastTyping("start");
    }

    // Auto-stop shortly after user pauses typing
    if (selfStopTimerRef.current) {
      window.clearTimeout(selfStopTimerRef.current);
    }
    selfStopTimerRef.current = window.setTimeout(() => {
      void broadcastTyping("stop");
    }, 1200);
  };

  /* -------------------------------------------------------
     SCROLL MANAGEMENT
  ------------------------------------------------------- */
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
     AI FOLLOW-UP SUGGESTION
  ------------------------------------------------------- */
  const handleSuggestFollowup = async () => {
    if (!activeConversationId) return;

    setLoadingSuggestion(true);
    setAiTyping(true);
    broadcastAiTyping("start");
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
    setAiTyping(false);
    broadcastAiTyping("stop");
  };

  /* -------------------------------------------------------
     SEND MESSAGE (MANUAL ONLY)
  ------------------------------------------------------- */
  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeConversationId) return;

    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv) return;

    const text = draft.trim();
    if (!text && !file) return;
    setSending(true);

    try {
      if (selfStopTimerRef.current) {
        window.clearTimeout(selfStopTimerRef.current);
        selfStopTimerRef.current = 0;
      }

      if (conv.channel === "whatsapp") {
        let url: string | null = null;
        let msgType = "text";

        if (file) {
          const path = `org_${conv.organization_id}/${activeConversationId}/${Date.now()}_${file.name}`;

          await supabase.storage.from(WHATSAPP_MEDIA_BUCKET).upload(path, file);

          const { data } = supabase.storage
            .from(WHATSAPP_MEDIA_BUCKET)
            .getPublicUrl(path);

          url = data?.publicUrl;
          msgType = file.type.startsWith("image/") ? "image" : "document";
        }

        await sendMessage(activeConversationId, {
          channel: "whatsapp",
          message_type: msgType,
          text: text || null,
          media_url: url,
          mime_type: file?.type ?? null,
          // @ts-expect-error - extra field passed through for whatsapp-send
          filename: file?.name ?? null,
        });

      } else {
        await sendMessage(activeConversationId, {
          text,
          sender: "user",
          message_type: "text",
          channel: conv.channel,
        });
      }

      setDraft("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await broadcastTyping("stop");
    } finally {
      setSending(false);
    }
  };

  /* -------------------------------------------------------
     FILTER + SEARCH
  ------------------------------------------------------- */
  const filteredConversations: Conversation[] = conversations
    .filter((c) => {
      if (filter === "psf") return Boolean(c.meta?.psf_case_id);
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

  const isPsfConversation = Boolean(activeConversation?.meta?.psf_case_id);
  const isAiLocked = Boolean(activeConversation?.ai_locked);

  /* -------------------------------------------------------
     UI
  ------------------------------------------------------- */
  return (
    <div className="flex h-full w-full bg-white overflow-hidden">
      {/* LEFT PANEL */}
      <div className="w-80 border-r border-slate-200 p-3 flex flex-col h-full overflow-hidden">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by phone or name…"
          className="mb-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="flex-1 overflow-y-auto min-h-0 pr-1">
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

      {/* CENTER PANEL */}
      <div className="flex flex-1 flex-col">
        {!activeConversationId ? (
          <div className="flex flex-1 items-center justify-center text-slate-500">
            Select a conversation
          </div>
        ) : (
          <>
            {activeConversation && (
              <ChatHeader conversation={activeConversation} />
            )}

            {/* HEADER BAR */}
            <div className="flex justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <div className="flex items-center gap-2 font-semibold">
                  {activeConversation?.contact?.name ||
                    activeConversation?.contact?.phone}

                  {isPsfConversation && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                      <ThumbsUp size={12} /> PSF
                    </span>
                  )}

                  {isAiLocked && (
                    <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                      AI Locked
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-500">
                  {activeConversation?.contact?.phone}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isAiLocked && (
                  <button
                    onClick={handleSuggestFollowup}
                    className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50"
                  >
                    <Sparkles size={14} />
                    Suggest follow-up
                  </button>
                )}

                {!isAiLocked && (
                  <button
                    onClick={handleTakeOverAI}
                    className="rounded-md bg-orange-600 px-3 py-1 text-xs text-white hover:bg-orange-700"
                  >
                    Take Over
                  </button>
                )}

                {isAiLocked && (
                  <button
                    onClick={handleUnlockAI}
                    className="rounded-md bg-slate-700 px-3 py-1 text-xs text-white hover:bg-slate-800"
                  >
                    Unlock AI
                  </button>
                )}
              </div>
            </div>

            {/* MESSAGES */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-4 overflow-y-auto p-6"
            >
              {(typingAgents.length > 0 || aiTyping) && (
                <div className="text-xs italic text-slate-400">
                  {aiTyping
                    ? "AI is typing…"
                    : `${typingAgents.join(", ")} is typing…`}
                </div>
              )}

              {currentMessages.map((msg) => (
                <ChatMessageBubble key={msg.id} message={msg} />
              ))}

              {(typingAgents.length > 0 || aiTyping) && (
                <div className="text-xs italic text-slate-400">
                  {typingAgents.length > 0 && (
                    <span>
                      {typingAgents.slice(0, 2).join(", ")}
                      {typingAgents.length > 2 ? "…" : ""} is typing…
                    </span>
                  )}
                  {typingAgents.length > 0 && aiTyping && <span> · </span>}
                  {aiTyping && <span>AI is typing…</span>}
                </div>
              )}

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
                  id="chat-file"
                  ref={fileInputRef}
                  type="file"
                  name="file"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />

                <label
                  htmlFor="chat-file"
                  title="Attach file"
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                >
                  📎
                </label>

                <input
                  name="message"
                  value={draft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onFocus={() => void broadcastTyping("start")}
                  onBlur={() => void broadcastTyping("stop")}
                  placeholder={
                    isAiLocked
                      ? "You are handling this conversation…"
                      : isPsfConversation
                      ? "Type response to customer..."
                      : "Type your message..."
                  }
                  className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  disabled={sending}
                  className={`rounded-md px-4 py-2 text-white ${
                    isAiLocked
                      ? "bg-slate-500 cursor-default"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  <SendHorizonal size={16} />
                </button>
              </div>

              {file && (
                <div className="mt-2 text-xs text-slate-500">
                  Attached: {file.name}
                </div>
              )}
            </form>
          </>
        )}
      </div>

      {/* RIGHT PANEL */}
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