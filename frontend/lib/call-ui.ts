import type { CallStatus, ParticipantState } from "@/types/chat";

export interface CallLauncherEligibility {
  conversationType: string | null | undefined;
  participantState: ParticipantState | null | undefined;
  participantArchivedAt: string | null | undefined;
  counterpartParticipantState: ParticipantState | null | undefined;
  counterpartArchivedAt: string | null | undefined;
  counterpartHiddenAt: string | null | undefined;
  isBlockedConversation: boolean;
  callStatus: CallStatus;
}

export interface IncomingCallAcceptanceEligibility {
  participantState: ParticipantState | null | undefined;
  participantArchivedAt: string | null | undefined;
  isBlockedConversation: boolean;
  callStatus: CallStatus;
}

export const canShowCallLauncher = ({
  conversationType,
  participantState,
  participantArchivedAt,
  counterpartParticipantState,
  counterpartArchivedAt,
  counterpartHiddenAt,
  isBlockedConversation,
  callStatus,
}: CallLauncherEligibility): boolean =>
  conversationType === "direct" &&
  participantState === "accepted" &&
  participantArchivedAt === null &&
  counterpartParticipantState === "accepted" &&
  counterpartArchivedAt === null &&
  counterpartHiddenAt === null &&
  !isBlockedConversation &&
  callStatus === "idle";

export const canAcceptIncomingCall = ({
  participantState,
  participantArchivedAt,
  isBlockedConversation,
  callStatus,
}: IncomingCallAcceptanceEligibility): boolean =>
  participantState === "accepted" &&
  participantArchivedAt === null &&
  !isBlockedConversation &&
  callStatus !== "active" &&
  callStatus !== "connecting";
