import type { Message } from "../../../types/database";

export function ChatMessageBubble({ message }: { message: Message }) {
  const isBot = message.sender === "bot";
  const isUser = message.sender === "user";
  const isCustomer = message.sender === "customer";

  const isInbound = isCustomer; // left side
  const isOutbound = isBot || isUser; // right side

  const bubbleClasses = (() => {
    if (isBot)
      return "bg-accent text-white"; // AI
    if (isCustomer && message.channel === "whatsapp")
      return "bg-green-900/40 text-green-200"; // WhatsApp inbound
    if (isUser)
      return "bg-slate-700 text-white"; // Internal agent
    return "bg-slate-800 text-white"; // fallback
  })();

  return (
    <div
      className={`flex w-full flex-col gap-1 ${
        isInbound ? "items-start" : "items-end"
      }`}
    >
      {/* Sender label */}
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {message.sender}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-md ${bubbleClasses}`}
      >
        {message.text}

        {/* Media (WA images, docs) */}
        {message.media_url && (
          <img
            src={message.media_url}
            alt="attachment"
            className="mt-2 max-w-xs rounded-lg border border-white/10"
          />
        )}
      </div>

      {/* Timestamp */}
      <span className="text-[10px] text-slate-500">
        {new Date(message.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
}
