import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AxiosError } from "axios";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchInboxThreads, patchThread } from "@/store/chatSlice";
import { getEcho } from "@/lib/echo";
import {
  listChatUsers,
  listConversations,
  startConversation,
  type ConversationListItem,
  type DirectoryUser,
} from "@/lib/chat-api";
import { mapConversationToThread, type ThreadItem } from "@/lib/chat-threads";
import { getPresenceStatus } from "@/lib/presence-api";

export type ThreadFilter = "inbox" | "unread" | "online" | "requests" | "archived" | "blocked" | "all";

export interface NewChatModalState {
  isOpen: boolean;
  error: string | null;
  isCreating: boolean;
  isLoading: boolean;
  usersError: string | null;
  users: DirectoryUser[];
  selectedUserIds: Set<number>;
  searchValue: string;
  groupNameValue: string;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onGroupNameChange: (value: string) => void;
  onToggleUser: (userId: number) => void;
  onSubmit: () => void;
}

interface UseMessengerThreadsOptions {
  activeThreadId?: string | null;
}

interface ChatMessageSentEvent {
  conversation_id: number | string;
  message: {
    id: number | string;
    sender_id?: number;
    body?: string | null;
    message_type?: string;
  };
}

interface ChatThreadUpdatedEvent {
  conversation_id: number | string;
  message: {
    id: number | string;
    sender_id?: number;
    body?: string | null;
    message_type?: string;
  };
  sent_at?: string;
}

interface ChatConversationRequestUpdatedEvent {
  conversation_id: number | string;
  acted_by_user_id: number;
  action: "accept" | "decline";
  sent_at?: string;
}

interface ChatConversationUpdatedEvent {
  conversation_id: number | string;
  changes: {
    title?: string | null;
  };
  sent_at?: string;
}

interface ChatConversationReadEvent {
  conversation_id: number | string;
  user_id: number;
  last_read_message_id: number;
  read_at: string;
}

interface ChatUserPresenceUpdatedEvent {
  user_id: number;
  is_online: boolean;
  last_seen_at: string | null;
  sent_at?: string;
}

