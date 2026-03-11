"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { AxiosError } from "axios";
import { Forward, PencilLine, Search, SmilePlus, Trash2, X } from "lucide-react";
import ProtectedShell from "@/components/ProtectedShell";
import Button from "@/components/Button";
import MessengerLayout from "@/components/messenger/MessengerLayout";
import MessengerSidebar from "@/components/messenger/MessengerSidebar";
import MessengerHeader from "@/components/messenger/MessengerHeader";
import MessageBubble from "@/components/messenger/MessageBubble";
import MessengerInfoPanel from "@/components/messenger/MessengerInfoPanel";
import {
  archiveConversation,
  forwardMessage,
  listConversations,
  listMessages,
  markConversationRead,
  removeMessageForEverywhere,
  removeMessageForYou,
  removeMessageReaction,
  respondToConversationRequest,
  sendMessage,
  updateMessage,
  uploadChatAttachment,
  showConversation,
  toggleMessageReaction,
  updateTyping,
  unarchiveConversation,
} from "@/lib/chat-api";
import { getPresenceStatus, pingPresence } from "@/lib/presence-api";
import { formatLastSeen, getNowFromServerOffset, resolveServerClockOffsetMs } from "@/lib/presence-time";
import { formatThreadRelativeTime, type ThreadItem } from "@/lib/chat-threads";
import { getEcho } from "@/lib/echo";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchInboxThreads, patchThread } from "@/store/chatSlice";
import type {
  Attachment,
  Conversation,
  ConversationListItem,
  ConversationShowResponse,
  AttachmentPayload,
  Message,
  MessageRemovalMode,
  ReactionAggregate,
} from "@/types/chat";

type ThreadFilter = "all" | "unread" | "online";

type DraftAttachmentStatus = "uploading" | "ready" | "error";

interface DraftAttachmentItem {
  id: string;
  file: File;
  previewUrl: string | null;
  status: DraftAttachmentStatus;
  error: string | null;
  payload: AttachmentPayload | null;
}

interface ChatMessageSentEvent {
  conversation_id: number | string;
  message: Message;
  sent_at?: string;
}

interface ChatTypingEvent {
  conversation_id: number | string;
  user_id: number;
  is_typing: boolean;
}

interface ChatReadEvent {
  conversation_id: number | string;
  user_id: number;
  last_read_message_id: number;
  read_at: string;
}

interface ChatRequestUpdatedEvent {
  conversation_id: number | string;
  acted_by_user_id: number;
  action: "accept" | "decline";
}

interface ChatUserPresenceUpdatedEvent {
  user_id: number;
  is_online: boolean;
  last_seen_at: string | null;
  sent_at: string;
}

interface ChatMessageReactionUpdatedEvent {
  conversation_id: number | string;
  message_id: number | string;
  emoji: string;
  action: "added" | "removed";
  user_id: number;
  reactions_total: number;
  reaction_aggregates: ReactionAggregate[];
  sent_at?: string;
}

interface ChatMessageEditedEvent {
  conversation_id: number | string;
  message_id: number | string;
  body: string;
  edited_at: string;
  editor_user_id: number;
}

interface ChatMessageRemovedEvent {
  conversation_id: number | string;
  message_id: number | string;
  mode: "for_you" | "everywhere";
  actor_user_id: number;
  removed_at: string;
  message?: Message | null;
}

type EchoConnectionStatus = "connected" | "disconnected" | "connecting" | "reconnecting" | "failed";

interface ApiValidationErrorPayload {
  message?: string;
  errors?: Record<string, string[]>;
}

const TYPING_IDLE_TIMEOUT_MS = 1500;
const TYPING_TRUE_THROTTLE_MS = 800;
const REMOVE_EVERYWHERE_WINDOW_MINUTES = 15;
const MESSAGE_PAGE_LIMIT = 15;
const LOAD_OLDER_THRESHOLD_PX = 120;
const REACTION_CHOICES = ["👍", "❤️", "😂", "🔥", "😮", "😢"] as const;

const clampNumber = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

const getMessagePreviewText = (message: Message): string => {
  return message.body?.trim() || `[${message.message_type}]`;
};

const hasRemovedForEveryoneFlag = (message: Message): boolean => {
  if (message.deletion_state?.is_removed_for_everyone) {
    return true;
  }

  if (!message.metadata) {
    return false;
  }

  return message.metadata.removed_for_everyone === true || message.metadata.removed_for_everyone === 1;
};

