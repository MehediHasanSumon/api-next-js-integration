import { formatThreadRelativeTime, type ThreadItem } from "@/lib/chat-threads";
import type {
  Attachment,
  AttachmentPayload,
  Conversation,
  ConversationShowResponse,
  Message,
  ReactionAggregate,
} from "@/types/chat";

export type DraftAttachmentStatus = "uploading" | "ready" | "error";

export interface DraftAttachmentItem {
  id: string;
  file: File;
  previewUrl: string | null;
  status: DraftAttachmentStatus;
  progress: number;
  error: string | null;
  payload: AttachmentPayload | null;
}

export interface ChatMessageSentEvent {
  conversation_id: number | string;
  message: Message;
  sent_at?: string;
}

export interface ChatTypingEvent {
  conversation_id: number | string;
  user_id: number;
  is_typing: boolean;
}

export interface ChatReadEvent {
  conversation_id: number | string;
  user_id: number;
  last_read_message_id: number;
  read_at: string;
}

export interface ChatRequestUpdatedEvent {
  conversation_id: number | string;
  acted_by_user_id: number;
  action: "accept" | "decline";
}

export interface ChatUserPresenceUpdatedEvent {
  user_id: number;
  is_online: boolean;
  last_seen_at: string | null;
  sent_at: string;
}

export interface ChatMessageReactionUpdatedEvent {
  conversation_id: number | string;
  message_id: number | string;
  emoji: string;
  action: "added" | "removed";
  user_id: number;
  reactions_total: number;
  reaction_aggregates: ReactionAggregate[];
  sent_at?: string;
}

export interface ChatMessageEditedEvent {
  conversation_id: number | string;
  message_id: number | string;
  body: string;
  edited_at: string;
  editor_user_id: number;
}

export interface ChatMessageRemovedEvent {
  conversation_id: number | string;
  message_id: number | string;
  mode: "for_you" | "everywhere";
  actor_user_id: number;
  removed_at: string;
  message?: Message | null;
}

export type EchoConnectionStatus = "connected" | "disconnected" | "connecting" | "reconnecting" | "failed";

export interface ApiValidationErrorPayload {
  message?: string;
  errors?: Record<string, string[]>;
}

export const TYPING_IDLE_TIMEOUT_MS = 1500;
export const TYPING_TRUE_THROTTLE_MS = 800;
export const REMOVE_EVERYWHERE_WINDOW_MINUTES = 15;
export const MESSAGE_PAGE_LIMIT = 15;
export const LOAD_OLDER_THRESHOLD_PX = 120;
export const REACTION_CHOICES = ["👍", "❤️", "😂", "🔥", "😮", "😢"] as const;
export const MAX_RECORDING_SECONDS = 120;
export const MUTE_PRESETS = [
  { id: "15m", label: "For 15 minutes", durationMs: 15 * 60 * 1000 },
  { id: "1h", label: "For 1 Hour", durationMs: 60 * 60 * 1000 },
  { id: "8h", label: "For 8 Hours", durationMs: 8 * 60 * 60 * 1000 },
  { id: "24h", label: "For 24 Hours", durationMs: 24 * 60 * 60 * 1000 },
  { id: "forever", label: "Until I turn it back on", durationMs: 10 * 365 * 24 * 60 * 60 * 1000 },
] as const;

export const clampNumber = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

export const getMessageDisplayText = (message: Message): string => {
  const trimmedBody = message.body?.trim();
  if (trimmedBody) {
    return trimmedBody;
  }

  const callHistoryEvent =
    message.metadata && typeof message.metadata === "object" ? message.metadata.call_history_event : undefined;

  if (message.message_type === "system" && typeof callHistoryEvent === "string") {
    return "Call update";
  }

  if (message.attachments && message.attachments.length > 0) {
    return "Sent attachment";
  }

  return `[${message.message_type}]`;
};

export const getMessagePreviewText = (message: Message): string => {
  return getMessageDisplayText(message);
};

export const getReplyPreviewText = (reply: Message["reply_to"]): string => {
  if (!reply) {
    return "";
  }

  return reply.body?.trim() || `[${reply.message_type}]`;
};