export const useMessengerThreads = (options: UseMessengerThreadsOptions = {}) => {
  const { activeThreadId } = options;
  const router = useRouter();
  const dispatch = useAppDispatch();

  const threads = useAppSelector((state) => state.chat.threads);
  const isLoading = useAppSelector((state) => state.chat.loading);
  const errorMessage = useAppSelector((state) => state.chat.error);
  const currentUserId = useAppSelector((state) => state.auth.user?.id ?? null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<ThreadFilter>("inbox");

  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [newChatError, setNewChatError] = useState<string | null>(null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [chatUsers, setChatUsers] = useState<DirectoryUser[]>([]);
  const [chatUsersError, setChatUsersError] = useState<string | null>(null);
  const [chatUsersLoading, setChatUsersLoading] = useState(false);
  const [chatUserSearch, setChatUserSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [conversationDirectory, setConversationDirectory] = useState<ConversationListItem[]>([]);
  const [blockedConversationDirectory, setBlockedConversationDirectory] = useState<ConversationListItem[]>([]);
  const [presenceByUserId, setPresenceByUserId] = useState<Record<number, { isOnline: boolean; lastSeenAt: string | null }>>({});

  const threadsRef = useRef<ThreadItem[]>([]);
  const subscribedRef = useRef<Set<string>>(new Set());
  const userChannelRef = useRef<string | null>(null);
  const initialLoadRef = useRef(false);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  const refreshThreads = useCallback(async (options?: { silent?: boolean }) => {
    await dispatch(fetchInboxThreads(options));

    const [allResult, blockedResult] = await Promise.allSettled([
      listConversations({ filter: "all", per_page: 100 }),
      listConversations({ filter: "blocked", per_page: 100 }),
    ]);

    setConversationDirectory(allResult.status === "fulfilled" ? allResult.value.data : []);
    setBlockedConversationDirectory(blockedResult.status === "fulfilled" ? blockedResult.value.data : []);
  }, [dispatch]);

  useEffect(() => {
    if (initialLoadRef.current) {
      return;
    }

    initialLoadRef.current = true;
    void refreshThreads({ silent: threads.length > 0 });
  }, [refreshThreads, threads.length]);

  useEffect(() => {
    if (filter !== "blocked") {
      return;
    }

    void refreshThreads({ silent: true });
  }, [filter, refreshThreads]);

  const unreadCount = useMemo(() => threads.reduce((sum, thread) => sum + thread.unread, 0), [threads]);
  const directoryThreads = useMemo(
    () => conversationDirectory.map(mapConversationToThread),
    [conversationDirectory]
  );
  const blockedThreads = useMemo(
    () => blockedConversationDirectory.map(mapConversationToThread),
    [blockedConversationDirectory]
  );

  const filteredThreads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const selectedSourceThreads =
      filter === "blocked"
        ? blockedThreads
        : filter === "requests" || filter === "archived" || filter === "all"
          ? directoryThreads
          : threads;

    return selectedSourceThreads.filter((thread) => {
      const matchQuery =
        query === "" ||
        thread.name.toLowerCase().includes(query) ||
        thread.lastMessage.toLowerCase().includes(query) ||
        thread.handle.toLowerCase().includes(query);

      if (!matchQuery) {
        return false;
      }

      if (filter === "unread") {
        return thread.unread > 0;
      }

      if (filter === "online") {
        if (thread.participantState !== "accepted") {
          return false;
        }

        if (thread.type !== "direct" || !thread.counterpartId) {
          return false;
        }

        return Boolean(presenceByUserId[thread.counterpartId]?.isOnline);
      }

      if (filter === "requests") {
        return thread.participantState === "pending";
      }

      if (filter === "archived") {
        return thread.archivedAt !== null && !thread.isBlocked;
      }

      if (filter === "blocked") {
        return thread.isBlocked;
      }

      if (filter === "all") {
        return true;
      }

      return true;
    });
  }, [blockedThreads, directoryThreads, filter, presenceByUserId, searchQuery, threads]);

  const acceptedDirectCounterpartIds = useMemo(() => {
    const ids = threads
      .filter((thread) => thread.participantState === "accepted" && thread.type === "direct" && thread.counterpartId)
      .map((thread) => thread.counterpartId as number);

    return Array.from(new Set(ids));
  }, [threads]);

  useEffect(() => {
    if (acceptedDirectCounterpartIds.length === 0) {
      return;
    }

    let cancelled = false;

    getPresenceStatus(acceptedDirectCounterpartIds)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setPresenceByUserId((previous) => {
          const next = { ...previous };
          response.data.forEach((item) => {
            next[item.user_id] = {
              isOnline: item.is_online,
              lastSeenAt: item.last_seen_at,
            };
          });
          return next;
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [acceptedDirectCounterpartIds]);

  const loadChatUsers = useCallback(async () => {
    setChatUsersLoading(true);
    setChatUsersError(null);

    try {
      const users = await listChatUsers({ limit: 500 });
      setChatUsers(users);
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setChatUsersError(axiosError.response?.data?.message || "Failed to load users.");
      setChatUsers([]);
    } finally {
      setChatUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isNewChatOpen) {
      void loadChatUsers();
    }
  }, [isNewChatOpen, loadChatUsers]);

  useEffect(() => {
    if (!isNewChatOpen || chatUsers.length === 0) {
      return;
    }

    let cancelled = false;
    const ids = chatUsers.map((user) => user.id);

    getPresenceStatus(ids)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setPresenceByUserId((previous) => {
          const next = { ...previous };
          response.data.forEach((item) => {
            next[item.user_id] = {
              isOnline: item.is_online,
              lastSeenAt: item.last_seen_at,
            };
          });
          return next;
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [chatUsers, isNewChatOpen]);

  const filteredChatUsers = useMemo(() => {
    const query = chatUserSearch.trim().toLowerCase();
    if (!query) {
      return chatUsers;
    }

    return chatUsers.filter((user) => user.name.toLowerCase().includes(query));
  }, [chatUserSearch, chatUsers]);

  const selectedUserIdsSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);

  const toggleUserSelection = (userId: number) => {
    setSelectedUserIds((previous) =>
      previous.includes(userId) ? previous.filter((id) => id !== userId) : [...previous, userId]
    );
  };

  const openNewChatModal = useCallback(() => {
    setIsNewChatOpen(true);
    setNewChatError(null);
    setSelectedUserIds([]);
    setChatUserSearch("");
    setGroupName("");
  }, []);

  const closeNewChatModal = useCallback(() => {
    setIsNewChatOpen(false);
    setNewChatError(null);
    setSelectedUserIds([]);
    setChatUserSearch("");
    setGroupName("");
  }, []);

  const findDirectConversationId = useCallback(
    (userId: number): string | null => {
      const match = conversationDirectory.find(
        (conversation) =>
          conversation.type === "direct" && Number(conversation.counterpart?.id) === Number(userId)
      );

      return match ? String(match.conversation_id) : null;
    },
    [conversationDirectory]
  );

  const handleStartConversation = useCallback(async () => {
    if (selectedUserIds.length === 0) {
      setNewChatError("Select at least one user.");
      return;
    }

    setNewChatError(null);
    setIsCreatingChat(true);

    try {
      if (selectedUserIds.length === 1) {
        const existingConversationId = findDirectConversationId(selectedUserIds[0]);
        if (existingConversationId) {
          closeNewChatModal();
          router.push(`/message/t/${existingConversationId}`);
          return;
        }
      }

      const response =
        selectedUserIds.length === 1
          ? await startConversation({ recipient_user_id: selectedUserIds[0] })
          : await startConversation({
              participant_ids: selectedUserIds,
              title: groupName.trim() || undefined,
            });
      closeNewChatModal();
      await refreshThreads();
      router.push(`/message/t/${response.conversation_id}`);
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string; errors?: Record<string, string[]> }>;
      const firstValidationError = Object.values(axiosError.response?.data?.errors ?? {})[0]?.[0];
      setNewChatError(firstValidationError || axiosError.response?.data?.message || "Failed to start conversation.");
    } finally {
      setIsCreatingChat(false);
    }
  }, [
    closeNewChatModal,
    findDirectConversationId,
    groupName,
    refreshThreads,
    router,
    selectedUserIds,
  ]);

  const handleMessageSent = useCallback(
    (payload: ChatMessageSentEvent) => {
      const conversationId = String(payload.conversation_id);
      const existing = threadsRef.current.find((thread) => thread.id === conversationId);
      if (!existing) {
        void refreshThreads({ silent: true });
        return;
      }

      const lastMessage =
        payload.message?.body?.trim() || `[${payload.message?.message_type ?? "text"}]`;
      const senderId = Number(payload.message?.sender_id ?? 0);
      const isFromMe = currentUserId !== null && senderId === Number(currentUserId);

      let nextUnread = existing.unread;
      if (!isFromMe) {
        nextUnread = conversationId === String(activeThreadId ?? "") ? 0 : existing.unread + 1;
      }

      dispatch(
        patchThread({
          id: conversationId,
          changes: {
            lastMessage,
            lastTime: "now",
            unread: nextUnread,
          },
        })
      );
    },
    [activeThreadId, currentUserId, dispatch, refreshThreads]
  );

  const handleConversationRead = useCallback(
    (payload: ChatConversationReadEvent) => {
      const conversationId = String(payload.conversation_id);
      if (!currentUserId || Number(payload.user_id) !== Number(currentUserId)) {
        return;
      }

      const existing = threadsRef.current.find((thread) => thread.id === conversationId);
      if (!existing) {
        return;
      }

      if (existing.unread === 0) {
        return;
      }

      dispatch(
        patchThread({
          id: conversationId,
          changes: {
            unread: 0,
          },
        })
      );
    },
    [currentUserId, dispatch]
  );

  useEffect(() => {
    const echo = getEcho();
    if (!echo) {
      return;
    }

    threads.forEach((thread) => {
      const id = String(thread.id);
      if (subscribedRef.current.has(id)) {
        return;
      }

      const channel = echo.private(`conversation.${id}`);
      channel.listen(".chat.message.sent", handleMessageSent);
      channel.listen(".chat.conversation.read", handleConversationRead);
      subscribedRef.current.add(id);
    });
  }, [handleConversationRead, handleMessageSent, threads]);

  useEffect(() => {
    const echo = getEcho();
    if (!echo || !currentUserId) {
      return;
    }

    const channelName = `user.${currentUserId}`;
    if (userChannelRef.current === channelName) {
      return;
    }

    if (userChannelRef.current) {
      echo.leave(userChannelRef.current);
    }

    userChannelRef.current = channelName;
    const channel = echo.private(channelName);

    const handleThreadUpdated = (payload: ChatThreadUpdatedEvent) => {
      const conversationId = String(payload.conversation_id);
      const existing = threadsRef.current.find((thread) => thread.id === conversationId);
      if (existing) {
        return;
      }

      void refreshThreads({ silent: true });
    };

    const handlePresenceUpdated = (payload: ChatUserPresenceUpdatedEvent) => {
      const userId = Number(payload.user_id);
      if (!Number.isFinite(userId) || userId <= 0) {
        return;
      }

      setPresenceByUserId((previous) => ({
        ...previous,
        [userId]: {
          isOnline: payload.is_online,
          lastSeenAt: payload.last_seen_at,
        },
      }));
    };

    const handleRequestUpdated = (_payload: ChatConversationRequestUpdatedEvent) => {
      void refreshThreads({ silent: true });
    };

    const handleConversationUpdated = (payload: ChatConversationUpdatedEvent) => {
      const conversationId = String(payload.conversation_id);
      if (payload.changes?.title) {
        dispatch(
          patchThread({
            id: conversationId,
            changes: { name: payload.changes.title },
          })
        );
      } else {
        void refreshThreads({ silent: true });
      }
    };

    channel.listen(".chat.thread.updated", handleThreadUpdated);
    channel.listen(".chat.conversation.request.updated", handleRequestUpdated);
    channel.listen(".chat.user.presence.updated", handlePresenceUpdated);
    channel.listen(".chat.conversation.updated", handleConversationUpdated);

    return () => {
      echo.leave(channelName);
      if (userChannelRef.current === channelName) {
        userChannelRef.current = null;
      }
    };
  }, [currentUserId, dispatch, refreshThreads]);

  useEffect(() => {
    return () => {
      const echo = getEcho();
      if (!echo) {
        return;
      }

      subscribedRef.current.forEach((id) => {
        echo.leave(`conversation.${id}`);
      });
      subscribedRef.current.clear();
    };
  }, []);

  const newChatModalState: NewChatModalState = {
    isOpen: isNewChatOpen,
    error: newChatError,
    isCreating: isCreatingChat,
    isLoading: chatUsersLoading,
    usersError: chatUsersError,
    users: filteredChatUsers,
    selectedUserIds: selectedUserIdsSet,
    searchValue: chatUserSearch,
    groupNameValue: groupName,
    onClose: closeNewChatModal,
    onSearchChange: setChatUserSearch,
    onGroupNameChange: setGroupName,
    onToggleUser: toggleUserSelection,
    onSubmit: handleStartConversation,
  };

  return {
    threads,
    filteredThreads,
    searchQuery,
    setSearchQuery,
    filter,
    setFilter,
    unreadCount,
    presenceByUserId,
    isLoading,
    errorMessage,
    refreshThreads,
    openNewChatModal,
    newChatModalState,
  };
};
