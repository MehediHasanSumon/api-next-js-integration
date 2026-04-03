"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Phone, PhoneOff, X } from "lucide-react";
import UserAvatar from "@/components/messenger/UserAvatar";
import { getEcho } from "@/lib/echo";
import callSignaling from "@/lib/call-signaling";
import {
  closeCallWindow,
  navigateCallWindow,
  openCallWindowPlaceholder,
  setManagedPopupCallId,
} from "@/lib/call-window";
import { createCallToneController, type CallToneController } from "@/lib/call-tones";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { resetCallState, setCurrentCall, setIncomingCallPayload, setCallStatus } from "@/store/callSlice";
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

      clearIncomingCall();
    };

    channel.listen(".call.invite", handleIncomingCall);
    channel.listen(".call.accepted", handleTerminalCallEvent);
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

    const popup = openCallWindowPlaceholder(incomingCallPayload.conversationId);
    if (!popup) {
      setIncomingCallError("Please allow popups in your browser to answer calls.");
      return;
    }

    setActionLoading("accept");
    setIncomingCallError(null);

    try {
      const response = await callSignaling.acceptCall(incomingCallPayload.call.id);
      setManagedPopupCallId(response.data.id);
      navigateCallWindow(popup, {
        conversationId: incomingCallPayload.conversationId,
        callId: response.data.id,
        mode: "incoming",
      });
      clearIncomingCall();
    } catch {
      closeCallWindow(popup);
      setIncomingCallError("Unable to answer the call right now.");
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20">
      <div className="absolute inset-0 bg-slate-950/22 backdrop-blur-[1px]" />
      <div className="relative w-full max-w-[330px] overflow-hidden rounded-[18px] bg-[#2f2f31] text-white shadow-[0_30px_90px_-36px_rgba(15,23,42,0.9)] ring-1 ring-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_45%)]" />

        <div className="relative px-5 pb-6 pt-5">
          <div className="flex items-center justify-center">
            <p className="text-[14px] font-semibold text-white/95">Incoming call</p>
            <button
              type="button"
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/12 text-white/80 transition hover:bg-white/18 disabled:opacity-50"
              aria-label="Close incoming call dialog"
              onClick={() => void handleDeclineIncomingCall()}
              disabled={Boolean(actionLoading)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-8 flex justify-center">
            <UserAvatar
              name={incomingCallerName}
              src={null}
              size={78}
              showStatus={false}
              className="ring-4 ring-white/10"
            />
          </div>

          <h2 className="mx-auto mt-5 max-w-[240px] text-center text-[24px] font-bold leading-[1.08] tracking-tight text-white">
            {incomingCallerName} is calling you
          </h2>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-[13px] font-medium text-white/60">
            <Lock className="h-3.5 w-3.5" />
            End-to-end encrypted
          </p>

          {incomingCallError ? (
            <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/12 px-3 py-2 text-center text-xs text-rose-100">
              {incomingCallError}
            </div>
          ) : null}

          <div className="mt-7 flex items-start justify-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#ef2f2f] text-white shadow-sm transition hover:bg-[#f24949] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void handleDeclineIncomingCall()}
                disabled={Boolean(actionLoading)}
                aria-label="Decline incoming call"
              >
                {actionLoading === "decline" ? <span className="text-[11px] font-semibold">...</span> : <PhoneOff className="h-5 w-5" />}
              </button>
              <span className="text-[13px] font-medium text-white/90">Decline</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#2fb344] text-white shadow-sm transition hover:bg-[#40c657] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void handleAcceptIncomingCall()}
                disabled={Boolean(actionLoading)}
                aria-label="Accept incoming call"
              >
                {actionLoading === "accept" ? <span className="text-[11px] font-semibold">...</span> : <Phone className="h-5 w-5" />}
              </button>
              <span className="text-[13px] font-medium text-white/90">Accept</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
