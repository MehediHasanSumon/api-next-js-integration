"use client";

import Link from "next/link";
import Button from "@/components/Button";
import MessengerSidebar from "@/components/messenger/MessengerSidebar";
import NewChatModal from "@/components/messenger/NewChatModal";
import type { ThreadItem } from "@/lib/chat-threads";
import type { NewChatModalState, ThreadFilter } from "@/lib/use-messenger-threads";

interface MessengerThreadsSidebarProps {
  threads: ThreadItem[];
  filteredThreads: ThreadItem[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filter: ThreadFilter;
  onFilterChange: (filter: ThreadFilter) => void;
  unreadCount: number;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onOpenNewChat: () => void;
  newChatModalState: NewChatModalState;
  activeThreadId?: string | null;
}

export default function MessengerThreadsSidebar({
  filteredThreads,
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
  unreadCount,
  isLoading,
  errorMessage,
  onRetry,
  onOpenNewChat,
  newChatModalState,
  activeThreadId,
}: MessengerThreadsSidebarProps) {
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
          <div className="grid grid-cols-3 gap-1">
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
              variant="ghost"
              size="sm"
              className="h-8 rounded-full text-xs"
              disabled
              title="Online filter will use realtime presence later"
            >
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

              return (
                <Link
                  key={thread.id}
                  href={`/message/t/${thread.id}`}
                  className={`flex items-start gap-3 rounded-2xl px-3 py-2 transition ${
                    isActive ? "bg-slate-100" : "hover:bg-slate-100/80"
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
        selectedUserIds={newChatModalState.selectedUserIds}
        searchValue={newChatModalState.searchValue}
        onClose={newChatModalState.onClose}
        onSearchChange={newChatModalState.onSearchChange}
        onToggleUser={newChatModalState.onToggleUser}
        onSubmit={newChatModalState.onSubmit}
      />
    </>
  );
}
