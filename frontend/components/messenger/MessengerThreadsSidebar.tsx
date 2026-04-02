"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { AxiosError } from "axios";
import { MoreHorizontal } from "lucide-react";
import Button from "@/components/Button";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import MessengerSidebar from "@/components/messenger/MessengerSidebar";
import NewChatModal from "@/components/messenger/NewChatModal";
import UserAvatar from "@/components/messenger/UserAvatar";
import type { ThreadItem } from "@/lib/chat-threads";
import type { NewChatModalState, ThreadFilter } from "@/lib/use-messenger-threads";
import { ThreadMuteConversationModal } from "@/app/(protected)/message/t/[threadId]/thread-page-overlays";
import {
  archiveConversation,
  blockConversation,
  deleteConversation,
  muteConversation,
  unarchiveConversation,
  unblockConversation,
  unmuteConversation,
} from "@/lib/chat-api";
import { buildMuteUntilIso, isFutureIsoDate, MUTE_PRESETS } from "@/app/(protected)/message/t/[threadId]/thread-page-helpers";

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
  onRefreshThreads: () => Promise<void>;
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
  onRefreshThreads,
  onOpenNewChat,
  newChatModalState,
  activeThreadId,
}: MessengerThreadsSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const moreFiltersRef = useRef<HTMLDivElement | null>(null);
  const [openThreadMenuId, setOpenThreadMenuId] = useState<string | null>(null);
  const [threadActionLoadingId, setThreadActionLoadingId] = useState<string | null>(null);
  const [threadActionError, setThreadActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ThreadItem | null>(null);
  const [muteTarget, setMuteTarget] = useState<ThreadItem | null>(null);
  const [selectedMutePresetId, setSelectedMutePresetId] = useState<(typeof MUTE_PRESETS)[number]["id"]>("15m");
  const [portalMounted, setPortalMounted] = useState(false);
  const threadMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!moreFiltersRef.current?.contains(event.target as Node)) {
        setMoreFiltersOpen(false);
      }

      if (!threadMenuRef.current?.contains(event.target as Node)) {
        setOpenThreadMenuId(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const closeThreadMenu = () => {
    setOpenThreadMenuId(null);
  };

  const handleThreadAction = async (
    thread: ThreadItem,
    action: "archive" | "mute" | "block" | "delete"
  ) => {
    setThreadActionError(null);
    setThreadActionLoadingId(thread.id);

    try {
      if (action === "archive") {
        if (thread.archivedAt) {
          await unarchiveConversation(thread.id);
        } else {
          await archiveConversation(thread.id);
        }
      } else if (action === "mute") {
        if (isFutureIsoDate(thread.mutedUntil)) {
          await unmuteConversation(thread.id);
        } else {
          const preset = MUTE_PRESETS.find((item) => item.id === selectedMutePresetId) ?? MUTE_PRESETS[0];
          await muteConversation(thread.id, { muted_until: buildMuteUntilIso(preset.durationMs) });
        }
      } else if (action === "block") {
        if (thread.isBlocked) {
          await unblockConversation(thread.id);
        } else {
          await blockConversation(thread.id);
        }
      } else {
        await deleteConversation(thread.id);
      }

      await onRefreshThreads();

      const shouldExitActiveThread =
        String(activeThreadId ?? "") === String(thread.id) &&
        (action === "delete" || action === "archive" || action === "block");

      if (shouldExitActiveThread && pathname?.startsWith("/message/")) {
        router.push("/masseges");
      }
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setThreadActionError(axiosError.response?.data?.message || "Failed to update conversation.");
    } finally {
      setThreadActionLoadingId(null);
      closeThreadMenu();
      if (action === "delete") {
        setDeleteTarget(null);
      }
      if (action === "mute") {
        setMuteTarget(null);
      }
    }
  };

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
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5">
            <Button
              type="button"
              variant={filter === "inbox" ? "secondary" : "ghost"}
              size="sm"
              className="h-9 rounded-2xl text-xs"
              onClick={() => onFilterChange("inbox")}
            >
              Inbox
            </Button>
            <Button
              type="button"
              variant={filter === "unread" ? "secondary" : "ghost"}
              size="sm"
              className="h-9 rounded-2xl text-xs"
              onClick={() => onFilterChange("unread")}
            >
              Unread {unreadCount > 0 ? `(${unreadCount})` : ""}
            </Button>
            <Button
              type="button"
              variant={filter === "online" ? "secondary" : "ghost"}
              size="sm"
              className="h-9 rounded-2xl text-xs"
              onClick={() => onFilterChange("online")}
            >
              Online
            </Button>
            <div ref={moreFiltersRef} className="relative">
              <Button
                type="button"
                variant={filter === "requests" || filter === "archived" || filter === "blocked" || filter === "all" ? "secondary" : "ghost"}
                size="sm"
                className="h-9 min-w-9 rounded-2xl px-2 text-xs"
                onClick={() => setMoreFiltersOpen((previous) => !previous)}
                aria-label="Open more conversation filters"
              >
                ...
              </Button>

              {moreFiltersOpen && (
                <div className="absolute right-0 top-11 z-20 min-w-[156px] rounded-3xl border border-slate-200/80 bg-white/96 p-1.5 shadow-[0_26px_56px_-28px_rgba(15,23,42,0.42)] backdrop-blur">
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
              const isMenuOpen = openThreadMenuId === thread.id;
              const isThreadActionLoading = threadActionLoadingId === thread.id;
              const isMuted = isFutureIsoDate(thread.mutedUntil);

              return (
                <div
                  key={thread.id}
                  ref={isMenuOpen ? threadMenuRef : null}
                  className={`group relative flex items-start gap-2 rounded-[22px] border px-3 py-3 transition ${
                    isActive
                      ? "border-blue-200/80 bg-[linear-gradient(180deg,#f4f8ff,#eef4ff)] shadow-[0_22px_48px_-36px_rgba(37,99,235,0.55)]"
                      : "border-transparent hover:border-slate-200/80 hover:bg-white/78"
                  }`}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setThreadActionError(null);
                    setOpenThreadMenuId(thread.id);
                  }}
                >
                  <Link href={`/message/t/${thread.id}`} className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      <UserAvatar name={thread.name} src={avatarUrl} size={40} isOnline={isOnline} showStatus={showStatus} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold tracking-tight text-slate-900">{thread.name}</p>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-xs leading-5 text-slate-500">
                          <span className="truncate">{thread.lastMessage}</span>
                          <span className="ml-2 shrink-0 text-[11px] font-medium text-slate-500">{thread.lastTime}</span>
                        </p>
                        {thread.unread > 0 && (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--messenger-blue)] px-1.5 text-[11px] font-semibold text-white shadow-[0_10px_24px_-16px_rgba(37,99,235,0.95)]">
                            {thread.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>

                  <div className="relative shrink-0">
                    <button
                      type="button"
                      className={`mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-slate-400 transition hover:border-slate-200 hover:bg-white hover:text-slate-700 ${
                        isMenuOpen ? "border-slate-200 bg-white text-slate-700" : "opacity-0 group-hover:opacity-100"
                      }`}
                      aria-label={`Open actions for ${thread.name}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setThreadActionError(null);
                        setOpenThreadMenuId((previous) => (previous === thread.id ? null : thread.id));
                      }}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>

                    {isMenuOpen && (
                      <div className="absolute right-0 top-10 z-20 min-w-[180px] rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_26px_56px_-28px_rgba(15,23,42,0.42)]">
                        <button
                          type="button"
                          className="flex w-full rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleThreadAction(thread, "archive");
                          }}
                          disabled={isThreadActionLoading}
                        >
                          {thread.archivedAt ? "Unarchive" : "Archive"}
                        </button>
                        <button
                          type="button"
                          className="flex w-full rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (isMuted) {
                              void handleThreadAction(thread, "mute");
                              return;
                            }

                            setSelectedMutePresetId("15m");
                            setMuteTarget(thread);
                            closeThreadMenu();
                          }}
                          disabled={isThreadActionLoading}
                        >
                          {isMuted ? "Unmute notifications" : "Mute notifications"}
                        </button>
                        {thread.type === "direct" && (
                          <button
                            type="button"
                            className="flex w-full rounded-xl px-3 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void handleThreadAction(thread, "block");
                            }}
                            disabled={isThreadActionLoading}
                          >
                            {thread.isBlocked ? "Unblock user" : "Block user"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="flex w-full rounded-xl px-3 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setDeleteTarget(thread);
                          }}
                          disabled={isThreadActionLoading}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {threadActionError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {threadActionError}
              </div>
            )}
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

      {portalMounted
        ? createPortal(
            <>
              <DeleteConfirmModal
                isOpen={Boolean(deleteTarget)}
                title="Delete conversation"
                description="This will remove the conversation from your list. You can start or reopen it again later if needed."
                itemName={deleteTarget?.name}
                confirmLabel="Delete conversation"
                loading={Boolean(deleteTarget && threadActionLoadingId === deleteTarget.id)}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={() => {
                  if (!deleteTarget) {
                    return;
                  }

                  void handleThreadAction(deleteTarget, "delete");
                }}
              />

              <ThreadMuteConversationModal
                open={Boolean(muteTarget)}
                presets={MUTE_PRESETS}
                selectedPresetId={selectedMutePresetId}
                loading={Boolean(muteTarget && threadActionLoadingId === muteTarget.id)}
                error={threadActionError}
                onClose={() => {
                  setMuteTarget(null);
                  setThreadActionError(null);
                }}
                onPresetChange={(presetId) => setSelectedMutePresetId(presetId as (typeof MUTE_PRESETS)[number]["id"])}
                onConfirm={() => {
                  if (!muteTarget) {
                    return;
                  }

                  void handleThreadAction(muteTarget, "mute");
                }}
              />
            </>,
            document.body
          )
        : null}
    </>
  );
}
