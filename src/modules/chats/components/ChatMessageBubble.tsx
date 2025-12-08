// src/modules/chats/components/ChatMessageBubble.tsx

import type { Message } from "../../../types/database";

export function ChatMessageBubble({ message }: { message: Message }) {
  const isBot = message.sender === "bot";
  const isUser = message.sender === "user";
  const isCustomer = message.sender === "customer";

  const isInbound = isCustomer;

  /* BUBBLE COLORS */
  const bubbleClasses = (() => {
    if (isBot)
      return "bg-[#e8efff] text-blue-800 dark:bg-blue-900/40 dark:text-blue-100";
    if (isCustomer && message.channel === "whatsapp")
      return "bg-[#e6f4ea] text-green-800 dark:bg-green-900/40 dark:text-green-100";
    if (isUser)
      return "bg-[#ece5fb] text-purple-800 dark:bg-purple-900/40 dark:text-purple-100";
    return "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100";
  })();

  /* MEDIA RENDERING */
  const renderMedia = () => {
    if (!message.media_url) return null;

    if (message.message_type === "video")
      return (
        <video
          src={message.media_url}
          controls
          className="mt-2 max-w-xs rounded-lg shadow-sm"
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
          className="mt-2 max-w-xs rounded-lg border border-slate-200 shadow-sm dark:border-white/10"
        />
      );

    if (message.message_type === "document")
      return (
        <a
          href={message.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-sm underline text-blue-600 dark:text-blue-300"
        >
          📄 View document
        </a>
      );

    return null;
  };

  return (
    <div
      className={`flex w-full flex-col gap-1 ${
        isInbound ? "items-start" : "items-end"
      } animate-messageAppear`}
    >
      <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {message.sender}
      </div>

      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${bubbleClasses}`}
      >
        {message.text && <span>{message.text}</span>}
        {renderMedia()}
      </div>

      <span
        className={`text-[10px] text-slate-500 dark:text-slate-400 ${
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