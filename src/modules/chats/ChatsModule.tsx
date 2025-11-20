import { useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  ToggleLeft,
  ToggleRight,
  Upload,
  Phone,
  Globe,
  User2,
} from "lucide-react";

import { useChatStore } from "../../state/useChatStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
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

  const [headerContact, setHeaderContact] = useState<HeaderContact | null>(
    null
  );
  const [headerLoading, setHeaderLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  /* -----------------------------------------------------------
   * LOAD CONVERSATIONS WHEN ORG CHANGES
   * -----------------------------------------------------------*/
  useEffect(() => {
    if (currentOrganization?.id) {
      fetchConversations(currentOrganization.id).catch(console.error);
    }
  }, [currentOrganization?.id, fetchConversations]);

  /* -----------------------------------------------------------
   * LOAD MESSAGES WHEN ACTIVE CONVERSATION CHANGES
   * -----------------------------------------------------------*/
  useEffect(() => {
    if (!activeConversationId) return;

    if (!messages[activeConversationId]) {
      fetchMessages(activeConversationId).catch(console.error);
      subscribeToMessages(activeConversationId);
    }
  }, [activeConversationId, messages, fetchMessages, subscribeToMessages]);

  /* -----------------------------------------------------------
   * SMART AUTO-SCROLL (only if user is near bottom)
   * -----------------------------------------------------------*/
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;

    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  /* -----------------------------------------------------------
   * LOAD HEADER CONTACT (name + phone) WHEN ACTIVE CONVERSATION CHANGES
   * -----------------------------------------------------------*/
  useEffect(() => {
    async function loadContact() {
      if (!activeConversationId) {
        setHeaderContact(null);
        return;
      }

      const conv = conversations.find((c) => c.id === activeConversationId);
      if (!conv || !conv.contact_id) {
        setHeaderContact(null);
        return;
      }

      try {
        setHeaderLoading(true);
        const { data, error } = await supabase
          .from("contacts")
          .select("name, phone")
          .eq("id", conv.contact_id)
          .maybeSingle();

        if (error) {
          console.error("[ChatsModule] loadContact error:", error);
          setHeaderContact(null);
        } else {
          setHeaderContact({
            name: data?.name ?? null,
            phone: data?.phone ?? null,
          });
        }
      } catch (err) {
        console.error("[ChatsModule] loadContact unexpected error:", err);
        setHeaderContact(null);
      } finally {
        setHeaderLoading(false);
      }
    }

    loadContact();
  }, [activeConversationId, conversations]);

  /* -----------------------------------------------------------
   * FILTER LOGIC
   * -----------------------------------------------------------*/
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

  const activeConversation = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId) ?? null
    : null;

  /* -----------------------------------------------------------
   * HEADER CHANNEL BADGE
   * -----------------------------------------------------------*/
  const HeaderChannelBadge = () => {
    if (!activeConversation) return null;

    if (activeConversation.channel === "whatsapp") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-900/40 px-2 py-0.5 text-[11px] text-green-300">
          <Phone size={12} />
          WhatsApp
        </span>
      );
    }

    if (activeConversation.channel === "web") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-900/40 px-2 py-0.5 text-[11px] text-blue-300">
          <Globe size={12} />
          Web
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/60 px-2 py-0.5 text-[11px] text-slate-200">
        <User2 size={12} />
        Internal
      </span>
    );
  };

  /* -----------------------------------------------------------
   * SEND MESSAGE (TEXT + OPTIONAL MEDIA)
   * -----------------------------------------------------------*/
  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeConversationId || !activeConversation) return;

    const fd = new FormData(event.currentTarget);
    const text = fd.get("message")?.toString().trim() || "";
    const file = (fd.get("file") as File | null) || null;

    // nothing to send
    if (!text && !file) return;

    setSending(true);
    try {
      // Branch by channel
      if (activeConversation.channel === "whatsapp") {
        // ------------------------------------------
        // WhatsApp outbound (agent → customer)
        // ------------------------------------------
        let mediaUrl: string | null = null;
        let messageType: string = "text";

        if (file) {
          // Upload to Supabase Storage (whatsapp-media)
          const ext =
            file.name.split(".").pop() ||
            (file.type.startsWith("image/") ? "jpg" : "bin");

          const path = `org_${activeConversation.organization_id}/${activeConversationId}/${Date.now()}_${file.name}`;

          const { error: uploadError } = await supabase.storage
            .from(WHATSAPP_MEDIA_BUCKET)
            .upload(path, file, {
              contentType: file.type,
              upsert: true,
            });

          if (uploadError) {
            console.error("[ChatsModule] media upload error:", uploadError);
          } else {
            const { data: pub } = supabase.storage
              .from(WHATSAPP_MEDIA_BUCKET)
              .getPublicUrl(path);
            mediaUrl = pub?.publicUrl ?? null;
          }

          if (file.type.startsWith("image/")) {
            messageType = "image";
          } else {
            messageType = "document";
          }
        }

        // Insert agent message in DB
        const displayText =
          text ||
          (messageType === "image"
            ? "Sent an image"
            : messageType === "document"
            ? "Sent a document"
            : "");

        const { error: msgError } = await supabase.from("messages").insert({
          conversation_id: activeConversationId,
          sender: "user",
          message_type: messageType,
          text: displayText || null,
          media_url: mediaUrl,
          channel: "whatsapp",
        });

        if (msgError) {
          console.error("[ChatsModule] insert WA message error:", msgError);
        } else {
          // Refresh messages list
          await fetchMessages(activeConversationId);
        }

        // Send via whatsapp-send Edge Function
        if (!headerContact?.phone) {
          console.warn(
            "[ChatsModule] No contact phone found, skipping outbound WhatsApp send."
          );
        } else {
          const body: any = {
            organization_id: activeConversation.organization_id,
            to: headerContact.phone,
          };

          if (messageType === "image" && mediaUrl) {
            body.type = "image";
            body.image_url = mediaUrl;
            if (text) body.image_caption = text;
          } else if (messageType === "document" && mediaUrl) {
            body.type = "document";
            body.document_url = mediaUrl;
            body.filename = file?.name ?? "document";
            if (text) body.document_caption = text;
          } else {
            body.type = "text";
            body.text = text;
          }

          const { data, error } = await supabase.functions.invoke(
            "whatsapp-send",
            { body }
          );

          if (error) {
            console.error("[ChatsModule] whatsapp-send error:", error);
          } else {
            console.log("[ChatsModule] whatsapp-send ok:", data);
          }
        }
      } else {
        // ------------------------------------------
        // Web / Internal chat (uses AI auto reply pipeline)
        // ------------------------------------------
        const payload: Partial<Message> = {
          text,
          sender: "user",
          message_type: "text",
          channel: activeConversation.channel ?? "internal",
        };

        await sendMessage(activeConversationId, payload);
      }

      event.currentTarget.reset();
    } catch (err) {
      console.error("[ChatsModule] handleSend error:", err);
    } finally {
      setSending(false);
    }
  };

  /* -----------------------------------------------------------
   * NO ORG SELECTED VIEW
   * -----------------------------------------------------------*/
  if (!currentOrganization) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-white/5 bg-slate-950/60 p-6 text-sm text-slate-400">
        Select an organization from the top-left to view conversations.
      </div>
    );
  }

  /* -----------------------------------------------------------
   * MAIN UI
   * -----------------------------------------------------------*/
  return (
    <div className="grid h-full grid-cols-[320px,1fr] gap-6">
      {/* -------------------------------------------
          SIDEBAR
      ------------------------------------------- */}
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
            <option value="whatsapp">WhatsApp</option>
            <option value="web">Web</option>
            <option value="internal">Internal</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {filteredConversations.map((conversation) => (
            <ChatSidebarItem
              key={conversation.id}
              conversation={conversation}
              isActive={activeConversationId === conversation.id}
              unreadCount={unread[conversation.id] ?? 0}
              onClick={() => setActiveConversation(conversation.id)}
            />
          ))}

          {!filteredConversations.length && (
            <div className="p-6 text-center text-sm text-slate-400">
              No conversations found.
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------
          MESSAGE PANEL
      ------------------------------------------- */}
      <div className="flex h-full flex-col rounded-2xl border border-white/5 bg-slate-900/60">
        {activeConversationId && activeConversation ? (
          <>
            {/* HEADER */}
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              {/* LEFT: Contact + Channel */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white">
                    {headerContact?.name ||
                      headerContact?.phone ||
                      "New conversation"}
                  </h2>
                  <HeaderChannelBadge />
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                  {headerContact?.phone && (
                    <span className="flex items-center gap-1">
                      <Phone size={12} />
                      <span>{headerContact.phone}</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <MessageCircle size={12} />
                    <span>ID: {activeConversation.id.slice(0, 8)}</span>
                  </span>
                  {headerLoading && (
                    <span className="text-[10px] text-slate-500">
                      Loading contact…
                    </span>
                  )}
                </div>
              </div>

              {/* RIGHT: AI Toggle */}
              <button
                onClick={() =>
                  toggleAI(
                    activeConversationId,
                    !aiToggle[activeConversationId]
                  )
                }
                className={`flex items-center gap-2 rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                  aiToggle[activeConversationId]
                    ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                    : "border-white/10 bg-slate-900/60 text-slate-200 hover:border-accent hover:text-white"
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

            {/* MESSAGES LIST */}
            <div
              ref={scrollContainerRef}
              className="flex-1 space-y-4 overflow-y-auto px-6 py-4"
            >
              {currentMessages.map((msg) => (
                <ChatMessageBubble key={msg.id} message={msg} />
              ))}

              <div ref={bottomRef} />

              {!currentMessages.length && (
                <p className="text-sm text-slate-400">No messages yet.</p>
              )}
            </div>

            {/* INPUT BAR */}
            <form
              onSubmit={handleSend}
              className="border-t border-white/5 px-6 py-4"
            >
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-white/10 px-4 py-2 text-xs uppercase tracking-wide text-slate-300">
                  <Upload size={16} />
                  Attach
                  <input
                    type="file"
                    name="file"
                    className="hidden"
                  />
                </label>

                <input
                  type="text"
                  name="message"
                  placeholder={
                    activeConversation.channel === "whatsapp"
                      ? "Reply to customer on WhatsApp..."
                      : "Type a message..."
                  }
                  className="flex-1 rounded-full border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white focus:border-accent focus:outline-none"
                />

                <button
                  type="submit"
                  disabled={sending}
                  className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? "Sending..." : "Send"}
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
