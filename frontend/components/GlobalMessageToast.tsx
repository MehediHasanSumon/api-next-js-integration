"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { getEcho } from "@/lib/echo";
import { fetchInboxThreads } from "@/store/chatSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

interface IncomingMessagePayload {
  conversation_id: number | string;
  message: {
    id: number | string;
    sender_id?: number;
    sender?: {
      name?: string | null;
    };
    body?: string | null;
    message_type?: string;
  };
}

interface ToastState {
  key: string;
  threadId: string;
  title: string;
  message: string;
}

const buildToastMessage = (payload: IncomingMessagePayload): string => {
  const body = payload.message?.body?.trim();
  if (body) {
    return body;
  }

  return `[${payload.message?.message_type ?? "message"}]`;
};

export default function GlobalMessageToast() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();

  const threads = useAppSelector((state) => state.chat.threads);
  const currentUserId = useAppSelector((state) => state.auth.user?.id ?? null);

  const [toast, setToast] = useState<ToastState | null>(null);

  const activeToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedKeysRef = useRef<Set<string>>(new Set());

  const activeThreadId = useMemo(() => {
    const match = pathname?.match(/^\/messages\/t\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  const threadsRef = useRef(threads);
  const activeThreadIdRef = useRef<string | null>(activeThreadId);
  const currentUserIdRef = useRef<number | null>(currentUserId);
  const subscribedChannelNameRef = useRef<string | null>(null);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    if (threads.length > 0) {
      return;
    }

    void dispatch(fetchInboxThreads({ silent: true }));
  }, [currentUserId, dispatch, threads.length]);

  useEffect(() => {
    if (activeToastTimerRef.current) {
      clearTimeout(activeToastTimerRef.current);
    }

    if (!toast) {
      return;
    }

    activeToastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 6000);

    return () => {
      if (activeToastTimerRef.current) {
        clearTimeout(activeToastTimerRef.current);
        activeToastTimerRef.current = null;
      }
    };
  }, [toast]);

  useEffect(() => {
    const echo = getEcho();
    if (!echo || !currentUserId) {
      return;
    }

    const channelName = `user.${currentUserId}`;
    if (subscribedChannelNameRef.current === channelName) {
      return;
    }

    const channel = echo.private(channelName);
    subscribedChannelNameRef.current = channelName;

    const handleThreadUpdated = (payload: IncomingMessagePayload) => {
      const senderId = Number(payload.message?.sender_id ?? 0);
      if (currentUserIdRef.current !== null && senderId === Number(currentUserIdRef.current)) {
        return;
      }

      const conversationId = String(payload.conversation_id);
      if (activeThreadIdRef.current && conversationId === activeThreadIdRef.current) {
        return;
      }

      const messageId = String(payload.message?.id ?? "");
      const eventKey = `${conversationId}:${messageId}`;
      if (processedKeysRef.current.has(eventKey)) {
        return;
      }

      processedKeysRef.current.add(eventKey);
      if (processedKeysRef.current.size > 100) {
        const firstKey = processedKeysRef.current.values().next().value;
        if (firstKey) {
          processedKeysRef.current.delete(firstKey);
        }
      }

      const threadMeta = threadsRef.current.find((item) => String(item.id) === conversationId);

      setToast({
        key: eventKey,
        threadId: conversationId,
        title: threadMeta?.name || payload.message?.sender?.name?.trim() || "New message",
        message: buildToastMessage(payload),
      });

      if (!threadMeta) {
        void dispatch(fetchInboxThreads({ silent: true }));
      }
    };

    channel.listen(".chat.thread.updated", handleThreadUpdated);

    return () => {
      if (subscribedChannelNameRef.current === channelName) {
        subscribedChannelNameRef.current = null;
      }
    };
  }, [currentUserId, dispatch]);

  if (typeof document === "undefined" || !toast) {
    return null;
  }

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[70] w-[min(360px,calc(100vw-2rem))]">
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/96 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.45)] backdrop-blur">
        <div
          className="flex cursor-pointer items-start gap-3 p-4 transition hover:bg-slate-50/80"
          onClick={() => {
            setToast(null);
            router.push(`/messages/t/${toast.threadId}`);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setToast(null);
              router.push(`/messages/t/${toast.threadId}`);
            }
          }}
        >
          <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500"></div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">New message</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900">{toast.title}</p>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{toast.message}</p>
          </div>

          <button
            type="button"
            className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close message toast"
            onClick={(event) => {
              event.stopPropagation();
              setToast(null);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
