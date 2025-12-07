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
  const channelBadge = (() => {
    if (conversation.channel === "whatsapp") {
      return (
        <span className="rounded-full bg-green-900/40 px-2 py-0.5 text-[10px] text-green-300">
          WhatsApp
        </span>
      );
    }
    if (conversation.channel === "web") {
      return (
        <span className="rounded-full bg-blue-900/40 px-2 py-0.5 text-[10px] text-blue-300">
          Web
        </span>
      );
    }
    return (
      <span className="rounded-full bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-300">
        Internal
      </span>
    );
  })();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition ${
        isActive
          ? "border-accent bg-accent/10"
          : "border-white/10 bg-slate-900/50 hover:border-accent/50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-slate-50">
            {conversation.id.slice(0, 8)}
          </span>

          <span className="text-[11px] text-slate-400">
            {conversation.last_message_at
              ? new Date(conversation.last_message_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "No messages yet"}
          </span>
        </div>

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

