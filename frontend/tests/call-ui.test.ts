import { describe, expect, it } from "vitest";
import { canAcceptIncomingCall, canShowCallLauncher } from "@/lib/call-ui";

describe("call UI eligibility", () => {
  it("shows the call launcher only for an eligible direct conversation", () => {
    expect(
      canShowCallLauncher({
        conversationType: "direct",
        participantState: "accepted",
        participantArchivedAt: null,
        counterpartParticipantState: "accepted",
        counterpartArchivedAt: null,
        counterpartHiddenAt: null,
        isBlockedConversation: false,
        callStatus: "idle",
      })
    ).toBe(true);
  });

  it("hides the call launcher for blocked, archived, or non-idle states", () => {
    expect(
      canShowCallLauncher({
        conversationType: "direct",
        participantState: "accepted",
        participantArchivedAt: null,
        counterpartParticipantState: "accepted",
        counterpartArchivedAt: null,
        counterpartHiddenAt: null,
        isBlockedConversation: true,
        callStatus: "idle",
      })
    ).toBe(false);

    expect(
      canShowCallLauncher({
        conversationType: "direct",
        participantState: "accepted",
        participantArchivedAt: "2026-03-29T12:00:00Z",
        counterpartParticipantState: "accepted",
        counterpartArchivedAt: null,
        counterpartHiddenAt: null,
        isBlockedConversation: false,
        callStatus: "idle",
      })
    ).toBe(false);

    expect(
      canShowCallLauncher({
        conversationType: "direct",
        participantState: "accepted",
        participantArchivedAt: null,
        counterpartParticipantState: "accepted",
        counterpartArchivedAt: null,
        counterpartHiddenAt: null,
        isBlockedConversation: false,
        callStatus: "calling",
      })
    ).toBe(false);
  });

  it("allows incoming call acceptance only when the thread is still callable", () => {
    expect(
      canAcceptIncomingCall({
        participantState: "accepted",
        participantArchivedAt: null,
        isBlockedConversation: false,
        callStatus: "incoming",
      })
    ).toBe(true);

    expect(
      canAcceptIncomingCall({
        participantState: "accepted",
        participantArchivedAt: null,
        isBlockedConversation: false,
        callStatus: "active",
      })
    ).toBe(false);

    expect(
      canAcceptIncomingCall({
        participantState: "pending",
        participantArchivedAt: null,
        isBlockedConversation: false,
        callStatus: "incoming",
      })
    ).toBe(false);
  });
});
