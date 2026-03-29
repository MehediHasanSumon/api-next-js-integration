import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallEventPayload } from "@/types/chat";

const startCallMock = vi.fn();
const showCallMock = vi.fn();
const acceptCallMock = vi.fn();
const declineCallMock = vi.fn();
const endCallMock = vi.fn();
const missCallMock = vi.fn();
const sendOfferMock = vi.fn();
const sendAnswerMock = vi.fn();
const sendIceCandidateMock = vi.fn();
const getEchoMock = vi.fn();

vi.mock("@/lib/chat-api", () => ({
  startCall: startCallMock,
  showCall: showCallMock,
  acceptCall: acceptCallMock,
  declineCall: declineCallMock,
  endCall: endCallMock,
  missCall: missCallMock,
  sendWebRtcOffer: sendOfferMock,
  sendWebRtcAnswer: sendAnswerMock,
  sendWebRtcIceCandidate: sendIceCandidateMock,
}));

vi.mock("@/lib/echo", () => ({
  getEcho: getEchoMock,
}));

describe("call signaling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("subscribes to all expected conversation signal events and leaves on cleanup", async () => {
    const listeners = new Map<string, (payload: unknown) => void>();
    const channel = {
      listen: vi.fn((event: string, handler: (payload: unknown) => void) => {
        listeners.set(event, handler);
        return channel;
      }),
    };
    const leave = vi.fn();

    getEchoMock.mockReturnValueOnce({
      private: vi.fn(() => channel),
    });
    getEchoMock.mockReturnValueOnce({
      leave,
    });

    const { createCallSignaling } = await import("@/lib/call-signaling");
    const signaling = createCallSignaling();
    const handlers = {
      onIncomingCall: vi.fn(),
      onCallAccepted: vi.fn(),
      onCallDeclined: vi.fn(),
      onCallEnded: vi.fn(),
      onCallMissed: vi.fn(),
      onOffer: vi.fn(),
      onAnswer: vi.fn(),
      onIceCandidate: vi.fn(),
    };

    const unsubscribe = signaling.subscribeToConversationSignals(99, handlers);

    expect(channel.listen).toHaveBeenCalledTimes(8);
    expect(Array.from(listeners.keys())).toEqual([
      ".call.invite",
      ".call.accepted",
      ".call.declined",
      ".call.ended",
      ".call.missed",
      ".webrtc.offer",
      ".webrtc.answer",
      ".webrtc.ice-candidate",
    ]);

    const payload = { conversation_id: 99, call: { id: 1 } } as unknown as CallEventPayload;
    listeners.get(".call.invite")?.(payload);
    expect(handlers.onIncomingCall).toHaveBeenCalledWith(payload);

    unsubscribe();
    expect(leave).toHaveBeenCalledWith("conversation.99");
  });

  it("proxies API actions through the chat-api layer", async () => {
    const { createCallSignaling } = await import("@/lib/call-signaling");
    const signaling = createCallSignaling();

    await signaling.startCall(7, { call_type: "audio" });
    await signaling.showCall(3);
    await signaling.acceptCall(3);
    await signaling.declineCall(3);
    await signaling.endCall(3);
    await signaling.missCall(3);
    await signaling.sendOffer(3, { type: "offer", sdp: "offer-sdp" });
    await signaling.sendAnswer(3, { type: "answer", sdp: "answer-sdp" });
    await signaling.sendIceCandidate(3, {
      candidate: "cand",
      sdp_mid: "0",
      sdp_m_line_index: 0,
      username_fragment: null,
    });

    expect(startCallMock).toHaveBeenCalledWith(7, { call_type: "audio" });
    expect(showCallMock).toHaveBeenCalledWith(3);
    expect(acceptCallMock).toHaveBeenCalledWith(3);
    expect(declineCallMock).toHaveBeenCalledWith(3);
    expect(endCallMock).toHaveBeenCalledWith(3);
    expect(missCallMock).toHaveBeenCalledWith(3);
    expect(sendOfferMock).toHaveBeenCalledWith(3, { type: "offer", sdp: "offer-sdp" });
    expect(sendAnswerMock).toHaveBeenCalledWith(3, { type: "answer", sdp: "answer-sdp" });
    expect(sendIceCandidateMock).toHaveBeenCalledWith(3, {
      candidate: "cand",
      sdp_mid: "0",
      sdp_m_line_index: 0,
      username_fragment: null,
    });
  });
});
