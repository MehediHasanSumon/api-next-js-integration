"use client";

import Button from "@/components/Button";
import UserAvatar from "@/components/messenger/UserAvatar";
import type { DirectoryUser } from "@/lib/chat-api";

interface NewChatModalProps {
  isOpen: boolean;
  error: string | null;
  isCreating: boolean;
  isLoading: boolean;
  usersError: string | null;
  users: DirectoryUser[];
  presenceByUserId: Record<number, { isOnline: boolean; lastSeenAt: string | null }>;
  selectedUserIds: Set<number>;
  searchValue: string;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onToggleUser: (userId: number) => void;
  onSubmit: () => void;
}

export default function NewChatModal({
  isOpen,
  error,
  isCreating,
  isLoading,
  usersError,
  users,
  presenceByUserId,
  selectedUserIds,
  searchValue,
  onClose,
  onSearchChange,
  onToggleUser,
  onSubmit,
}: NewChatModalProps) {
  if (!isOpen) {
    return null;
  }

  const selectedCount = selectedUserIds.size;
  const submitLabel = selectedCount > 1 ? "Start Group Chat" : "Start Chat";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close new chat modal"
        className="absolute inset-0 bg-slate-900/50"
        onClick={isCreating ? undefined : onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-white/60 bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-900">Start New Conversation</h2>
        <p className="mt-2 text-sm text-slate-600">Pick one person for 1-to-1 chat or select multiple for a group.</p>

        <label className="mt-4 block text-sm font-medium text-slate-700">Search users</label>
        <input
          type="text"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name"
          className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          disabled={isCreating || isLoading}
        />

        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
              Loading users...
            </div>
          ) : usersError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-xs text-rose-600">
              {usersError}
            </div>
          ) : users.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
              No users found.
            </div>
          ) : (
            users.map((user) => {
              const isSelected = selectedUserIds.has(user.id);
              const isOnline = Boolean(presenceByUserId[user.id]?.isOnline);

              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => onToggleUser(user.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                    isSelected ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <UserAvatar name={user.name} size={36} isOnline={isOnline} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{user.name}</p>
                  </div>
                  <div
                    className={`h-5 w-5 rounded-full border ${
                      isSelected ? "border-blue-500 bg-blue-500" : "border-slate-300"
                    }`}
                  >
                    {isSelected && (
                      <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            loading={isCreating}
            disabled={isCreating || selectedCount === 0}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
