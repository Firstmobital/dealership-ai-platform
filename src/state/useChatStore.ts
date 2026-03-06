// src/state/useChatStore.ts
import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import toast from "react-hot-toast";

import type { Conversation, Message } from "../types/database";

/* ========================================================================== */
/*  REALTIME STATE (P0-B — ORG SAFE + CLEANUP)                                 */
/* ========================================================================== */

let realtimeOrgId: string | null = null;

let rtConversations:
  | ReturnType<typeof supabase.channel>
  | null = null;

let rtMessages:
  | ReturnType<typeof supabase.channel>
  | null = null;

let rtOrgMessages:
  | ReturnType<typeof supabase.channel>
  | null = null;

function teardownRealtime() {
  try {
    if (rtMessages) supabase.removeChannel(rtMessages);
  } catch {
    // ignore
  }
  try {
    if (rtOrgMessages) supabase.removeChannel(rtOrgMessages);
  } catch {
    // ignore
  }
  try {
    if (rtConversations) supabase.removeChannel(rtConversations);
  } catch {
    // ignore
  }

  rtMessages = null;
  rtOrgMessages = null;
  rtConversations = null;
  realtimeOrgId = null;
}

/* ========================================================================== */
/*  FILTER TYPES                                                              */
/* ========================================================================== */

export type ConversationFilter =
  | "all"
  | "assigned"
  | "unassigned"
  | "bot"
  | "whatsapp"
  | "web"
  | "internal"
  | "psf";

/* ========================================================================== */
/*  CHAT STORE TYPE                                                           */
/* ========================================================================== */

type ChatState = {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  activeConversationId: string | null;

  filter: ConversationFilter;
  loading: boolean;

  // 🔍 Phase 1B — Search & Filters
  search: string;
  intentFilter: string | null;
  assignedFilter: string | null;

  // ✅ Cursor pagination state for conversations
  conversationsPageSize: number;
  conversationsLoading: boolean;
  conversationsHasMore: boolean;
  conversationsCursor: { lastMessageAt: string | null; createdAt: string | null; id: string } | null;
  // Used to prevent duplicate fetches for same cursor/filter.
  conversationsInFlightKey: string | null;

  // Optional filter: only conversations where customer_reply_count = X
  replyCountFilter: number | null;

  aiToggle: Record<string, boolean>;
  unread: Record<string, number>;

  // Cleanup (used on logout / org switch)
  reset: () => void;

  // Cursor-based conversations fetch
  fetchConversationsPage: (
    organizationId: string,
    params?: {
      reset?: boolean;
      limit?: number;
      search?: string;
      intent?: string | null;
      assignedTo?: string | null;
      replyCount?: number | null;
    }
  ) => Promise<void>;

  // Back-compat: existing callers can still call fetchConversations(orgId)
  fetchConversations: (
    organizationId: string,
    params?: {
      search?: string;
      intent?: string | null;
      assignedTo?: string | null;
      replyCount?: number | null;
    }
  ) => Promise<void>;

  fetchMessages: (conversationId: string) => Promise<void>;

  initRealtime: (organizationId: string) => void;

  setActiveConversation: (conversationId: string | null) => void;
  setFilter: (filter: ConversationFilter) => void;

  // 🔍 setters
  setSearch: (q: string) => void;
  setIntentFilter: (intent: string | null) => void;
  setAssignedFilter: (userId: string | null) => void;
  setReplyCountFilter: (n: number | null) => void;

  toggleAI: (conversationId: string, enabled: boolean) => Promise<void>;

  sendMessage: (
    conversationId: string,
    payload: Partial<Message>
  ) => Promise<{ noReply: boolean }>;

  suggestFollowup: (conversationId: string) => Promise<string>;
};

/* ========================================================================== */
/*  HELPERS                                                                   */
/* ========================================================================== */

function isInboundMessage(msg: any): boolean {
  const sender = String(msg?.sender ?? "").toLowerCase();
  // Treat anything not clearly an agent/system as inbound/customer.
  return sender === "customer" || sender === "lead" || sender === "user";
}

