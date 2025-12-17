// src/modules/chats/components/ChatMessageBubble.tsx
// FULL + FINAL — Tier 3
// Joyz-style bright CRM bubbles
// Phase 7A–7C UI clarity

import type { Message } from "../../../types/database";

/* -------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------- */
function getSenderLabel(message: Message) {
  if (message.sender === "bot") return "AI";
  if (message.sender === "user") return "Agent";
  if (message.sender === "customer") return "Customer";
  return "System";
}

function getSenderBadgeClass(message: Message) {
  if (message.sender === "bot")
    return "bg-blue-100 text-blue-700";

  if (message.sender === "customer")
    return "bg-green-100 text-green-700";

  if (message.sender === "user")
    return "bg-purple-100 text-purple-700";

  return "bg-slate-200 text-slate-700";
}

/* -------------------------------------------------------
 * COMPONENT
 * ------------------------------------------------------- */
export function ChatMessageBubble({ message }: { message: Message }) {
  const isBot = message.sender === "bot";
  const isUser = message.sender === "user";
  const isCustomer = message.sender === "customer";

  const isInbound = isCustomer;

  /* -------------------------------------------------------
   * BUBBLE COLORS — Bright CRM
   * ------------------------------------------------------- */
  const bubbleClasses = (() => {
    if (isBot)
      return "bg-blue-50 text-blue-900";

    if (isCustomer && message.channel === "whatsapp")
      return "bg-green-50 text-green-900";

    if (isUser)
      return "bg-purple-50 text-purple-900";

    return "bg-slate-100 text-slate-900";
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
          className="mt-2 max-w-xs rounded-lg border border-slate-200"
        />
      );

    if (message.message_type === "document")
      return (
        <a
          href={message.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-sm text-blue-700 underline"
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
      }`}
    >
      {/* Sender badge */}
      <div
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getSenderBadgeClass(
          message,
        )}`}
      >
        {getSenderLabel(message)}
        {isBot && <span>🤖</span>}
      </div>

      {/* Message bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${bubbleClasses}`}
      >
        {message.text && <span>{message.text}</span>}
        {renderMedia()}
      </div>

      {/* Timestamp */}
      <span
        className={`text-[10px] text-slate-500 ${
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
