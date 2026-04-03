"use client";

import type { ConversationId } from "@/types/chat";

export type CallWindowMode = "calling" | "incoming" | "active";

interface CallWindowLocationOptions {
  conversationId: ConversationId;
  callId?: number | null;
  mode?: CallWindowMode;
}

const CALL_WINDOW_NAME_PREFIX = "messenger-call-window";
const CALL_WINDOW_MANAGED_CALL_KEY = "messenger.callWindow.managedCallId";
const CALL_WINDOW_FEATURES = [
  "popup=yes",
  "width=520",
  "height=860",
  "left=120",
  "top=80",
  "resizable=yes",
  "scrollbars=yes",
].join(",");

const canUseWindow = (): boolean => typeof window !== "undefined";

const getWindowName = (conversationId: ConversationId): string =>
  `${CALL_WINDOW_NAME_PREFIX}-${String(conversationId)}`;

export const buildCallWindowUrl = ({ conversationId, callId, mode }: CallWindowLocationOptions): string => {
  const query = new URLSearchParams();
  query.set("callWindow", "1");

  if (callId !== null && callId !== undefined) {
    query.set("callId", String(callId));
  }

  if (mode) {
    query.set("callMode", mode);
  }

  return `/message/t/${encodeURIComponent(String(conversationId))}?${query.toString()}`;
};

export const openCallWindowPlaceholder = (conversationId: ConversationId): Window | null => {
  if (!canUseWindow()) {
    return null;
  }

  const popup = window.open("about:blank", getWindowName(conversationId), CALL_WINDOW_FEATURES);
  if (!popup) {
    return null;
  }

  try {
    popup.document.title = "Starting call...";
  } catch {
    // Ignore document access errors for popup placeholders.
  }

  popup.focus();
  return popup;
};

export const openCallWindow = (options: CallWindowLocationOptions): Window | null => {
  if (!canUseWindow()) {
    return null;
  }

  const popup = window.open(
    buildCallWindowUrl(options),
    getWindowName(options.conversationId),
    CALL_WINDOW_FEATURES
  );

  popup?.focus();
  return popup;
};

export const navigateCallWindow = (popup: Window | null | undefined, options: CallWindowLocationOptions): void => {
  if (!popup || popup.closed) {
    return;
  }

  popup.location.href = buildCallWindowUrl(options);
  popup.focus();
};

export const closeCallWindow = (popup: Window | null | undefined): void => {
  if (!popup || popup.closed) {
    return;
  }

  popup.close();
};

export const setManagedPopupCallId = (callId: number | null): void => {
  if (!canUseWindow()) {
    return;
  }

  if (callId === null) {
    window.localStorage.removeItem(CALL_WINDOW_MANAGED_CALL_KEY);
    return;
  }

  window.localStorage.setItem(CALL_WINDOW_MANAGED_CALL_KEY, String(callId));
};

export const getManagedPopupCallId = (): number | null => {
  if (!canUseWindow()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(CALL_WINDOW_MANAGED_CALL_KEY);
  if (!rawValue) {
    return null;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

export const isManagedInPopupWindow = (callId: number): boolean => getManagedPopupCallId() === callId;