export const toNumericId = (value: string | number): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getReadMessageId = (
  participantLastReadMessageId: Message["id"] | null | undefined,
  readEvent: ChatReadEvent | null,
  participantUserId: number | null | undefined
): number | null => {
  const participantReadId = participantLastReadMessageId === null || participantLastReadMessageId === undefined
    ? null
    : toNumericId(participantLastReadMessageId);
  const realtimeReadId =
    readEvent && participantUserId !== null && participantUserId !== undefined && readEvent.user_id === participantUserId
      ? toNumericId(readEvent.last_read_message_id)
      : null;

  if (participantReadId === null) {
    return realtimeReadId;
  }

  if (realtimeReadId === null) {
    return participantReadId;
  }

  return Math.max(participantReadId, realtimeReadId);
};

export const hasRemovedForEveryoneFlag = (message: Message): boolean => {
  if (message.deletion_state?.is_removed_for_everyone) {
    return true;
  }

  if (!message.metadata) {
    return false;
  }

  return message.metadata.removed_for_everyone === true || message.metadata.removed_for_everyone === 1;
};

export const sortMessagesAscending = (list: Message[]): Message[] => {
  return [...list].sort((a, b) => {
    const aId = toNumericId(a.id);
    const bId = toNumericId(b.id);

    if (aId !== null && bId !== null) {
      return aId - bId;
    }

    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();

    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
      return aTime - bTime;
    }

    return String(a.id).localeCompare(String(b.id));
  });
};

export const patchMessageById = (
  list: Message[],
  targetMessageId: string,
  updater: (message: Message) => Message
): Message[] => {
  let changed = false;
  const next = list.map((item) => {
    if (String(item.id) !== targetMessageId) {
      return item;
    }

    changed = true;
    return updater(item);
  });

  if (!changed) {
    return list;
  }

  return sortMessagesAscending(next);
};

export const applyOptimisticReactionMutation = (
  message: Message,
  emoji: string
): { nextMessage: Message; action: "added" | "removed" } => {
  const current = Array.isArray(message.reaction_aggregates) ? message.reaction_aggregates : [];
  const normalizedEmoji = emoji.trim();
  const existing = current.find((item) => item.emoji === normalizedEmoji);

  let action: "added" | "removed" = "added";
  let nextAggregates: ReactionAggregate[] = [];

  if (existing?.reacted_by_me) {
    action = "removed";
    nextAggregates = current
      .map((item) => {
        if (item.emoji !== normalizedEmoji) {
          return item;
        }

        const nextCount = Math.max(0, item.count - 1);
        if (nextCount === 0) {
          return null;
        }

        return {
          ...item,
          count: nextCount,
          reacted_by_me: false,
        };
      })
      .filter((item): item is ReactionAggregate => item !== null);
  } else {
    nextAggregates = current.map((item) => ({ ...item }));
    const index = nextAggregates.findIndex((item) => item.emoji === normalizedEmoji);

    if (index === -1) {
      nextAggregates.push({
        emoji: normalizedEmoji,
        count: 1,
        reacted_by_me: true,
      });
    } else {
      nextAggregates[index] = {
        ...nextAggregates[index],
        count: nextAggregates[index].count + 1,
        reacted_by_me: true,
      };
    }
  }

  nextAggregates.sort((a, b) => a.emoji.localeCompare(b.emoji));
  const nextTotal = nextAggregates.reduce((sum, item) => sum + item.count, 0);

  return {
    action,
    nextMessage: {
      ...message,
      reaction_aggregates: nextAggregates,
      reactions_total: nextTotal,
    },
  };
};

export const buildTombstoneMessage = (message: Message, actorUserId: number): Message => {
  const previousMetadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};

  return {
    ...message,
    message_type: "system",
    body: "This message was removed.",
    attachments: [],
    metadata: {
      ...previousMetadata,
      removed_for_everyone: true,
      removed_for_everyone_by: actorUserId,
      removed_for_everyone_at: new Date().toISOString(),
      tombstone_text: "This message was removed.",
    },
    deletion_state: {
      is_removed_for_everyone: true,
      removed_for_everyone_by: actorUserId,
      removed_for_everyone_at: new Date().toISOString(),
      tombstone_text: "This message was removed.",
      original_message_type: message.message_type,
    },
    reaction_aggregates: [],
    reactions_total: 0,
  };
};

