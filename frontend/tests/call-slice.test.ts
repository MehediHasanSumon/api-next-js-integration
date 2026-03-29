import { describe, expect, it } from "vitest";
import reducer, {
  resetCallState,
  setCallError,
  setCallStatus,
  setIncomingCallPayload,
  setMuted,
  updateCallFromSignal,
} from "@/store/callSlice";
import type { CallSummary } from "@/types/chat";

const buildCall = (overrides: Partial<CallSummary> = {}): CallSummary => ({
  id: 42,
  conversation_id: 7,
  caller_id: 1,
  receiver_id: 2,
  call_type: "audio",
  status: "ringing",
  started_at: "2026-03-29T12:00:00Z",
  answered_at: null,
  ended_at: null,
  duration_seconds: null,
  end_reason: null,
  metadata: null,
  created_at: "2026-03-29T12:00:00Z",
  updated_at: "2026-03-29T12:00:00Z",
  caller: { id: 1, name: "Caller", email: "caller@example.com" },
  receiver: { id: 2, name: "Receiver", email: "receiver@example.com" },
  ...overrides,
});

describe("callSlice", () => {
  it("stores incoming call payload and syncs current call fields", () => {
    const call = buildCall({ call_type: "video" });
    const state = reducer(
      undefined,
      setIncomingCallPayload({
        conversationId: 7,
        call,
      })
    );

    expect(state.incomingCallPayload?.call.id).toBe(42);
    expect(state.currentCall?.id).toBe(42);
    expect(state.callType).toBe("video");
  });

  it("moves state to failed when a call error is set", () => {
    const state = reducer(undefined, setCallError("Permission denied"));

    expect(state.error).toBe("Permission denied");
    expect(state.callStatus).toBe("failed");
  });

  it("updates only the active call when a signal payload matches", () => {
    const initial = reducer(undefined, setIncomingCallPayload({ conversationId: 7, call: buildCall() }));
    const updated = reducer(
      initial,
      updateCallFromSignal({
        id: 42,
        status: "accepted",
        call_type: "video",
      })
    );

    const ignored = reducer(
      updated,
      updateCallFromSignal({
        id: 999,
        status: "ended",
      })
    );

    expect(updated.currentCall?.status).toBe("accepted");
    expect(updated.callType).toBe("video");
    expect(ignored.currentCall?.id).toBe(42);
    expect(ignored.currentCall?.status).toBe("accepted");
  });

  it("resets media and status flags back to idle", () => {
    const withState = [
      setIncomingCallPayload({ conversationId: 7, call: buildCall() }),
      setCallStatus("active"),
      setMuted(true),
      setCallError(null),
    ].reduce(reducer, undefined as ReturnType<typeof reducer> | undefined);

    const reset = reducer(withState, resetCallState());

    expect(reset.currentCall).toBeNull();
    expect(reset.callStatus).toBe("idle");
    expect(reset.callType).toBeNull();
    expect(reset.isMuted).toBe(false);
    expect(reset.error).toBeNull();
  });
});
