"use client";

import { type RefObject } from "react";
import { Search, X } from "lucide-react";
import Button from "@/components/Button";
import UserAvatar from "@/components/messenger/UserAvatar";
import type { ConversationListItem, DirectoryUser, Message, MessageRemovalMode } from "@/types/chat";

interface PresenceState {
  isOnline: boolean;
}

type PresenceMap = Record<number, PresenceState | undefined>;

export interface ThreadImageViewerState {
  url: string;
  name: string;
  mode: "single" | "gallery";
  index?: number;
  list?: Array<{ url: string; name: string }>;
}

interface MutePresetOption {
  id: string;
  label: string;
  durationMs: number;
}

interface ForwardModalProps {
  open: boolean;
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  targetsLoading: boolean;
  filteredTargets: ConversationListItem[];
  forwardSendingId: string | null;
  error: string | null;
  onClose: () => void;
  onSend: (targetId: string) => void;
  resolveAvatarUrl: (avatarPath: string | null) => string | null;
  presenceByUserIdMap: PresenceMap;
}

export function ThreadForwardModal({
  open,
  loading,
  search,
  onSearchChange,
  targetsLoading,
  filteredTargets,
  forwardSendingId,
  error,
  onClose,
  onSend,
  resolveAvatarUrl,
  presenceByUserIdMap,
}: ForwardModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Close forward modal"
        onClick={loading ? undefined : onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Forward</h2>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
            onClick={loading ? undefined : onClose}
            disabled={loading}
            aria-label="Close forward modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search for people and groups"
              className="h-10 w-full rounded-full border border-slate-200 bg-slate-100 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[color:var(--messenger-blue)]/30"
              disabled={loading}
            />
          </div>

          <div className="mt-4 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Contacts</span>
            <span>{filteredTargets.length}</span>
          </div>

          <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {targetsLoading ? (
              <p className="text-sm text-slate-500">Loading contacts...</p>
            ) : filteredTargets.length === 0 ? (
              <p className="text-sm text-slate-500">No contacts found.</p>
            ) : (
              filteredTargets.map((target) => {
                const label =
                  target.title?.trim() ||
                  target.counterpart?.name?.trim() ||
                  target.counterpart?.email ||
                  `Conversation #${target.conversation_id}`;
                const subtitle =
                  target.counterpart?.email && target.counterpart.email !== label ? target.counterpart.email : null;
                const avatarUrl = resolveAvatarUrl(target.avatar_path);
                const targetId = String(target.conversation_id);
                const isSending = forwardSendingId === targetId;

                return (
                  <div
                    key={targetId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar
                        name={label}
                        src={avatarUrl}
                        size={40}
                        isOnline={Boolean(target.counterpart?.id && presenceByUserIdMap[target.counterpart.id]?.isOnline)}
                        showStatus={target.type === "direct"}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{label}</p>
                        {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={loading || isSending}
                      onClick={() => onSend(targetId)}
                    >
                      {isSending ? "Sending..." : "Send"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {error && <div className="border-t border-slate-200 px-5 py-3 text-xs text-rose-600">{error}</div>}
      </div>
    </div>
  );
}

interface MembersModalProps {
  open: boolean;
  memberSaving: boolean;
  memberLoading: boolean;
  memberError: string | null;
  memberSearch: string;
  onSearchChange: (value: string) => void;
  filteredMemberDirectory: DirectoryUser[];
  memberSelection: Set<number>;
  presenceByUserIdMap: PresenceMap;
  memberActionError: string | null;
  onClose: () => void;
  onToggleMemberSelection: (userId: number) => void;
  onAddMembers: () => void;
}

export function ThreadMembersModal({
  open,
  memberSaving,
  memberLoading,
  memberError,
  memberSearch,
  onSearchChange,
  filteredMemberDirectory,
  memberSelection,
  presenceByUserIdMap,
  memberActionError,
  onClose,
  onToggleMemberSelection,
  onAddMembers,
}: MembersModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Close members modal"
        onClick={memberSaving ? undefined : onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Add members</h2>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
            onClick={memberSaving ? undefined : onClose}
            disabled={memberSaving}
            aria-label="Close members modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <input
            value={memberSearch}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search users"
            className="h-10 w-full rounded-full border border-slate-200 bg-slate-100 px-4 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[color:var(--messenger-blue)]/30"
            disabled={memberLoading || memberSaving}
          />

          <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {memberLoading ? (
              <p className="text-sm text-slate-500">Loading users...</p>
            ) : memberError ? (
              <p className="text-sm text-rose-600">{memberError}</p>
            ) : filteredMemberDirectory.length === 0 ? (
              <p className="text-sm text-slate-500">No users available.</p>
            ) : (
              filteredMemberDirectory.map((user) => {
                const isSelected = memberSelection.has(user.id);
                const isOnline = Boolean(presenceByUserIdMap[user.id]?.isOnline);

                return (
                  <button
                    key={`member-select-${user.id}`}
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                      isSelected ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                    onClick={() => onToggleMemberSelection(user.id)}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar name={user.name} size={36} isOnline={isOnline} />
                      <span className="truncate text-sm font-medium text-slate-900">{user.name}</span>
                    </div>
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                        isSelected ? "border-blue-500 bg-blue-500" : "border-slate-300"
                      }`}
                    >
                      {isSelected && (
                        <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {memberActionError && <p className="mt-3 text-xs text-rose-600">{memberActionError}</p>}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={memberSaving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onAddMembers}
            loading={memberSaving}
            disabled={memberSaving || memberSelection.size === 0}
          >
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ImageViewerProps {
  imageViewer: ThreadImageViewerState | null;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

interface ReactionPickerModalProps {
  open: boolean;
  reactionChoices: readonly string[];
  reactionPopoverPosition: { top: number; left: number } | null;
  reactionMutationLoadingKey: string | null;
  reactionMessageId: string | number | null;
  onClose: () => void;
  onReact: (emoji: string) => void;
}

export function ThreadReactionPickerModal({
  open,
  reactionChoices,
  reactionPopoverPosition,
  reactionMutationLoadingKey,
  reactionMessageId,
  onClose,
  onReact,
}: ReactionPickerModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/30"
        aria-label="Close reaction modal"
        onClick={reactionMutationLoadingKey ? undefined : onClose}
      />
      <div
        className="absolute z-50 w-auto max-w-[90vw] -translate-x-1/2 -translate-y-full rounded-full border border-slate-200 bg-white px-2 py-1 shadow-xl"
        style={
          reactionPopoverPosition
            ? { top: reactionPopoverPosition.top, left: reactionPopoverPosition.left }
            : { top: "50%", left: "50%" }
        }
      >
        <div className="flex items-center gap-1">
          {reactionChoices.map((emoji) => {
            const loading = reactionMutationLoadingKey === `${String(reactionMessageId)}:${emoji}`;

            return (
              <button
                key={emoji}
                type="button"
                className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition ${
                  loading ? "bg-slate-100 opacity-60" : "hover:bg-slate-100"
                }`}
                disabled={Boolean(reactionMutationLoadingKey)}
                onClick={() => onReact(emoji)}
                aria-label={`React with ${emoji}`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ThreadImageViewer({ imageViewer, onClose, onPrevious, onNext }: ImageViewerProps) {
  if (!imageViewer) {
    return null;
  }

  const canBrowseGallery = imageViewer.mode === "gallery" && imageViewer.list && imageViewer.list.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-950/80" aria-label="Close image viewer" onClick={onClose} />
      <div className="relative z-10 w-full max-w-4xl">
        <button
          type="button"
          className="absolute -top-10 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          onClick={onClose}
          aria-label="Close image viewer"
        >
          <X className="h-4 w-4" />
        </button>
        {canBrowseGallery && (
          <>
            <button
              type="button"
              className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
              onClick={onPrevious}
              disabled={(imageViewer.index ?? 0) <= 0}
              aria-label="Previous photo"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
              onClick={onNext}
              disabled={(imageViewer.index ?? 0) >= (imageViewer.list!.length - 1)}
              aria-label="Next photo"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}
        <div className="overflow-hidden rounded-2xl bg-slate-900 shadow-2xl">
          <img src={imageViewer.url} alt={imageViewer.name} className="max-h-[80vh] w-full object-contain" />
        </div>
        <p className="mt-3 text-center text-xs text-slate-200">{imageViewer.name}</p>
        {canBrowseGallery ? (
          <p className="mt-1 text-center text-[11px] text-slate-400">
            {(imageViewer.index ?? 0) + 1} / {imageViewer.list!.length}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface RemoveMessageModalProps {
  message: Message | null;
  mode: MessageRemovalMode;
  canEverywhere: boolean;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onModeChange: (mode: MessageRemovalMode) => void;
  onSubmit: () => void;
}

interface MuteConversationModalProps {
  open: boolean;
  presets: readonly MutePresetOption[];
  selectedPresetId: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onPresetChange: (presetId: string) => void;
  onConfirm: () => void;
}

export function ThreadMuteConversationModal({
  open,
  presets,
  selectedPresetId,
  loading,
  error,
  onClose,
  onPresetChange,
  onConfirm,
}: MuteConversationModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-transparent"
        aria-label="Close mute modal"
        onClick={loading ? undefined : onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
          <h2 className="text-base font-semibold text-slate-900">Mute conversation</h2>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-100"
            aria-label="Close mute modal"
            onClick={loading ? undefined : onClose}
            disabled={loading}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-5">
          <div className="space-y-2">
            {presets.map((preset) => {
              const checked = selectedPresetId === preset.id;

              return (
                <label
                  key={preset.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                    checked
                      ? "border-blue-200 bg-blue-50/70"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="mute-duration"
                    value={preset.id}
                    checked={checked}
                    onChange={() => onPresetChange(preset.id)}
                    disabled={loading}
                    className="h-5 w-5 shrink-0 accent-blue-600"
                  />
                  <span className={`text-sm ${checked ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                    {preset.label}
                  </span>
                </label>
              );
            })}
          </div>

          <p className="mt-3 text-xs leading-5 text-slate-600">
            Chat windows will stay closed, and you won&apos;t get push notifications on your devices.
          </p>

          {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="h-10 rounded-xl border-slate-300 bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="h-10 rounded-xl border-0 bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
            >
              {loading ? "Muting..." : "Mute"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThreadRemoveMessageModal({
  message,
  mode,
  canEverywhere,
  loading,
  error,
  onClose,
  onModeChange,
  onSubmit,
}: RemoveMessageModalProps) {
  if (!message) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Close remove modal"
        onClick={loading ? undefined : onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-white/60 bg-white p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-slate-900">Remove Message</h2>
        <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          {message.body?.trim() || `[${message.message_type}]`}
        </p>

        <div className="mt-4 space-y-2">
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input
              type="radio"
              name="remove-mode"
              value="for_you"
              checked={mode === "for_you"}
              onChange={() => onModeChange("for_you")}
              disabled={loading}
              className="mt-0.5"
            />
            <span>
              <strong>Remove for you</strong>
              <span className="block text-xs text-slate-500">Hide this message only from your view.</span>
            </span>
          </label>

          {canEverywhere && (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="radio"
                name="remove-mode"
                value="everywhere"
                checked={mode === "everywhere"}
                onChange={() => onModeChange("everywhere")}
                disabled={loading}
                className="mt-0.5"
              />
              <span>
                <strong>Remove from everywhere</strong>
                <span className="block text-xs text-slate-500">Replace message with a tombstone for all participants.</span>
              </span>
            </label>
          )}
        </div>

        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onSubmit} loading={loading} disabled={loading}>
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}
