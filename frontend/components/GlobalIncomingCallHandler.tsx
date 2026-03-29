"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import { getEcho } from "@/lib/echo";
import callSignaling from "@/lib/call-signaling";
import { createCallToneController, type CallToneController } from "@/lib/call-tones";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { resetCallState, setCallError, setCallStatus, setCurrentCall, setIncomingCallPayload } from "@/store/callSlice";
import type { CallEventPayload } from "@/types/chat";

const rememberEvent = (cache: Set<string>, key: string): boolean => {
  if (cache.has(key)) {
    return false;
  }

  cache.add(key);
  if (cache.size > 100) {
    const oldestKey = cache.values().next().value;
    if (typeof oldestKey === "string") {
      cache.delete(oldestKey);
    }
  }

  return true;
};

export default function GlobalIncomingCallHandler() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const currentUserId = useAppSelector((state) => state.auth.user?.id ?? null);
  const currentCall = useAppSelector((state) => state.call.currentCall);
  const callStatus = useAppSelector((state) => state.call.callStatus);
  const incomingCallPayload = useAppSelector((state) => state.call.incomingCallPayload);
  const [actionLoading, setActionLoading] = useState<"accept" | "decline" | null>(null);
  const [incomingCallError, setIncomingCallError] = useState<string | null>(null);
  const dedupeRef = useRef<Set<string>>(new Set());
  const toneControllerRef = useRef<CallToneController | null>(null);

  const clearIncomingCall = useCallback(() => {
    setActionLoading(null);
    setIncomingCallError(null);
    dispatch(resetCallState());
  }, [dispatch]);

  useEffect(() => {
    if (callStatus === "incoming" && incomingCallPayload?.call) {
      if (!toneControllerRef.current) {
        toneControllerRef.current = createCallToneController();
      }

      toneControllerRef.current.play("incoming");
      return;
    }

    toneControllerRef.current?.stop();
  }, [callStatus, incomingCallPayload]);

  useEffect(() => {
    return () => {
      toneControllerRef.current?.close();
      toneControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    const echo = getEcho();
    if (!echo) {
      return;
    }

    const channelName = `user.${currentUserId}`;
    const channel = echo.private(channelName);

    const handleIncomingCall = (payload: CallEventPayload) => {
      if (Number(payload.call.receiver_id) !== Number(currentUserId)) {
        return;
      }

      const dedupeKey = `call.invite:${payload.conversation_id}:${payload.call.id}:${payload.sent_at ?? ""}`;
      if (!rememberEvent(dedupeRef.current, dedupeKey)) {
        return;
      }

      const isBusyOnDifferentCall =
        currentCall &&
        Number(currentCall.id) !== Number(payload.call.id) &&
        (callStatus === "active" || callStatus === "connecting" || callStatus === "calling");

      if (isBusyOnDifferentCall) {
        return;
      }

      dispatch(
        setIncomingCallPayload({
          conversationId: Number(payload.conversation_id),
          call: payload.call,
        })
      );
      dispatch(setCurrentCall(payload.call));
      dispatch(setCallStatus("incoming"));
      dispatch(setCallError(null));
      setIncomingCallError(null);
      setActionLoading(null);
    };

    const handleTerminalCallEvent = (payload: CallEventPayload) => {
      if (!incomingCallPayload?.call) {
        return;
      }

      if (Number(incomingCallPayload.call.id) !== Number(payload.call.id)) {
        return;
      }

      if (callStatus !== "incoming") {
        return;
      }

      clearIncomingCall();
    };

    channel.listen(".call.invite", handleIncomingCall);
    channel.listen(".call.declined", handleTerminalCallEvent);
    channel.listen(".call.ended", handleTerminalCallEvent);
    channel.listen(".call.missed", handleTerminalCallEvent);

    return () => {
      const liveEcho = getEcho();
      if (!liveEcho) {
        return;
      }

      liveEcho.leave(channelName);
    };
  }, [callStatus, clearIncomingCall, currentCall, currentUserId, dispatch, incomingCallPayload]);

  const handleAcceptIncomingCall = async () => {
    if (!incomingCallPayload?.call) {
      return;
    }

    const targetConversationId = incomingCallPayload.conversationId;
    setActionLoading("accept");
    setIncomingCallError(null);

    try {
      router.push(`/message/t/${targetConversationId}`);
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      const response = await callSignaling.acceptCall(incomingCallPayload.call.id);
      dispatch(setCurrentCall(response.data));
      dispatch(setIncomingCallPayload(null));
      dispatch(setCallStatus("connecting"));
      dispatch(setCallError(null));
    } catch {
      setIncomingCallError("Unable to answer the call right now.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeclineIncomingCall = async () => {
    if (!incomingCallPayload?.call) {
      return;
    }

    setActionLoading("decline");
    setIncomingCallError(null);

    try {
      await callSignaling.declineCall(incomingCallPayload.call.id);
      clearIncomingCall();
    } catch {
      setIncomingCallError("Unable to decline the call right now.");
      setActionLoading(null);
    }
  };

  if (!incomingCallPayload?.call || callStatus !== "incoming") {
    return null;
  }

  const incomingCallerName =
    incomingCallPayload.call.caller?.name?.trim() ||
    incomingCallPayload.call.receiver?.name?.trim() ||
    "Incoming caller";
  const incomingCallTypeLabel = incomingCallPayload.call.call_type === "video" ? "Video call" : "Audio call";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          {incomingCallPayload.call.call_type === "video" ? (
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 19h8a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          ) : (
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18a6 6 0 006-6V8a6 6 0 10-12 0v4a6 6 0 006 6zm0 0v3m-4 0h8" />
            </svg>
          )}
        </div>
        <p className="mt-5 text-center text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          Incoming {incomingCallTypeLabel}
        </p>
        <h2 className="mt-2 text-center text-2xl font-semibold text-slate-900">{incomingCallerName}</h2>
        <p className="mt-2 text-center text-sm text-slate-500">
          {incomingCallPayload.call.call_type === "video"
            ? "They want to start a video call with you."
            : "They are calling you now."}
        </p>

        {incomingCallError && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {incomingCallError}
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            type="button"
            variant="danger"
            className="min-w-28 rounded-full"
            onClick={() => void handleDeclineIncomingCall()}
            loading={actionLoading === "decline"}
            disabled={Boolean(actionLoading)}
          >
            Decline
          </Button>
          <Button
            type="button"
            className="min-w-28 rounded-full bg-emerald-600 hover:bg-emerald-700"
            onClick={() => void handleAcceptIncomingCall()}
            loading={actionLoading === "accept"}
            disabled={Boolean(actionLoading)}
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
