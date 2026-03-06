"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { AxiosError } from "axios";
import ProtectedShell from "@/components/ProtectedShell";
import Button from "@/components/Button";
import {
  archiveConversation,
  listMessages,
  markConversationRead,
  respondToConversationRequest,
  sendMessage,
  showConversation,
  updateTyping,
  unarchiveConversation,
} from "@/lib/chat-api";
import { formatThreadRelativeTime, type ThreadItem } from "@/lib/chat-threads";
import { getEcho } from "@/lib/echo";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchInboxThreads, patchThread } from "@/store/chatSlice";
import type { Conversation, ConversationShowResponse, Message } from "@/types/chat";

type ThreadFilter = "all" | "unread" | "online";

interface ChatMessageSentEvent {
  conversation_id: number | string;
  message: Message;
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

type EchoConnectionStatus = "connected" | "disconnected" | "connecting" | "reconnecting" | "failed";

interface ApiValidationErrorPayload {
  message?: string;
  errors?: Record<string, string[]>;
}

const TYPING_IDLE_TIMEOUT_MS = 1500;
const TYPING_TRUE_THROTTLE_MS = 800;
// Presence contract: Typing > Online > Last seen.
const PRESENCE_ONLINE_WINDOW_MS = 90 * 1000;

const formatFileSize = (size: number): string => {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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

const formatLastSeenText = (rawDate: string | null | undefined): string | null => {
  if (!rawDate) {
    return null;
  }

  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const diffMs = Math.max(0, Date.now() - date.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return "1 min ago";
  }

  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)} min ago`;
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)} hr ago`;
  }

  return date.toLocaleDateString();
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

  const messageViewportRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    lastMarkedMessageIdRef.current = null;
    markReadInFlightRef.current = false;
    setTypingUserIds([]);
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

    const counterpartLastSeenAt = counterpart?.last_seen_at ?? null;

    if (counterpartLastSeenAt) {
      const counterpartLastSeenTs = new Date(counterpartLastSeenAt).getTime();
      if (Number.isFinite(counterpartLastSeenTs)) {
        const diffMs = Math.max(0, Date.now() - counterpartLastSeenTs);
        if (diffMs <= PRESENCE_ONLINE_WINDOW_MS) {
          return "Online";
        }
      }

      const lastSeenText = formatLastSeenText(counterpartLastSeenAt);
      if (lastSeenText) {
        return lastSeenText;
      }
    }

    return counterpart?.email ? `@${counterpart.email.split("@")[0]}` : activeThread?.handle ?? "-";
  }, [activeThread?.handle, counterpart?.email, counterpart?.last_seen_at, typingIndicatorText]);

  const presenceSubtitleClassName = typingIndicatorText || presenceSubtitle === "Online" ? "text-emerald-600" : "text-slate-500";

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

  const refreshThreads = useCallback(async () => {
    await dispatch(fetchInboxThreads());
  }, [dispatch]);

  const refreshConversation = useCallback(async () => {
    if (!threadId) {
      return;
    }

    const conversationResponse = await showConversation(threadId);
    setConversationData(conversationResponse);
  }, [threadId]);

  const refreshMessages = useCallback(async () => {
    if (!threadId) {
      return;
    }

    const messageResponse = await listMessages(threadId, { limit: 100 });
    setMessages(sortMessagesAscending(messageResponse.data));
  }, [threadId]);

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
  }, [refreshMessages, refreshThreads, threadId]);

  useEffect(() => {
    if (!messageViewportRef.current) {
      return;
    }

    messageViewportRef.current.scrollTo({
      top: messageViewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

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
    const unsubscribeConnection = echo.connector.onConnectionChange((status) => {
      setEchoConnectionStatus(status);

      if (status === "connected") {
        echoReconnectAttemptRef.current = 0;
        clearReconnectTimer();
        resetLocalTypingRuntimeState();
        clearRemoteTypingIndicators();

        void Promise.all([refreshConversation(), refreshThreads(), refreshMessages()]).catch(() => undefined);
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

    return () => {
      clearRemoteTypingIndicators();
      resetLocalTypingRuntimeState();
      unsubscribeConnection();
      clearReconnectTimer();
      echo.leave(`conversation.${threadId}`);
    };
  }, [clearRemoteTypingIndicators, currentUserId, dispatch, refreshConversation, refreshMessages, refreshThreads, resetLocalTypingRuntimeState, threadId]);

  const handleMessageScroll = () => {
    const viewport = messageViewportRef.current;
    if (!viewport) {
      return;
    }

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (distanceFromBottom <= 80) {
      void markThreadRead();
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
    if (!body || !threadId || participant?.participant_state !== "accepted") {
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
    const optimisticMessage: Message = {
      id: `temp-${clientUid}`,
      conversation_id: threadId,
      sender_id: currentUserId ?? 0,
      message_type: "text",
      body,
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
      attachments: [],
    };

    setMessages((previous) => upsertMessageByIdentity(previous, optimisticMessage));

    dispatch(
      patchThread({
        id: threadId,
        changes: {
          lastMessage: body,
          lastTime: "now",
        },
      })
    );

    try {
      const response = await sendMessage(threadId, {
        message_type: "text",
        body,
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

  const isPendingThread = participant?.participant_state === "pending";
  const isDeclinedThread = participant?.participant_state === "declined";
  const isArchivedThread = participant?.archived_at !== null;
  const canSendMessage = participant?.participant_state === "accepted";

  return (
    <ProtectedShell
      title={`${activeThread?.name ?? "Conversation"} Chat`}
      description={`${activeThread?.name ?? "Conversation"} conversation`}
      showPageHeader={false}
    >
      <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/90">
        <div
          className={`grid h-[calc(100dvh-7.8rem)] min-h-[560px] grid-cols-1 transition-[grid-template-columns] duration-300 ease-in-out ${
            showInfoPanel ? "lg:grid-cols-[320px_minmax(0,1fr)_280px]" : "lg:grid-cols-[320px_minmax(0,1fr)_0px]"
          }`}
        >
          <aside className="flex min-h-0 h-full flex-col border-r border-slate-200/80 bg-white/85">
            <div className="border-b border-slate-200/80 px-4 py-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Chats</h2>
                <Link href="/masseges" className="text-xs font-medium text-blue-600 hover:text-blue-700">
                  Inbox
                </Link>
              </div>

              <div className="relative">
                <svg className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search conversations"
                  className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1 border-b border-slate-200/80 p-2">
              <Button type="button" variant={filter === "all" ? "secondary" : "ghost"} size="sm" className="h-8 text-xs" onClick={() => setFilter("all")}>
                All
              </Button>
              <Button type="button" variant={filter === "unread" ? "secondary" : "ghost"} size="sm" className="h-8 text-xs" onClick={() => setFilter("unread")}>
                Unread {unreadCount > 0 ? `(${unreadCount})` : ""}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" disabled title="Online filter will use realtime presence later">
                Online ({onlineCount})
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filteredThreads.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
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
                        className={`flex items-start gap-3 rounded-xl px-2.5 py-2 transition ${
                          active ? "bg-blue-50 ring-1 ring-blue-100" : "hover:bg-slate-100"
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
                              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold text-white">
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
            </div>
          </aside>

          <section className={`flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] ${showInfoPanel ? "border-r border-slate-200/80" : ""}`}>
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/85 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-sm font-semibold text-white">
                  {activeThread?.name?.charAt(0) ?? "?"}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{activeThread?.name ?? "Conversation"}</p>
                  <p className={`text-xs ${presenceSubtitleClassName}`}>
                    {presenceSubtitle}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" className="text-slate-500" aria-label="Start call">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 19h8a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => void handleArchiveToggle()}
                  disabled={archiveActionLoading || isLoading || !participant}
                >
                  {archiveActionLoading ? "Saving..." : isArchivedThread ? "Unarchive" : "Archive"}
                </Button>
                <Button
                  type="button"
                  variant={showInfoPanel ? "outline" : "ghost"}
                  size="icon"
                  className="text-slate-500"
                  onClick={() => setShowInfoPanel((previous) => !previous)}
                  aria-label="Toggle contact info"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Button>
              </div>
            </div>

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

            <div ref={messageViewportRef} onScroll={handleMessageScroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
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
                  <div className="mx-auto w-fit rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
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
                      const messageText =
                        message.body?.trim() ||
                        (message.attachments && message.attachments.length > 0
                          ? "Sent attachment"
                          : `[${message.message_type}]`);

                      return (
                        <div key={String(message.id)} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[82%] rounded-2xl px-3 py-2 ${
                              isMine
                                ? "rounded-br-md bg-blue-600 text-white"
                                : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                            }`}
                          >
                            <p className="text-sm leading-relaxed">{messageText}</p>

                            {message.attachments && message.attachments.length > 0 && (
                              <div className="mt-2 space-y-1.5">
                                {message.attachments.map((attachment) => {
                                  const attachmentName = attachment.original_name || attachment.storage_path.split("/").pop() || "Attachment";

                                  return (
                                    <div
                                      key={String(attachment.id)}
                                      className={`flex items-center gap-2 rounded-lg px-2 py-1 ${isMine ? "bg-blue-500/30" : "bg-slate-100"}`}
                                    >
                                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded ${isMine ? "bg-blue-400/50 text-white" : "bg-white text-slate-600"}`}>
                                        {attachment.attachment_type === "image" ? (
                                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                          </svg>
                                        ) : (
                                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-6.518 6.518a4 4 0 105.657 5.657l7.07-7.071a6 6 0 10-8.485-8.485l-7.07 7.071a8 8 0 1011.314 11.314l6.518-6.518" />
                                          </svg>
                                        )}
                                      </span>
                                      <div className="min-w-0">
                                        <p className={`truncate text-xs font-medium ${isMine ? "text-white" : "text-slate-700"}`}>{attachmentName}</p>
                                        <p className={`text-[11px] ${isMine ? "text-blue-100" : "text-slate-500"}`}>{formatFileSize(attachment.size_bytes)}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            <p className={`mt-1 text-[11px] ${isMine ? "text-blue-100" : "text-slate-500"}`}>
                              {isOptimistic ? "Sending..." : formatClockTime(message.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>

            <form onSubmit={handleSend} className="border-t border-slate-200/80 bg-white px-4 py-3">
              {sendError && <p className="mb-2 text-xs text-rose-600">{sendError}</p>}
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
                    onClick={() => void handleRequestAction("accept")}
                  >
                    {requestActionLoading === "accept" ? "Accepting..." : "Accept"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={requestActionLoading !== null}
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
              {lastReadEvent && (
                <p className="mb-2 text-xs text-slate-500">
                  Seen {formatRelativeTime(lastReadEvent.read_at)} (message #{lastReadEvent.last_read_message_id})
                </p>
              )}

              <div className="flex items-center gap-2">
                <input
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
                  className="h-10 flex-1 rounded-full border border-slate-300 bg-white px-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  disabled={!canSendMessage || isLoading}
                />
                <Button
                  type="submit"
                  size="md"
                  className="rounded-full px-4"
                  disabled={!canSendMessage || isLoading || isSending || draft.trim() === ""}
                >
                  {isSending ? "Sending..." : "Send"}
                </Button>
              </div>
            </form>
          </section>

          <aside
            className={`hidden min-h-0 h-full flex-col overflow-hidden bg-white/85 transition-all duration-300 ease-in-out lg:flex ${
              showInfoPanel ? "opacity-100 translate-x-0" : "pointer-events-none opacity-0 translate-x-2"
            }`}
          >
            <div className="border-b border-slate-200/80 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact Info</p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
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
          </aside>
        </div>
      </div>
    </ProtectedShell>
  );
}
