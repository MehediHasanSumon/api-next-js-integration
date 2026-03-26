"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/Button";
import MessengerSidebar from "@/components/messenger/MessengerSidebar";
import NewChatModal from "@/components/messenger/NewChatModal";
import UserAvatar from "@/components/messenger/UserAvatar";
import type { ThreadItem } from "@/lib/chat-threads";
import type { NewChatModalState, ThreadFilter } from "@/lib/use-messenger-threads";

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

interface MessengerThreadsSidebarProps {
  threads: ThreadItem[];
  filteredThreads: ThreadItem[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filter: ThreadFilter;
  onFilterChange: (filter: ThreadFilter) => void;
  unreadCount: number;
  presenceByUserId: Record<number, { isOnline: boolean; lastSeenAt: string | null }>;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onOpenNewChat: () => void;
  newChatModalState: NewChatModalState;
  activeThreadId?: string | null;
}

export default function MessengerThreadsSidebar({
  threads,
  filteredThreads,
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
  unreadCount,
  presenceByUserId,
  isLoading,
  errorMessage,
  onRetry,
  onOpenNewChat,
  newChatModalState,
  activeThreadId,
}: MessengerThreadsSidebarProps) {
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const moreFiltersRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!moreFiltersRef.current?.contains(event.target as Node)) {
        setMoreFiltersOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const selectMoreFilter = (nextFilter: Extract<ThreadFilter, "requests" | "archived" | "blocked" | "all">) => {
    onFilterChange(nextFilter);
    setMoreFiltersOpen(false);
  };

  return (
    <>
      <MessengerSidebar
        title="Chats"
        action={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-full px-3 text-[11px]"
              onClick={onOpenNewChat}
            >
              New Chat
            </Button>
          </div>
        }
        searchValue={searchQuery}
        onSearchChange={onSearchChange}
        filters={
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1">
            <Button
              type="button"
              variant={filter === "inbox" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 rounded-full text-xs"
              onClick={() => onFilterChange("inbox")}
            >
              Inbox
            </Button>
            <Button
              type="button"
              variant={filter === "unread" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 rounded-full text-xs"
              onClick={() => onFilterChange("unread")}
            >
              Unread {unreadCount > 0 ? `(${unreadCount})` : ""}
            </Button>
            <Button
              type="button"
              variant={filter === "online" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 rounded-full text-xs"
              onClick={() => onFilterChange("online")}
            >
              Online
            </Button>
            <div ref={moreFiltersRef} className="relative">
              <Button
                type="button"
                variant={filter === "requests" || filter === "archived" || filter === "blocked" || filter === "all" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 min-w-8 rounded-full px-2 text-xs"
                onClick={() => setMoreFiltersOpen((previous) => !previous)}
                aria-label="Open more conversation filters"
              >
                ...
              </Button>

              {moreFiltersOpen && (
                <div className="absolute right-0 top-10 z-20 min-w-[148px] rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <button
                    type="button"
                    className={`flex w-full rounded-xl px-3 py-2 text-left text-xs font-medium ${
                      filter === "requests" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"
                    }`}
                    onClick={() => selectMoreFilter("requests")}
                  >
                    Requests
                  </button>
                  <button
                    type="button"
                    className={`flex w-full rounded-xl px-3 py-2 text-left text-xs font-medium ${
                      filter === "archived" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"
                    }`}
                    onClick={() => selectMoreFilter("archived")}
                  >
                    Archived
                  </button>
                  <button
                    type="button"
                    className={`flex w-full rounded-xl px-3 py-2 text-left text-xs font-medium ${
                      filter === "blocked" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"
                    }`}
                    onClick={() => selectMoreFilter("blocked")}
                  >
                    Blocked
                  </button>
                  <button
                    type="button"
                    className={`flex w-full rounded-xl px-3 py-2 text-left text-xs font-medium ${
                      filter === "all" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"
                    }`}
                    onClick={() => selectMoreFilter("all")}
                  >
                    All
                  </button>
                </div>
              )}
            </div>
          </div>
        }
      >
        {isLoading && threads.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`thread-skeleton-${index}`}
                className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2"
              >
                <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 animate-pulse rounded-full bg-slate-200" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-slate-100" />
                </div>
                <div className="h-3 w-8 animate-pulse rounded-full bg-slate-200" />
              </div>
            ))}
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center">
            <p className="text-sm font-medium text-rose-700">{errorMessage}</p>
            <Button type="button" size="sm" variant="outline" className="mt-3 rounded-full" onClick={onRetry}>
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
            {filteredThreads.map((thread) => {
              const isActive = activeThreadId ? String(thread.id) === String(activeThreadId) : false;
              const counterpartId = thread.counterpartId ?? null;
              const isOnline = counterpartId ? Boolean(presenceByUserId[counterpartId]?.isOnline) : false;
              const showStatus = thread.type === "direct";
              const avatarUrl = resolveAvatarUrl(thread.avatarPath);

              return (
                <Link
                  key={thread.id}
                  href={`/message/t/${thread.id}`}
                  className={`flex items-start gap-3 rounded-2xl px-3 py-2 transition ${
                    isActive ? "bg-slate-100" : "hover:bg-slate-100/80"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    <UserAvatar name={thread.name} src={avatarUrl} size={40} isOnline={isOnline} showStatus={showStatus} />
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
              );
            })}
          </div>
        )}
      </MessengerSidebar>

      <NewChatModal
        isOpen={newChatModalState.isOpen}
        error={newChatModalState.error}
        isCreating={newChatModalState.isCreating}
        isLoading={newChatModalState.isLoading}
        usersError={newChatModalState.usersError}
        users={newChatModalState.users}
        presenceByUserId={presenceByUserId}
        selectedUserIds={newChatModalState.selectedUserIds}
        searchValue={newChatModalState.searchValue}
        groupNameValue={newChatModalState.groupNameValue}
        onClose={newChatModalState.onClose}
        onSearchChange={newChatModalState.onSearchChange}
        onGroupNameChange={newChatModalState.onGroupNameChange}
        onToggleUser={newChatModalState.onToggleUser}
        onSubmit={newChatModalState.onSubmit}
      />
    </>
  );
}
