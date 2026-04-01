"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Phone, PhoneOff, X } from "lucide-react";
import UserAvatar from "@/components/messenger/UserAvatar";
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
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/25 backdrop-blur-[2px]"
        aria-label="Dismiss incoming call dialog"
        onClick={() => void handleDeclineIncomingCall()}
        disabled={Boolean(actionLoading)}
      />
      <div className="relative w-full max-w-[300px] rounded-[14px] border border-black/5 bg-white px-6 pb-5 pt-4 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-center">
          <p className="text-[15px] font-semibold text-slate-900">Incoming call</p>
          <button
            type="button"
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
            aria-label="Close incoming call dialog"
            onClick={() => void handleDeclineIncomingCall()}
            disabled={Boolean(actionLoading)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 flex justify-center">
          <UserAvatar name={incomingCallerName} size={56} showStatus={false} className="ring-2 ring-slate-100" />
        </div>

        <h2 className="mx-auto mt-4 max-w-[220px] text-center text-[18px] font-bold leading-[1.15] tracking-tight text-slate-950 sm:text-[20px]">
          {incomingCallerName} is calling you
        </h2>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] font-medium text-slate-500">
          <Lock className="h-3 w-3" />
          End-to-end encrypted
        </p>

        {incomingCallError && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {incomingCallError}
          </div>
        )}

        <div className="mt-7 flex items-start justify-center gap-10">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white shadow-sm transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleDeclineIncomingCall()}
              disabled={Boolean(actionLoading)}
              aria-label={`Decline ${incomingCallTypeLabel.toLowerCase()}`}
            >
              {actionLoading === "decline" ? <span className="text-[11px] font-semibold">...</span> : <PhoneOff className="h-5 w-5" />}
            </button>
            <span className="text-[13px] font-medium text-slate-800">Decline</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white shadow-sm transition hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleAcceptIncomingCall()}
              disabled={Boolean(actionLoading)}
              aria-label={`Accept ${incomingCallTypeLabel.toLowerCase()}`}
            >
              {actionLoading === "accept" ? <span className="text-[11px] font-semibold">...</span> : <Phone className="h-5 w-5" />}
            </button>
            <span className="text-[13px] font-medium text-slate-800">Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
}
