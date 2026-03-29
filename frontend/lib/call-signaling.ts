"use client";

import {
  acceptCall,
  declineCall,
  endCall,
  missCall,
  sendWebRtcAnswer,
  sendWebRtcIceCandidate,
  sendWebRtcOffer,
  showCall,
  startCall,
} from "@/lib/chat-api";
import { getEcho } from "@/lib/echo";
import type {
  CallEventPayload,
  CallResponse,
  ConversationId,
  StartCallPayload,
  WebRtcAnswerSignalEvent,
  WebRtcIceCandidatePayload,
  WebRtcIceCandidateSignalEvent,
  WebRtcOfferSignalEvent,
  WebRtcSessionDescriptionPayload,
} from "@/types/chat";

export interface CallSignalHandlers {
  onIncomingCall?: (payload: CallEventPayload) => void;
  onCallAccepted?: (payload: CallEventPayload) => void;
  onCallDeclined?: (payload: CallEventPayload) => void;
  onCallEnded?: (payload: CallEventPayload) => void;
  onCallMissed?: (payload: CallEventPayload) => void;
  onOffer?: (payload: WebRtcOfferSignalEvent) => void;
  onAnswer?: (payload: WebRtcAnswerSignalEvent) => void;
  onIceCandidate?: (payload: WebRtcIceCandidateSignalEvent) => void;
}

export const createCallSignaling = () => {
  const subscribeToConversationSignals = (
    conversationId: ConversationId,
    handlers: CallSignalHandlers
  ): (() => void) => {
    const echo = getEcho();
    if (!echo) {
      return () => undefined;
    }

    const channelName = `conversation.${conversationId}`;
    const channel = echo.private(channelName);

    channel.listen(".call.invite", (payload: CallEventPayload) => {
      handlers.onIncomingCall?.(payload);
    });

    channel.listen(".call.accepted", (payload: CallEventPayload) => {
      handlers.onCallAccepted?.(payload);
    });

    channel.listen(".call.declined", (payload: CallEventPayload) => {
      handlers.onCallDeclined?.(payload);
    });

    channel.listen(".call.ended", (payload: CallEventPayload) => {
      handlers.onCallEnded?.(payload);
    });

    channel.listen(".call.missed", (payload: CallEventPayload) => {
      handlers.onCallMissed?.(payload);
    });

    channel.listen(".webrtc.offer", (payload: WebRtcOfferSignalEvent) => {
      handlers.onOffer?.(payload);
    });

    channel.listen(".webrtc.answer", (payload: WebRtcAnswerSignalEvent) => {
      handlers.onAnswer?.(payload);
    });

    channel.listen(".webrtc.ice-candidate", (payload: WebRtcIceCandidateSignalEvent) => {
      handlers.onIceCandidate?.(payload);
    });

    return () => {
      const liveEcho = getEcho();
      if (!liveEcho) {
        return;
      }

      liveEcho.leave(channelName);
    };
  };

  return {
    startCall: (conversationId: ConversationId, payload: StartCallPayload): Promise<CallResponse> =>
      startCall(conversationId, payload),
    showCall: (callId: number): Promise<CallResponse> => showCall(callId),
    acceptCall: (callId: number): Promise<CallResponse> => acceptCall(callId),
    declineCall: (callId: number): Promise<CallResponse> => declineCall(callId),
    endCall: (callId: number): Promise<CallResponse> => endCall(callId),
    missCall: (callId: number): Promise<CallResponse> => missCall(callId),
    sendOffer: (callId: number, payload: WebRtcSessionDescriptionPayload) => sendWebRtcOffer(callId, payload),
    sendAnswer: (callId: number, payload: WebRtcSessionDescriptionPayload) => sendWebRtcAnswer(callId, payload),
    sendIceCandidate: (callId: number, payload: WebRtcIceCandidatePayload) =>
      sendWebRtcIceCandidate(callId, payload),
    subscribeToConversationSignals,
  };
};

const callSignaling = createCallSignaling();

export default callSignaling;