const patchMessageById = (
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

const applyOptimisticReactionMutation = (
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

const buildTombstoneMessage = (message: Message, actorUserId: number): Message => {
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
const formatFileSize = (size: number): string => {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const resolveAttachmentUrl = (attachment: Attachment | AttachmentPayload): string | null => {
  if (!attachment.storage_path) {
    return null;
  }

  if (attachment.storage_disk && attachment.storage_disk !== "public") {
    return null;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return null;
  }

  const baseUrl = apiUrl.replace(/\/api\/?$/, "");
  const normalizedPath = attachment.storage_path.replace(/^public\//, "").replace(/^\/+/, "");

  return `${baseUrl}/storage/${normalizedPath}`;
};

const resolveAvatarUrl = (avatarPath: string | null): string | null => {
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

const mapAttachmentPayloadToAttachment = (
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
    storage_disk: payload.storage_disk ?? "public",
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

const formatRelativeTime = (rawDate: string | null): string => {
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

const formatClockTime = (rawDate: string): string => {
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const mapConversationDetailToThread = (
  conversation: Conversation,
  participant: ConversationShowResponse["participant"] | null
): ThreadItem => {
  return {
    id: String(conversation.id),
    name: conversation.title?.trim() || `Conversation #${conversation.id}`,
    handle: `#${conversation.id}`,
    lastMessage:
      conversation.last_message?.body?.trim() ||
      (conversation.last_message ? `[${conversation.last_message.message_type}]` : "No messages yet"),
    lastTime: formatThreadRelativeTime(conversation.last_message?.created_at ?? conversation.last_message_at),
    unread: participant?.unread_count ?? 0,
  };
};

const toNumericId = (value: string | number): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const sortMessagesAscending = (list: Message[]): Message[] => {
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

const isSameMessageIdentity = (left: Message, right: Message): boolean => {
  if (String(left.id) === String(right.id)) {
    return true;
  }

  if (left.client_uid && right.client_uid) {
    return left.client_uid === right.client_uid;
  }

  return false;
};

const upsertMessageByIdentity = (list: Message[], message: Message): Message[] => {
  const index = list.findIndex((item) => isSameMessageIdentity(item, message));

  if (index === -1) {
    return sortMessagesAscending([...list, message]);
  }

  const next = [...list];
  next[index] = message;
  return sortMessagesAscending(next);
};

const getMessageIdAsNumber = (message: Message | undefined): number | null => {
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

const generateClientUid = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function MessageThreadPage() {
  const params = useParams<{ threadId: string }>();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const threadId = params?.threadId || "";

  const currentUser = useAppSelector((state) => state.auth.user);
  const currentUserId = currentUser?.id ?? null;
  const threads = useAppSelector((state) => state.chat.threads);

  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const [draft, setDraft] = useState("");
  const [showInfoPanel, setShowInfoPanel] = useState(true);

  const [conversationData, setConversationData] = useState<ConversationShowResponse | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<number[]>([]);
  const [presenceByUserId, setPresenceByUserId] = useState<Record<number, { isOnline: boolean; lastSeenAt: string | null }>>({});
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState<number | null>(null);
  const [lastReadEvent, setLastReadEvent] = useState<ChatReadEvent | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [requestActionError, setRequestActionError] = useState<string | null>(null);
  const [requestActionLoading, setRequestActionLoading] = useState<"accept" | "decline" | null>(null);
  const [archiveActionError, setArchiveActionError] = useState<string | null>(null);
  const [archiveActionLoading, setArchiveActionLoading] = useState(false);
  const [echoConnectionStatus, setEchoConnectionStatus] = useState<EchoConnectionStatus>("connecting");
  const [messageActionError, setMessageActionError] = useState<string | null>(null);
  const [reactionModalMessage, setReactionModalMessage] = useState<Message | null>(null);
  const [reactionPopoverPosition, setReactionPopoverPosition] = useState<{ top: number; left: number } | null>(null);
  const [reactionMutationLoadingKey, setReactionMutationLoadingKey] = useState<string | null>(null);
  const [forwardModalMessage, setForwardModalMessage] = useState<Message | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardSendingId, setForwardSendingId] = useState<string | null>(null);
  const [forwardModalError, setForwardModalError] = useState<string | null>(null);
  const [forwardModalLoading, setForwardModalLoading] = useState(false);
  const [forwardTargets, setForwardTargets] = useState<ConversationListItem[]>([]);
  const [forwardTargetsLoading, setForwardTargetsLoading] = useState(false);
  const [imageViewer, setImageViewer] = useState<{ url: string; name: string } | null>(null);
  const [removeModalMessage, setRemoveModalMessage] = useState<Message | null>(null);
  const [removeModalMode, setRemoveModalMode] = useState<MessageRemovalMode>("for_you");
  const [removeModalLoading, setRemoveModalLoading] = useState(false);
  const [removeModalError, setRemoveModalError] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingLoading, setEditingLoading] = useState(false);
  const [editingError, setEditingError] = useState<string | null>(null);
  const [draftAttachments, setDraftAttachments] = useState<DraftAttachmentItem[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);

  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const hasInitialScrollRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const lastThreadIdRef = useRef<string>("");
  const markReadInFlightRef = useRef(false);
  const lastMarkedMessageIdRef = useRef<number | null>(null);
  const latestMessagesRef = useRef<Message[]>([]);
  const typingTimeoutsRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const localTypingStateRef = useRef(false);
  const lastSentTypingStateRef = useRef<boolean | null>(null);
  const lastTrueTypingSentAtRef = useRef(0);
  const typingTrueThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingForbiddenRef = useRef(false);
  const echoReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const echoReconnectAttemptRef = useRef(0);
  const processedRealtimeEventKeysRef = useRef<string[]>([]);
  const processedRealtimeEventLookupRef = useRef<Set<string>>(new Set());
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const previousDraftRef = useRef<string>("");
  const messageBubbleRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    lastMarkedMessageIdRef.current = null;
    markReadInFlightRef.current = false;
    setTypingUserIds([]);
    setPresenceByUserId({});
    setServerClockOffsetMs(null);
    setLastReadEvent(null);
    localTypingStateRef.current = false;
    lastSentTypingStateRef.current = null;
    lastTrueTypingSentAtRef.current = 0;
    typingForbiddenRef.current = false;
    if (typingTrueThrottleTimerRef.current) {
      clearTimeout(typingTrueThrottleTimerRef.current);
      typingTrueThrottleTimerRef.current = null;
    }
    if (stopTypingTimerRef.current) {
      clearTimeout(stopTypingTimerRef.current);
      stopTypingTimerRef.current = null;
    }
    setRequestActionError(null);
    setRequestActionLoading(null);
    setArchiveActionError(null);
    setArchiveActionLoading(false);
    setEchoConnectionStatus("connecting");
    setMessageActionError(null);
    setReactionModalMessage(null);
    setReactionMutationLoadingKey(null);
    setForwardModalMessage(null);
    setForwardSearch("");
    setForwardSendingId(null);
    setForwardModalError(null);
    setForwardModalLoading(false);
    setForwardTargets([]);
    setForwardTargetsLoading(false);
    setRemoveModalMessage(null);
    setRemoveModalMode("for_you");
    setRemoveModalError(null);
    setRemoveModalLoading(false);
    setEditingMessageId(null);
    setEditingError(null);
    setEditingLoading(false);
    previousDraftRef.current = "";
    draftAttachments.forEach((item) => {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
    setDraftAttachments([]);
    setAttachmentError(null);
    setIsLoadingOlder(false);
    setHasMoreOlder(true);
    processedRealtimeEventLookupRef.current.clear();
    processedRealtimeEventKeysRef.current = [];
    hasInitialScrollRef.current = false;
    isNearBottomRef.current = true;
  }, [threadId]);

  useLayoutEffect(() => {
    if (threadId === lastThreadIdRef.current) {
      return;
    }

    lastThreadIdRef.current = threadId;
    hasInitialScrollRef.current = false;
    isNearBottomRef.current = true;
  }, [threadId]);

  useEffect(() => {
    if (!threadId) {
      return;
    }

    void pingPresence()
      .then((response) => {
        const offset = resolveServerClockOffsetMs(response.server_time);
        if (offset !== null) {
          setServerClockOffsetMs(offset);
        }
      })
      .catch(() => undefined);
  }, [threadId]);

  const activeThread = useMemo(() => {
    const byList = threads.find((thread) => thread.id === threadId);

    if (byList) {
      return byList;
    }

    if (conversationData?.conversation) {
      return mapConversationDetailToThread(conversationData.conversation, conversationData.participant);
    }

    return null;
  }, [conversationData, threadId, threads]);

  const conversation = conversationData?.conversation ?? null;
  const participant = conversationData?.participant ?? null;
  const canEmitTyping = participant?.participant_state === "accepted" && participant.archived_at === null;
  const hasAttachmentUploadsInProgress = draftAttachments.some((item) => item.status === "uploading");

  useEffect(() => {
    if (canEmitTyping) {
      typingForbiddenRef.current = false;
    }
  }, [canEmitTyping]);

  const counterpart = useMemo(() => {
    if (!conversation?.participants || currentUserId === null) {
      return null;
    }

    const other = conversation.participants.find((item) => item.user_id !== currentUserId && item.user);
    return other?.user ?? null;
  }, [conversation?.participants, currentUserId]);

  const otherParticipants = useMemo(() => {
    if (!conversation?.participants || currentUserId === null) {
      return [];
    }

    return conversation.participants
      .filter((item) => item.user && item.user_id !== currentUserId)
      .map((item) => ({
        id: item.user_id,
        name: item.user?.name ?? "User",
        email: item.user?.email ?? "",
        lastSeenAt: item.user?.last_seen_at ?? null,
      }));
  }, [conversation?.participants, currentUserId]);

  const typingUserNames = useMemo(() => {
    if (!conversation?.participants || typingUserIds.length === 0) {
      return [];
    }

    const typingSet = new Set(typingUserIds);

    return conversation.participants
      .filter((item) => item.user && item.user_id !== currentUserId && typingSet.has(item.user_id))
      .map((item) => {
        const name = item.user?.name?.trim();
        if (name) {
          return name;
        }

        const emailHandle = item.user?.email?.split("@")[0];
        if (emailHandle) {
          return emailHandle;
        }

        return "User";
      });
  }, [conversation?.participants, currentUserId, typingUserIds]);

  const typingIndicatorText = useMemo(() => {
    if (typingUserNames.length === 0) {
      return null;
    }

    if (typingUserNames.length === 1) {
      return `${typingUserNames[0]} is typing...`;
    }

    if (typingUserNames.length === 2) {
      return `${typingUserNames[0]} and ${typingUserNames[1]} are typing...`;
    }

    return `${typingUserNames[0]}, ${typingUserNames[1]} and ${typingUserNames.length - 2} others are typing...`;
  }, [typingUserNames]);

  const presenceSubtitle = useMemo(() => {
    if (typingIndicatorText) {
      return typingIndicatorText;
    }

    const nowForPresence = getNowFromServerOffset(serverClockOffsetMs);
    const onlineParticipantCount = otherParticipants.reduce((count, participantInfo) => {
      const participantPresence = presenceByUserId[participantInfo.id];
      const participantLastSeenAt = participantPresence?.lastSeenAt ?? participantInfo.lastSeenAt;
      const participantLastSeenText = formatLastSeen(participantLastSeenAt, nowForPresence);
      const isOnline = participantPresence?.isOnline || participantLastSeenText === "Online";
      return isOnline ? count + 1 : count;
    }, 0);

    if (onlineParticipantCount > 0) {
      if (otherParticipants.length > 1 && onlineParticipantCount > 1) {
        return `${onlineParticipantCount} online`;
      }
      return "Online";
    }

    const latestLastSeenAt = otherParticipants.reduce<string | null>((latest, participantInfo) => {
      const participantPresence = presenceByUserId[participantInfo.id];
      const candidate = participantPresence?.lastSeenAt ?? participantInfo.lastSeenAt;
      if (!candidate) {
        return latest;
      }

      if (!latest) {
        return candidate;
      }

      const candidateTs = new Date(candidate).getTime();
      const latestTs = new Date(latest).getTime();

      if (!Number.isFinite(candidateTs)) {
        return latest;
      }

      if (!Number.isFinite(latestTs) || candidateTs > latestTs) {
        return candidate;
      }

      return latest;
    }, null);

    const lastSeenText = formatLastSeen(latestLastSeenAt, nowForPresence);
    if (lastSeenText) {
      return lastSeenText;
    }

    return counterpart?.email ? `@${counterpart.email.split("@")[0]}` : activeThread?.handle ?? "-";
  }, [activeThread?.handle, counterpart?.email, otherParticipants, presenceByUserId, serverClockOffsetMs, typingIndicatorText]);

  const presenceSubtitleClassName =
    typingIndicatorText || presenceSubtitle.toLowerCase().includes("online") ? "text-emerald-600" : "text-slate-500";
  const isPresenceOnline = Boolean(typingIndicatorText) || presenceSubtitle.toLowerCase().includes("online");

  const unreadCount = useMemo(() => threads.reduce((sum, thread) => sum + thread.unread, 0), [threads]);
  const onlineCount = 0;

  const filteredThreads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return threads.filter((thread) => {
      const matchesQuery =
        query === "" ||
        thread.name.toLowerCase().includes(query) ||
        thread.lastMessage.toLowerCase().includes(query) ||
        thread.handle.toLowerCase().includes(query);

      if (!matchesQuery) {
        return false;
      }

      if (filter === "unread") {
        return thread.unread > 0;
      }

      if (filter === "online") {
        return false;
      }

      return true;
    });
  }, [filter, searchQuery, threads]);

  const filteredForwardTargets = useMemo(() => {
    const query = forwardSearch.trim().toLowerCase();
    if (query === "") {
      return forwardTargets;
    }

    return forwardTargets.filter((target) => {
      const label =
        target.title?.trim() ||
        target.counterpart?.name?.trim() ||
        target.counterpart?.email ||
        `Conversation #${target.conversation_id}`;
      const labelLower = label.toLowerCase();
      const emailLower = target.counterpart?.email?.toLowerCase() ?? "";
      const idMatch = String(target.conversation_id).includes(query);

      return labelLower.includes(query) || emailLower.includes(query) || idMatch;
    });
  }, [forwardSearch, forwardTargets]);

  const refreshThreads = useCallback(async () => {
    await dispatch(fetchInboxThreads());
  }, [dispatch]);

  const refreshConversation = useCallback(async (): Promise<ConversationShowResponse | null> => {
    if (!threadId) {
      return null;
    }

    const conversationResponse = await showConversation(threadId);
    setConversationData(conversationResponse);
    return conversationResponse;
  }, [threadId]);

  const refreshMessages = useCallback(async () => {
    if (!threadId) {
      return;
    }

    const messageResponse = await listMessages(threadId, { limit: MESSAGE_PAGE_LIMIT });
    setMessages(sortMessagesAscending(messageResponse.data));
    setHasMoreOlder(messageResponse.data.length >= MESSAGE_PAGE_LIMIT);
  }, [threadId]);

  const loadOlderMessages = useCallback(async () => {
    if (!threadId || isLoadingOlder || !hasMoreOlder) {
      return;
    }

    const oldestMessageId = getMessageIdAsNumber(messages[0]);
    if (!oldestMessageId) {
      return;
    }

    const viewport = messageViewportRef.current;
    const previousScrollHeight = viewport?.scrollHeight ?? 0;
    const previousScrollTop = viewport?.scrollTop ?? 0;

    setIsLoadingOlder(true);

    try {
      const response = await listMessages(threadId, {
        limit: MESSAGE_PAGE_LIMIT,
        before_id: oldestMessageId,
      });

      if (response.data.length === 0) {
        setHasMoreOlder(false);
        return;
      }

      setHasMoreOlder(response.data.length >= MESSAGE_PAGE_LIMIT);

      setMessages((previous) => {
        const existingIds = new Set(previous.map((item) => String(item.id)));
        const older = response.data.filter((item) => !existingIds.has(String(item.id)));
        return sortMessagesAscending([...older, ...previous]);
      });

      requestAnimationFrame(() => {
        if (!viewport) {
          return;
        }
        const newScrollHeight = viewport.scrollHeight;
        viewport.scrollTop = newScrollHeight - previousScrollHeight + previousScrollTop;
      });
    } finally {
      setIsLoadingOlder(false);
    }
  }, [hasMoreOlder, isLoadingOlder, messages, threadId]);

  const rememberRealtimeEvent = useCallback((rawKey: string): boolean => {
    if (!rawKey) {
      return true;
    }

    if (processedRealtimeEventLookupRef.current.has(rawKey)) {
      return false;
    }

    processedRealtimeEventLookupRef.current.add(rawKey);
    processedRealtimeEventKeysRef.current.push(rawKey);

    if (processedRealtimeEventKeysRef.current.length > 600) {
      const expired = processedRealtimeEventKeysRef.current.shift();
      if (expired) {
        processedRealtimeEventLookupRef.current.delete(expired);
      }
    }

    return true;
  }, []);

  const isCurrentUserAdmin = useMemo(() => {
    return (currentUser?.roles ?? []).includes("admin");
  }, [currentUser?.roles]);

  const canRemoveEverywhereByPolicy = useCallback(
    (message: Message): boolean => {
      if (!currentUserId || participant?.participant_state !== "accepted" || participant.archived_at !== null) {
        return false;
      }

      if (hasRemovedForEveryoneFlag(message)) {
        return false;
      }

      if (message.message_type === "system" && !isCurrentUserAdmin) {
        return false;
      }

      if (isCurrentUserAdmin) {
        return true;
      }

      if (Number(message.sender_id) !== currentUserId) {
        return false;
      }

      const createdAtMs = new Date(message.created_at).getTime();
      if (!Number.isFinite(createdAtMs)) {
        return false;
      }

      return Date.now() - createdAtMs <= REMOVE_EVERYWHERE_WINDOW_MINUTES * 60 * 1000;
    },
    [currentUserId, isCurrentUserAdmin, participant?.archived_at, participant?.participant_state]
  );

  const loadForwardTargets = useCallback(async () => {
    setForwardTargetsLoading(true);
    setForwardModalError(null);

    try {
      const response = await listConversations({ filter: "all", per_page: 100 });
      const acceptedTargets = response.data.filter((item) => item.participant_state === "accepted");
      setForwardTargets(acceptedTargets);
    } catch {
      setForwardModalError("Failed to load conversation list.");
      setForwardTargets([]);
    } finally {
      setForwardTargetsLoading(false);
    }
  }, []);

  const refreshPresenceSnapshotForUserIds = useCallback(async (ids: number[]) => {
    const targetUserIds = Array.from(new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));

    if (targetUserIds.length === 0) {
      return;
    }

    const response = await getPresenceStatus(targetUserIds);
    const offset = resolveServerClockOffsetMs(response.server_time);
    if (offset !== null) {
      setServerClockOffsetMs(offset);
    }

    setPresenceByUserId((previous) => {
      let changed = false;
      const next = { ...previous };

      response.data.forEach((item) => {
        const current = next[item.user_id];
        const candidate = {
          isOnline: item.is_online,
          lastSeenAt: item.last_seen_at,
        };

        if (!current || current.isOnline !== candidate.isOnline || current.lastSeenAt !== candidate.lastSeenAt) {
          next[item.user_id] = candidate;
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, []);

  const refreshPresenceSnapshot = useCallback(async () => {
    await refreshPresenceSnapshotForUserIds(otherParticipants.map((item) => item.id));
  }, [otherParticipants, refreshPresenceSnapshotForUserIds]);

  useEffect(() => {
    if (otherParticipants.length === 0) {
      return;
    }

    void refreshPresenceSnapshot().catch(() => undefined);
  }, [otherParticipants, refreshPresenceSnapshot, threadId]);

  const markThreadRead = useCallback(async (targetMessageId?: number) => {
    if (!threadId) {
      return;
    }

    if (participant?.participant_state !== "accepted") {
      return;
    }

    const latestMessageId = targetMessageId ?? getMessageIdAsNumber(latestMessagesRef.current[latestMessagesRef.current.length - 1]);

    if (!latestMessageId) {
      return;
    }

    if (lastMarkedMessageIdRef.current === latestMessageId || markReadInFlightRef.current) {
      return;
    }

    markReadInFlightRef.current = true;

    try {
      await markConversationRead(threadId, { last_read_message_id: latestMessageId });

      lastMarkedMessageIdRef.current = latestMessageId;

      setConversationData((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          participant: {
            ...previous.participant,
            unread_count: 0,
            last_read_message_id: latestMessageId,
            last_read_at: new Date().toISOString(),
          },
        };
      });
    } catch {
      // Mark-read is best-effort; keep UX responsive even if endpoint fails.
    } finally {
      markReadInFlightRef.current = false;
    }
  }, [participant?.participant_state, threadId]);

  useEffect(() => {
    if (!threadId) {
      return;
    }

    let isCancelled = false;

    const loadThreadData = async () => {
      setIsLoading(true);
      setPageError(null);

      try {
        const [conversationResponse] = await Promise.all([
          showConversation(threadId),
          refreshMessages(),
        ]);

        if (isCancelled) {
          return;
        }

        setConversationData(conversationResponse);
        const participantIds = conversationResponse.conversation.participants?.map((item) => Number(item.user_id)) ?? [];
        void refreshPresenceSnapshotForUserIds(participantIds).catch(() => undefined);
        await refreshThreads();
      } catch {
        if (!isCancelled) {
          setPageError("Failed to load this conversation.");
          setConversationData(null);
          setMessages([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadThreadData();

    return () => {
      isCancelled = true;
    };
  }, [refreshMessages, refreshPresenceSnapshotForUserIds, refreshThreads, threadId]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const viewport = messageViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior,
    });
  }, []);

  useLayoutEffect(() => {
    const viewport = messageViewportRef.current;
    if (!viewport || messages.length === 0) {
      return;
    }

    const shouldStickToBottom = !hasInitialScrollRef.current || isNearBottomRef.current;
    if (!shouldStickToBottom) {
      return;
    }

    const behavior: ScrollBehavior = hasInitialScrollRef.current ? "smooth" : "auto";
    scrollToBottom(behavior);
    hasInitialScrollRef.current = true;
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isLoading || messages.length === 0) {
      return;
    }

    void markThreadRead();
  }, [isLoading, markThreadRead, messages.length]);

  useEffect(() => {
    const onWindowFocus = () => {
      void markThreadRead();
    };

    window.addEventListener("focus", onWindowFocus);

    return () => {
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [markThreadRead]);

  const clearRemoteTypingIndicators = useCallback(() => {
    Object.values(typingTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId));
    typingTimeoutsRef.current = {};
    setTypingUserIds([]);
  }, []);

  const clearStaleOnlinePresenceFlags = useCallback(() => {
    setPresenceByUserId((previous) => {
      const entries = Object.entries(previous);
      if (entries.length === 0) {
        return previous;
      }

      let changed = false;
      const next: Record<number, { isOnline: boolean; lastSeenAt: string | null }> = {};

      entries.forEach(([userIdKey, presence]) => {
        const userId = Number(userIdKey);
        if (presence.isOnline) {
          changed = true;
        }

        next[userId] = {
          isOnline: false,
          lastSeenAt: presence.lastSeenAt,
        };
      });

      return changed ? next : previous;
    });
  }, []);

  const resetLocalTypingRuntimeState = useCallback(() => {
    localTypingStateRef.current = false;
    lastSentTypingStateRef.current = null;
    lastTrueTypingSentAtRef.current = 0;
    if (typingTrueThrottleTimerRef.current) {
      clearTimeout(typingTrueThrottleTimerRef.current);
      typingTrueThrottleTimerRef.current = null;
    }
    if (stopTypingTimerRef.current) {
      clearTimeout(stopTypingTimerRef.current);
      stopTypingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!threadId) {
      return;
    }

    const echo = getEcho();
    if (!echo) {
      setEchoConnectionStatus("failed");
      return;
    }

    const clearReconnectTimer = () => {
      if (echoReconnectTimeoutRef.current) {
        clearTimeout(echoReconnectTimeoutRef.current);
        echoReconnectTimeoutRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      clearReconnectTimer();

      const delay = Math.min(1000 * 2 ** echoReconnectAttemptRef.current, 15000);
      echoReconnectAttemptRef.current += 1;

      echoReconnectTimeoutRef.current = setTimeout(() => {
        try {
          echo.connect();
        } catch {
          // If connect throws, the next status change or retry cycle will schedule again.
        }
      }, delay);
    };

    setEchoConnectionStatus(echo.connectionStatus());

    const channel = echo.private(`conversation.${threadId}`);
    const userChannel = currentUserId ? echo.private(`user.${currentUserId}`) : null;
    const unsubscribeConnection = echo.connector.onConnectionChange((status) => {
      setEchoConnectionStatus(status);

      if (status === "connected") {
        echoReconnectAttemptRef.current = 0;
        clearReconnectTimer();
        resetLocalTypingRuntimeState();
        clearRemoteTypingIndicators();
        clearStaleOnlinePresenceFlags();
        setReactionMutationLoadingKey(null);
        setRemoveModalLoading(false);
        setForwardModalLoading(false);

        void Promise.all([refreshConversation(), refreshThreads(), refreshMessages()])
          .then(async ([conversationResponse]) => {
            const participantIds = conversationResponse?.conversation.participants?.map((item) => Number(item.user_id)) ?? [];
            await refreshPresenceSnapshotForUserIds(participantIds);
          })
          .catch(() => undefined);
        return;
      }

      if (status === "disconnected" || status === "failed") {
        scheduleReconnect();
      }
    });

    channel.listen(".chat.message.sent", (payload: ChatMessageSentEvent) => {
      if (String(payload.conversation_id) !== threadId) {
        return;
      }

      const dedupeKey = `message.sent:${threadId}:${String(payload.message.id)}:${payload.message.client_uid ?? ""}:${payload.sent_at ?? ""}`;
      if (!rememberRealtimeEvent(dedupeKey)) {
        return;
      }

      setMessages((previous) => upsertMessageByIdentity(previous, payload.message));
      dispatch(
        patchThread({
          id: threadId,
          changes: {
            lastMessage: payload.message.body?.trim() || `[${payload.message.message_type}]`,
            lastTime: "now",
          },
        })
      );
    });

    channel.listen(".chat.message.reaction.updated", (payload: ChatMessageReactionUpdatedEvent) => {
      if (String(payload.conversation_id) !== threadId) {
        return;
      }

      const dedupeKey = `message.reaction.updated:${threadId}:${String(payload.message_id)}:${payload.emoji}:${payload.action}:${payload.user_id}:${payload.sent_at ?? ""}`;
      if (!rememberRealtimeEvent(dedupeKey)) {
        return;
      }

      setMessages((previous) =>
        patchMessageById(previous, String(payload.message_id), (message) => ({
          ...message,
          reaction_aggregates: payload.reaction_aggregates ?? [],
          reactions_total: payload.reactions_total,
        }))
      );
    });

    channel.listen(".chat.message.edited", (payload: ChatMessageEditedEvent) => {
      if (String(payload.conversation_id) !== threadId) {
        return;
      }

      const dedupeKey = `message.edited:${threadId}:${String(payload.message_id)}:${payload.edited_at}:${payload.editor_user_id}`;
      if (!rememberRealtimeEvent(dedupeKey)) {
        return;
      }

      const messageIdKey = String(payload.message_id);

      setMessages((previous) =>
        patchMessageById(previous, messageIdKey, (message) => ({
          ...message,
          body: payload.body,
          edited_at: payload.edited_at,
        }))
      );

      if (String(conversation?.last_message_id ?? "") === messageIdKey) {
        dispatch(
          patchThread({
            id: threadId,
            changes: {
              lastMessage: payload.body?.trim() || "[text]",
              lastTime: "now",
            },
          })
        );
      }
    });

    channel.listen(".chat.message.removed", (payload: ChatMessageRemovedEvent) => {
      if (payload.mode !== "everywhere" || String(payload.conversation_id) !== threadId) {
        return;
      }

      const dedupeKey = `message.removed:everywhere:${threadId}:${String(payload.message_id)}:${payload.removed_at}`;
      if (!rememberRealtimeEvent(dedupeKey)) {
        return;
      }

      setMessages((previous) =>
        patchMessageById(previous, String(payload.message_id), (message) => {
          if (payload.message) {
            return {
              ...message,
              ...payload.message,
              attachments: payload.message.attachments ?? [],
              reaction_aggregates: payload.message.reaction_aggregates ?? [],
              reactions_total: payload.message.reactions_total ?? 0,
            };
          }

          return buildTombstoneMessage(message, payload.actor_user_id);
        })
      );
    });

    channel.listen(".chat.conversation.typing", (payload: ChatTypingEvent) => {
      if (String(payload.conversation_id) !== threadId || payload.user_id === currentUserId) {
        return;
      }

      const existingTimeout = typingTimeoutsRef.current[payload.user_id];
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      if (!payload.is_typing) {
        setTypingUserIds((previous) => previous.filter((userId) => userId !== payload.user_id));
        delete typingTimeoutsRef.current[payload.user_id];
        return;
      }

      setTypingUserIds((previous) => (previous.includes(payload.user_id) ? previous : [...previous, payload.user_id]));

      typingTimeoutsRef.current[payload.user_id] = setTimeout(() => {
        setTypingUserIds((previous) => previous.filter((userId) => userId !== payload.user_id));
        delete typingTimeoutsRef.current[payload.user_id];
      }, 3000);
    });

    channel.listen(".chat.conversation.read", (payload: ChatReadEvent) => {
      if (String(payload.conversation_id) !== threadId || payload.user_id === currentUserId) {
        return;
      }

      setLastReadEvent(payload);
    });

    channel.listen(".chat.conversation.request.updated", (payload: ChatRequestUpdatedEvent) => {
      if (String(payload.conversation_id) !== threadId) {
        return;
      }

      void refreshThreads().catch(() => undefined);
      void refreshConversation().catch(() => undefined);
    });

    channel.listen(".chat.user.presence.updated", (payload: ChatUserPresenceUpdatedEvent) => {
      const offset = resolveServerClockOffsetMs(payload.sent_at);
      if (offset !== null) {
        setServerClockOffsetMs(offset);
      }

      setPresenceByUserId((previous) => {
        const current = previous[payload.user_id];
        if (current && current.isOnline === payload.is_online && current.lastSeenAt === payload.last_seen_at) {
          return previous;
        }

        return {
          ...previous,
          [payload.user_id]: {
            isOnline: payload.is_online,
            lastSeenAt: payload.last_seen_at,
          },
        };
      });
    });

    if (userChannel) {
      userChannel.listen(".chat.message.removed", (payload: ChatMessageRemovedEvent) => {
        if (payload.mode !== "for_you" || String(payload.conversation_id) !== threadId) {
          return;
        }

        const dedupeKey = `message.removed:for_you:${threadId}:${String(payload.message_id)}:${payload.removed_at}`;
        if (!rememberRealtimeEvent(dedupeKey)) {
          return;
        }

        setMessages((previous) => previous.filter((message) => String(message.id) !== String(payload.message_id)));
      });
    }

    return () => {
      clearRemoteTypingIndicators();
      setPresenceByUserId({});
      resetLocalTypingRuntimeState();
      unsubscribeConnection();
      clearReconnectTimer();
      echo.leave(`conversation.${threadId}`);
      if (currentUserId) {
        echo.leave(`user.${currentUserId}`);
      }
    };
  }, [
    clearRemoteTypingIndicators,
    clearStaleOnlinePresenceFlags,
    currentUserId,
    dispatch,
    rememberRealtimeEvent,
    refreshConversation,
    refreshMessages,
    refreshPresenceSnapshotForUserIds,
    refreshThreads,
    resetLocalTypingRuntimeState,
    threadId,
  ]);

  const handleMessageScroll = () => {
    const viewport = messageViewportRef.current;
    if (!viewport) {
      return;
    }

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const nearBottom = distanceFromBottom <= 80;
    isNearBottomRef.current = nearBottom;

    if (nearBottom) {
      void markThreadRead();
    }

    if (viewport.scrollTop <= LOAD_OLDER_THRESHOLD_PX) {
      void loadOlderMessages();
    }
  };

  const handleManualEchoReconnect = () => {
    const echo = getEcho();
    if (!echo) {
      setEchoConnectionStatus("failed");
      return;
    }

    try {
      setEchoConnectionStatus("connecting");
      echo.connect();
    } catch {
      setEchoConnectionStatus("failed");
    }
  };

  const sendTypingStatus = useCallback(
    async (isTyping: boolean) => {
      if (!threadId || !canEmitTyping || typingForbiddenRef.current) {
        return;
      }

      localTypingStateRef.current = isTyping;

      if (!isTyping && typingTrueThrottleTimerRef.current) {
        clearTimeout(typingTrueThrottleTimerRef.current);
        typingTrueThrottleTimerRef.current = null;
      }

      if (lastSentTypingStateRef.current === isTyping) {
        return;
      }

      if (isTyping) {
        const now = Date.now();
        const elapsed = now - lastTrueTypingSentAtRef.current;
        if (lastTrueTypingSentAtRef.current > 0 && elapsed < TYPING_TRUE_THROTTLE_MS) {
          if (!typingTrueThrottleTimerRef.current) {
            typingTrueThrottleTimerRef.current = setTimeout(() => {
              typingTrueThrottleTimerRef.current = null;
              void sendTypingStatus(true);
            }, TYPING_TRUE_THROTTLE_MS - elapsed);
          }
          return;
        }
      }

      try {
        await updateTyping(threadId, isTyping);
        lastSentTypingStateRef.current = isTyping;
        if (isTyping) {
          lastTrueTypingSentAtRef.current = Date.now();
        }
      } catch (error) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 403) {
          typingForbiddenRef.current = true;
          localTypingStateRef.current = false;
          lastSentTypingStateRef.current = null;
          if (typingTrueThrottleTimerRef.current) {
            clearTimeout(typingTrueThrottleTimerRef.current);
            typingTrueThrottleTimerRef.current = null;
          }
          if (stopTypingTimerRef.current) {
            clearTimeout(stopTypingTimerRef.current);
            stopTypingTimerRef.current = null;
          }
        }
        // Typing updates are best-effort.
      }
    },
    [canEmitTyping, threadId]
  );

  const resetStopTypingTimer = useCallback(() => {
    if (stopTypingTimerRef.current) {
      clearTimeout(stopTypingTimerRef.current);
    }

    stopTypingTimerRef.current = setTimeout(() => {
      stopTypingTimerRef.current = null;
      void sendTypingStatus(false);
    }, TYPING_IDLE_TIMEOUT_MS);
  }, [sendTypingStatus]);

  const handleDraftChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextDraft = event.target.value;
      setDraft(nextDraft);

      if (!canEmitTyping || !threadId) {
        return;
      }

      if (nextDraft.trim() === "") {
        if (stopTypingTimerRef.current) {
          clearTimeout(stopTypingTimerRef.current);
          stopTypingTimerRef.current = null;
        }

        void sendTypingStatus(false);
        return;
      }

      void sendTypingStatus(true);

      resetStopTypingTimer();
    },
    [canEmitTyping, resetStopTypingTimer, sendTypingStatus, threadId]
  );

  useEffect(() => {
    const handleWindowBlur = () => {
      void sendTypingStatus(false);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        void sendTypingStatus(false);
      }
    };

    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [sendTypingStatus]);

  useEffect(() => {
    return () => {
      void sendTypingStatus(false);
    };
  }, [sendTypingStatus]);

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const body = draft.trim();
    const readyAttachments = draftAttachments
      .filter((item) => item.status === "ready" && item.payload)
      .map((item) => item.payload!) as AttachmentPayload[];
    const hasAttachments = readyAttachments.length > 0;
    const hasPendingUploads = draftAttachments.some((item) => item.status === "uploading");
    const hasUploadErrors = draftAttachments.some((item) => item.status === "error");

    if (!threadId || participant?.participant_state !== "accepted") {
      return;
    }

    if (hasPendingUploads) {
      setSendError("Please wait for attachments to finish uploading.");
      return;
    }

    if (hasUploadErrors) {
      setSendError("Remove failed attachments before sending.");
      return;
    }

    if (editingMessageId) {
      if (!body) {
        setEditingError("Message body is required.");
        return;
      }
      if (hasAttachments) {
        setSendError("Remove attachments before editing a message.");
        return;
      }

      if (stopTypingTimerRef.current) {
        clearTimeout(stopTypingTimerRef.current);
        stopTypingTimerRef.current = null;
      }
      void sendTypingStatus(false);

      setSendError(null);
      setEditingError(null);
      setEditingLoading(true);

      try {
        const response = await updateMessage(editingMessageId, { body });
        const updatedMessage = response.data;

        setMessages((previous) =>
          patchMessageById(previous, editingMessageId, (message) => ({
            ...message,
            ...updatedMessage,
            attachments: updatedMessage.attachments ?? message.attachments ?? [],
            reaction_aggregates: updatedMessage.reaction_aggregates ?? message.reaction_aggregates ?? [],
            reactions_total: updatedMessage.reactions_total ?? message.reactions_total ?? 0,
          }))
        );

        if (String(conversation?.last_message_id ?? "") === editingMessageId) {
          dispatch(
            patchThread({
              id: threadId,
              changes: {
                lastMessage: updatedMessage.body?.trim() || `[${updatedMessage.message_type}]`,
                lastTime: "now",
              },
            })
          );
        }

        cancelEditingMessage();
      } catch (error) {
        const axiosError = error as AxiosError<ApiValidationErrorPayload>;
        const firstError = Object.values(axiosError.response?.data?.errors ?? {})[0]?.[0];
        setEditingError(firstError || axiosError.response?.data?.message || "Failed to update message.");
      } finally {
        setEditingLoading(false);
      }

      return;
    }

    if (!body && !hasAttachments) {
      return;
    }

    if (stopTypingTimerRef.current) {
      clearTimeout(stopTypingTimerRef.current);
      stopTypingTimerRef.current = null;
    }
    void sendTypingStatus(false);

    setSendError(null);
    setIsSending(true);
    setDraft("");

    const clientUid = generateClientUid();
    const optimisticCreatedAt = new Date().toISOString();
    const optimisticType = !body && hasAttachments
      ? readyAttachments.every((item) => item.attachment_type === "image")
        ? "image"
        : "file"
      : "text";
    const optimisticAttachments = hasAttachments
      ? readyAttachments.map((payload) =>
          mapAttachmentPayloadToAttachment(payload, `temp-${clientUid}`, currentUserId)
        )
      : [];
    const optimisticMessage: Message = {
      id: `temp-${clientUid}`,
      conversation_id: threadId,
      sender_id: currentUserId ?? 0,
      message_type: optimisticType,
      body: body || null,
      metadata: { optimistic: true },
      reply_to_message_id: null,
      client_uid: clientUid,
      edited_at: null,
      deleted_at: null,
      created_at: optimisticCreatedAt,
      updated_at: optimisticCreatedAt,
      sender: currentUser
        ? {
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
          }
        : undefined,
      attachments: optimisticAttachments,
    };

    setMessages((previous) => upsertMessageByIdentity(previous, optimisticMessage));

    dispatch(
      patchThread({
        id: threadId,
        changes: {
          lastMessage: body || (hasAttachments ? `[${optimisticType}]` : ""),
          lastTime: "now",
        },
      })
    );

    try {
      const messageType = !body && hasAttachments
        ? readyAttachments.every((item) => item.attachment_type === "image")
          ? "image"
          : "file"
        : "text";
      const response = await sendMessage(threadId, {
        message_type: messageType,
        body: body || undefined,
        attachments: hasAttachments ? readyAttachments : undefined,
        client_uid: clientUid,
      });

      setMessages((previous) => upsertMessageByIdentity(previous, response.data));

      dispatch(
        patchThread({
          id: threadId,
          changes: {
            lastMessage: response.data.body?.trim() || "[text]",
            lastTime: "now",
          },
        })
      );

      const sentMessageId = getMessageIdAsNumber(response.data);
      if (sentMessageId) {
        await markThreadRead(sentMessageId);
      }

      draftAttachments.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
      setDraftAttachments([]);
      setAttachmentError(null);
    } catch (error) {
      setMessages((previous) => previous.filter((message) => message.client_uid !== clientUid));
      setDraft(body);

      const axiosError = error as AxiosError<ApiValidationErrorPayload>;
      const status = axiosError.response?.status;

      if (status === 401) {
        setSendError("Session expired. Redirecting to login...");
      } else if (status === 403) {
        setSendError("Conversation request is pending. Please accept the request before sending.");
      } else if (status === 422) {
        const firstValidationError = Object.values(axiosError.response?.data?.errors ?? {})[0]?.[0];
        setSendError(firstValidationError || axiosError.response?.data?.message || "Invalid message payload.");
      } else if (!axiosError.response) {
        setSendError("Network error. Message was not sent.");
      } else {
        setSendError("Failed to send message.");
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleRequestAction = async (action: "accept" | "decline") => {
    if (!threadId || participant?.participant_state !== "pending") {
      return;
    }

    setRequestActionError(null);
    setRequestActionLoading(action);

    try {
      await respondToConversationRequest(threadId, action);
      await refreshThreads();

      if (action === "accept") {
        await refreshConversation();
      } else {
        router.push("/masseges");
      }
    } catch {
      setRequestActionError("Failed to update request status.");
    } finally {
      setRequestActionLoading(null);
    }
  };

  const handleArchiveToggle = async () => {
    if (!threadId || !participant) {
      return;
    }

    const shouldArchive = participant.archived_at === null;

    setArchiveActionError(null);
    setArchiveActionLoading(true);

    try {
      if (shouldArchive) {
        await archiveConversation(threadId);
      } else {
        await unarchiveConversation(threadId);
      }

      setConversationData((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          participant: {
            ...previous.participant,
            archived_at: shouldArchive ? new Date().toISOString() : null,
          },
        };
      });

      await refreshThreads();
    } catch {
      setArchiveActionError("Failed to update archive status.");
    } finally {
      setArchiveActionLoading(false);
    }
  };

  const openReactionModal = (message: Message) => {
    setMessageActionError(null);
    setReactionModalMessage(message);
    const messageIdKey = String(message.id);
    const bubble = messageBubbleRefs.current[messageIdKey];
    if (bubble) {
      const rect = bubble.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const left = clampNumber(centerX, 40, window.innerWidth - 40);
      const top = Math.max(8, rect.top);
      setReactionPopoverPosition({ top, left });
    } else {
      setReactionPopoverPosition({
        top: Math.round(window.innerHeight / 2),
        left: Math.round(window.innerWidth / 2),
      });
    }
  };

  const openForwardModal = (message: Message) => {
    setMessageActionError(null);
    setForwardModalMessage(message);
    setForwardSearch("");
    setForwardSendingId(null);
    setForwardModalError(null);
    void loadForwardTargets();
  };

  const openRemoveModal = (message: Message) => {
    setMessageActionError(null);
    setRemoveModalMessage(message);
    setRemoveModalMode("for_you");
    setRemoveModalError(null);
  };

  const startEditingMessage = (message: Message) => {
    const body = message.body?.trim() ?? "";

    if (body === "") {
      return;
    }

    setMessageActionError(null);
    setEditingMessageId(String(message.id));
    setEditingError(null);
    previousDraftRef.current = draft;
    setDraft(message.body ?? "");

    requestAnimationFrame(() => {
      composerInputRef.current?.focus();
      composerInputRef.current?.select();
    });
  };

  const cancelEditingMessage = () => {
    setEditingMessageId(null);
    setEditingError(null);
    setEditingLoading(false);
    setDraft(previousDraftRef.current);
    previousDraftRef.current = "";
  };

  const closeReactionModal = () => {
    setReactionModalMessage(null);
    setReactionMutationLoadingKey(null);
    setReactionPopoverPosition(null);
  };

  const closeForwardModal = () => {
    setForwardModalMessage(null);
    setForwardModalLoading(false);
    setForwardModalError(null);
    setForwardSearch("");
    setForwardSendingId(null);
  };

  const openImageViewer = (url: string, name: string) => {
    setImageViewer({ url, name });
  };

  const closeImageViewer = () => {
    setImageViewer(null);
  };

  const closeRemoveModal = () => {
    setRemoveModalMessage(null);
    setRemoveModalLoading(false);
    setRemoveModalError(null);
    setRemoveModalMode("for_you");
  };

  const uploadDraftAttachment = async (conversationId: string, itemId: string, file: File) => {
    try {
      const response = await uploadChatAttachment(conversationId, file);
      setDraftAttachments((previous) =>
        previous.map((item) =>
          item.id === itemId
            ? {
                ...item,
                status: "ready",
                payload: response.data,
                error: null,
              }
            : item
        )
      );
    } catch (error) {
      const axiosError = error as AxiosError<ApiValidationErrorPayload>;
      const firstError = Object.values(axiosError.response?.data?.errors ?? {})[0]?.[0];
      setDraftAttachments((previous) =>
        previous.map((item) =>
          item.id === itemId
            ? {
                ...item,
                status: "error",
                error: firstError || axiosError.response?.data?.message || "Upload failed.",
              }
            : item
        )
      );
    }
  };

  const handleAttachmentSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!threadId || files.length === 0) {
      return;
    }

    setAttachmentError(null);

    const newItems = files.map((file) => {
      const isImage = file.type.startsWith("image/");
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      const id = `att-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      return {
        id,
        file,
        previewUrl,
        status: "uploading" as DraftAttachmentStatus,
        error: null,
        payload: null,
      };
    });

    setDraftAttachments((previous) => [...previous, ...newItems]);

    newItems.forEach((item) => {
      void uploadDraftAttachment(threadId, item.id, item.file);
    });

    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  };

  const removeDraftAttachment = (id: string) => {
    setDraftAttachments((previous) => {
      const target = previous.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }

      return previous.filter((item) => item.id !== id);
    });
  };

  const handleReactionToggle = async (emoji: string) => {
    if (!reactionModalMessage || !threadId || !currentUserId) {
      return;
    }

    const targetMessageId = String(reactionModalMessage.id);
    const latestMessage = latestMessagesRef.current.find((message) => String(message.id) === targetMessageId);
    if (!latestMessage) {
      closeReactionModal();
      return;
    }

    const rollbackSnapshot = { ...latestMessage };
    const optimistic = applyOptimisticReactionMutation(latestMessage, emoji);
    const loadingKey = `${targetMessageId}:${emoji}`;

    setReactionMutationLoadingKey(loadingKey);
    setMessageActionError(null);

    setMessages((previous) => patchMessageById(previous, targetMessageId, () => optimistic.nextMessage));

    try {
      const response =
        optimistic.action === "removed"
          ? await removeMessageReaction(latestMessage.id, { emoji })
          : await toggleMessageReaction(latestMessage.id, { emoji });

      setMessages((previous) =>
        patchMessageById(previous, targetMessageId, (message) => ({
          ...message,
          reaction_aggregates: response.data.reaction_aggregates,
          reactions_total: response.data.reactions_total,
        }))
      );

      closeReactionModal();
    } catch {
      setMessages((previous) => patchMessageById(previous, targetMessageId, () => rollbackSnapshot));
      setMessageActionError("Failed to update reaction.");
    } finally {
      setReactionMutationLoadingKey((previous) => (previous === loadingKey ? null : previous));
    }
  };

  const handleQuickForward = async (targetConversationId: string | number) => {
    if (!forwardModalMessage) {
      return;
    }

    const targetId = String(targetConversationId);

    setForwardModalLoading(true);
    setForwardSendingId(targetId);
    setForwardModalError(null);

    try {
      const response = await forwardMessage(forwardModalMessage.id, {
        target_conversation_id: targetId,
      });

      if (String(response.data.conversation_id) === threadId) {
        setMessages((previous) => upsertMessageByIdentity(previous, response.data));
        dispatch(
          patchThread({
            id: threadId,
            changes: {
              lastMessage: getMessagePreviewText(response.data),
              lastTime: "now",
            },
          })
        );
      }

      closeForwardModal();
      await refreshThreads();
    } catch (error) {
      const axiosError = error as AxiosError<ApiValidationErrorPayload>;
      if (axiosError.response?.status === 403) {
        setForwardModalError("You can only forward to accepted conversations.");
      } else if (axiosError.response?.status === 422) {
        const firstValidationError = Object.values(axiosError.response?.data?.errors ?? {})[0]?.[0];
        setForwardModalError(firstValidationError || "Invalid forward request payload.");
      } else if (!axiosError.response) {
        setForwardModalError("Network error while forwarding message.");
      } else {
        setForwardModalError("Failed to forward message.");
      }
    } finally {
      setForwardModalLoading(false);
      setForwardSendingId(null);
    }
  };

  const handleRemoveSubmit = async () => {
    if (!removeModalMessage || !threadId) {
      return;
    }

    const targetMessageId = String(removeModalMessage.id);
    const latestMessage = latestMessagesRef.current.find((message) => String(message.id) === targetMessageId);
    if (!latestMessage) {
      closeRemoveModal();
      return;
    }

    setRemoveModalLoading(true);
    setRemoveModalError(null);

    if (removeModalMode === "for_you") {
      setMessages((previous) => previous.filter((message) => String(message.id) !== targetMessageId));

      try {
        await removeMessageForYou(latestMessage.id);
        closeRemoveModal();
        await refreshThreads();
      } catch {
        setMessages((previous) => sortMessagesAscending([...previous, latestMessage]));
        setRemoveModalError("Failed to remove this message for you.");
      } finally {
        setRemoveModalLoading(false);
      }

      return;
    }

    const rollbackSnapshot = { ...latestMessage };
    const optimisticTombstone = buildTombstoneMessage(latestMessage, currentUserId ?? 0);
    setMessages((previous) => patchMessageById(previous, targetMessageId, () => optimisticTombstone));

    try {
      const response = await removeMessageForEverywhere(latestMessage.id);

      if (response.data.message) {
        setMessages((previous) => patchMessageById(previous, targetMessageId, () => response.data.message as Message));
      }

      closeRemoveModal();
      await refreshThreads();
    } catch (error) {
      setMessages((previous) => patchMessageById(previous, targetMessageId, () => rollbackSnapshot));

      const axiosError = error as AxiosError<ApiValidationErrorPayload>;
      if (axiosError.response?.status === 403) {
        setRemoveModalError("You are not allowed to remove this message for everyone.");
      } else {
        setRemoveModalError("Failed to remove message for everyone.");
      }
    } finally {
      setRemoveModalLoading(false);
    }
  };

  const isPendingThread = participant?.participant_state === "pending";
  const isDeclinedThread = participant?.participant_state === "declined";
  const isArchivedThread = participant?.archived_at !== null;
  const canSendMessage = participant?.participant_state === "accepted";
  const removeModalCanEverywhere = removeModalMessage ? canRemoveEverywhereByPolicy(removeModalMessage) : false;

  return (
    <ProtectedShell
      title={`${activeThread?.name ?? "Conversation"} Chat`}
      description={`${activeThread?.name ?? "Conversation"} conversation`}
      showPageHeader={false}
    >
      <MessengerLayout showInfo={showInfoPanel}>
          <MessengerSidebar
            title="Chats"
            action={
              <Link
                href="/masseges"
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm hover:bg-slate-100"
              >
                Inbox
              </Link>
            }
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            filters={
              <div className="grid grid-cols-3 gap-1">
                <Button type="button" variant={filter === "all" ? "secondary" : "ghost"} size="sm" className="h-8 rounded-full text-xs" onClick={() => setFilter("all")}>
                  All
                </Button>
                <Button type="button" variant={filter === "unread" ? "secondary" : "ghost"} size="sm" className="h-8 rounded-full text-xs" onClick={() => setFilter("unread")}>
                  Unread {unreadCount > 0 ? `(${unreadCount})` : ""}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full text-xs" disabled title="Online filter will use realtime presence later">
                  Online ({onlineCount})
                </Button>
              </div>
            }
          >
            {filteredThreads.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-4 text-center">
                <p className="text-sm font-medium text-slate-700">No conversations found</p>
                <p className="mt-1 text-xs text-slate-500">Try a different search or filter.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredThreads.map((thread) => {
                  const active = thread.id === threadId;

                  return (
                    <Link
                      key={thread.id}
                      href={`/message/t/${thread.id}`}
                      className={`group flex items-start gap-3 rounded-2xl px-3 py-2 transition ${
                        active ? "bg-[color:var(--messenger-soft)] ring-1 ring-slate-200" : "hover:bg-slate-100/80"
                      }`}
                    >
                      <div className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-sm font-semibold text-white">
                        {thread.name.charAt(0)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">{thread.name}</p>
                          <span className="shrink-0 text-[11px] text-slate-500">{thread.lastTime}</span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <p className="truncate text-xs text-slate-500">{thread.lastMessage}</p>
                          {thread.unread > 0 && (
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--messenger-blue)] px-1.5 text-[11px] font-semibold text-white">
                              {thread.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </MessengerSidebar>

          <section className={`flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,#ffffff_0%,#f1f5f9_45%,#eaf2ff_100%)] animate-[messengerRise_0.5s_ease] ${showInfoPanel ? "border-r border-slate-200/80" : ""}`}>
            <MessengerHeader
              title={activeThread?.name ?? "Conversation"}
              subtitle={presenceSubtitle}
              subtitleClassName={presenceSubtitleClassName}
              avatarText={activeThread?.name?.charAt(0) ?? "?"}
              isOnline={isPresenceOnline}
              actions={
                <>
                  <Button type="button" variant="ghost" size="icon" className="rounded-full text-slate-500" aria-label="Start call">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 19h8a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => void handleArchiveToggle()}
                    disabled={archiveActionLoading || isLoading || !participant}
                  >
                    {archiveActionLoading ? "Saving..." : isArchivedThread ? "Unarchive" : "Archive"}
                  </Button>
                  <Button
                    type="button"
                    variant={showInfoPanel ? "outline" : "ghost"}
                    size="icon"
                    className="rounded-full text-slate-500"
                    onClick={() => setShowInfoPanel((previous) => !previous)}
                    aria-label="Toggle contact info"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </Button>
                </>
              }
            />

            {echoConnectionStatus !== "connected" && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
                <div className="flex items-center justify-between gap-3">
                  <span>
                    {echoConnectionStatus === "connecting" && "Connecting to realtime service..."}
                    {echoConnectionStatus === "reconnecting" && "Reconnecting to realtime service..."}
                    {echoConnectionStatus === "disconnected" && "Realtime disconnected. Retrying automatically..."}
                    {echoConnectionStatus === "failed" && "Realtime connection failed."}
                  </span>
                  {(echoConnectionStatus === "disconnected" || echoConnectionStatus === "failed") && (
                    <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={handleManualEchoReconnect}>
                      Reconnect
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div
              ref={messageViewportRef}
              onScroll={handleMessageScroll}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
            >
              {isLoading ? (
                <div className="mx-auto mt-10 max-w-sm rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm text-slate-600">
                  Loading conversation...
                </div>
              ) : pageError ? (
                <div className="mx-auto mt-10 max-w-sm rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">
                  {pageError}
                </div>
              ) : (
                <>
                  {messages.length > 0 && (
                    <div className="mx-auto w-fit rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
                      {isLoadingOlder
                        ? "Loading older messages..."
                        : hasMoreOlder
                          ? "Scroll up to load older messages"
                          : "Start of conversation"}
                    </div>
                  )}
                  <div className="mx-auto w-fit rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200/80">
                    Messages
                  </div>

                  {messages.length === 0 ? (
                    <div className="mx-auto mt-10 max-w-sm rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center">
                      <p className="text-sm font-medium text-slate-700">No messages yet</p>
                      <p className="mt-1 text-xs text-slate-500">Start the conversation by sending a message.</p>
                    </div>
                  ) : (
                    messages.map((message) => {
                      const isMine = currentUserId !== null && Number(message.sender_id) === currentUserId;
                      const isOptimistic = String(message.id).startsWith("temp-");
                      const messageIdKey = String(message.id);
                      const isEditing = editingMessageId === messageIdKey;
                      const isRemovedForEveryone = hasRemovedForEveryoneFlag(message);
                      const canUseMessageActions = participant?.participant_state === "accepted" && participant.archived_at === null && !isOptimistic;
                      const canReactMessage = canUseMessageActions && !isRemovedForEveryone;
                      const canForwardMessage = canUseMessageActions && !isRemovedForEveryone;
                      const canRemoveForYou = !isOptimistic;
                      const canRemoveEverywhere = canRemoveEverywhereByPolicy(message);
                      const canEditMessage =
                        canUseMessageActions &&
                        isMine &&
                        !isRemovedForEveryone &&
                        message.message_type === "text" &&
                        Boolean(message.body?.trim()) &&
                        (!message.attachments || message.attachments.length === 0) &&
                        !isEditing;
                      const hasAnyAction =
                        canForwardMessage || canReactMessage || canRemoveForYou || canRemoveEverywhere || canEditMessage;
                      const editedLabel = !isOptimistic && message.edited_at ? " \u00b7 edited" : "";
                      const messageText =
                        message.body?.trim() ||
                        (message.attachments && message.attachments.length > 0
                          ? "Sent attachment"
                          : `[${message.message_type}]`);
                      const isSystemMessage = isRemovedForEveryone || message.message_type === "system";
                      const senderInitial =
                        message.sender?.name?.trim().charAt(0) ||
                        message.sender?.email?.trim().charAt(0) ||
                        counterpart?.name?.trim().charAt(0) ||
                        "?";

                      return (
                        <div key={messageIdKey} className={`group relative flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                          {!isMine && (
                            <div className="mb-6 flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                              {senderInitial}
                            </div>
                          )}
                          <div className="relative max-w-[78%]">
                            {hasAnyAction && (
                              <div
                                className={`absolute top-1 z-20 ${isMine ? "left-0 -translate-x-full pr-2" : "right-0 translate-x-full pl-2"}`}
                              >
                                <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-1 py-1 shadow-sm opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                                  {canForwardMessage && (
                                    <button
                                      type="button"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
                                      onClick={() => openForwardModal(message)}
                                      aria-label="Forward message"
                                    >
                                      <Forward className="h-4 w-4" />
                                    </button>
                                  )}
                                  {canEditMessage && (
                                    <button
                                      type="button"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
                                      onClick={() => startEditingMessage(message)}
                                      aria-label="Edit message"
                                    >
                                      <PencilLine className="h-4 w-4" />
                                    </button>
                                  )}
                                  {canReactMessage && (
                                    <button
                                      type="button"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
                                      onClick={() => openReactionModal(message)}
                                      aria-label="React to message"
                                    >
                                      <SmilePlus className="h-4 w-4" />
                                    </button>
                                  )}
                                  {(canRemoveForYou || canRemoveEverywhere) && (
                                    <button
                                      type="button"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-rose-600 hover:bg-rose-50"
                                      onClick={() => openRemoveModal(message)}
                                      aria-label="Remove message"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            <div
                              ref={(node) => {
                                messageBubbleRefs.current[messageIdKey] = node;
                              }}
                              className="relative inline-block"
                            >
                              <MessageBubble isMine={isMine} isSystem={isSystemMessage} className={isSystemMessage ? "italic" : ""}>
                              {(message.forwarded_from_message_id || message.forwarded_snapshot) && (
                                <p
                                  className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${
                                    isSystemMessage ? "text-amber-700" : isMine ? "text-blue-100" : "text-slate-500"
                                  }`}
                                >
                                  Forwarded
                                </p>
                              )}

                              <p className={`text-sm leading-relaxed ${isRemovedForEveryone ? "italic opacity-85" : ""}`}>{messageText}</p>

                              {message.attachments && message.attachments.length > 0 && (() => {
                                const imageAttachments = message.attachments
                                  .map((attachment) => ({
                                    attachment,
                                    url: resolveAttachmentUrl(attachment),
                                  }))
                                  .filter((item) => item.attachment.attachment_type === "image" && item.url);
                                const fileAttachments = message.attachments.filter(
                                  (attachment) => attachment.attachment_type !== "image" || !resolveAttachmentUrl(attachment)
                                );

                                return (
                                  <div className="mt-2 space-y-2">
                                    {imageAttachments.length > 0 && (
                                      <div className={`${imageAttachments.length > 1 ? "grid grid-cols-2 gap-2" : ""}`}>
                                        {imageAttachments.map(({ attachment, url }) => {
                                          const attachmentName =
                                            attachment.original_name || attachment.storage_path.split("/").pop() || "Image";

                                          return (
                                            <button
                                              key={String(attachment.id)}
                                              type="button"
                                              onClick={() => openImageViewer(url as string, attachmentName)}
                                              className={`overflow-hidden rounded-2xl border ${isMine ? "border-blue-200/40" : "border-slate-200"} ${
                                                imageAttachments.length > 1 ? "h-36" : "h-60"
                                              } w-full bg-slate-100/30`}
                                              aria-label={`Open image ${attachmentName}`}
                                            >
                                              <img src={url as string} alt={attachmentName} className="h-full w-full object-cover" />
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {fileAttachments.map((attachment) => {
                                      const attachmentName =
                                        attachment.original_name || attachment.storage_path.split("/").pop() || "Attachment";
                                      const attachmentUrl = resolveAttachmentUrl(attachment);
                                      const isImageAttachment = attachment.attachment_type === "image";

                                      return (
                                        <div
                                          key={String(attachment.id)}
                                          className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${
                                            isMine ? "bg-white/20" : "bg-slate-100"
                                          }`}
                                        >
                                          <div className="flex min-w-0 items-center gap-2">
                                            <span
                                              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
                                                isMine ? "bg-white/30 text-white" : "bg-white text-slate-600"
                                              }`}
                                            >
                                              {isImageAttachment ? (
                                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth="2"
                                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                                  />
                                                </svg>
                                              ) : (
                                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth="2"
                                                    d="M14.752 11.168l-6.518 6.518a4 4 0 105.657 5.657l7.07-7.071a6 6 0 10-8.485-8.485l-7.07 7.071a8 8 0 1011.314 11.314l6.518-6.518"
                                                  />
                                                </svg>
                                              )}
                                            </span>
                                            <div className="min-w-0">
                                              <p className={`truncate text-xs font-medium ${isMine ? "text-white" : "text-slate-700"}`}>
                                                {attachmentName}
                                              </p>
                                              <p className={`text-[11px] ${isMine ? "text-blue-100" : "text-slate-500"}`}>
                                                {formatFileSize(attachment.size_bytes)}
                                              </p>
                                            </div>
                                          </div>
                                          {attachmentUrl && (
                                            <a
                                              href={attachmentUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              download
                                              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                                                isMine
                                                  ? "bg-white/80 text-slate-700 hover:bg-white"
                                                  : "bg-white text-slate-700 hover:bg-slate-50"
                                              }`}
                                            >
                                              Download
                                            </a>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}

                              <p className={`mt-1 text-[11px] ${isMine ? "text-blue-100/80" : "text-slate-500"}`}>
                                {isOptimistic ? "Sending..." : `${formatClockTime(message.created_at)}${editedLabel}`}
                              </p>
                              </MessageBubble>
                            </div>

                            {!isEditing && Array.isArray(message.reaction_aggregates) && message.reaction_aggregates.length > 0 && (
                              <div className={`mt-1 flex ${isMine ? "justify-end" : "justify-start"}`}>
                                <div className="flex flex-wrap gap-1">
                                  {message.reaction_aggregates.map((aggregate) => (
                                    <button
                                      key={`${messageIdKey}-${aggregate.emoji}`}
                                      type="button"
                                      onClick={() => {
                                        if (!canReactMessage) {
                                          return;
                                        }
                                        openReactionModal(message);
                                      }}
                                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] shadow-sm ${
                                        aggregate.reacted_by_me
                                          ? isMine
                                            ? "border-blue-200 bg-blue-500/30 text-white"
                                            : "border-blue-200 bg-blue-50 text-blue-700"
                                          : isMine
                                            ? "border-blue-300/60 bg-blue-500/20 text-blue-100"
                                            : "border-slate-200 bg-slate-100 text-slate-700"
                                      }`}
                                    >
                                      <span>{aggregate.emoji}</span>
                                      <span>{aggregate.count}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>

            <form onSubmit={handleSend} className="border-t border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur">
              {sendError && <p className="mb-2 text-xs text-rose-600">{sendError}</p>}
              {editingError && <p className="mb-2 text-xs text-rose-600">{editingError}</p>}
              {attachmentError && <p className="mb-2 text-xs text-rose-600">{attachmentError}</p>}
              {messageActionError && <p className="mb-2 text-xs text-rose-600">{messageActionError}</p>}
              {requestActionError && <p className="mb-2 text-xs text-rose-600">{requestActionError}</p>}
              {archiveActionError && <p className="mb-2 text-xs text-rose-600">{archiveActionError}</p>}
              {isArchivedThread && <p className="mb-2 text-xs text-slate-500">This conversation is archived.</p>}
              {isPendingThread && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <p className="w-full text-xs text-slate-500">This conversation is pending. Accept to start chatting.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={requestActionLoading !== null}
                    className="rounded-full"
                    onClick={() => void handleRequestAction("accept")}
                  >
                    {requestActionLoading === "accept" ? "Accepting..." : "Accept"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={requestActionLoading !== null}
                    className="rounded-full"
                    onClick={() => void handleRequestAction("decline")}
                  >
                    {requestActionLoading === "decline" ? "Declining..." : "Decline"}
                  </Button>
                </div>
              )}
              {isDeclinedThread && <p className="mb-2 text-xs text-slate-500">This conversation request was declined.</p>}
              {!canSendMessage && !isPendingThread && !isDeclinedThread && (
                <p className="mb-2 text-xs text-slate-500">You can send messages after the request is accepted.</p>
              )}

              {editingMessageId && (
                <div className="mb-2 flex items-center justify-between rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  <span>Editing message</span>
                  <button type="button" className="text-blue-600 hover:text-blue-800" onClick={cancelEditingMessage}>
                    Cancel
                  </button>
                </div>
              )}

              {draftAttachments.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {draftAttachments.map((item) => {
                    const isImage = item.previewUrl !== null;

                    return (
                      <div key={item.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-2 py-1 text-xs text-slate-700 shadow-sm">
                        {isImage ? (
                          <button
                            type="button"
                            onClick={() => openImageViewer(item.previewUrl ?? "", item.file.name)}
                            className="rounded-md"
                            aria-label={`Open image ${item.file.name}`}
                          >
                            <img src={item.previewUrl ?? ""} alt={item.file.name} className="h-10 w-10 rounded-md object-cover" />
                          </button>
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-6.518 6.518a4 4 0 105.657 5.657l7.07-7.071a6 6 0 10-8.485-8.485l-7.07 7.071a8 8 0 1011.314 11.314l6.518-6.518" />
                            </svg>
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="max-w-[120px] truncate font-medium text-slate-700">{item.file.name}</p>
                          <p className="text-[11px] text-slate-500">
                            {formatFileSize(item.file.size)}
                            {item.status === "uploading" && " · uploading"}
                            {item.status === "error" && " · failed"}
                          </p>
                          {item.error && <p className="text-[11px] text-rose-600">{item.error}</p>}
                        </div>
                        <button
                          type="button"
                          className="ml-auto text-slate-400 hover:text-slate-700"
                          onClick={() => removeDraftAttachment(item.id)}
                          aria-label="Remove attachment"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/*,.pdf,.txt,.zip,.docx,.xlsx"
                  onChange={handleAttachmentSelect}
                  disabled={!canSendMessage || isLoading}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={!canSendMessage || isLoading || hasAttachmentUploadsInProgress || Boolean(editingMessageId) || editingLoading}
                  aria-label="Attach file"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-6.518 6.518a4 4 0 105.657 5.657l7.07-7.071a6 6 0 10-8.485-8.485l-7.07 7.071a8 8 0 1011.314 11.314l6.518-6.518" />
                  </svg>
                </Button>
                <input
                  ref={composerInputRef}
                  type="text"
                  value={draft}
                  onChange={handleDraftChange}
                  onBlur={() => {
                    if (stopTypingTimerRef.current) {
                      clearTimeout(stopTypingTimerRef.current);
                      stopTypingTimerRef.current = null;
                    }
                    void sendTypingStatus(false);
                  }}
                  placeholder="Type a message..."
                  className="h-10 flex-1 rounded-full border border-slate-200 bg-slate-100 px-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[color:var(--messenger-blue)]/30"
                  disabled={!canSendMessage || isLoading || editingLoading}
                />
                <Button
                  type="submit"
                  size="md"
                  className="rounded-full px-4 shadow-sm"
                  disabled={
                    !canSendMessage ||
                    isLoading ||
                    isSending ||
                    editingLoading ||
                    (draft.trim() === "" && draftAttachments.length === 0)
                  }
                >
                  {editingLoading ? "Saving..." : isSending ? "Sending..." : editingMessageId ? "Save" : "Send"}
                </Button>
              </div>
            </form>
          </section>

          <MessengerInfoPanel show={showInfoPanel} title="Details">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
                <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-lg font-semibold text-white">
                  {(counterpart?.name || activeThread?.name || "?").charAt(0)}
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-900">{counterpart?.name || activeThread?.name || "Conversation"}</p>
                <p className="text-xs text-slate-500">{counterpart?.email || activeThread?.handle || "-"}</p>
                <p className="mt-1 text-[11px] font-medium text-slate-500">Presence will appear with realtime presence step.</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">About</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  {conversation?.description || "Direct conversation thread."}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-2">
                <Button type="button" variant="ghost" size="sm" fullWidth className="justify-start border-0 text-xs font-medium text-slate-700 shadow-none">
                  Search in conversation
                </Button>
                <Button type="button" variant="ghost" size="sm" fullWidth className="justify-start border-0 text-xs font-medium text-slate-700 shadow-none">
                  Mute notifications
                </Button>
                <Button type="button" variant="ghost" size="sm" fullWidth className="justify-start border-0 text-xs font-medium text-rose-600 shadow-none hover:bg-rose-50">
                  Block / Report
                </Button>
              </div>
            </div>
          </MessengerInfoPanel>
      </MessengerLayout>

      {reactionModalMessage && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/30"
            aria-label="Close reaction modal"
            onClick={reactionMutationLoadingKey ? undefined : closeReactionModal}
          />
          <div
            className="absolute z-50 w-auto max-w-[90vw] -translate-x-1/2 -translate-y-full rounded-full border border-slate-200 bg-white px-2 py-1 shadow-xl"
            style={
              reactionPopoverPosition
                ? { top: reactionPopoverPosition.top, left: reactionPopoverPosition.left }
                : { top: "50%", left: "50%" }
            }
          >
            <div className="flex items-center gap-1">
              {REACTION_CHOICES.map((emoji) => {
                const loading = reactionMutationLoadingKey === `${String(reactionModalMessage.id)}:${emoji}`;

                return (
                  <button
                    key={emoji}
                    type="button"
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition ${
                      loading ? "bg-slate-100 opacity-60" : "hover:bg-slate-100"
                    }`}
                    disabled={Boolean(reactionMutationLoadingKey)}
                    onClick={() => void handleReactionToggle(emoji)}
                    aria-label={`React with ${emoji}`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {forwardModalMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            aria-label="Close forward modal"
            onClick={forwardModalLoading ? undefined : closeForwardModal}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Forward</h2>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                onClick={forwardModalLoading ? undefined : closeForwardModal}
                disabled={forwardModalLoading}
                aria-label="Close forward modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={forwardSearch}
                  onChange={(event) => setForwardSearch(event.target.value)}
                  placeholder="Search for people and groups"
                  className="h-10 w-full rounded-full border border-slate-200 bg-slate-100 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[color:var(--messenger-blue)]/30"
                  disabled={forwardModalLoading}
                />
              </div>

              <div className="mt-4 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>Contacts</span>
                <span>{filteredForwardTargets.length}</span>
              </div>

              <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {forwardTargetsLoading ? (
                  <p className="text-sm text-slate-500">Loading contacts...</p>
                ) : filteredForwardTargets.length === 0 ? (
                  <p className="text-sm text-slate-500">No contacts found.</p>
                ) : (
                  filteredForwardTargets.map((target) => {
                    const label =
                      target.title?.trim() ||
                      target.counterpart?.name?.trim() ||
                      target.counterpart?.email ||
                      `Conversation #${target.conversation_id}`;
                    const subtitle =
                      target.counterpart?.email && target.counterpart.email !== label ? target.counterpart.email : null;
                    const avatarUrl = resolveAvatarUrl(target.avatar_path);
                    const initial = label.charAt(0).toUpperCase();
                    const targetId = String(target.conversation_id);
                    const isSending = forwardSendingId === targetId;

                    return (
                      <div
                        key={targetId}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-sm font-semibold text-white">
                            {avatarUrl ? (
                              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              initial
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">{label}</p>
                            {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={forwardModalLoading || isSending}
                          onClick={() => void handleQuickForward(targetId)}
                        >
                          {isSending ? "Sending..." : "Send"}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {forwardModalError && (
              <div className="border-t border-slate-200 px-5 py-3 text-xs text-rose-600">{forwardModalError}</div>
            )}
          </div>
        </div>
      )}

      {imageViewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/80"
            aria-label="Close image viewer"
            onClick={closeImageViewer}
          />
          <div className="relative z-10 w-full max-w-4xl">
            <button
              type="button"
              className="absolute -top-10 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              onClick={closeImageViewer}
              aria-label="Close image viewer"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="overflow-hidden rounded-2xl bg-slate-900 shadow-2xl">
              <img
                src={imageViewer.url}
                alt={imageViewer.name}
                className="max-h-[80vh] w-full object-contain"
              />
            </div>
            <p className="mt-3 text-center text-xs text-slate-200">{imageViewer.name}</p>
          </div>
        </div>
      )}

      {removeModalMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            aria-label="Close remove modal"
            onClick={removeModalLoading ? undefined : closeRemoveModal}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-white/60 bg-white p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-slate-900">Remove Message</h2>
            <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
              {removeModalMessage.body?.trim() || `[${removeModalMessage.message_type}]`}
            </p>

            <div className="mt-4 space-y-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="remove-mode"
                  value="for_you"
                  checked={removeModalMode === "for_you"}
                  onChange={() => setRemoveModalMode("for_you")}
                  disabled={removeModalLoading}
                  className="mt-0.5"
                />
                <span>
                  <strong>Remove for you</strong>
                  <span className="block text-xs text-slate-500">Hide this message only from your view.</span>
                </span>
              </label>

              {removeModalCanEverywhere && (
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="remove-mode"
                    value="everywhere"
                    checked={removeModalMode === "everywhere"}
                    onChange={() => setRemoveModalMode("everywhere")}
                    disabled={removeModalLoading}
                    className="mt-0.5"
                  />
                  <span>
                    <strong>Remove from everywhere</strong>
                    <span className="block text-xs text-slate-500">Replace message with a tombstone for all participants.</span>
                  </span>
                </label>
              )}
            </div>

            {removeModalError && <p className="mt-2 text-xs text-rose-600">{removeModalError}</p>}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={closeRemoveModal} disabled={removeModalLoading}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => void handleRemoveSubmit()}
                loading={removeModalLoading}
                disabled={removeModalLoading}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </ProtectedShell>
  );
}
