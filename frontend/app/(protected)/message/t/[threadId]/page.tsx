"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { AxiosError } from "axios";
import { CornerUpLeft, Forward, PencilLine, Search, SmilePlus, Trash2, X } from "lucide-react";
import ProtectedShell from "@/components/ProtectedShell";
import Button from "@/components/Button";
import MessengerLayout from "@/components/messenger/MessengerLayout";
import MessengerThreadsSidebar from "@/components/messenger/MessengerThreadsSidebar";
import MessengerHeader from "@/components/messenger/MessengerHeader";
import MessageBubble from "@/components/messenger/MessageBubble";
import { canShowCallLauncher } from "@/lib/call-ui";
import {
  classifyCallNetworkQuality,
  formatCallDuration,
  getNetworkQualityLabel,
  getNetworkQualityToneClassName,
  readCallQualitySampleFromStats,
  type CallNetworkQuality,
} from "@/lib/call-phase2";
import { createCallToneController, type CallToneController } from "@/lib/call-tones";
import MessengerInfoPanel from "@/components/messenger/MessengerInfoPanel";
import UserAvatar from "@/components/messenger/UserAvatar";
import RecordingBar from "@/components/messenger/RecordingBar";
import MessageAttachments from "@/components/messenger/MessageAttachments";
import DraftAttachmentsPreview from "@/components/messenger/DraftAttachmentsPreview";
import {
  archiveConversation,
  addConversationParticipants,
  forwardMessage,
  leaveConversation,
  listChatUsers,
  listConversations,
  listMessages,
  markConversationRead,
  blockConversation,
  unblockConversation,
  removeMessageForEverywhere,
  removeMessageForYou,
  removeConversationParticipant,
  removeMessageReaction,
  respondToConversationRequest,
  sendMessage,
  updateConversation,
  updateConversationParticipantRole,
  updateMessage,
  uploadChatAttachment,
  showConversation,
  toggleMessageReaction,
  updateTyping,
  muteConversation,
  unmuteConversation,
  unarchiveConversation,
} from "@/lib/chat-api";
import callSignaling from "@/lib/call-signaling";
import {
  requestAudioStream,
  requestVideoStream,
  setAudioTracksEnabled,
  setVideoTracksEnabled,
  stopMediaStream,
} from "@/lib/media-permissions";
import { getPresenceStatus, pingPresence } from "@/lib/presence-api";
import { formatLastSeen, getNowFromServerOffset, resolveServerClockOffsetMs } from "@/lib/presence-time";
import { createWebRtcConnection, type WebRtcConnectionController } from "@/lib/webrtc";
import { formatThreadRelativeTime, type ThreadItem } from "@/lib/chat-threads";
import { getEcho } from "@/lib/echo";
import { useMessengerThreads } from "@/lib/use-messenger-threads";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { patchThread } from "@/store/chatSlice";
import {
  resetCallState,
  setCallError,
  setCallStatus,
  setCameraOff,
  setCurrentCall,
  setIncomingCallPayload,
  setLocalStream,
  setMuted,
  setRemoteStream,
} from "@/store/callSlice";
import type {
  Attachment,
  CallEventPayload,
  CallMissedEventPayload,
  WebRtcAnswerSignalEvent,
  WebRtcIceCandidatePayload,
  WebRtcIceCandidateSignalEvent,
  WebRtcOfferSignalEvent,
  Conversation,
  ConversationListItem,
  ConversationShowResponse,
  AttachmentPayload,
  CallType,
  Message,
  MessageRemovalMode,
  ReactionAggregate,
  DirectoryUser,
} from "@/types/chat";

type DraftAttachmentStatus = "uploading" | "ready" | "error";

