import type { Message } from "../../../types/database";

export function ChatMessageBubble({ message }: { message: Message }) {
  const getBubbleStyle = () => {
    // AI / Internal bot responses
    if (message.sender === "bot") {
      return "bg-accent text-white";
    }

    // WhatsApp inbound messages
    if (message.channel === "whatsapp") {
      return "bg-green-900/40 text-green-200";
    }

    // Web or internal user messages
    return "bg-slate-800 text-white";
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Sender Label */}
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {message.sender}
      </div>

      {/* Bubble */}
      <div
        className={`w-fit max-w-xl rounded-2xl px-4 py-2 text-sm ${getBubbleStyle()}`}
      >
        {message.text}

        {/* Media */}
        {message.media_url && (
          <img
            src={message.media_url}
            alt="attachment"
            className="mt-2 rounded-lg max-w-xs border border-white/10"
          />
        )}
      </div>

      {/* Timestamp */}
      <span className="text-[10px] text-slate-500">
        {new Date(message.created_at).toLocaleString()}
      </span>
    </div>
  );
}
