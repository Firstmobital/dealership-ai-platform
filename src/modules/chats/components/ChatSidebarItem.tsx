// src/modules/chats/components/ChatSidebarItem.tsx
// src/modules/chats/components/ChatSidebarItem.tsx
// FULL + FINAL — Phase 1B (Intent Tagging UI)
// Bright CRM sidebar items (PHONE-FIRST)

import type { Conversation } from "../../../types/database";

type Props = {
  conversation: Conversation;
  isActive: boolean;
  unreadCount: number;
  onClick: () => void;
};

export function ChatSidebarItem({
  conversation,
  isActive,
  unreadCount,
  onClick,
}: Props) {
  /* -------------------------------------------------------
   * CHANNEL BADGE — Subtle CRM pills
   * ------------------------------------------------------- */
  const channelBadge = (() => {
    if (conversation.channel === "whatsapp") {
      return (
        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] text-green-700">
          WhatsApp
        </span>
      );
    }
    if (conversation.channel === "web") {
      return (
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">
          Web
        </span>
      );
    }
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700">
        Internal
      </span>
    );
  })();

  /* -------------------------------------------------------
   * INTENT BADGE — Phase 1B
   * ------------------------------------------------------- */
  const intent = conversation.intent ?? "general";

  const intentBadge = (() => {
    const base =
      "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize";

    switch (intent) {
      case "sales":
        return (
          <span className={`${base} bg-emerald-50 text-emerald-700`}>
            Sales
          </span>
        );
      case "service":
        return (
          <span className={`${base} bg-blue-50 text-blue-700`}>
            Service
          </span>
        );
      case "finance":
        return (
          <span className={`${base} bg-purple-50 text-purple-700`}>
            Finance
          </span>
        );
      case "accessories":
        return (
          <span className={`${base} bg-amber-50 text-amber-700`}>
            Accessories
          </span>
        );
      default:
        return (
          <span className={`${base} bg-slate-100 text-slate-600`}>
            General
          </span>
        );
    }
  })();

  /* -------------------------------------------------------
   * PRIMARY IDENTITY (PHONE > NAME > FALLBACK)
   * ------------------------------------------------------- */
  const phone = conversation.contact?.phone ?? "Unknown number";
  const name =
    conversation.contact?.name ||
    [conversation.contact?.first_name, conversation.contact?.last_name]
      .filter(Boolean)
      .join(" ") ||
    null;

  /* -------------------------------------------------------
   * TIME FORMATTER
   * ------------------------------------------------------- */
  const time = conversation.last_message_at
    ? new Date(conversation.last_message_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "No messages";

  /* -------------------------------------------------------
   * UI
   * ------------------------------------------------------- */
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full px-3 py-2 text-left transition-colors",
        "flex items-center justify-between gap-3 rounded-md",
        isActive
          ? "bg-blue-50 text-slate-900"
          : "bg-transparent text-slate-700 hover:bg-slate-50",
      ].join(" ")}
    >
      {/* LEFT — Contact info */}
      <div className="flex flex-col gap-0.5 overflow-hidden">
        {/* PHONE (PRIMARY) */}
        <span className="truncate text-sm font-medium text-slate-900">
          {phone}
        </span>

        {/* NAME + TIME (SECONDARY) */}
        <span className="truncate text-[11px] text-slate-500">
          {name ? `${name} • ${time}` : time}
        </span>
      </div>

      {/* RIGHT — Badges + unread */}
      <div className="flex flex-col items-end gap-1">
        {channelBadge}
        {intentBadge}

        {unreadCount > 0 && (
          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-medium text-white">
            {unreadCount}
          </span>
        )}
      </div>
    </button>
  );
}
