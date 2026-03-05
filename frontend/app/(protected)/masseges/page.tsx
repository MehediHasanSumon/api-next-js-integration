"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AxiosError } from "axios";
import ProtectedShell from "@/components/ProtectedShell";
import Button from "@/components/Button";
import { listConversations, startConversation } from "@/lib/chat-api";
import type { ConversationListItem } from "@/types/chat";

type ThreadFilter = "inbox" | "unread";

interface ThreadItem {
  id: string;
  name: string;
  handle: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
}

const formatLastSeen = (rawDate: string | null): string => {
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

const mapConversationToThread = (conversation: ConversationListItem): ThreadItem => {
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
    lastMessage,
    lastTime: formatLastSeen(lastActivity),
    unread: conversation.unread_count,
  };
};

export default function MassegesPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<ThreadFilter>("inbox");
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [newChatEmail, setNewChatEmail] = useState("");
  const [newChatError, setNewChatError] = useState<string | null>(null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await listConversations({ filter: "inbox", per_page: 100 });
      setThreads(response.data.map(mapConversationToThread));
    } catch {
      setErrorMessage("Failed to load conversations.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

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

  const previewThread = filteredThreads[0] ?? threads[0] ?? null;

  const handleStartConversation = async () => {
    const email = newChatEmail.trim().toLowerCase();
    if (!email) {
      setNewChatError("Please enter a valid email.");
      return;
    }

    setNewChatError(null);
    setIsCreatingChat(true);

    try {
      const response = await startConversation({ recipient_email: email });
      setIsNewChatOpen(false);
      setNewChatEmail("");
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
      <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/90">
        <div className="grid h-[calc(100dvh-7.8rem)] min-h-[560px] grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="flex min-h-0 h-full flex-col border-r border-slate-200/80 bg-white/85">
            <div className="border-b border-slate-200/80 px-4 py-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Chats</h2>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                    {filteredThreads.length}
                  </span>
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setIsNewChatOpen(true)}>
                    New Chat
                  </Button>
                </div>
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
              <Button
                type="button"
                variant={filter === "inbox" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setFilter("inbox")}
              >
                Inbox
              </Button>
              <Button
                type="button"
                variant={filter === "unread" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setFilter("unread")}
              >
                Unread {unreadCount > 0 ? `(${unreadCount})` : ""}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" disabled title="Online filter will use realtime presence later">
                Online
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {isLoading ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                  <p className="text-sm font-medium text-slate-700">Loading conversations...</p>
                </div>
              ) : errorMessage ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
                  <p className="text-sm font-medium text-rose-700">{errorMessage}</p>
                  <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void fetchConversations()}>
                    Retry
                  </Button>
                </div>
              ) : filteredThreads.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                  <p className="text-sm font-medium text-slate-700">No conversations found</p>
                  <p className="mt-1 text-xs text-slate-500">Try a different search or filter.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredThreads.map((thread) => (
                    <Link
                      key={thread.id}
                      href={`/message/t/${thread.id}`}
                      className="flex items-start gap-3 rounded-xl px-2.5 py-2 transition hover:bg-slate-100"
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
                              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold text-white">
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
            </div>
          </aside>

          <section className="hidden h-full min-h-0 flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] lg:flex">
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
        </div>
      </div>

      {isNewChatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close new chat modal"
            className="absolute inset-0 bg-slate-900/50"
            onClick={isCreatingChat ? undefined : () => setIsNewChatOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-white/60 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Start New Conversation</h2>
            <p className="mt-2 text-sm text-slate-600">Enter recipient email address to create or reopen a direct chat.</p>

            <label className="mt-4 block text-sm font-medium text-slate-700">Recipient Email</label>
            <input
              type="email"
              value={newChatEmail}
              onChange={(event) => setNewChatEmail(event.target.value)}
              placeholder="user@example.com"
              className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              disabled={isCreatingChat}
            />
            {newChatError && <p className="mt-2 text-xs text-rose-600">{newChatError}</p>}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setIsNewChatOpen(false)} disabled={isCreatingChat}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleStartConversation()} loading={isCreatingChat} disabled={isCreatingChat}>
                Start Chat
              </Button>
            </div>
          </div>
        </div>
      )}
    </ProtectedShell>
  );
}
