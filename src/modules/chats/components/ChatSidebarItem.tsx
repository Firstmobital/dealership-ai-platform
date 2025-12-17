// src/modules/chats/components/ChatSidebarItem.tsx
// FULL + FINAL — Tier 3
// Bright CRM sidebar items

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
      {/* LEFT — Conversation info */}
      <div className="flex flex-col gap-0.5 overflow-hidden">
        <span className="truncate text-sm font-medium text-slate-900">
          {conversation.id.slice(0, 8)}
        </span>

        <span className="text-[11px] text-slate-500">
          {time}
        </span>
      </div>

      {/* RIGHT — Channel + unread */}
      <div className="flex flex-col items-end gap-1">
        {channelBadge}

        {unreadCount > 0 && (
          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-medium text-white">
            {unreadCount}
          </span>
        )}
      </div>
    </button>
  );
}
