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
import type { ThreadItem } from "@/lib/chat-threads";

export type ThreadFilter = "inbox" | "unread";

export interface NewChatModalState {
  isOpen: boolean;
  error: string | null;
  isCreating: boolean;
  isLoading: boolean;
  usersError: string | null;
  users: DirectoryUser[];
  selectedUserIds: Set<number>;
  searchValue: string;
  onClose: () => void;
  onSearchChange: (value: string) => void;
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

interface ChatConversationReadEvent {
  conversation_id: number | string;
  user_id: number;
  last_read_message_id: number;
  read_at: string;
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
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [conversationDirectory, setConversationDirectory] = useState<ConversationListItem[]>([]);

  const threadsRef = useRef<ThreadItem[]>([]);
  const subscribedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  const refreshThreads = useCallback(async () => {
    await dispatch(fetchInboxThreads());

    try {
      const response = await listConversations({ filter: "all", per_page: 200 });
      setConversationDirectory(response.data);
    } catch {
      setConversationDirectory([]);
    }
  }, [dispatch]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  const unreadCount = useMemo(() => threads.reduce((sum, thread) => sum + thread.unread, 0), [threads]);

  const filteredThreads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return threads.filter((thread) => {
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

      return true;
    });
  }, [filter, searchQuery, threads]);

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
  }, []);

  const closeNewChatModal = useCallback(() => {
    setIsNewChatOpen(false);
    setNewChatError(null);
    setSelectedUserIds([]);
    setChatUserSearch("");
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
          : await startConversation({ participant_ids: selectedUserIds });
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
    refreshThreads,
    router,
    selectedUserIds,
  ]);

  const handleMessageSent = useCallback(
    (payload: ChatMessageSentEvent) => {
      const conversationId = String(payload.conversation_id);
      const existing = threadsRef.current.find((thread) => thread.id === conversationId);
      if (!existing) {
        void refreshThreads();
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
    onClose: closeNewChatModal,
    onSearchChange: setChatUserSearch,
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
    isLoading,
    errorMessage,
    refreshThreads,
    openNewChatModal,
    newChatModalState,
  };
};