interface DraftAttachmentItem {
  id: string;
  file: File;
  previewUrl: string | null;
  status: DraftAttachmentStatus;
  progress: number;
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

const getMessageDisplayText = (message: Message): string => {
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

const getMessagePreviewText = (message: Message): string => {
  return getMessageDisplayText(message);
};

const getReplyPreviewText = (reply: Message["reply_to"]): string => {
  if (!reply) {
    return "";
  }

  return reply.body?.trim() || `[${reply.message_type}]`;
};

const getReadMessageId = (
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

const isFutureIsoDate = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
};

const buildMuteUntilIso = (durationMs: number): string => {
  return new Date(Date.now() + durationMs).toISOString();
};

const formatMuteUntil = (value: string | null): string => {
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

const MAX_RECORDING_SECONDS = 120;
const MUTE_PRESETS = [
  { id: "15m", label: "For 15 minutes", durationMs: 15 * 60 * 1000 },
  { id: "1h", label: "For 1 Hour", durationMs: 60 * 60 * 1000 },
  { id: "8h", label: "For 8 Hours", durationMs: 8 * 60 * 60 * 1000 },
  { id: "24h", label: "For 24 Hours", durationMs: 24 * 60 * 60 * 1000 },
  { id: "forever", label: "Until I turn it back on", durationMs: 10 * 365 * 24 * 60 * 60 * 1000 },
] as const;

const mapConversationDetailToThread = (
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
    isBlocked: false,
    type: conversation.type ?? null,
    counterpartId: null,
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
  const currentCall = useAppSelector((state) => state.call.currentCall);
  const callStatus = useAppSelector((state) => state.call.callStatus);
  const callLocalStream = useAppSelector((state) => state.call.localStream);
  const callRemoteStream = useAppSelector((state) => state.call.remoteStream);
  const isCallMuted = useAppSelector((state) => state.call.isMuted);
  const isCallCameraOff = useAppSelector((state) => state.call.isCameraOff);
  const {
    threads,
    filteredThreads,
    searchQuery,
    setSearchQuery,
    filter,
    setFilter,
    unreadCount,
    presenceByUserId: presenceByUserIdMap,
    isLoading: threadsLoading,
    errorMessage: threadsError,
    refreshThreads,
    openNewChatModal,
    newChatModalState,
  } = useMessengerThreads({ activeThreadId: threadId });
  const [draft, setDraft] = useState("");
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const audioRefMap = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

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
  const [muteActionError, setMuteActionError] = useState<string | null>(null);
  const [muteActionLoading, setMuteActionLoading] = useState(false);
  const [muteModalOpen, setMuteModalOpen] = useState(false);
  const [selectedMutePresetId, setSelectedMutePresetId] = useState<(typeof MUTE_PRESETS)[number]["id"]>("15m");
  const [echoConnectionStatus, setEchoConnectionStatus] = useState<EchoConnectionStatus>("connecting");
  const [messageActionError, setMessageActionError] = useState<string | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupNameEditing, setGroupNameEditing] = useState(false);
  const [groupNameSaving, setGroupNameSaving] = useState(false);
  const [groupNameError, setGroupNameError] = useState<string | null>(null);
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState("");
  const [groupDescriptionEditing, setGroupDescriptionEditing] = useState(false);
  const [groupDescriptionSaving, setGroupDescriptionSaving] = useState(false);
  const [groupDescriptionError, setGroupDescriptionError] = useState<string | null>(null);
  const [groupAvatarSaving, setGroupAvatarSaving] = useState(false);
  const [groupAvatarError, setGroupAvatarError] = useState<string | null>(null);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [memberDirectory, setMemberDirectory] = useState<DirectoryUser[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSelection, setMemberSelection] = useState<Set<number>>(new Set());
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [memberRoleUpdatingId, setMemberRoleUpdatingId] = useState<number | null>(null);
  const [leaveGroupLoading, setLeaveGroupLoading] = useState(false);
  const [leaveGroupError, setLeaveGroupError] = useState<string | null>(null);
  const [blockActionLoading, setBlockActionLoading] = useState(false);
  const [blockActionError, setBlockActionError] = useState<string | null>(null);
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
  const [imageViewer, setImageViewer] = useState<{
    url: string;
    name: string;
    mode: "single" | "gallery";
    list?: { url: string; name: string }[];
    index?: number;
  } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [callMenuOpen, setCallMenuOpen] = useState(false);
  const [callActionLoading, setCallActionLoading] = useState<CallType | null>(null);
  const [callActionError, setCallActionError] = useState<string | null>(null);
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [callNetworkQuality, setCallNetworkQuality] = useState<CallNetworkQuality>("unavailable");
  const [callReconnectState, setCallReconnectState] = useState<"idle" | "reconnecting">("idle");
  const [removeModalMessage, setRemoveModalMessage] = useState<Message | null>(null);
  const [removeModalMode, setRemoveModalMode] = useState<MessageRemovalMode>("for_you");
  const [removeModalLoading, setRemoveModalLoading] = useState(false);
  const [removeModalError, setRemoveModalError] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingLoading, setEditingLoading] = useState(false);
  const [editingError, setEditingError] = useState<string | null>(null);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [draftAttachments, setDraftAttachments] = useState<DraftAttachmentItem[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);

  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const hasInitialScrollRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const lastThreadIdRef = useRef<string>("");
  const lastAutoScrollThreadIdRef = useRef<string>("");
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
  const groupAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const callMenuRef = useRef<HTMLDivElement | null>(null);
  const activeCallLocalVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeCallRemoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const webRtcControllerRef = useRef<WebRtcConnectionController | null>(null);
  const pendingIceCandidatesRef = useRef<WebRtcIceCandidatePayload[]>([]);
  const missedCallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeCallIdRef = useRef<number | null>(null);
  const callCleanupThreadIdRef = useRef<string>(threadId);
  const callReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callDurationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callQualityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toneControllerRef = useRef<CallToneController | null>(null);
  const previousDraftRef = useRef<string>("");
  const messageBubbleRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingActionRef = useRef<"send" | "cancel" | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    setLeaveGroupLoading(false);
    setLeaveGroupError(null);
    setBlockActionLoading(false);
    setBlockActionError(null);
    setGroupDescriptionEditing(false);
    setGroupDescriptionSaving(false);
    setGroupDescriptionError(null);
    setGroupAvatarSaving(false);
    setGroupAvatarError(null);
    setMemberRoleUpdatingId(null);
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
    setReplyingToMessage(null);
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
    setIsRecording(false);
    setRecordingSeconds(0);
    setCallMenuOpen(false);
    setCallActionLoading(null);
    setCallActionError(null);
    setCallDurationSeconds(0);
    setCallNetworkQuality("unavailable");
    setCallReconnectState("idle");
    if (callReconnectTimeoutRef.current) {
      clearTimeout(callReconnectTimeoutRef.current);
      callReconnectTimeoutRef.current = null;
    }
    if (callDurationIntervalRef.current) {
      clearInterval(callDurationIntervalRef.current);
      callDurationIntervalRef.current = null;
    }
    if (callQualityIntervalRef.current) {
      clearInterval(callQualityIntervalRef.current);
      callQualityIntervalRef.current = null;
    }
    toneControllerRef.current?.stop();
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    recordingActionRef.current = null;
    recordingChunksRef.current = [];
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }
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
    lastAutoScrollThreadIdRef.current = "";
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
      return mapConversationDetailToThread(conversationData.conversation, conversationData.participant, currentUserId);
    }

    return null;
  }, [conversationData, currentUserId, threadId, threads]);

  const conversation = conversationData?.conversation ?? null;
  const participant = conversationData?.participant ?? null;
  const moderation = conversationData?.moderation ?? null;
  const isGroupConversation = conversation?.type === "group";
  const isBlockedByMe = Boolean(moderation?.blocked_by_me);
  const isBlockedByOther = Boolean(moderation?.blocked_by_other);
  const isBlockedConversation = isBlockedByMe || isBlockedByOther;
  const canEmitTyping = participant?.participant_state === "accepted" && participant.archived_at === null && !isBlockedConversation;
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

  const counterpartParticipant = useMemo(() => {
    if (!conversation?.participants || currentUserId === null) {
      return null;
    }

    return conversation.participants.find((item) => item.user_id !== currentUserId) ?? null;
  }, [conversation?.participants, currentUserId]);

  const counterpartReadMessageId = useMemo(
    () => getReadMessageId(counterpartParticipant?.last_read_message_id, lastReadEvent, counterpartParticipant?.user_id),
    [counterpartParticipant?.last_read_message_id, counterpartParticipant?.user_id, lastReadEvent]
  );

  const counterpartOnline = Boolean(counterpart?.id && presenceByUserId[counterpart.id]?.isOnline);

  const detailsDisplayName = isGroupConversation
    ? conversation?.title?.trim() || activeThread?.name || "Group chat"
    : counterpart?.name || activeThread?.name || "Conversation";
  const detailsAvatarUrl = conversation?.avatar_path ? resolveAvatarUrl(conversation.avatar_path) : null;
  const detailsOnline = isGroupConversation ? false : counterpartOnline;

  const canEditGroupName = useMemo(() => {
    if (!conversation?.participants || currentUserId === null) {
      return false;
    }

    const me = conversation.participants.find(
      (item) => Number(item.user_id) === Number(currentUserId)
    );
    return me?.role === "owner";
  }, [conversation?.participants, currentUserId]);

  const canEditGroupMembers = isGroupConversation && canEditGroupName;

  const groupMembers = useMemo(() => {
    if (!conversation?.participants) {
      return [];
    }

    return conversation.participants
      .filter((item) => item.user)
      .map((item) => ({
        id: item.user_id,
        name: item.user?.name ?? "User",
        role: item.role,
      }));
  }, [conversation?.participants]);

  const existingMemberIds = useMemo(() => new Set(groupMembers.map((member) => member.id)), [groupMembers]);

  const filteredMemberDirectory = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    return memberDirectory.filter((user) => {
      if (existingMemberIds.has(user.id)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return user.name.toLowerCase().includes(query);
    });
  }, [existingMemberIds, memberDirectory, memberSearch]);

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

  const allMediaPhotos = useMemo(() => {
    const collected: { url: string; name: string }[] = [];

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      const attachments = message.attachments ?? [];
      attachments.forEach((attachment) => {
        const type = attachment.attachment_type as string;
        const isImageType = type === "image";
        const isImageMime = (attachment.mime_type ?? "").startsWith("image/");
        if (!isImageType && !isImageMime) {
          return;
        }

        const url = resolveAttachmentUrl(attachment);
        if (!url) {
          return;
        }

        const name = attachment.original_name ?? "Image";
        collected.push({ url, name });
      });
    }

    return collected;
  }, [messages]);

  const mediaPhotos = useMemo(() => {
    return allMediaPhotos.slice(0, 6);
  }, [allMediaPhotos]);

  const latestOwnMessageId = useMemo(() => {
    if (currentUserId === null) {
      return null;
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (Number(candidate.sender_id) !== Number(currentUserId)) {
        continue;
      }

      return String(candidate.id);
    }

    return null;
  }, [currentUserId, messages]);

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

  useEffect(() => {
    if (!conversation) {
      return;
    }

    if (!isGroupConversation) {
      setGroupNameDraft("");
      setGroupNameEditing(false);
      setGroupNameError(null);
      return;
    }

    setGroupNameDraft(conversation.title?.trim() || "");
    setGroupNameError(null);
    setGroupDescriptionDraft(conversation.description?.trim() || "");
    setGroupDescriptionError(null);
  }, [conversation, isGroupConversation]);

  useEffect(() => {
    if (!conversation?.id) {
      return;
    }

    dispatch(
      patchThread({
        id: String(conversation.id),
        changes: {
          name: conversation.title?.trim() || detailsDisplayName,
          avatarPath: conversation.avatar_path ?? null,
        },
      })
    );
  }, [conversation?.avatar_path, conversation?.id, conversation?.title, detailsDisplayName, dispatch]);

  const presenceSubtitle = useMemo(() => {
    if (isBlockedByOther) {
      return "You can't send messages yet";
    }

    if (isBlockedByMe) {
      return "Blocked";
    }

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
  }, [activeThread?.handle, counterpart?.email, isBlockedByMe, isBlockedByOther, otherParticipants, presenceByUserId, serverClockOffsetMs, typingIndicatorText]);

  const presenceSubtitleClassName =
    typingIndicatorText || presenceSubtitle.toLowerCase().includes("online") ? "text-emerald-600" : "text-slate-500";
  const isPresenceOnline = Boolean(typingIndicatorText) || presenceSubtitle.toLowerCase().includes("online");
  const canStartCall = canShowCallLauncher({
    conversationType: conversation?.type,
    participantState: participant?.participant_state,
    participantArchivedAt: participant?.archived_at,
    counterpartParticipantState: counterpartParticipant?.participant_state,
    counterpartArchivedAt: counterpartParticipant?.archived_at,
    counterpartHiddenAt: counterpartParticipant?.hidden_at,
    isBlockedConversation,
    callStatus,
  });


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

      if (message.message_type === "system") {
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
      dispatch(
        patchThread({
          id: threadId,
          changes: {
            unread: 0,
          },
        })
      );
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

  useLayoutEffect(() => {
    if (!threadId || isLoading || messages.length === 0) {
      return;
    }

    if (lastAutoScrollThreadIdRef.current === threadId) {
      return;
    }

    lastAutoScrollThreadIdRef.current = threadId;
    requestAnimationFrame(() => {
      scrollToBottom("auto");
      hasInitialScrollRef.current = true;
      isNearBottomRef.current = true;
    });
  }, [isLoading, messages.length, scrollToBottom, threadId]);

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

    const handleAcceptedCallEvent = (payload: CallEventPayload) => {
      if (String(payload.conversation_id) !== threadId) {
        return;
      }

      const dedupeKey = `call.accepted:${threadId}:${payload.call.id}:${payload.sent_at ?? ""}`;
      if (!rememberRealtimeEvent(dedupeKey)) {
        return;
      }

      dispatch(setCurrentCall(payload.call));
      dispatch(setIncomingCallPayload(null));
      dispatch(setCallStatus("connecting"));

      if (currentUserId !== null && Number(payload.call.caller_id) === Number(currentUserId)) {
        void (async () => {
          try {
            const controller = await ensureCallControllerWithLocalStream(payload.call.id, payload.call.call_type);
            const offer = await controller.createOffer();
            await callSignaling.sendOffer(payload.call.id, offer);
          } catch {
            dispatch(setCallError("Failed to start WebRTC negotiation."));
          }
        })();
      }
    };

    const handleDeclinedCallEvent = (payload: CallEventPayload) => {
      if (String(payload.conversation_id) !== threadId) {
        return;
      }

      const dedupeKey = `call.declined:${threadId}:${payload.call.id}:${payload.sent_at ?? ""}`;
      if (!rememberRealtimeEvent(dedupeKey)) {
        return;
      }

      dispatch(setCurrentCall(payload.call));
      dispatch(setIncomingCallPayload(null));
      dispatch(setCallStatus("ended"));
      cleanupWebRtcRuntime();
    };

    const handleEndedCallEvent = (payload: CallEventPayload) => {
      if (String(payload.conversation_id) !== threadId) {
        return;
      }

      const dedupeKey = `call.ended:${threadId}:${payload.call.id}:${payload.sent_at ?? ""}`;
      if (!rememberRealtimeEvent(dedupeKey)) {
        return;
      }

      dispatch(setCurrentCall(payload.call));
      dispatch(setIncomingCallPayload(null));
      dispatch(setCallStatus("ended"));
      cleanupWebRtcRuntime();
    };

    const handleMissedCallEvent = (payload: CallMissedEventPayload) => {
      if (String(payload.conversation_id) !== threadId) {
        return;
      }

      const dedupeKey = `call.missed:${threadId}:${payload.call.id}:${payload.sent_at ?? ""}`;
      if (!rememberRealtimeEvent(dedupeKey)) {
        return;
      }

      dispatch(setCurrentCall(payload.call));
      dispatch(setIncomingCallPayload(null));
      dispatch(setCallStatus("ended"));
      dispatch(setCallError("Missed call."));
      cleanupWebRtcRuntime();
    };

    const handleOfferEvent = (payload: WebRtcOfferSignalEvent) => {
      if (String(payload.conversation_id) !== threadId) {
        return;
      }

      if (currentUserId !== null && Number(payload.signal.to_user_id) !== Number(currentUserId)) {
        return;
      }

      void (async () => {
        try {
          const controller = await ensureCallControllerWithLocalStream(payload.call.id, payload.call.call_type);
          await controller.applyRemoteDescription(payload.signal);
          const answer = await controller.createAnswer();
          await callSignaling.sendAnswer(payload.call.id, answer);
        } catch {
          dispatch(setCallError("Failed to process incoming WebRTC offer."));
        }
      })();
    };

    const handleAnswerEvent = (payload: WebRtcAnswerSignalEvent) => {
      if (String(payload.conversation_id) !== threadId) {
        return;
      }

      if (currentUserId !== null && Number(payload.signal.to_user_id) !== Number(currentUserId)) {
        return;
      }

      void (async () => {
        try {
          if (!webRtcControllerRef.current) {
            return;
          }

          await webRtcControllerRef.current.applyRemoteDescription(payload.signal);
        } catch {
          dispatch(setCallError("Failed to apply WebRTC answer."));
        }
      })();
    };

    const handleIceCandidateEvent = (payload: WebRtcIceCandidateSignalEvent) => {
      if (String(payload.conversation_id) !== threadId) {
        return;
      }

      if (currentUserId !== null && Number(payload.signal.to_user_id) !== Number(currentUserId)) {
        return;
      }

      if (!webRtcControllerRef.current) {
        pendingIceCandidatesRef.current.push(payload.signal);
        return;
      }

      void webRtcControllerRef.current.addIceCandidate(payload.signal).catch(() => {
        dispatch(setCallError("Failed to apply ICE candidate."));
      });
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
        clearCallReconnectState();
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

            if (activeCallIdRef.current) {
              const callResponse = await callSignaling.showCall(activeCallIdRef.current);
              dispatch(setCurrentCall(callResponse.data));

              if (callResponse.data.status === "ended" || callResponse.data.status === "declined" || callResponse.data.status === "missed") {
                cleanupCallState();
                return;
              }

              if (callResponse.data.status === "accepted") {
                dispatch(setCallStatus("active"));
              }
            }
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
      setConversationData((previous) => {
        if (!previous?.conversation.participants) {
          return previous;
        }

        return {
          ...previous,
          conversation: {
            ...previous.conversation,
            participants: previous.conversation.participants.map((item) =>
              Number(item.user_id) === Number(payload.user_id)
                ? {
                    ...item,
                    last_read_message_id: payload.last_read_message_id,
                    last_read_at: payload.read_at,
                  }
                : item
            ),
          },
        };
      });
    });

    channel.listen(".chat.conversation.request.updated", (payload: ChatRequestUpdatedEvent) => {
      if (String(payload.conversation_id) !== threadId) {
        return;
      }

      void refreshThreads().catch(() => undefined);
      void refreshConversation().catch(() => undefined);
    });

    channel.listen(
      ".chat.conversation.updated",
      (payload: {
        conversation_id: number | string;
        changes?: {
          title?: string | null;
          description?: string | null;
          avatar_path?: string | null;
          participants_updated?: boolean;
        };
      }) => {
        if (String(payload.conversation_id) !== threadId) {
          return;
        }

        if (
          payload.changes?.title ||
          Object.prototype.hasOwnProperty.call(payload.changes ?? {}, "description") ||
          Object.prototype.hasOwnProperty.call(payload.changes ?? {}, "avatar_path")
        ) {
          setConversationData((previous) => {
            if (!previous) {
              return previous;
            }

            return {
              ...previous,
              conversation: {
                ...previous.conversation,
                title: payload.changes?.title ?? previous.conversation.title,
                description: Object.prototype.hasOwnProperty.call(payload.changes ?? {}, "description")
                  ? payload.changes?.description ?? null
                  : previous.conversation.description,
                avatar_path: Object.prototype.hasOwnProperty.call(payload.changes ?? {}, "avatar_path")
                  ? payload.changes?.avatar_path ?? null
                  : previous.conversation.avatar_path,
              },
            };
          });

          if (payload.changes?.title) {
            dispatch(
              patchThread({
                id: threadId,
                changes: {
                  name: payload.changes.title,
                },
              })
            );
          }
        }

        if (payload.changes?.participants_updated) {
          void refreshConversation().catch(() => undefined);
        }
      }
    );

    channel.listen(".call.accepted", handleAcceptedCallEvent);
    channel.listen(".call.declined", handleDeclinedCallEvent);
    channel.listen(".call.ended", handleEndedCallEvent);
    channel.listen(".call.missed", handleMissedCallEvent);
    channel.listen(".webrtc.offer", handleOfferEvent);
    channel.listen(".webrtc.answer", handleAnswerEvent);
    channel.listen(".webrtc.ice-candidate", handleIceCandidateEvent);

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
      userChannel.listen(".call.accepted", handleAcceptedCallEvent);
      userChannel.listen(".call.declined", handleDeclinedCallEvent);
      userChannel.listen(".call.ended", handleEndedCallEvent);
      userChannel.listen(".call.missed", handleMissedCallEvent);
      userChannel.listen(".webrtc.offer", handleOfferEvent);
      userChannel.listen(".webrtc.answer", handleAnswerEvent);
      userChannel.listen(".webrtc.ice-candidate", handleIceCandidateEvent);

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

    if (isRecording) {
      setSendError("Finish recording before sending.");
      return;
    }

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
    const resolveAttachmentMessageType = (attachments: AttachmentPayload[]) => {
      if (attachments.length === 0) {
        return "text";
      }

      const allImages = attachments.every((item) => item.attachment_type === "image");
      if (allImages) {
        return "image";
      }

      const allVoice = attachments.every((item) => item.attachment_type === "voice");
      if (allVoice) {
        return "voice";
      }

      return "file";
    };

    const attachmentMessageType = hasAttachments ? resolveAttachmentMessageType(readyAttachments) : "text";
    const optimisticType = !body && hasAttachments ? attachmentMessageType : "text";
    const optimisticAttachments = hasAttachments
      ? readyAttachments.map((payload) =>
          mapAttachmentPayloadToAttachment(payload, `temp-${clientUid}`, currentUserId)
        )
      : [];
    const replyTo = replyingToMessage
      ? {
          id: replyingToMessage.id,
          conversation_id: replyingToMessage.conversation_id,
          sender_id: replyingToMessage.sender_id,
          message_type: replyingToMessage.message_type,
          body: replyingToMessage.body,
          created_at: replyingToMessage.created_at,
          sender: replyingToMessage.sender,
          reactions_total: replyingToMessage.reactions_total,
          reaction_aggregates: replyingToMessage.reaction_aggregates,
        }
      : null;
    const optimisticMessage: Message = {
      id: `temp-${clientUid}`,
      conversation_id: threadId,
      sender_id: currentUserId ?? 0,
      message_type: optimisticType,
      body: body || null,
      metadata: { optimistic: true },
      reply_to_message_id: replyingToMessage?.id ?? null,
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
      reply_to: replyTo,
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
      const messageType = body ? "text" : attachmentMessageType;
      const response = await sendMessage(threadId, {
        message_type: messageType,
        body: body || undefined,
        attachments: hasAttachments ? readyAttachments.map((attachment) => ({ upload_token: attachment.upload_token })) : undefined,
        reply_to_message_id: replyingToMessage?.id ?? undefined,
        client_uid: clientUid,
      });

      setMessages((previous) => upsertMessageByIdentity(previous, response.data));

      dispatch(
        patchThread({
          id: threadId,
          changes: {
            lastMessage: response.data.body?.trim() || `[${response.data.message_type ?? "text"}]`,
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
      setReplyingToMessage(null);
    } catch (error) {
      setMessages((previous) => previous.filter((message) => message.client_uid !== clientUid));
      setDraft(body);

      const axiosError = error as AxiosError<ApiValidationErrorPayload>;
      const status = axiosError.response?.status;

      if (status === 401) {
        setSendError("Session expired. Please sign in again to continue sending messages.");
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

      if (shouldArchive) {
        router.push("/masseges");
      }
    } catch {
      setArchiveActionError("Failed to update archive status.");
    } finally {
      setArchiveActionLoading(false);
    }
  };

  const handleConfirmMute = async () => {
    if (!threadId || !participant) {
      return;
    }

    const preset = MUTE_PRESETS.find((item) => item.id === selectedMutePresetId) ?? MUTE_PRESETS[0];

    setMuteActionError(null);
    setMuteActionLoading(true);

    try {
      const response = await muteConversation(threadId, {
        muted_until: buildMuteUntilIso(preset.durationMs),
      });

      setConversationData((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          participant: {
            ...previous.participant,
            muted_until: response.muted_until,
          },
        };
      });

      setMuteModalOpen(false);
    } catch {
      setMuteActionError("Failed to mute notifications.");
    } finally {
      setMuteActionLoading(false);
    }
  };

  const handleMuteToggle = async () => {
    if (!threadId || !participant) {
      return;
    }

    if (!isMutedThread) {
      setMuteActionError(null);
      setSelectedMutePresetId("15m");
      setMuteModalOpen(true);
      return;
    }

    setMuteActionError(null);
    setMuteActionLoading(true);

    try {
      const response = await unmuteConversation(threadId);

      setConversationData((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          participant: {
            ...previous.participant,
            muted_until: response.muted_until,
          },
        };
      });
    } catch {
      setMuteActionError("Failed to update notification mute status.");
    } finally {
      setMuteActionLoading(false);
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

  const cancelGroupNameEdit = () => {
    setGroupNameEditing(false);
    setGroupNameError(null);
    setGroupNameDraft(conversation?.title?.trim() || "");
  };

  const cancelGroupDescriptionEdit = () => {
    setGroupDescriptionEditing(false);
    setGroupDescriptionError(null);
    setGroupDescriptionDraft(conversation?.description?.trim() || "");
  };

  const handleGroupNameSave = async () => {
    if (!threadId || !conversation || !isGroupConversation || !canEditGroupName) {
      return;
    }

    const nextTitle = groupNameDraft.trim();
    if (!nextTitle) {
      setGroupNameError("Group name is required.");
      return;
    }

    setGroupNameSaving(true);
    setGroupNameError(null);

    try {
      const response = await updateConversation(threadId, { title: nextTitle });
      setConversationData((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          conversation: {
            ...previous.conversation,
            title: response.conversation.title,
          },
        };
      });
      dispatch(
        patchThread({
          id: threadId,
          changes: {
            name: response.conversation.title ?? nextTitle,
          },
        })
      );
      setGroupNameEditing(false);
    } catch (error) {
      const axiosError = error as AxiosError<ApiValidationErrorPayload>;
      const firstError = Object.values(axiosError.response?.data?.errors ?? {})[0]?.[0];
      setGroupNameError(firstError || axiosError.response?.data?.message || "Failed to update group name.");
    } finally {
      setGroupNameSaving(false);
    }
  };

  const handleGroupDescriptionSave = async () => {
    if (!threadId || !conversation || !isGroupConversation || !canEditGroupName) {
      return;
    }

    setGroupDescriptionSaving(true);
    setGroupDescriptionError(null);

    try {
      const response = await updateConversation(threadId, {
        description: groupDescriptionDraft.trim() || null,
      });

      setConversationData((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          conversation: {
            ...previous.conversation,
            description: response.conversation.description ?? null,
          },
        };
      });

      setGroupDescriptionEditing(false);
    } catch (error) {
      const axiosError = error as AxiosError<ApiValidationErrorPayload>;
      const firstError = Object.values(axiosError.response?.data?.errors ?? {})[0]?.[0];
      setGroupDescriptionError(firstError || axiosError.response?.data?.message || "Failed to update group description.");
    } finally {
      setGroupDescriptionSaving(false);
    }
  };

  const handleGroupAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!nextFile || !threadId || !conversation || !isGroupConversation || !canEditGroupName) {
      return;
    }

    setGroupAvatarSaving(true);
    setGroupAvatarError(null);

    try {
      const response = await updateConversation(threadId, { avatar: nextFile });

      setConversationData((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          conversation: {
            ...previous.conversation,
            avatar_path: response.conversation.avatar_path ?? null,
          },
        };
      });
    } catch (error) {
      const axiosError = error as AxiosError<ApiValidationErrorPayload>;
      const firstError = Object.values(axiosError.response?.data?.errors ?? {})[0]?.[0];
      setGroupAvatarError(firstError || axiosError.response?.data?.message || "Failed to update group photo.");
    } finally {
      setGroupAvatarSaving(false);
    }
  };

  const openMembersModal = async () => {
    if (!isGroupConversation) {
      return;
    }

    setMembersModalOpen(true);
    setMemberSearch("");
    setMemberSelection(new Set());
    setMemberError(null);
    setMemberActionError(null);
    setMemberLoading(true);

    try {
      const users = await listChatUsers({ limit: 500 });
      setMemberDirectory(users);
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setMemberError(axiosError.response?.data?.message || "Failed to load users.");
      setMemberDirectory([]);
    } finally {
      setMemberLoading(false);
    }
  };

  const closeMembersModal = () => {
    setMembersModalOpen(false);
    setMemberSearch("");
    setMemberSelection(new Set());
    setMemberError(null);
    setMemberActionError(null);
  };

  const toggleMemberSelection = (userId: number) => {
    setMemberSelection((previous) => {
      const next = new Set(previous);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleAddMembers = async () => {
    if (!threadId || !isGroupConversation || !canEditGroupMembers) {
      return;
    }

    const ids = Array.from(memberSelection);
    if (ids.length === 0) {
      setMemberActionError("Select at least one user.");
      return;
    }

    setMemberSaving(true);
    setMemberActionError(null);

    try {
      await addConversationParticipants(threadId, { participant_ids: ids });
      await refreshConversation();
      await refreshThreads();
      closeMembersModal();
    } catch (error) {
      const axiosError = error as AxiosError<ApiValidationErrorPayload>;
      const firstError = Object.values(axiosError.response?.data?.errors ?? {})[0]?.[0];
      setMemberActionError(firstError || axiosError.response?.data?.message || "Failed to add members.");
    } finally {
      setMemberSaving(false);
    }
  };

  const handleRemoveMember = async (userId: number) => {
    if (!threadId || !isGroupConversation || !canEditGroupMembers) {
      return;
    }

    setMemberActionError(null);

    try {
      await removeConversationParticipant(threadId, userId);
      await refreshConversation();
      await refreshThreads();
    } catch (error) {
      const axiosError = error as AxiosError<ApiValidationErrorPayload>;
      const firstError = Object.values(axiosError.response?.data?.errors ?? {})[0]?.[0];
      setMemberActionError(firstError || axiosError.response?.data?.message || "Failed to remove member.");
    }
  };

  const handleTransferOwnership = async (userId: number) => {
    if (!threadId || !isGroupConversation || !canEditGroupMembers) {
      return;
    }

    setMemberActionError(null);
    setMemberRoleUpdatingId(userId);

    try {
      await updateConversationParticipantRole(threadId, userId, { role: "owner" });
      await refreshConversation();
      await refreshThreads();
    } catch (error) {
      const axiosError = error as AxiosError<ApiValidationErrorPayload>;
      const firstError = Object.values(axiosError.response?.data?.errors ?? {})[0]?.[0];
      setMemberActionError(firstError || axiosError.response?.data?.message || "Failed to transfer ownership.");
    } finally {
      setMemberRoleUpdatingId(null);
    }
  };

  const handleLeaveGroup = async () => {
    if (!threadId || !isGroupConversation || participant?.participant_state !== "accepted") {
      return;
    }

    setLeaveGroupError(null);
    setLeaveGroupLoading(true);

    try {
      await leaveConversation(threadId);
      await refreshThreads();
      router.push("/masseges");
    } catch (error) {
      const axiosError = error as AxiosError<ApiValidationErrorPayload>;
      const firstError = Object.values(axiosError.response?.data?.errors ?? {})[0]?.[0];
      setLeaveGroupError(firstError || axiosError.response?.data?.message || "Failed to leave group.");
    } finally {
      setLeaveGroupLoading(false);
    }
  };

  const handleBlockConversation = async () => {
    if (!threadId || isGroupConversation) {
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Block ${detailsDisplayName}? You won't see this conversation in your inbox anymore.`);
      if (!confirmed) {
        return;
      }
    }

    setBlockActionLoading(true);
    setBlockActionError(null);

    try {
      await blockConversation(threadId);
      await refreshThreads();
      await refreshConversation();
    } catch (error) {
      const axiosError = error as AxiosError<ApiValidationErrorPayload>;
      const firstError = Object.values(axiosError.response?.data?.errors ?? {})[0]?.[0];
      setBlockActionError(firstError || axiosError.response?.data?.message || "Failed to block this user.");
    } finally {
      setBlockActionLoading(false);
    }
  };

  const handleUnblockConversation = async () => {
    if (!threadId || isGroupConversation) {
      return;
    }

    setBlockActionLoading(true);
    setBlockActionError(null);

    try {
      await unblockConversation(threadId);
      dispatch(
        patchThread({
          id: threadId,
          changes: {
            archivedAt: null,
            isBlocked: false,
          },
        })
      );
      setFilter("inbox");
      await refreshThreads();
      await refreshConversation();
    } catch (error) {
      const axiosError = error as AxiosError<ApiValidationErrorPayload>;
      const firstError = Object.values(axiosError.response?.data?.errors ?? {})[0]?.[0];
      setBlockActionError(firstError || axiosError.response?.data?.message || "Failed to unblock this user.");
    } finally {
      setBlockActionLoading(false);
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

  const startReplyingToMessage = (message: Message) => {
    setEditingMessageId(null);
    setEditingError(null);
    setReplyingToMessage(message);

    requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  };

  const cancelReplyingToMessage = () => {
    setReplyingToMessage(null);
  };

  const startEditingMessage = (message: Message) => {
    const body = message.body?.trim() ?? "";

    if (body === "") {
      return;
    }

    setMessageActionError(null);
    setReplyingToMessage(null);
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
    setImageViewer({ url, name, mode: "single" });
  };

  const openImageGallery = (list: { url: string; name: string }[], index: number) => {
    if (list.length === 0) {
      return;
    }

    const clampedIndex = Math.max(0, Math.min(index, list.length - 1));
    const target = list[clampedIndex];
    setImageViewer({ url: target.url, name: target.name, mode: "gallery", list, index: clampedIndex });
  };

  const closeImageViewer = () => {
    setImageViewer(null);
  };

  const goToPreviousImage = useCallback(() => {
    setImageViewer((current) => {
      if (!current || current.mode !== "gallery" || !current.list || current.list.length === 0) {
        return current;
      }

      const currentIndex = current.index ?? 0;
      const nextIndex = Math.max(0, currentIndex - 1);
      const target = current.list[nextIndex];
      return {
        ...current,
        url: target.url,
        name: target.name,
        index: nextIndex,
      };
    });
  }, []);

  const goToNextImage = useCallback(() => {
    setImageViewer((current) => {
      if (!current || current.mode !== "gallery" || !current.list || current.list.length === 0) {
        return current;
      }

      const currentIndex = current.index ?? 0;
      const nextIndex = Math.min(current.list.length - 1, currentIndex + 1);
      const target = current.list[nextIndex];
      return {
        ...current,
        url: target.url,
        name: target.name,
        index: nextIndex,
      };
    });
  }, []);

  useEffect(() => {
    if (!imageViewer || imageViewer.mode !== "gallery") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPreviousImage();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextImage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [goToNextImage, goToPreviousImage, imageViewer]);

  useEffect(() => {
    if (!callMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (callMenuRef.current && !callMenuRef.current.contains(event.target as Node)) {
        setCallMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [callMenuOpen]);

  useEffect(() => {
    if (activeCallLocalVideoRef.current) {
      activeCallLocalVideoRef.current.srcObject = callLocalStream ?? null;
    }
  }, [callLocalStream]);

  useEffect(() => {
    if (activeCallRemoteVideoRef.current) {
      activeCallRemoteVideoRef.current.srcObject = callRemoteStream ?? null;
    }
  }, [callRemoteStream]);

  const closeRemoveModal = () => {
    setRemoveModalMessage(null);
    setRemoveModalLoading(false);
    setRemoveModalError(null);
    setRemoveModalMode("for_you");
  };

  const cleanupWebRtcRuntime = useCallback(() => {
    if (webRtcControllerRef.current) {
      webRtcControllerRef.current.close();
      webRtcControllerRef.current = null;
    }

    if (missedCallTimeoutRef.current) {
      clearTimeout(missedCallTimeoutRef.current);
      missedCallTimeoutRef.current = null;
    }

    if (callReconnectTimeoutRef.current) {
      clearTimeout(callReconnectTimeoutRef.current);
      callReconnectTimeoutRef.current = null;
    }

    if (callDurationIntervalRef.current) {
      clearInterval(callDurationIntervalRef.current);
      callDurationIntervalRef.current = null;
    }

    if (callQualityIntervalRef.current) {
      clearInterval(callQualityIntervalRef.current);
      callQualityIntervalRef.current = null;
    }

    pendingIceCandidatesRef.current = [];
    toneControllerRef.current?.stop();
    stopMediaStream(callLocalStream);
    stopMediaStream(callRemoteStream);
    dispatch(setLocalStream(null));
    dispatch(setRemoteStream(null));
    dispatch(setMuted(false));
    dispatch(setCameraOff(false));
    setCallDurationSeconds(0);
    setCallNetworkQuality("unavailable");
    setCallReconnectState("idle");
  }, [callLocalStream, callRemoteStream, dispatch]);

  const cleanupCallState = useCallback(() => {
    cleanupWebRtcRuntime();
    dispatch(resetCallState());
  }, [cleanupWebRtcRuntime, dispatch]);

  const playCallTone = useCallback((mode: "incoming" | "outgoing") => {
    if (!toneControllerRef.current) {
      toneControllerRef.current = createCallToneController();
    }

    toneControllerRef.current.play(mode);
  }, []);

  const stopCallTone = useCallback(() => {
    toneControllerRef.current?.stop();
  }, []);

  const clearCallReconnectState = useCallback(() => {
    if (callReconnectTimeoutRef.current) {
      clearTimeout(callReconnectTimeoutRef.current);
      callReconnectTimeoutRef.current = null;
    }

    setCallReconnectState("idle");
  }, []);

  const beginCallReconnect = useCallback(
    (failureMessage: string) => {
      setCallReconnectState("reconnecting");
      dispatch(setCallStatus("connecting"));

      if (callReconnectTimeoutRef.current) {
        clearTimeout(callReconnectTimeoutRef.current);
      }

      callReconnectTimeoutRef.current = setTimeout(() => {
        dispatch(setCallError(failureMessage));
        cleanupCallState();
      }, 15000);
    },
    [cleanupCallState, dispatch]
  );

  const createCallController = useCallback(
    (callId: number, localStream: MediaStream) => {
      if (webRtcControllerRef.current) {
        webRtcControllerRef.current.close();
      }

      const controller = createWebRtcConnection({
        localStream,
        onRemoteStream: (stream) => {
          dispatch(setRemoteStream(stream));
        },
        onIceCandidate: (candidate) => {
          void callSignaling.sendIceCandidate(callId, candidate).catch(() => {
            dispatch(setCallError("Failed to send ICE candidate."));
          });
        },
        onConnectionStateChange: (state) => {
          if (state === "connected") {
            clearCallReconnectState();
            dispatch(setCallStatus("active"));
            return;
          }

          if (state === "disconnected") {
            beginCallReconnect("Call connection could not be restored.");
            return;
          }

          if (state === "failed") {
            beginCallReconnect("Call connection failed.");
          }
        },
        onIceConnectionStateChange: (state) => {
          if (state === "disconnected") {
            beginCallReconnect("Call media path could not be restored.");
            return;
          }

          if (state === "checking") {
            setCallNetworkQuality("unavailable");
          }
        },
      });

      webRtcControllerRef.current = controller;
      dispatch(setLocalStream(localStream));
      dispatch(setRemoteStream(controller.getRemoteStream()));
      dispatch(setMuted(false));
      dispatch(setCameraOff(localStream.getVideoTracks().length === 0));

      if (pendingIceCandidatesRef.current.length > 0) {
        const queuedCandidates = [...pendingIceCandidatesRef.current];
        pendingIceCandidatesRef.current = [];
        queuedCandidates.forEach((candidate) => {
          void controller.addIceCandidate(candidate).catch(() => undefined);
        });
      }

      return controller;
    },
    [beginCallReconnect, clearCallReconnectState, dispatch]
  );

  const requestLocalCallStream = useCallback(async (callType: CallType): Promise<MediaStream> => {
    return callType === "video" ? requestVideoStream() : requestAudioStream();
  }, []);

  const ensureCallControllerWithLocalStream = useCallback(
    async (callId: number, callType: CallType): Promise<WebRtcConnectionController> => {
      if (webRtcControllerRef.current) {
        return webRtcControllerRef.current;
      }

      const localStream = await requestLocalCallStream(callType);
      return createCallController(callId, localStream);
    },
    [createCallController, requestLocalCallStream]
  );

  useEffect(() => {
    if (
      !currentCall ||
      callStatus !== "calling" ||
      currentCall.status !== "ringing" ||
      currentUserId === null ||
      Number(currentCall.caller_id) !== Number(currentUserId)
    ) {
      if (missedCallTimeoutRef.current) {
        clearTimeout(missedCallTimeoutRef.current);
        missedCallTimeoutRef.current = null;
      }
      return;
    }

    if (missedCallTimeoutRef.current) {
      clearTimeout(missedCallTimeoutRef.current);
    }

    missedCallTimeoutRef.current = setTimeout(() => {
      void callSignaling.missCall(currentCall.id).catch(() => undefined);
    }, 30000);

    return () => {
      if (missedCallTimeoutRef.current) {
        clearTimeout(missedCallTimeoutRef.current);
        missedCallTimeoutRef.current = null;
      }
    };
  }, [callStatus, currentCall, currentUserId]);

  useEffect(() => {
    activeCallIdRef.current =
      currentCall && callStatus !== "idle" && callStatus !== "ended" ? currentCall.id : null;
  }, [callStatus, currentCall]);

  useEffect(() => {
    if (callStatus === "calling") {
      playCallTone("outgoing");
      return;
    }

    stopCallTone();
  }, [callStatus, playCallTone, stopCallTone]);

  useEffect(() => {
    return () => {
      toneControllerRef.current?.close();
      toneControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!currentCall) {
      setCallDurationSeconds(0);
      return;
    }

    if (currentCall.duration_seconds !== null && (callStatus === "ended" || callStatus === "failed")) {
      setCallDurationSeconds(currentCall.duration_seconds);
      return;
    }

    const answeredAtMs = currentCall.answered_at ? new Date(currentCall.answered_at).getTime() : null;
    if (answeredAtMs === null || !Number.isFinite(answeredAtMs)) {
      setCallDurationSeconds(0);
      return;
    }

    if (callDurationIntervalRef.current) {
      clearInterval(callDurationIntervalRef.current);
      callDurationIntervalRef.current = null;
    }

    const tick = () => {
      setCallDurationSeconds(Math.max(0, Math.floor((Date.now() - answeredAtMs) / 1000)));
    };

    tick();

    if (callStatus === "active" || callStatus === "connecting") {
      callDurationIntervalRef.current = setInterval(tick, 1000);
    }

    return () => {
      if (callDurationIntervalRef.current) {
        clearInterval(callDurationIntervalRef.current);
        callDurationIntervalRef.current = null;
      }
    };
  }, [callStatus, currentCall]);

  useEffect(() => {
    const updateQuality = async () => {
      if (!webRtcControllerRef.current) {
        setCallNetworkQuality(callReconnectState === "reconnecting" ? "reconnecting" : "unavailable");
        return;
      }

      try {
        const peerConnection = webRtcControllerRef.current.getPeerConnection();
        const statsReport = await peerConnection.getStats();
        const sample = readCallQualitySampleFromStats(statsReport);

        setCallNetworkQuality(
          classifyCallNetworkQuality({
            ...sample,
            connectionState: peerConnection.connectionState,
            iceConnectionState: peerConnection.iceConnectionState,
            reconnecting: callReconnectState === "reconnecting",
          })
        );
      } catch {
        setCallNetworkQuality(callReconnectState === "reconnecting" ? "reconnecting" : "unavailable");
      }
    };

    if (callQualityIntervalRef.current) {
      clearInterval(callQualityIntervalRef.current);
      callQualityIntervalRef.current = null;
    }

    if (!currentCall || (callStatus !== "active" && callStatus !== "connecting")) {
      setCallNetworkQuality(callReconnectState === "reconnecting" ? "reconnecting" : "unavailable");
      return;
    }

    void updateQuality();
    callQualityIntervalRef.current = setInterval(() => {
      void updateQuality();
    }, 5000);

    return () => {
      if (callQualityIntervalRef.current) {
        clearInterval(callQualityIntervalRef.current);
        callQualityIntervalRef.current = null;
      }
    };
  }, [callReconnectState, callStatus, currentCall]);

  useEffect(() => {
    if (callCleanupThreadIdRef.current === threadId) {
      return;
    }

    callCleanupThreadIdRef.current = threadId;
    cleanupCallState();
  }, [cleanupCallState, threadId]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupWebRtcRuntime();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [cleanupWebRtcRuntime]);

  useEffect(() => {
    return () => {
      cleanupWebRtcRuntime();
    };
  }, [cleanupWebRtcRuntime]);

  useEffect(() => {
    if (callStatus !== "failed") {
      return;
    }

    cleanupWebRtcRuntime();
  }, [callStatus, cleanupWebRtcRuntime]);

  useEffect(() => {
    if (echoConnectionStatus !== "disconnected" && echoConnectionStatus !== "failed") {
      return;
    }

    if (!activeCallIdRef.current) {
      return;
    }

    beginCallReconnect("Realtime connection could not be restored.");
  }, [beginCallReconnect, echoConnectionStatus]);

  const handleStartCall = async (callType: CallType) => {
    if (!conversation || !canStartCall || callActionLoading) {
      return;
    }

    setCallMenuOpen(false);
    setCallActionLoading(callType);
    setCallActionError(null);
    dispatch(setCallError(null));

    try {
      const response = await callSignaling.startCall(conversation.id, { call_type: callType });
      dispatch(setCurrentCall(response.data));
      dispatch(setCallStatus("calling"));
    } catch (error) {
      const axiosError = error as AxiosError<ApiValidationErrorPayload>;
      const firstValidationError = axiosError.response?.data?.errors
        ? Object.values(axiosError.response.data.errors)[0]?.[0]
        : null;
      const message = firstValidationError || axiosError.response?.data?.message || `Failed to start ${callType} call.`;
      setCallActionError(message);
      dispatch(setCallError(message));
    } finally {
      setCallActionLoading(null);
    }
  };

  const handleToggleMuteCall = () => {
    const nextMuted = !isCallMuted;
    setAudioTracksEnabled(callLocalStream, !nextMuted);
    dispatch(setMuted(nextMuted));
  };

  const handleToggleCameraCall = () => {
    const nextCameraOff = !isCallCameraOff;
    setVideoTracksEnabled(callLocalStream, !nextCameraOff);
    dispatch(setCameraOff(nextCameraOff));
  };

  const handleEndActiveCall = async () => {
    if (!currentCall) {
      return;
    }

    try {
      await callSignaling.endCall(currentCall.id);
    } catch {
      // Keep local cleanup even if remote end request fails.
    } finally {
      cleanupCallState();
    }
  };

  const uploadDraftAttachment = async (
    conversationId: string,
    itemId: string,
    file: File,
    durationMs?: number | null
  ) => {
    try {
      const response = await uploadChatAttachment(conversationId, file, durationMs, (progress) => {
        setDraftAttachments((previous) =>
          previous.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  progress,
                }
              : item
          )
        );
      });
      setDraftAttachments((previous) =>
        previous.map((item) =>
          item.id === itemId
            ? {
                ...item,
                status: "ready",
                progress: 100,
                payload: {
                  ...response.data,
                  metadata: {
                    ...(response.data.metadata ?? {}),
                    local_preview_url: item.previewUrl,
                  },
                },
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
      const previewUrl = URL.createObjectURL(file);
      const id = `att-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      return {
        id,
        file,
        previewUrl,
        status: "uploading" as DraftAttachmentStatus,
        progress: 0,
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

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const stopAllVoicePlayback = useCallback(() => {
    audioRefMap.current.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    setPlayingVoiceId(null);
  }, []);

  useEffect(() => {
    return () => {
      stopAllVoicePlayback();
      audioRefMap.current.clear();
    };
  }, [stopAllVoicePlayback]);

  const playVoiceAttachment = useCallback(
    (attachmentId: string, url: string) => {
      const existing = audioRefMap.current.get(attachmentId);
      const audio =
        existing ??
        (() => {
          const created = new Audio(url);
          created.preload = "metadata";
          created.addEventListener("ended", () => {
            setPlayingVoiceId((current) => (current === attachmentId ? null : current));
          });
          audioRefMap.current.set(attachmentId, created);
          return created;
        })();

      if (audio.src !== url) {
        audio.src = url;
      }

      if (!audio.paused) {
        audio.pause();
        setPlayingVoiceId((current) => (current === attachmentId ? null : current));
        return;
      }

      audioRefMap.current.forEach((item, id) => {
        if (id !== attachmentId) {
          item.pause();
          item.currentTime = 0;
        }
      });

      audio.currentTime = 0;
      void audio.play().then(() => setPlayingVoiceId(attachmentId)).catch(() => undefined);
    },
    []
  );

  const cleanupRecordingStream = () => {
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }
  };

  const enqueueRecordedAttachment = (file: File, durationMs?: number | null) => {
    if (!threadId) {
      return;
    }

    setAttachmentError(null);
    const sanitizedDurationMs =
      typeof durationMs === "number" && Number.isFinite(durationMs)
        ? Math.max(0, Math.min(Math.round(durationMs), 3600000))
        : undefined;

    const id = `att-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const item: DraftAttachmentItem = {
      id,
      file,
      previewUrl: null,
      status: "uploading",
      progress: 0,
      error: null,
      payload: null,
    };

    setDraftAttachments((previous) => [...previous, item]);
    void uploadDraftAttachment(threadId, id, file, sanitizedDurationMs);
  };

  const getSupportedAudioMimeType = () => {
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
      return null;
    }

    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/mp4",
    ];

    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
  };

  const resolveAudioDurationMs = (file: File): Promise<number | null> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined") {
        resolve(null);
        return;
      }

      const audio = document.createElement("audio");
      const objectUrl = URL.createObjectURL(file);
      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
        audio.removeAttribute("src");
        audio.load();
      };

      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        cleanup();
        resolve(Number.isFinite(duration) ? duration * 1000 : null);
      };
      audio.onerror = () => {
        cleanup();
        resolve(null);
      };

      audio.src = objectUrl;
    });
  };

  const stopRecording = (action: "send" | "cancel") => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      setIsRecording(false);
      stopRecordingTimer();
      cleanupRecordingStream();
      recordingChunksRef.current = [];
      recordingActionRef.current = null;
      return;
    }

    recordingActionRef.current = action;

    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  const startRecording = async () => {
    if (isRecording || !canSendMessage || isLoading || editingLoading) {
      return;
    }

    setMessageActionError(null);
    setRecordingSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingActionRef.current = null;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const action = recordingActionRef.current;
        const chunks = recordingChunksRef.current;
        const finalMimeType = recorder.mimeType || mimeType || "audio/webm";

        stopRecordingTimer();
        setIsRecording(false);
        cleanupRecordingStream();
        mediaRecorderRef.current = null;
        recordingActionRef.current = null;
        recordingChunksRef.current = [];

        if (action !== "send" || chunks.length === 0) {
          return;
        }

        const blob = new Blob(chunks, { type: finalMimeType });
        const extension = finalMimeType.includes("ogg") ? "ogg" : finalMimeType.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: finalMimeType });
        void (async () => {
          const durationMs = await resolveAudioDurationMs(file);
          enqueueRecordedAttachment(file, durationMs);
        })();
      };

      recorder.start();
      setIsRecording(true);
      stopRecordingTimer();
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((previous) => {
          const next = previous + 1;

          if (next >= MAX_RECORDING_SECONDS) {
            stopRecordingTimer();
            stopRecording("send");
            return MAX_RECORDING_SECONDS;
          }

          return next;
        });
      }, 1000);
    } catch {
      setMessageActionError("Unable to access the microphone.");
      cleanupRecordingStream();
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
  const isMutedThread = isFutureIsoDate(participant?.muted_until);
  const canSendMessage =
    participant?.participant_state === "accepted" &&
    participant?.archived_at === null &&
    !isBlockedConversation;
  const removeModalCanEverywhere = removeModalMessage ? canRemoveEverywhereByPolicy(removeModalMessage) : false;
  const showActiveCallPanel = Boolean(currentCall) && callStatus !== "idle" && callStatus !== "incoming";
  const activeCallDisplayName =
    (currentUserId !== null && Number(currentCall?.caller_id) === Number(currentUserId)
      ? currentCall?.receiver?.name
      : currentCall?.caller?.name) ||
    activeThread?.name ||
    "Call";
  const activeCallStatusLabel =
    callReconnectState === "reconnecting"
      ? "Reconnecting..."
      : callStatus === "calling"
      ? currentCall?.status === "ringing"
        ? "Ringing..."
        : "Calling..."
      : callStatus === "connecting"
        ? "Connecting..."
        : callStatus === "active"
          ? "Live now"
          : currentCall?.status === "missed"
            ? "Missed call"
          : callStatus === "ended"
            ? "Call ended"
          : callStatus === "failed"
              ? "Call failed"
              : "In progress";
  const activeCallDurationLabel = formatCallDuration(callDurationSeconds);
  const activeCallNetworkLabel = getNetworkQualityLabel(callNetworkQuality);
  const activeCallNetworkToneClassName = getNetworkQualityToneClassName(callNetworkQuality);
  const showActiveCallDuration =
    Boolean(currentCall?.answered_at) ||
    callDurationSeconds > 0 ||
    (currentCall?.duration_seconds ?? 0) > 0;

  return (
    <ProtectedShell
      title={`${activeThread?.name ?? "Conversation"} Chat`}
      description={`${activeThread?.name ?? "Conversation"} conversation`}
      showPageHeader={false}
    >
      <MessengerLayout showInfo={showInfoPanel}>
          <MessengerThreadsSidebar
            threads={threads}
            filteredThreads={filteredThreads}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filter={filter}
            onFilterChange={setFilter}
            unreadCount={unreadCount}
            presenceByUserId={presenceByUserIdMap}
            isLoading={threadsLoading}
            errorMessage={threadsError}
            onRetry={() => void refreshThreads()}
            onOpenNewChat={openNewChatModal}
            newChatModalState={newChatModalState}
            activeThreadId={threadId}
          />

          <section className={`flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,#ffffff_0%,#f1f5f9_45%,#eaf2ff_100%)] ${showInfoPanel ? "border-r border-slate-200/80" : ""}`}>
            <MessengerHeader
              title={activeThread?.name ?? "Conversation"}
              subtitle={presenceSubtitle}
              subtitleClassName={presenceSubtitleClassName}
              avatarName={activeThread?.name ?? "Conversation"}
              avatarUrl={conversation?.avatar_path ? resolveAvatarUrl(conversation.avatar_path) : null}
              isOnline={isPresenceOnline}
              actions={
                <>
                  {canStartCall && (
                    <div ref={callMenuRef} className="relative">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="rounded-full text-slate-500"
                        aria-label="Start call"
                        aria-expanded={callMenuOpen}
                        onClick={() => setCallMenuOpen((previous) => !previous)}
                        disabled={Boolean(callActionLoading)}
                      >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 19h8a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </Button>
                      {callMenuOpen && (
                        <div className="absolute right-0 top-12 z-20 w-44 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => void handleStartCall("audio")}
                            disabled={Boolean(callActionLoading)}
                          >
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18a6 6 0 006-6V8a6 6 0 10-12 0v4a6 6 0 006 6zm0 0v3m-4 0h8" />
                              </svg>
                            </span>
                            <span>{callActionLoading === "audio" ? "Starting..." : "Audio call"}</span>
                          </button>
                          <button
                            type="button"
                            className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => void handleStartCall("video")}
                            disabled={Boolean(callActionLoading)}
                          >
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-sky-50 text-sky-600">
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 19h8a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                            </span>
                            <span>{callActionLoading === "video" ? "Starting..." : "Video call"}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
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

            {callActionError && (
              <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
                {callActionError}
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
                      const isTimelineSystemMessage = message.message_type === "system" && !isRemovedForEveryone;
                      const isStatusMessage = isRemovedForEveryone;
                      const canUseMessageActions =
                        participant?.participant_state === "accepted" &&
                        participant.archived_at === null &&
                        !isOptimistic &&
                        !isTimelineSystemMessage;
                      const canReactMessage = canUseMessageActions && !isRemovedForEveryone;
                      const canForwardMessage = canUseMessageActions && !isRemovedForEveryone;
                      const canReplyMessage = canUseMessageActions && !isRemovedForEveryone;
                      const canRemoveForYou = !isOptimistic && !isTimelineSystemMessage;
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
                        canReplyMessage || canForwardMessage || canReactMessage || canRemoveForYou || canRemoveEverywhere || canEditMessage;
                      const editedLabel = !isOptimistic && message.edited_at ? " \u00b7 edited" : "";
                      const replyPreviewText = getReplyPreviewText(message.reply_to);
                      const shouldShowReadStatus =
                        !isOptimistic &&
                        !isGroupConversation &&
                        isMine &&
                        !isTimelineSystemMessage &&
                        latestOwnMessageId === messageIdKey &&
                        counterpartParticipant?.participant_state === "accepted";
                      const messageNumericId = toNumericId(message.id);
                      const deliveryStatus = shouldShowReadStatus
                        ? counterpartReadMessageId !== null &&
                          messageNumericId !== null &&
                          counterpartReadMessageId >= messageNumericId
                          ? "Seen"
                          : "Delivered"
                        : null;
                      const messageText = getMessageDisplayText(message);
                      const attachmentsForTextCheck = message.attachments ?? [];
                      const shouldHideMessageText =
                        !message.body?.trim() &&
                        attachmentsForTextCheck.length > 0 &&
                        attachmentsForTextCheck.every((attachment) => {
                          const type = attachment.attachment_type as string;
                          const isAudioType = type === "voice" || type === "audio";
                          const isAudioMime = (attachment.mime_type ?? "").startsWith("audio/");
                          return isAudioType || isAudioMime;
                        });
                      const senderInitial =
                        message.sender?.name?.trim().charAt(0) ||
                        message.sender?.email?.trim().charAt(0) ||
                        counterpart?.name?.trim().charAt(0) ||
                        "?";

                      return (
                        <div
                          key={messageIdKey}
                          className={`group relative flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}
                        >
                          {!isMine && (
                            <div className="mb-6">
                              <UserAvatar
                                name={message.sender?.name ?? counterpart?.name ?? senderInitial}
                                size={32}
                                isOnline={Boolean(message.sender?.id && presenceByUserId[message.sender.id]?.isOnline)}
                              />
                            </div>
                          )}
                          <div className="relative max-w-[78%]">
                            {hasAnyAction && (
                              <div
                                className={`absolute top-1 z-20 ${isMine ? "left-0 -translate-x-full pr-2" : "right-0 translate-x-full pl-2"}`}
                              >
                                <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-1 py-1 shadow-sm opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                                  {canReplyMessage && (
                                    <button
                                      type="button"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
                                      onClick={() => startReplyingToMessage(message)}
                                      aria-label="Reply to message"
                                    >
                                      <CornerUpLeft className="h-4 w-4" />
                                    </button>
                                  )}
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
                              <MessageBubble
                                isMine={isMine}
                                isSystem={isTimelineSystemMessage}
                                isRemoved={isStatusMessage}
                                isTimelineEvent={isTimelineSystemMessage}
                                className={isTimelineSystemMessage || isStatusMessage ? "italic" : ""}
                              >
                              {message.reply_to && (
                                <div
                                  className={`mb-2 rounded-2xl border px-3 py-2 text-xs ${
                                    isMine
                                      ? "border-blue-300/70 bg-blue-500/20 text-blue-50"
                                      : "border-slate-200 bg-slate-100/90 text-slate-600"
                                  }`}
                                >
                                  <p className={`font-semibold ${isMine ? "text-white" : "text-slate-700"}`}>
                                    {message.reply_to.sender?.name?.trim() || "Reply"}
                                  </p>
                                  <p className="mt-0.5 line-clamp-2">{replyPreviewText}</p>
                                </div>
                              )}
                              {(message.forwarded_from_message_id || message.forwarded_snapshot) && (
                                <p
                                  className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${
                                    isTimelineSystemMessage ? "text-amber-700" : isMine ? "text-blue-100" : "text-slate-500"
                                  }`}
                                >
                                  Forwarded
                                </p>
                              )}

                              {!shouldHideMessageText && (
                                <p className={`text-sm leading-relaxed ${isRemovedForEveryone ? "italic opacity-85" : ""}`}>{messageText}</p>
                              )}

                              {message.attachments && message.attachments.length > 0 && (
                                <MessageAttachments
                                  attachments={message.attachments}
                                  isMine={isMine}
                                  playingVoiceId={playingVoiceId}
                                  resolveAttachmentUrl={resolveAttachmentUrl}
                                  onOpenImage={openImageViewer}
                                  onPlayVoice={playVoiceAttachment}
                                  formatFileSize={formatFileSize}
                                />
                              )}

                              <p
                                className={`mt-1 text-[11px] ${
                                  isTimelineSystemMessage || isStatusMessage
                                    ? "text-slate-400"
                                    : isMine
                                      ? "text-blue-100/80"
                                      : "text-slate-500"
                                }`}
                              >
                                {isOptimistic
                                  ? "Sending..."
                                  : `${
                                      formatClockTime(message.created_at)
                                    }${isTimelineSystemMessage ? "" : editedLabel}${
                                      deliveryStatus ? ` \u00b7 ${deliveryStatus}` : ""
                                    }`}
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
              {(archiveActionError || muteActionError) && (
                <p className="mb-2 text-xs text-rose-600">{archiveActionError || muteActionError}</p>
              )}
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
              {!canSendMessage && !isPendingThread && !isDeclinedThread && !isBlockedConversation && (
                <p className="mb-2 text-xs text-slate-500">You can send messages after the request is accepted.</p>
              )}
              {isBlockedByOther && (
                <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                  <p className="text-sm font-semibold text-slate-800">You can&apos;t send messages yet</p>
                  <p className="mt-1 text-xs text-slate-500">This person has blocked messages in this chat.</p>
                </div>
              )}
              {isBlockedByMe && (
                <div className="mb-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-center">
                  <p className="text-sm font-semibold text-slate-800">
                    You blocked messages and calls from {detailsDisplayName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    You can&apos;t message or call them in this chat, and you won&apos;t receive their messages or calls.
                  </p>
                  <div className="mt-4 space-y-2">
                    <Button
                      type="button"
                      variant="secondary"
                      fullWidth
                      className="rounded-2xl"
                      onClick={() => void handleUnblockConversation()}
                      disabled={blockActionLoading}
                    >
                      {blockActionLoading ? "Unblocking..." : "Unblock"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      fullWidth
                      className="rounded-2xl"
                      onClick={() => setBlockActionError("Please review the conversation settings or contact support if this looks wrong.")}
                      disabled={blockActionLoading}
                    >
                      Something&apos;s wrong
                    </Button>
                  </div>
                </div>
              )}

              {!isBlockedConversation && (
                <>
                  {editingMessageId && (
                    <div className="mb-2 flex items-center justify-between rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                      <span>Editing message</span>
                      <button type="button" className="text-blue-600 hover:text-blue-800" onClick={cancelEditingMessage}>
                        Cancel
                      </button>
                    </div>
                  )}

                  {replyingToMessage && (
                    <div className="mb-2 flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-700">
                          Replying to {replyingToMessage.sender?.name?.trim() || "message"}
                        </p>
                        <p className="mt-0.5 line-clamp-2">{getMessagePreviewText(replyingToMessage)}</p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 text-slate-500 hover:text-slate-700"
                        onClick={cancelReplyingToMessage}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {isRecording && (
                    <RecordingBar
                      recordingSeconds={recordingSeconds}
                      onCancel={() => stopRecording("cancel")}
                      onSend={() => stopRecording("send")}
                    />
                  )}

                  <DraftAttachmentsPreview
                    items={draftAttachments}
                    onRemove={removeDraftAttachment}
                    onOpenImage={openImageViewer}
                    formatFileSize={formatFileSize}
                  />

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
                      disabled={
                        !canSendMessage ||
                        isLoading ||
                        isRecording ||
                        hasAttachmentUploadsInProgress ||
                        Boolean(editingMessageId) ||
                        editingLoading
                      }
                      aria-label="Attach file"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-6.518 6.518a4 4 0 105.657 5.657l7.07-7.071a6 6 0 10-8.485-8.485l-7.07 7.071a8 8 0 1011.314 11.314l6.518-6.518" />
                      </svg>
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={`rounded-full ${isRecording ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                      onClick={startRecording}
                      disabled={!canSendMessage || isLoading || isRecording || Boolean(editingMessageId) || editingLoading}
                      aria-label="Record voice message"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M12 1a3 3 0 013 3v8a3 3 0 11-6 0V4a3 3 0 013-3zm-5 11a5 5 0 0010 0m-5 5v4m-3 0h6"
                        />
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
                      disabled={!canSendMessage || isLoading || editingLoading || isRecording}
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
                        isRecording ||
                        (draft.trim() === "" && draftAttachments.length === 0)
                      }
                    >
                      {editingLoading ? "Saving..." : isSending ? "Sending..." : editingMessageId ? "Save" : "Send"}
                    </Button>
                  </div>
                </>
              )}
            </form>
          </section>

          <MessengerInfoPanel show={showInfoPanel} title="Details">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
                <div className="mx-auto">
                  <UserAvatar
                    name={detailsDisplayName}
                    src={detailsAvatarUrl}
                    size={56}
                    isOnline={detailsOnline}
                    showStatus={!isGroupConversation}
                  />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-900">{detailsDisplayName}</p>
                {isGroupConversation ? (
                  <div className="mt-3 text-left">
                    {canEditGroupName && (
                      <div className="mb-4">
                        <input
                          ref={groupAvatarInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => void handleGroupAvatarChange(event)}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Group photo</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-full px-3 text-[11px]"
                            onClick={() => groupAvatarInputRef.current?.click()}
                            disabled={groupAvatarSaving}
                          >
                            {groupAvatarSaving ? "Uploading..." : detailsAvatarUrl ? "Change photo" : "Upload photo"}
                          </Button>
                        </div>
                        {groupAvatarError && <p className="mt-2 text-xs text-rose-600">{groupAvatarError}</p>}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Group name</p>
                      {!groupNameEditing && canEditGroupName && (
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                          onClick={() => setGroupNameEditing(true)}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {groupNameEditing && canEditGroupName ? (
                      <div className="mt-2 space-y-2">
                        <input
                          value={groupNameDraft}
                          onChange={(event) => setGroupNameDraft(event.target.value)}
                          placeholder="Group name"
                          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[color:var(--messenger-blue)]/30"
                          disabled={groupNameSaving}
                        />
                        {groupNameError && <p className="text-xs text-rose-600">{groupNameError}</p>}
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="rounded-full px-3 text-xs"
                            onClick={() => void handleGroupNameSave()}
                            disabled={groupNameSaving}
                          >
                            {groupNameSaving ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-full px-3 text-xs"
                            onClick={cancelGroupNameEdit}
                            disabled={groupNameSaving}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-slate-700">{conversation?.title || "Group chat"}</p>
                    )}
                  </div>
                ) : null}
              </div>

              {isGroupConversation && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Members ({groupMembers.length})
                    </p>
                    {canEditGroupMembers && (
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                        onClick={() => void openMembersModal()}
                      >
                        Add members
                      </button>
                    )}
                  </div>
                  <div className="mt-3 space-y-2">
                    {groupMembers.map((member) => {
                      const isOwner = member.role === "owner";
                      const showRemove =
                        canEditGroupMembers && !isOwner && Number(member.id) !== Number(currentUserId);
                      const showTransferOwnership =
                        canEditGroupMembers && !isOwner && Number(member.id) !== Number(currentUserId);
                      const isOnline = Boolean(presenceByUserId[member.id]?.isOnline);
                      const isTransferringOwnership = memberRoleUpdatingId === member.id;

                      return (
                        <div
                          key={`member-${member.id}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <UserAvatar name={member.name} size={32} isOnline={isOnline} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900">{member.name}</p>
                              <p className="text-[11px] text-slate-500">{isOwner ? "Owner" : "Member"}</p>
                            </div>
                          </div>
                          {(showTransferOwnership || showRemove) ? (
                            <div className="flex items-center gap-2">
                              {showTransferOwnership ? (
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() => void handleTransferOwnership(member.id)}
                                  disabled={Boolean(memberRoleUpdatingId)}
                                >
                                  {isTransferringOwnership ? "Saving..." : "Make owner"}
                                </button>
                              ) : null}
                              {showRemove ? (
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() => void handleRemoveMember(member.id)}
                                  disabled={Boolean(memberRoleUpdatingId)}
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  {memberActionError && <p className="mt-2 text-xs text-rose-600">{memberActionError}</p>}
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">About</p>
                  {isGroupConversation && canEditGroupName && !groupDescriptionEditing && (
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                      onClick={() => setGroupDescriptionEditing(true)}
                    >
                      Edit
                    </button>
                  )}
                </div>
                {isGroupConversation && canEditGroupName && groupDescriptionEditing ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={groupDescriptionDraft}
                      onChange={(event) => setGroupDescriptionDraft(event.target.value)}
                      placeholder="Write a short group description"
                      rows={4}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[color:var(--messenger-blue)]/30"
                      disabled={groupDescriptionSaving}
                    />
                    {groupDescriptionError && <p className="text-xs text-rose-600">{groupDescriptionError}</p>}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-full px-3 text-xs"
                        onClick={() => void handleGroupDescriptionSave()}
                        disabled={groupDescriptionSaving}
                      >
                        {groupDescriptionSaving ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-full px-3 text-xs"
                        onClick={cancelGroupDescriptionEdit}
                        disabled={groupDescriptionSaving}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    {conversation?.description || "Direct conversation thread."}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Media Photos</p>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      if (allMediaPhotos.length === 0) {
                        return;
                      }

                      openImageGallery(allMediaPhotos, 0);
                    }}
                    disabled={allMediaPhotos.length === 0}
                  >
                    See all
                  </button>
                </div>
                {mediaPhotos.length === 0 ? (
                  <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
                    No photos yet.
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {mediaPhotos.map((photo, index) => (
                      <button
                        key={`${photo.url}-${index}`}
                        type="button"
                        className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                        onClick={() => openImageGallery(mediaPhotos, index)}
                        aria-label={`Open ${photo.name}`}
                      >
                        <img src={photo.url} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  fullWidth
                  className="justify-start border-0 text-xs font-medium text-slate-700 shadow-none"
                  onClick={() => void handleArchiveToggle()}
                  disabled={archiveActionLoading || isLoading || !participant}
                >
                  {archiveActionLoading ? "Saving..." : isArchivedThread ? "Unarchive" : "Archive"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  fullWidth
                  className="justify-start border-0 text-xs font-medium text-slate-700 shadow-none"
                  onClick={() => void handleMuteToggle()}
                  disabled={muteActionLoading || isLoading || !participant}
                >
                  {muteActionLoading ? "Saving..." : isMutedThread ? "Unmute notifications" : "Mute notifications"}
                </Button>
                {isMutedThread && participant?.muted_until ? (
                  <p className="px-3 pt-1 text-[11px] text-slate-500">
                    Muted until {formatMuteUntil(participant.muted_until)}
                  </p>
                ) : null}
                {isGroupConversation && participant?.participant_state === "accepted" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    fullWidth
                    className="justify-start border-0 text-xs font-medium text-rose-600 shadow-none hover:bg-rose-50"
                    onClick={() => void handleLeaveGroup()}
                    disabled={leaveGroupLoading}
                  >
                    {leaveGroupLoading ? "Leaving..." : "Leave group"}
                  </Button>
                ) : null}
                {leaveGroupError ? <p className="px-3 pt-1 text-[11px] text-rose-600">{leaveGroupError}</p> : null}
                {!isGroupConversation ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    fullWidth
                    className="justify-start border-0 text-xs font-medium text-rose-600 shadow-none hover:bg-rose-50"
                    onClick={() => void (isBlockedByMe ? handleUnblockConversation() : handleBlockConversation())}
                    disabled={blockActionLoading}
                  >
                    {blockActionLoading ? (isBlockedByMe ? "Unblocking..." : "Blocking...") : isBlockedByMe ? "Unblock user" : "Block user"}
                  </Button>
                ) : null}
                {blockActionError ? <p className="px-3 pt-1 text-[11px] text-rose-600">{blockActionError}</p> : null}
              </div>
            </div>
          </MessengerInfoPanel>
      </MessengerLayout>

      {muteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            aria-label="Close mute modal"
            onClick={muteActionLoading ? undefined : () => setMuteModalOpen(false)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
              <h2 className="text-base font-semibold text-slate-900">Mute conversation</h2>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-100"
                aria-label="Close mute modal"
                onClick={muteActionLoading ? undefined : () => setMuteModalOpen(false)}
                disabled={muteActionLoading}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 pb-6 pt-5">
              <div className="space-y-2">
                {MUTE_PRESETS.map((preset) => {
                  const checked = selectedMutePresetId === preset.id;

                  return (
                    <label
                      key={preset.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                        checked
                          ? "border-blue-200 bg-blue-50/70"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="mute-duration"
                        value={preset.id}
                        checked={checked}
                        onChange={() => setSelectedMutePresetId(preset.id)}
                        disabled={muteActionLoading}
                        className="h-5 w-5 shrink-0 accent-blue-600"
                      />
                      <span className={`text-sm ${checked ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                        {preset.label}
                      </span>
                    </label>
                  );
                })}
              </div>

              <p className="mt-3 text-xs leading-5 text-slate-600">
                Chat windows will stay closed, and you won&apos;t get push notifications on your devices.
              </p>

              {muteActionError && <p className="mt-3 text-xs text-rose-600">{muteActionError}</p>}

              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMuteModalOpen(false)}
                  disabled={muteActionLoading}
                  className="h-10 rounded-xl border-slate-300 bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleConfirmMute()}
                  disabled={muteActionLoading}
                  className="h-10 rounded-xl border-0 bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  {muteActionLoading ? "Muting..." : "Mute"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                          <UserAvatar
                            name={label}
                            src={avatarUrl}
                            size={40}
                            isOnline={Boolean(target.counterpart?.id && presenceByUserIdMap[target.counterpart.id]?.isOnline)}
                            showStatus={target.type === "direct"}
                          />
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

      {membersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            aria-label="Close members modal"
            onClick={memberSaving ? undefined : closeMembersModal}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Add members</h2>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                onClick={memberSaving ? undefined : closeMembersModal}
                disabled={memberSaving}
                aria-label="Close members modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4">
              <input
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Search users"
                className="h-10 w-full rounded-full border border-slate-200 bg-slate-100 px-4 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[color:var(--messenger-blue)]/30"
                disabled={memberLoading || memberSaving}
              />

              <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {memberLoading ? (
                  <p className="text-sm text-slate-500">Loading users...</p>
                ) : memberError ? (
                  <p className="text-sm text-rose-600">{memberError}</p>
                ) : filteredMemberDirectory.length === 0 ? (
                  <p className="text-sm text-slate-500">No users available.</p>
                ) : (
                  filteredMemberDirectory.map((user) => {
                    const isSelected = memberSelection.has(user.id);
                    const isOnline = Boolean(presenceByUserIdMap[user.id]?.isOnline);

                    return (
                      <button
                        key={`member-select-${user.id}`}
                        type="button"
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                          isSelected ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                        onClick={() => toggleMemberSelection(user.id)}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <UserAvatar name={user.name} size={36} isOnline={isOnline} />
                          <span className="truncate text-sm font-medium text-slate-900">{user.name}</span>
                        </div>
                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                            isSelected ? "border-blue-500 bg-blue-500" : "border-slate-300"
                          }`}
                        >
                          {isSelected && (
                            <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {memberActionError && <p className="mt-3 text-xs text-rose-600">{memberActionError}</p>}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={closeMembersModal} disabled={memberSaving}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleAddMembers()}
                loading={memberSaving}
                disabled={memberSaving || memberSelection.size === 0}
              >
                Add
              </Button>
            </div>
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
            {imageViewer.mode === "gallery" && imageViewer.list && imageViewer.list.length > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
                  onClick={goToPreviousImage}
                  disabled={(imageViewer.index ?? 0) <= 0}
                  aria-label="Previous photo"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
                  onClick={goToNextImage}
                  disabled={(imageViewer.index ?? 0) >= (imageViewer.list.length - 1)}
                  aria-label="Next photo"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
            <div className="overflow-hidden rounded-2xl bg-slate-900 shadow-2xl">
              <img
                src={imageViewer.url}
                alt={imageViewer.name}
                className="max-h-[80vh] w-full object-contain"
              />
            </div>
            <p className="mt-3 text-center text-xs text-slate-200">{imageViewer.name}</p>
            {imageViewer.mode === "gallery" && imageViewer.list && imageViewer.list.length > 1 ? (
              <p className="mt-1 text-center text-[11px] text-slate-400">
                {(imageViewer.index ?? 0) + 1} / {imageViewer.list.length}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {showActiveCallPanel && currentCall && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {currentCall.call_type === "video" ? "Video call" : "Audio call"}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">{activeCallDisplayName}</h2>
                <p className="mt-1 text-sm text-slate-500">{activeCallStatusLabel}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {showActiveCallDuration && (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                      {activeCallDurationLabel}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                    <span className={`h-2 w-2 rounded-full ${activeCallNetworkToneClassName}`} />
                    {activeCallNetworkLabel}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="danger"
                className="rounded-full"
                onClick={() => void handleEndActiveCall()}
              >
                End call
              </Button>
            </div>

            {currentCall.call_type === "video" ? (
              <div className="grid gap-3 bg-slate-950 p-4 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-slate-900">
                  {callRemoteStream ? (
                    <video
                      ref={activeCallRemoteVideoRef}
                      autoPlay
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-center text-white">
                      <p className="text-sm font-medium">Waiting for remote video...</p>
                      <p className="mt-1 text-xs text-slate-300">Remote participant will appear here.</p>
                    </div>
                  )}
                  <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
                    {showActiveCallDuration && (
                      <span className="rounded-full bg-slate-950/70 px-3 py-1 text-xs font-medium text-white">
                        {activeCallDurationLabel}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-medium text-white">
                      <span className={`h-2 w-2 rounded-full ${activeCallNetworkToneClassName}`} />
                      {activeCallNetworkLabel}
                    </span>
                  </div>
                </div>
                <div className="flex min-h-[260px] flex-col gap-3">
                  <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-slate-900">
                    {callLocalStream && !isCallCameraOff ? (
                      <video
                        ref={activeCallLocalVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="text-center text-white">
                        <p className="text-sm font-medium">{isCallCameraOff ? "Camera is off" : "Camera preview"}</p>
                        <p className="mt-1 text-xs text-slate-300">
                          {callLocalStream ? "Turn camera on to preview video." : "Your local video will appear here."}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="rounded-3xl bg-white p-3">
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        type="button"
                        variant={isCallMuted ? "outline" : "secondary"}
                        className="rounded-full"
                        onClick={handleToggleMuteCall}
                      >
                        {isCallMuted ? "Unmute" : "Mute"}
                      </Button>
                      <Button
                        type="button"
                        variant={isCallCameraOff ? "outline" : "secondary"}
                        className="rounded-full"
                        onClick={handleToggleCameraCall}
                      >
                        {isCallCameraOff ? "Camera on" : "Camera off"}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        className="rounded-full"
                        onClick={() => void handleEndActiveCall()}
                      >
                        Hang up
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[radial-gradient(circle_at_top,#f8fafc_0%,#e2e8f0_100%)] px-5 py-10">
                <div className="mx-auto flex max-w-xl flex-col items-center text-center">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg">
                    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18a6 6 0 006-6V8a6 6 0 10-12 0v4a6 6 0 006 6zm0 0v3m-4 0h8" />
                    </svg>
                  </div>
                  <h3 className="mt-5 text-2xl font-semibold text-slate-900">{activeCallDisplayName}</h3>
                  <p className="mt-2 text-sm text-slate-500">{activeCallStatusLabel}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    {showActiveCallDuration && (
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600">
                        {activeCallDurationLabel}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600">
                      <span className={`h-2 w-2 rounded-full ${activeCallNetworkToneClassName}`} />
                      {activeCallNetworkLabel}
                    </span>
                  </div>
                  <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <Button
                      type="button"
                      variant={isCallMuted ? "outline" : "secondary"}
                      className="rounded-full"
                      onClick={handleToggleMuteCall}
                    >
                      {isCallMuted ? "Unmute microphone" : "Mute microphone"}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      className="rounded-full"
                      onClick={() => void handleEndActiveCall()}
                    >
                      End call
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
