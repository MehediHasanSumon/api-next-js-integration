"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AxiosError } from "axios";
import ProtectedShell from "@/components/ProtectedShell";
import Button from "@/components/Button";
import MessengerLayout from "@/components/messenger/MessengerLayout";
import MessengerSidebar from "@/components/messenger/MessengerSidebar";
import NewChatModal from "@/components/messenger/NewChatModal";
import { listChatUsers, listConversations, startConversation, type DirectoryUser, type ConversationListItem } from "@/lib/chat-api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchInboxThreads } from "@/store/chatSlice";

type ThreadFilter = "inbox" | "unread";

export default function MassegesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const threads = useAppSelector((state) => state.chat.threads);
  const isLoading = useAppSelector((state) => state.chat.loading);
  const errorMessage = useAppSelector((state) => state.chat.error);
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

  const fetchConversations = useCallback(async () => {
    await dispatch(fetchInboxThreads());

    try {
      const response = await listConversations({ filter: "all", per_page: 200 });
      setConversationDirectory(response.data);
    } catch {
      setConversationDirectory([]);
    }
  }, [dispatch]);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

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

  useEffect(() => {
    if (searchParams?.get("new") === "1") {
      openNewChatModal();
    }
  }, [openNewChatModal, searchParams]);

  const previewThread = filteredThreads[0] ?? threads[0] ?? null;

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

  const handleStartConversation = async () => {
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
      await fetchConversations();
      router.push(`/message/t/${response.conversation_id}`);
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string; errors?: Record<string, string[]> }>;
      const firstValidationError = Object.values(axiosError.response?.data?.errors ?? {})[0]?.[0];
      setNewChatError(firstValidationError || axiosError.response?.data?.message || "Failed to start conversation.");
    } finally {
      setIsCreatingChat(false);
    }
  };

  return (
    <ProtectedShell title="Masseges" description="Team conversations and quick updates" showPageHeader={false}>
      <MessengerLayout showInfo={false}>
          <MessengerSidebar
            title="Chats"
            action={
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" className="h-7 rounded-full px-3 text-[11px]" onClick={openNewChatModal}>
                  New Chat
                </Button>
              </div>
            }
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            filters={
              <div className="grid grid-cols-3 gap-1">
                <Button
                  type="button"
                  variant={filter === "inbox" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 rounded-full text-xs"
                  onClick={() => setFilter("inbox")}
                >
                  Inbox
                </Button>
                <Button
                  type="button"
                  variant={filter === "unread" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 rounded-full text-xs"
                  onClick={() => setFilter("unread")}
                >
                  Unread {unreadCount > 0 ? `(${unreadCount})` : ""}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full text-xs" disabled title="Online filter will use realtime presence later">
                  Online
                </Button>
              </div>
            }
          >
            {isLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-4 text-center">
                <p className="text-sm font-medium text-slate-700">Loading conversations...</p>
              </div>
            ) : errorMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center">
                <p className="text-sm font-medium text-rose-700">{errorMessage}</p>
                <Button type="button" size="sm" variant="outline" className="mt-3 rounded-full" onClick={() => void fetchConversations()}>
                  Retry
                </Button>
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-4 text-center">
                <p className="text-sm font-medium text-slate-700">No conversations found</p>
                <p className="mt-1 text-xs text-slate-500">Try a different search or filter.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredThreads.map((thread) => (
                  <Link
                    key={thread.id}
                    href={`/message/t/${thread.id}`}
                    className="flex items-start gap-3 rounded-2xl px-3 py-2 transition hover:bg-slate-100/80"
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
                        <div className="flex shrink-0 items-center gap-1">
                          {thread.unread > 0 && (
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--messenger-blue)] px-1.5 text-[11px] font-semibold text-white">
                              {thread.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </MessengerSidebar>

          <section className="hidden h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,#ffffff_0%,#f1f5f9_45%,#eaf2ff_100%)] animate-[messengerRise_0.5s_ease] lg:flex">
            <div className="border-b border-slate-200/80 bg-white/80 px-5 py-3">
              <p className="text-sm font-semibold text-slate-900">Conversation Preview</p>
              <p className="text-xs text-slate-500">Review the selected chat before opening thread.</p>
            </div>

            {previewThread ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-6">
                <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-base font-semibold text-white">
                      {previewThread.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-base font-semibold text-slate-900">{previewThread.name}</p>
                      <p className="text-xs text-slate-500">{previewThread.handle}</p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last Message</p>
                      <p className="mt-1 text-sm text-slate-700">{previewThread.lastMessage}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Unread</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">{previewThread.unread}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Status</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">Presence later</p>
                      </div>
                    </div>
                  </div>

                  <Link href={`/message/t/${previewThread.id}`} className="mt-6 inline-flex rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                    Open Conversation
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center">
                <div>
                  <p className="text-sm font-semibold text-slate-900">No preview available</p>
                  <p className="mt-1 text-xs text-slate-500">Please reset filters to see conversations.</p>
                </div>
              </div>
            )}
          </section>
      </MessengerLayout>

      <NewChatModal
        isOpen={isNewChatOpen}
        error={newChatError}
        isCreating={isCreatingChat}
        users={filteredChatUsers}
        selectedUserIds={selectedUserIdsSet}
        searchValue={chatUserSearch}
        isLoading={chatUsersLoading}
        usersError={chatUsersError}
        onClose={closeNewChatModal}
        onSearchChange={setChatUserSearch}
        onToggleUser={toggleUserSelection}
        onSubmit={() => void handleStartConversation()}
      />
    </ProtectedShell>
  );
}