function isUnreadMessage(msg: any): boolean {
  // Prefer explicit read signals when available.
  if (typeof msg?.seen === "boolean") return msg.seen === false;
  if (msg?.read_at === null) return true;
  if (typeof msg?.read_at === "string" && msg.read_at.length === 0) return true;
  const status = String(msg?.status ?? "").toLowerCase();
  if (status === "unread" || status === "received") return true;
  return false;
}

function computeUnreadCountForConversation(
  conversation: any,
  messages: Message[] | undefined,
  activeConversationId: string | null,
): number {
  if (!conversation?.id) return 0;
  if (activeConversationId === conversation.id) return 0;

  const msgs = messages ?? [];

  // A) Count inbound messages that are explicitly unread.
  const explicitUnread = msgs.filter((m: any) => isInboundMessage(m) && isUnreadMessage(m));
  if (explicitUnread.length > 0) return explicitUnread.length;

  // B) Fallback: compare to last_read_at if present.
  const lastReadAtRaw = (conversation as any)?.last_read_at;
  const lastReadAt = lastReadAtRaw ? new Date(String(lastReadAtRaw)).getTime() : null;
  if (!lastReadAt || Number.isNaN(lastReadAt)) {
    return msgs.filter((m: any) => isInboundMessage(m)).length;
  }

  return msgs.filter((m: any) => {
    if (!isInboundMessage(m)) return false;
    const ts = m?.order_at ?? m?.created_at;
    if (!ts) return false;
    const t = new Date(String(ts)).getTime();
    if (Number.isNaN(t)) return false;
    return t > lastReadAt;
  }).length;
}

// WhatsApp edge function expects phone formatted as digits (India normalization happens server-side)
// but it can only normalize if it receives something close to E.164 / phone-like; handle common cases.
function normalizeToWhatsAppTo(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  // remove spaces, dashes, parentheses
  const cleaned = s.replace(/[\s\-()]/g, "");
  // allow leading +, then digits
  const plusOk = cleaned.startsWith("+")
    ? `+${cleaned.slice(1).replace(/\D/g, "")}`
    : cleaned.replace(/\D/g, "");

  // If it still has '+', keep it (server normalizer handles +91...)
  if (cleaned.startsWith("+")) return plusOk;
  return plusOk || null;
}

function pickWhatsAppToFromConversation(conv: any): string | null {
  if (!conv) return null;

  // Order matters: prefer explicit E.164 fields when present.
  const candidates: unknown[] = [
    conv.customer_phone_e164,
    conv.customer_phone,
    conv.contact_phone_e164,
    conv.contact_phone,
    conv.customer_whatsapp_e164,
    conv.customer_whatsapp,
    conv.whatsapp_number,
    conv.whatsapp_number_e164,

    // normalized conversation shape in this repo includes `contact` (see normalizeConversation)
    conv.contact?.phone_e164,
    conv.contact?.phone,
    conv.contact?.whatsapp_number,
    conv.contact?.whatsapp_number_e164,

    // some queries include contacts relationship
    conv.contacts?.phone_e164,
    conv.contacts?.phone,
    conv.contacts?.whatsapp_number,
    conv.contacts?.whatsapp_number_e164,
  ];

  for (const c of candidates) {
    const to = normalizeToWhatsAppTo(c);
    if (to) return to;
  }

  return null;
}

function normalizeConversation(row: any): Conversation {
  const contact = row?.contacts
    ? Array.isArray(row.contacts)
      ? row.contacts[0] ?? null
      : row.contacts
    : null;

  return {
    ...row,
    contact,
  } as Conversation;
}

async function fetchContactForConversation(conversation: any) {
  try {
    const contactId = conversation?.contact_id;
    if (!contactId) return null;

    const { data } = await supabase
      .from("contacts")
      .select("id, phone, name, first_name, last_name")
      .eq("id", contactId)
      .maybeSingle();

    return data ?? null;
  } catch {
    return null;
  }
}

