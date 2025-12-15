// src/modules/chats/components/ChatMessageBubble.tsx

import type { Message } from "../../../types/database";

export function ChatMessageBubble({ message }: { message: Message }) {
  const isBot = message.sender === "bot";
  const isUser = message.sender === "user";
  const isCustomer = message.sender === "customer";

  const isInbound = isCustomer;

  /* -------------------------------------------------------
   * BUBBLE COLORS — Joyz-style (soft, clean)
   * ------------------------------------------------------- */
  const bubbleClasses = (() => {
    if (isBot)
      return "bg-blue-50 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100";

    if (isCustomer && message.channel === "whatsapp")
      return "bg-green-50 text-green-900 dark:bg-green-900/40 dark:text-green-100";

    if (isUser)
      return "bg-purple-50 text-purple-900 dark:bg-purple-900/40 dark:text-purple-100";

    return "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100";
  })();

  /* -------------------------------------------------------
   * MEDIA RENDERING
   * ------------------------------------------------------- */
  const renderMedia = () => {
    if (!message.media_url) return null;

    if (message.message_type === "video")
      return (
        <video
          src={message.media_url}
          controls
          className="mt-2 max-w-xs rounded-lg"
        />
      );

    if (["audio", "voice"].includes(message.message_type))
      return (
        <audio
          src={message.media_url}
          controls
          className="mt-2 w-full max-w-xs"
        />
      );

    if (message.message_type === "sticker")
      return (
        <img
          src={message.media_url}
          alt="sticker"
          className="mt-2 h-32 w-32 rounded-xl"
        />
      );

    if (message.message_type === "image")
      return (
        <img
          src={message.media_url}
          alt="image"
          className="mt-2 max-w-xs rounded-lg border border-slate-200 dark:border-white/10"
        />
      );

    if (message.message_type === "document")
      return (
        <a
          href={message.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-sm text-blue-700 underline dark:text-blue-300"
        >
          📄 View document
        </a>
      );

    return null;
  };

  /* -------------------------------------------------------
   * UI
   * ------------------------------------------------------- */
  return (
    <div
      className={`flex w-full flex-col gap-1 ${
        isInbound ? "items-start" : "items-end"
      } animate-messageAppear`}
    >
      {/* Sender */}
      <div className="text-[10px] uppercase tracking-wide text-slate-600 dark:text-slate-400">
        {message.sender}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${bubbleClasses}`}
      >
        {message.text && <span>{message.text}</span>}
        {renderMedia()}
      </div>

      {/* Timestamp */}
      <span
        className={`text-[10px] text-slate-600 dark:text-slate-400 ${
          isInbound ? "self-start" : "self-end"
        }`}
      >
        {new Date(message.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
}