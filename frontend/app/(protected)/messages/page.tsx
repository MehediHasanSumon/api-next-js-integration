"use client";

import ProtectedShell from "@/components/ProtectedShell";
import MessengerLayout from "@/components/messenger/MessengerLayout";
import MessengerPreviewPanel from "@/components/messenger/MessengerPreviewPanel";
import MessengerThreadsSidebar from "@/components/messenger/MessengerThreadsSidebar";
import { useMessengerThreads } from "@/lib/use-messenger-threads";

export default function MessagesPage() {
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
    <ProtectedShell title="Messages" description="Team conversations and quick updates" showPageHeader={false}>
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
          onRefreshThreads={async () => {
            await refreshThreads();
          }}
          onOpenNewChat={openNewChatModal}
          newChatModalState={newChatModalState}
        />

        <MessengerPreviewPanel previewThread={previewThread} previewOnline={previewOnline} />
      </MessengerLayout>
    </ProtectedShell>
  );
}
