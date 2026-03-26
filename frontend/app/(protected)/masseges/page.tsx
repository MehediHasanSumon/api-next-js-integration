"use client";

import Link from "next/link";
import ProtectedShell from "@/components/ProtectedShell";
import MessengerLayout from "@/components/messenger/MessengerLayout";
import MessengerThreadsSidebar from "@/components/messenger/MessengerThreadsSidebar";
import UserAvatar from "@/components/messenger/UserAvatar";
import { useMessengerThreads } from "@/lib/use-messenger-threads";

export default function MassegesPage() {
  const {
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
  } = useMessengerThreads();

  const previewThread =
    filteredThreads[0] ??
    (filter === "inbox" || filter === "unread" || filter === "online" ? threads[0] ?? null : null);
  const previewOnline =
    previewThread?.counterpartId ? Boolean(presenceByUserId[previewThread.counterpartId]?.isOnline) : false;

  return (
    <ProtectedShell title="Masseges" description="Team conversations and quick updates" showPageHeader={false}>
      <MessengerLayout showInfo={false}>
          <MessengerThreadsSidebar
            threads={threads}
            filteredThreads={filteredThreads}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filter={filter}
            onFilterChange={setFilter}
            unreadCount={unreadCount}
            presenceByUserId={presenceByUserId}
            isLoading={isLoading}
            errorMessage={errorMessage}
            onRetry={() => void refreshThreads()}
            onOpenNewChat={openNewChatModal}
            newChatModalState={newChatModalState}
          />

          <section className="hidden h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,#ffffff_0%,#f1f5f9_45%,#eaf2ff_100%)] animate-[messengerRise_0.5s_ease] lg:flex">
            <div className="border-b border-slate-200/80 bg-white/80 px-5 py-3">
              <p className="text-sm font-semibold text-slate-900">Conversation Preview</p>
              <p className="text-xs text-slate-500">Review the selected chat before opening thread.</p>
            </div>

            {previewThread ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-6">
                <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="flex items-center gap-3">
                  <UserAvatar name={previewThread.name} size={48} isOnline={previewOnline} showStatus={previewThread.type === "direct"} />
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

    </ProtectedShell>
  );
}
