// src/modules/chats/components/ChatSidebarItem.tsx

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
   * CHANNEL BADGE — Light Joyz-style pills
   * ------------------------------------------------------- */
  const channelBadge = (() => {
    if (conversation.channel === "whatsapp") {
      return (
        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
          WhatsApp
        </span>
      );
    }
    if (conversation.channel === "web") {
      return (
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          Web
        </span>
      );
    }
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
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
   * MAIN UI
   * ------------------------------------------------------- */
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full rounded-xl border px-4 py-3 text-left transition-all
        shadow-sm
        flex flex-col gap-1

        ${isActive
          ? // ACTIVE — Purple/Accent outline + subtle highlight
            "border-accent bg-accent/10 shadow-md"
          : // INACTIVE — Soft white card
            "border-slate-200 bg-white hover:border-accent/40 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/40 dark:hover:bg-slate-800"
        }
      `}
    >
      <div className="flex items-center justify-between">
        {/* LEFT: ID + Last message time */}
        <div className="flex flex-col">
          <span
            className={`text-sm font-semibold ${
              isActive
                ? "text-accent dark:text-accent"
                : "text-slate-700 dark:text-slate-200"
            }`}
          >
            {conversation.id.slice(0, 8)}
          </span>

          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {time}
          </span>
        </div>

        {/* RIGHT: Channel + unread */}
        <div className="flex flex-col items-end gap-1">
          {channelBadge}

          {unreadCount > 0 && (
            <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
              {unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