export const formatFileSize = (size: number): string => {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const resolveAttachmentUrl = (attachment: Attachment | AttachmentPayload): string | null => {
  const metadata = attachment.metadata;
  const localPreviewUrl =
    metadata && typeof metadata === "object" && typeof metadata.local_preview_url === "string"
      ? metadata.local_preview_url
      : null;

  if (localPreviewUrl) {
    return localPreviewUrl;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return null;
  }

  const attachmentId = "id" in attachment ? attachment.id : null;

  if (attachmentId === null || attachmentId === undefined || attachmentId === "") {
    return null;
  }

  return `${apiUrl.replace(/\/$/, "")}/chat/attachments/${attachmentId}`;
};

export const resolveAvatarUrl = (avatarPath: string | null): string | null => {
  if (!avatarPath) {
    return null;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return null;
  }

  const baseUrl = apiUrl.replace(/\/api\/?$/, "");
  const normalizedPath = avatarPath.replace(/^public\//, "").replace(/^\/+/, "");

  return `${baseUrl}/storage/${normalizedPath}`;
};

export const mapAttachmentPayloadToAttachment = (
  payload: AttachmentPayload,
  messageId: string,
  fallbackUserId: number | null
): Attachment => {
  const createdAt = new Date().toISOString();

  return {
    id: `temp-${messageId}-${payload.storage_path}`,
    message_id: messageId,
    uploader_id: fallbackUserId,
    attachment_type: payload.attachment_type,
    storage_disk: payload.storage_disk ?? "private",
    storage_path: payload.storage_path,
    original_name: payload.original_name ?? null,
    mime_type: payload.mime_type,
    extension: payload.extension ?? null,
    size_bytes: payload.size_bytes,
    width: payload.width ?? null,
    height: payload.height ?? null,
    duration_ms: payload.duration_ms ?? null,
    checksum_sha256: payload.checksum_sha256 ?? null,
    metadata: payload.metadata ?? null,
    created_at: createdAt,
    updated_at: createdAt,
  };
};

export const formatRelativeTime = (rawDate: string | null): string => {
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

export const formatClockTime = (rawDate: string): string => {
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const isFutureIsoDate = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
};

export const buildMuteUntilIso = (durationMs: number): string => {
  return new Date(Date.now() + durationMs).toISOString();
};

export const formatMuteUntil = (value: string | null): string => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const mapConversationDetailToThread = (
  conversation: Conversation,
  participant: ConversationShowResponse["participant"] | null,
  currentUserId: number | null
): ThreadItem => {
  const participants = conversation.participants ?? [];
  const counterpart =
    conversation.type === "direct" && currentUserId !== null
      ? participants.find((item) => item.user && Number(item.user_id) !== Number(currentUserId))?.user ?? null
      : null;
  const counterpartName = counterpart?.name?.trim();
  const counterpartEmail = counterpart?.email;

  return {
    id: String(conversation.id),
    name: conversation.title?.trim() || counterpartName || `Conversation #${conversation.id}`,
    handle: counterpartEmail ? `@${counterpartEmail.split("@")[0]}` : `#${conversation.id}`,
    avatarPath: conversation.avatar_path,
    lastMessage:
      conversation.last_message?.body?.trim() ||
      (conversation.last_message ? `[${conversation.last_message.message_type}]` : "No messages yet"),
    lastTime: formatThreadRelativeTime(conversation.last_message?.created_at ?? conversation.last_message_at),
    unread: participant?.unread_count ?? 0,
    participantState: participant?.participant_state ?? "accepted",
    archivedAt: participant?.archived_at ?? null,
    mutedUntil: participant?.muted_until ?? null,
    isBlocked: false,
    type: conversation.type ?? null,
    counterpartId: null,
  };
};

export const isSameMessageIdentity = (left: Message, right: Message): boolean => {
  if (String(left.id) === String(right.id)) {
    return true;
  }

  if (left.client_uid && right.client_uid) {
    return left.client_uid === right.client_uid;
  }

  return false;
};

export const upsertMessageByIdentity = (list: Message[], message: Message): Message[] => {
  const index = list.findIndex((item) => isSameMessageIdentity(item, message));

  if (index === -1) {
    return sortMessagesAscending([...list, message]);
  }

  const next = [...list];
  next[index] = message;
  return sortMessagesAscending(next);
};

export const getMessageIdAsNumber = (message: Message | undefined): number | null => {
  if (!message) {
    return null;
  }

  const parsed = toNumericId(message.id);
  if (parsed === null) {
    return null;
  }

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

export const generateClientUid = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
