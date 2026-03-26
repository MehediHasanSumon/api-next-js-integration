import type { ConversationListItem, ParticipantState } from "@/types/chat";

export interface ThreadItem {
  id: string;
  name: string;
  handle: string;
  avatarPath: string | null;
  lastMessage: string;
  lastTime: string;
  unread: number;
  participantState: ParticipantState;
  archivedAt: string | null;
  type: string | null;
  counterpartId: number | null;
}

export const formatThreadRelativeTime = (rawDate: string | null): string => {
  if (!rawDate) {
    return "-";
  }

  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < hour) {
    return `${Math.max(1, Math.floor(diffMs / minute))}m`;
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}h`;
  }

  if (diffMs < day * 2) {
    return "Yesterday";
  }

  return date.toLocaleDateString();
};

export const mapConversationToThread = (conversation: ConversationListItem): ThreadItem => {
  const counterpartName = conversation.counterpart?.name?.trim();
  const counterpartEmail = conversation.counterpart?.email;
  const name = conversation.title?.trim() || counterpartName || conversation.last_message?.sender?.name || `Conversation #${conversation.conversation_id}`;
  const handle = counterpartEmail ? `@${counterpartEmail.split("@")[0]}` : `#${conversation.conversation_id}`;
  const lastMessage =
    conversation.last_message?.body?.trim() ||
    (conversation.last_message ? `[${conversation.last_message.message_type}]` : "No messages yet");
  const lastActivity = conversation.last_message?.created_at ?? conversation.last_message_at;

  return {
    id: String(conversation.conversation_id),
    name,
    handle,
    avatarPath: conversation.avatar_path,
    lastMessage,
    lastTime: formatThreadRelativeTime(lastActivity),
    unread: conversation.unread_count,
    participantState: conversation.participant_state,
    archivedAt: conversation.archived_at,
    type: conversation.type,
    counterpartId: conversation.counterpart?.id ?? null,
  };
};