/* ========================================================================== */
/*  STORE IMPLEMENTATION                                                      */
/* ========================================================================== */

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  messages: {},
  activeConversationId: null,

  filter: "all",
  loading: false,

  // 🔍 Phase 1B
  search: "",
  intentFilter: null,
  assignedFilter: null,

  conversationsPageSize: 50,
  conversationsLoading: false,
  conversationsHasMore: true,
  conversationsCursor: null,
  conversationsInFlightKey: null,

  replyCountFilter: null,

  aiToggle: {},
  unread: {},

  reset: () => {
    teardownRealtime();
    set({
      conversations: [],
      messages: {},
      activeConversationId: null,
      filter: "all",
      loading: false,
      search: "",
      intentFilter: null,
      assignedFilter: null,
      conversationsLoading: false,
      conversationsHasMore: true,
      conversationsCursor: null,
      conversationsInFlightKey: null,
      replyCountFilter: null,
      aiToggle: {},
      unread: {},
    });
  },

  /* -------------------------------------------------------------------------- */
  /* FETCH CONVERSATIONS (CURSOR PAGINATION, ORG SAFE)                           */
  /* -------------------------------------------------------------------------- */
  fetchConversationsPage: async (organizationId, params) => {
    const limit = params?.limit ?? get().conversationsPageSize;
    const reset = Boolean(params?.reset);

    const search = (params?.search ?? get().search ?? "").trim();
    const intent = (params?.intent ?? get().intentFilter) ?? null;
    const assignedTo = (params?.assignedTo ?? get().assignedFilter) ?? null;
    const replyCount = (params?.replyCount ?? get().replyCountFilter) ?? null;

    if (!organizationId) return;

    // Guard: if already loading, don't start another request.
    if (get().conversationsLoading) return;

    const cursor = reset ? null : (get().conversationsCursor as any);

    // Key used to prevent duplicated fetches when scroll events fire rapidly.
    const inFlightKey = JSON.stringify({
      organizationId,
      cursor,
      limit,
      search,
      intent,
      assignedTo,
      replyCount,
    });
    if (get().conversationsInFlightKey === inFlightKey) return;

    // If we already know there's no more data, don't fetch.
    if (!reset && !get().conversationsHasMore) return;

    set({ conversationsLoading: true, conversationsInFlightKey: inFlightKey });

    // Always filter by organization_id (multi-tenant safe)
    let query = supabase
      .from("conversations")
      .select(
        [
          "*",
          // Only pull contact fields needed for list/search.
          "contacts(id, phone, name, first_name, last_name)",
        ].join(",")
      )
      .eq("organization_id", organizationId)
      // stable ordering: last_message_at desc (NULLS LAST), then created_at desc, then id desc
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (intent) query = query.eq("intent", intent);
    if (assignedTo) query = query.eq("assigned_to", assignedTo);

    if (typeof replyCount === "number") {
      query = query.eq("customer_reply_count", replyCount);
    }

    // Search (name/phone) - uses contact relationship.
    // Search (name/phone) - must scope OR filters to foreign table "contacts"
    if (search) {
      const digits = search.replace(/\D/g, "");
      const nameTerm = `%${search}%`;

      if (digits) {
        query = query.or(`name.ilike.${nameTerm},phone.ilike.%${digits}%`, {
          foreignTable: "contacts",
        });
      } else {
        query = query.or(`name.ilike.${nameTerm}`, { foreignTable: "contacts" });
      }
    }

    // Cursor pagination: fetch records strictly "after" cursor tuple.
    // Order: last_message_at desc (NULLS LAST), created_at desc, id desc.
    if (cursor) {
      const lastTs = cursor.lastMessageAt;
      const lastCreatedAt = cursor.createdAt;
      const lastId = cursor.id;

      // A) Normal case: last_message_at exists
      if (lastTs) {
        // (last_message_at < lastTs) OR (last_message_at = lastTs AND id < lastId)
        query = query.or(
          `last_message_at.lt.${lastTs},and(last_message_at.eq.${lastTs},id.lt.${lastId})`
        );
      } else {
        // B) NULL last_message_at group: paginate within NULLS using created_at + id.
        // last_message_at IS NULL AND (created_at < lastCreatedAt OR (created_at = lastCreatedAt AND id < lastId))
        // Note: this assumes cursor.createdAt is present when lastMessageAt is null.
        query = query.or(
          `and(last_message_at.is.null,created_at.lt.${lastCreatedAt}),and(last_message_at.is.null,created_at.eq.${lastCreatedAt},id.lt.${lastId})`
        );
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("[useChatStore] fetchConversationsPage error", error);
      set({ conversationsLoading: false, conversationsInFlightKey: null });
      return;
    }

    const rows = (data ?? []).map(normalizeConversation);

    // Inbox visibility rule (FINAL):
    // Visible if any of:
    // A) delivered/read campaign message exists
    // B) inbound customer-side message exists
    // C) bot/agent message exists
    // Hidden only if ONLY failed campaign messages (or no qualifying messages)
    // Fail-open: if helper query fails, do not filter.
    let filteredRows = rows;
    try {
      const convIds = rows.map((r: any) => r?.id).filter(Boolean) as string[];

      if (convIds.length > 0) {
        const deliveredCampaignSet = new Set<string>();
        const inboundSet = new Set<string>();
        const botSet = new Set<string>();

        // Query messages for these conversations (org-scoped) to compute visibility sets.
        const { data: msgs, error: msgsErr } = await supabase
          .from("messages")
          .select(
            "conversation_id,sender,campaign_id,campaign_message_id,delivered_at,read_at,whatsapp_status,status"
          )
          .eq("organization_id", organizationId)
          .in("conversation_id", convIds);

        if (msgsErr) {
          // Fail open: don't hide anything if we can't evaluate message statuses.
          console.error(
            "[useChatStore] fetchConversationsPage inbox visibility helper query error",
            msgsErr,
          );
        } else {
          for (const m of (msgs ?? []) as any[]) {
            const cid = String(m?.conversation_id ?? "");
            if (!cid) continue;

            const sender = String(m?.sender ?? "").toLowerCase();
            if (sender === "customer" || sender === "lead" || sender === "user") {
              inboundSet.add(cid);
            }
            if (sender === "bot" || sender === "agent") {
              botSet.add(cid);
            }

            const isCampaign = m?.campaign_id != null || m?.campaign_message_id != null;
            if (isCampaign) {
              const wa = String(m?.whatsapp_status ?? "").toLowerCase();
              const st = String(m?.status ?? "").toLowerCase();
              const deliveredOrRead =
                m?.delivered_at != null ||
                m?.read_at != null ||
                wa === "delivered" ||
                wa === "read" ||
                st === "delivered" ||
                st === "read";

              if (deliveredOrRead) deliveredCampaignSet.add(cid);
            }
          }

          const visibleSet = new Set<string>([
            ...deliveredCampaignSet,
            ...inboundSet,
            ...botSet,
          ]);

          const before = rows.length;
          filteredRows = rows.filter((c: any) => visibleSet.has(String(c.id)));

          if (import.meta.env.DEV) {
            console.debug("Inbox filter stats", {
              fetched: before,
              visible: filteredRows.length,
              deliveredCampaignCount: deliveredCampaignSet.size,
              inboundCount: inboundSet.size,
              botCount: botSet.size,
            });
          }
        }
      }
    } catch (e) {
      // Fail open
      console.error(
        "[useChatStore] fetchConversationsPage inbox visibility filter exception",
        e,
      );
    }

    const rowsToUse = filteredRows;

    // Next cursor from last *raw* row (pagination must be based on DB page, not filtered rows)
    const last = rows[rows.length - 1] as any;
    const nextCursor =
      last?.id
        ? { lastMessageAt: last?.last_message_at ?? null, createdAt: last?.created_at ?? null, id: last.id }
        : null;

    set((state) => {
      const merged = reset ? rowsToUse : [...state.conversations, ...rowsToUse];

      // Deduplicate by id (safety with realtime inserts / race)
      const seen = new Set<string>();
      const deduped: Conversation[] = [];
      for (const c of merged as any[]) {
        if (!c?.id) continue;
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        deduped.push(c as Conversation);
      }

      const aiToggle = {
        ...state.aiToggle,
        ...Object.fromEntries(rowsToUse.map((c: any) => [c.id, c.ai_enabled !== false])),
      };

      // Recompute unread map deterministically using messages already in memory.
      const unreadNext: Record<string, number> = { ...state.unread };
      for (const conv of deduped as any[]) {
        unreadNext[conv.id] = computeUnreadCountForConversation(
          conv,
          state.messages[conv.id],
          state.activeConversationId,
        );
      }

      return {
        ...state,
        conversations: deduped,
        aiToggle,
        unread: unreadNext,
        conversationsCursor: nextCursor,
        // hasMore must be based on raw DB rows length, not filtered length
        conversationsHasMore: rows.length === limit,
        conversationsLoading: false,
        conversationsInFlightKey: null,
      };
    });
  },

  // Back-compat wrapper: resets and loads first page
  fetchConversations: async (organizationId, params) => {
    // Preserve old loading flag for any existing UI.
    set({ loading: true });
    await get().fetchConversationsPage(organizationId, {
      reset: true,
      search: params?.search,
      intent: params?.intent,
      assignedTo: params?.assignedTo,
      replyCount: params?.replyCount,
    });
    set({ loading: false });
  },

  /* -------------------------------------------------------------------------- */
  /* FETCH MESSAGES                                                             */
  /* -------------------------------------------------------------------------- */
  fetchMessages: async (conversationId) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      // Phase 3: canonical ordering key (messages.order_at)
      .order("order_at", { ascending: true });

    if (error) {
      console.error("[useChatStore] fetchMessages error", error);
      return;
    }

    set((state) => {
      const nextMessages = {
        ...state.messages,
        [conversationId]: (data ?? []) as Message[],
      };

      const conv = state.conversations.find((c) => c.id === conversationId) as any;
      if (!conv) return { messages: nextMessages };

      const nextUnread = {
        ...state.unread,
        [conversationId]: computeUnreadCountForConversation(
          conv,
          nextMessages[conversationId],
          state.activeConversationId,
        ),
      };

      return { messages: nextMessages, unread: nextUnread };
    });
  },

  /* -------------------------------------------------------------------------- */
  /* REALTIME                                                                  */
  /* -------------------------------------------------------------------------- */
  initRealtime: (organizationId) => {
    // P0-B: Make realtime deterministic and org-safe.
    // If org changes, teardown everything and re-init.
    if (!organizationId) return;
    if (realtimeOrgId && realtimeOrgId !== organizationId) {
      teardownRealtime();
    }

    // If already initialized for this org and channels exist, do not resubscribe.
    if (realtimeOrgId === organizationId && rtConversations && rtOrgMessages) {
      return;
    }

    realtimeOrgId = organizationId;

    /* ------------------ CONVERSATIONS ------------------ */
    rtConversations = supabase
      .channel(`rt-conversations:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const next = payload.new as any;

          // Reorder + update the conversation in store.
          set((state) => {
            const existing = state.conversations;
            const idx = existing.findIndex((c) => c.id === next.id);
            if (idx === -1) return state;

            const updated = normalizeConversation({
              ...existing[idx],
              ...next,
              contacts: (existing[idx] as any).contact ?? (existing[idx] as any).contacts,
            });

            const reordered = [
              updated,
              ...existing.slice(0, idx),
              ...existing.slice(idx + 1),
            ];

            const isActive = state.activeConversationId === next.id;

            // If conversation isn't active, recompute unread based on messages we have;
            // otherwise keep it cleared.
            const unreadNext = { ...state.unread };
            unreadNext[next.id] = computeUnreadCountForConversation(
              updated,
              state.messages[next.id],
              isActive ? next.id : state.activeConversationId,
            );

            return {
              ...state,
              conversations: reordered as any,
              unread: unreadNext,
            };
          });
        },
      )
      // Also listen for message inserts at the org level to update unread for non-active convos
      // without relying on last_message_at heuristics.
      ;

    // Messages channel scoped to org via the conversation row filter isn't available here,
    // so we do a best-effort INSERT listener and then validate org by looking up convo in state.
    rtOrgMessages = supabase
      .channel(`rt-messages-org:${organizationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as any;
          const rawConvId = msg?.conversation_id;
          if (!rawConvId) return;
          const convId = String(rawConvId);

          const state = get();

          // Only count inbound messages toward unread.
          if (!isInboundMessage(msg)) return;

          // If active, keep unread cleared and do no further work.
          if (state.activeConversationId === convId) {
            set((s) => ({ unread: { ...s.unread, [convId]: 0 } }));
            return;
          }

          // If convo not in current list, ignore.
          const conv = state.conversations.find((c) => c.id === convId) as any;
          if (!conv) return;
          if (conv.organization_id !== organizationId) return;

          // If message already exists, skip set() altogether.
          const existing = state.messages[convId] ?? [];
          if (existing.some((m) => (m as any)?.id === msg.id)) return;

          // Merge message into cache (so computeUnread can work) and bump unread.
          set((s) => {
            const nextList = [...(s.messages[convId] ?? []), msg as Message];
            return {
              messages: {
                ...s.messages,
                [convId]: nextList,
              },
              unread: {
                ...s.unread,
                [convId]: computeUnreadCountForConversation(
                  conv,
                  nextList,
                  s.activeConversationId,
                ),
              },
            };
          });
        },
       )
       .subscribe();

    rtConversations
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversations",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const convRaw = payload.new as any;

          if (get().conversations.some((c) => c.id === convRaw.id)) return;

          void (async () => {
            const contact = await fetchContactForConversation(convRaw);
            const conv = normalizeConversation({
              ...convRaw,
              contacts: contact,
            });
            set({ conversations: [conv, ...get().conversations] });
          })();
        }
      )
      .subscribe();
  },

  /* -------------------------------------------------------------------------- */
  /* UI STATE                                                                   */
  /* -------------------------------------------------------------------------- */
  setActiveConversation: (conversationId) => {
    set({ activeConversationId: conversationId });
    if (conversationId) {
      set((state) => ({
        unread: { ...state.unread, [conversationId]: 0 },
      }));
    }

    // P0-B: Subscribe to messages for the active conversation only.
    try {
      if (rtMessages) supabase.removeChannel(rtMessages);
    } catch {
      // ignore
    }
    rtMessages = null;

    if (!conversationId) return;

    rtMessages = supabase
      .channel(`rt-messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          const existing = get().messages[msg.conversation_id] ?? [];
          if (existing.some((m) => m.id === msg.id)) return;

          set({
            messages: {
              ...get().messages,
              [msg.conversation_id]: [...existing, msg],
            },
            unread: {
              ...get().unread,
              [msg.conversation_id]: 0,
            },
          });
        },
      )
      .subscribe();
  },

  setFilter: (filter) => set({ filter }),

  // 🔍 setters
  setSearch: (q) => set({ search: q }),
  setIntentFilter: (intent) => set({ intentFilter: intent }),
  setAssignedFilter: (userId) => set({ assignedFilter: userId }),
  setReplyCountFilter: (n) => set({ replyCountFilter: n }),

  /* -------------------------------------------------------------------------- */
  /* TOGGLE AI                                                                  */
  /* -------------------------------------------------------------------------- */
  toggleAI: async (conversationId, enabled) => {
    const { error } = await supabase
      .from("conversations")
      .update({ ai_enabled: enabled })
      .eq("id", conversationId);

    if (error) throw error;

    set((state) => ({
      aiToggle: { ...state.aiToggle, [conversationId]: enabled },
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, ai_enabled: enabled }
          : c
      ),
    }));
  },

  /* -------------------------------------------------------------------------- */
  /* SEND MESSAGE                                                               */
  /* -------------------------------------------------------------------------- */
  sendMessage: async (conversationId, payload) => {
    const text = payload.text?.trim() ?? "";

    // Optimistic UI: append a local pending message immediately.
    // For WhatsApp media messages, we show the pending bubble while the edge function sends.
    const tempId = `temp-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();
    const optimistic: any = {
      id: tempId,
      conversation_id: conversationId,
      sender: payload.sender ?? "agent",
      message_type: payload.message_type ?? "text",
      text,
      channel: payload.channel ?? "web",
      media_url: (payload as any).media_url ?? null,
      mime_type: (payload as any).mime_type ?? null,
      filename: (payload as any).filename ?? null,
      created_at: nowIso,
      order_at: nowIso,
    };

    // ✅ WhatsApp agent send (Edge Function)
    if (payload.channel === "whatsapp") {
      const messageType = (payload.message_type ?? "text").toString();
      const type =
        messageType === "image" ||
        messageType === "document" ||
        messageType === "video" ||
        messageType === "audio"
          ? (messageType as any)
          : "text";

      // Validate minimum payload
      if (type === "text" && !text) return { noReply: false };
      const media_url = (payload as any).media_url ?? null;
      if (type !== "text" && !media_url) return { noReply: false };

      // Add optimistic message now (so UI shows immediate pending state)
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: [...(state.messages[conversationId] ?? []), optimistic],
        },
      }));

      // Best-effort: read from local cache for logging only.
      const conv = get().conversations.find((c) => c.id === conversationId) as any;
      const to = pickWhatsAppToFromConversation(conv);

      // organization_id is only used by the edge function for settings lookup/idempotency.
      // In this repo, whatsapp-send derives organization_id from the conversation row, but it
      // still expects it for settings resolution. If missing locally, fetch it once.
      let organizationId: string | null = conv?.organization_id ?? null;
      if (!organizationId) {
        const { data: orgRow, error: orgErr } = await supabase
          .from("conversations")
          .select("organization_id")
          .eq("id", conversationId)
          .maybeSingle();

        if (orgErr) {
          console.error("[useChatStore] failed to resolve organization_id", orgErr);
        }
        organizationId = (orgRow as any)?.organization_id ?? null;
      }

      console.info("[whatsapp-send invoke]", {
        conversationId,
        organizationId: organizationId ?? undefined,
        to: to ?? undefined,
        type,
        hasMediaUrl: !!media_url,
      });

      // Align with supabase/functions/whatsapp-send contract:
      // - Always send conversation_id so the edge function resolves conversation + contact.
      // - Do not send `message_type` (business type enum) from the frontend.
      const body: any = {
        conversation_id: conversationId,
        type,
        text: text || null,
        sender: "agent",
        media_url,
        mime_type: (payload as any).mime_type ?? null,
        filename: (payload as any).filename ?? null,
      };

      // Optional hint only; edge function can derive org from conversation row.
      if (organizationId) body.organization_id = organizationId;
      // Optional hint only; edge function uses DB contact phone in conversation_id path.
      if (to) body.to = to;

      const { data, error } = await supabase.functions.invoke("whatsapp-send", {
        body,
      });

      if (error || (data as any)?.error) {
        console.error("[useChatStore] whatsapp-send failed", error ?? data);
        toast.error(
          (data as any)?.error
            ? String((data as any).error)
            : "WhatsApp send failed",
        );

        // Roll back optimistic message on failure.
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: (state.messages[conversationId] ?? []).filter(
              (m: any) => m.id !== tempId,
            ),
          },
        }));

        return { noReply: false };
      }

      // Reconcile authoritative state (delivery events / message row) after send.
      void get().fetchMessages(conversationId);

      return { noReply: false };
    }

    // Non-WhatsApp: preserve existing direct insert behavior.
    if (!text) return { noReply: false };

    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [...(state.messages[conversationId] ?? []), optimistic],
      },
    }));

    const { error: insertErr } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: payload.sender ?? "agent",
      message_type: payload.message_type ?? "text",
      text,
      channel: payload.channel ?? "web",
    });

    if (insertErr) {
      console.error("[useChatStore] insert message error", insertErr);
      toast.error("Failed to send message");
      // Remove optimistic message on failure.
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: (state.messages[conversationId] ?? []).filter(
            (m: any) => m.id !== tempId,
          ),
        },
      }));
      return { noReply: false };
    }

    // Reconcile authoritative state (realtime should insert the real row; ensure no temp residue).
    void get().fetchMessages(conversationId);

    const aiEnabled = get().aiToggle[conversationId];
    if (!aiEnabled) return { noReply: false };

    // Only trigger AI for customer/inbound messages.
    const sender = (payload.sender ?? "agent").toString();
    if (sender === "agent") return { noReply: false };

    const { data } = await supabase.functions.invoke("ai-handler", {
      body: { conversation_id: conversationId, user_message: text },
    });

    if (data?.no_reply) return { noReply: true };
    return { noReply: false };
  },

  /* -------------------------------------------------------------------------- */
  /* FOLLOW-UP SUGGESTION                                                       */
  /* -------------------------------------------------------------------------- */
  suggestFollowup: async (conversationId) => {
    const { data } = await supabase.functions.invoke("ai-handler", {
      body: {
        conversation_id: conversationId,
        user_message: "Suggest follow-up",
        mode: "suggest_followup",
      },
    });

    return (data?.suggestion ?? "").toString();
  },
}));
