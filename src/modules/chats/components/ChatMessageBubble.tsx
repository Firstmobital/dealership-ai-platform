import type { Message } from "../../../types/database";

export function ChatMessageBubble({ message }: { message: Message }) {
  const isBot = message.sender === "bot";
  const isUser = message.sender === "user";
  const isCustomer = message.sender === "customer";

  const isInbound = isCustomer; // left side (WhatsApp User)
  const isOutbound = isBot || isUser; // right side (AI or Agent)

  const bubbleClasses = (() => {
    if (isBot) return "bg-accent text-white"; // AI messages
    if (isCustomer && message.channel === "whatsapp")
      return "bg-green-900/40 text-green-200"; // WhatsApp inbound
    if (isUser) return "bg-slate-700 text-white"; // Internal agent
    return "bg-slate-800 text-white"; // fallback
  })();

  /* ----------------------------------------- */
  /* MEDIA RENDERERS                           */
  /* ----------------------------------------- */

  const renderMedia = () => {
    if (!message.media_url) return null;

    // VIDEO
    if (message.message_type === "video") {
      return (
        <video
          src={message.media_url}
          controls
          className="mt-2 max-w-xs rounded-lg shadow-md"
        />
      );
    }

    // AUDIO / VOICE
    if (message.message_type === "audio" || message.message_type === "voice") {
      return (
        <audio
          src={message.media_url}
          controls
          className="mt-2 w-full max-w-xs"
        />
      );
    }

    // STICKER
    if (message.message_type === "sticker") {
      return (
        <img
          src={message.media_url}
          alt="sticker"
          className="mt-2 h-32 w-32 rounded-xl"
        />
      );
    }

    // IMAGE (default)
    if (message.message_type === "image") {
      return (
        <img
          src={message.media_url}
          alt="image"
          className="mt-2 max-w-xs rounded-lg border border-white/10 shadow"
        />
      );
    }

    // DOCUMENT / OTHER FILE
    if (message.message_type === "document") {
      return (
        <a
          href={message.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-sm underline text-blue-300"
        >
          📄 View Document
        </a>
      );
    }

    return null;
  };

  /* ----------------------------------------- */
  /* MAIN RENDER                               */
  /* ----------------------------------------- */

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

      {/* Message bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-md ${bubbleClasses}`}
      >
        {/* Text Message */}
        {message.text && <span>{message.text}</span>}

        {/* MEDIA (Images, Videos, Audio, Docs) */}
        {renderMedia()}
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
