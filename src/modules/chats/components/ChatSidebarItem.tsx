import { PhoneCall, Globe, MessageSquare } from "lucide-react";
import { useChatStore } from "../../../state/useChatStore";
import type { Conversation, Contact } from "../../../types/database";

type Props = {
  conversation: Conversation;
  contact: Contact | null;
};

export function ChatSidebarItem({ conversation, contact }: Props) {
  const { activeConversationId, unread, setActiveConversation } =
    useChatStore();

  const isActive = activeConversationId === conversation.id;
  const unreadCount = unread[conversation.id] ?? 0;

  const getChannelIcon = () => {
    switch (conversation.channel) {
      case "whatsapp":
        return <PhoneCall size={14} className="text-green-400" />;
      case "web":
        return <Globe size={14} className="text-blue-400" />;
      default:
        return <MessageSquare size={14} className="text-purple-400" />;
    }
  };

  const name =
    contact?.name ??
    contact?.phone ??
    (conversation.channel === "whatsapp" ? "WhatsApp User" : "Unknown");

  return (
    <div
      onClick={() => setActiveConversation(conversation.id)}
      className={`flex items-center justify-between px-3 py-2 rounded-lg mb-1 cursor-pointer transition ${
        isActive ? "bg-slate-800" : "hover:bg-slate-900"
      }`}
    >
      <div className="flex items-center gap-2">
        {getChannelIcon()}
        <span className="text-sm text-white truncate">{name}</span>
      </div>

      {unreadCount > 0 && (
        <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
          {unreadCount}
        </span>
      )}
    </div>
  );
}
