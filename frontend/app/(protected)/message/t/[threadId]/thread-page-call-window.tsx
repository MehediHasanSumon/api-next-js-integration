"use client";

import type { CSSProperties, ReactNode, RefObject } from "react";
import {
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  PhoneOff,
  UserPlus,
  Video,
  VideoOff,
} from "lucide-react";
import UserAvatar from "@/components/messenger/UserAvatar";
import type { CallStatus, CallSummary } from "@/types/chat";

interface CallWindowProps {
  displayName: string;
  avatarUrl: string | null;
  currentCall: CallSummary | null;
  callStatus: CallStatus;
  statusLabel: string;
  errorMessage: string | null;
  showDuration: boolean;
  durationLabel: string;
  networkLabel: string;
  networkToneClassName: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  localVideoRef: RefObject<HTMLVideoElement | null>;
  remoteVideoRef: RefObject<HTMLVideoElement | null>;
  incomingActionLoading: "accept" | "decline" | null;
  onAcceptIncoming: () => void;
  onDeclineIncoming: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onEndCall: () => void;
}

interface ControlButtonProps {
  label: string;
  onClick?: () => void;
  active?: boolean;
  tone?: "neutral" | "danger" | "accept";
  disabled?: boolean;
  children: ReactNode;
}

function CallWindowControlButton({
  label,
  onClick,
  active = false,
  tone = "neutral",
  disabled = false,
  children,
}: ControlButtonProps) {
  const toneClasses =
    tone === "danger"
      ? "bg-red-500 text-white hover:bg-red-400"
      : tone === "accept"
        ? "bg-emerald-500 text-white hover:bg-emerald-400"
        : active
          ? "bg-white text-slate-900 hover:bg-white/90"
          : "bg-white/16 text-white hover:bg-white/24";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 shadow-[0_18px_38px_-24px_rgba(15,23,42,0.9)] backdrop-blur transition disabled:cursor-not-allowed disabled:opacity-60 ${toneClasses}`}
      title={label}
    >
      {children}
    </button>
  );
}

const backgroundStyle = (avatarUrl: string | null): CSSProperties | undefined =>
  avatarUrl
    ? {
        backgroundImage: `url(${avatarUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;

export default function ThreadPageCallWindow({
  displayName,
  avatarUrl,
  currentCall,
  callStatus,
  statusLabel,
  errorMessage,
  showDuration,
  durationLabel,
  networkLabel,
  networkToneClassName,
  localStream,
  remoteStream,
  isMuted,
  isCameraOff,
  localVideoRef,
  remoteVideoRef,
  incomingActionLoading,
  onAcceptIncoming,
  onDeclineIncoming,
  onToggleMute,
  onToggleCamera,
  onEndCall,
}: CallWindowProps) {
  const isIncoming = callStatus === "incoming";
  const isVideoCall = currentCall?.call_type === "video";
  const showVideoStage = isVideoCall && (remoteStream || localStream);
  const showRemoteVideo = isVideoCall && Boolean(remoteStream);
  const topLabel = currentCall?.call_type === "video" ? "Video call" : "Audio call";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#111315] text-white">
      <div className="absolute inset-0 scale-110 blur-3xl" style={backgroundStyle(avatarUrl)} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(148,163,184,0.08),transparent_34%),linear-gradient(180deg,rgba(22,24,28,0.52),rgba(15,23,42,0.78))]" />
      <div className="absolute inset-0 bg-black/30" />

      <div className="relative flex min-h-screen flex-col">
        <header className="flex items-start gap-4 px-5 pb-4 pt-5">
          <div className="flex min-w-0 items-start gap-3">
            <UserAvatar
              name={displayName}
              src={avatarUrl}
              size={42}
              showStatus={false}
              className="rounded-full ring-1 ring-white/15"
            />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-white/95">{displayName}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-white/70">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>End-to-end encrypted</span>
              </div>
            </div>
          </div>
        </header>

        <main className="relative flex flex-1 flex-col items-center justify-center px-6 pb-36 pt-6">
          {showVideoStage ? (
            <div className="absolute inset-x-6 top-24 bottom-32 overflow-hidden rounded-[30px] border border-white/10 bg-black/30 shadow-[0_40px_120px_-48px_rgba(15,23,42,0.9)]">
              {showRemoteVideo ? (
                <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-black/30 text-center">
                  <div>
                    <p className="text-lg font-medium text-white/95">{displayName}</p>
                    <p className="mt-2 text-sm text-white/60">{statusLabel}</p>
                  </div>
                </div>
              )}

              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.14),transparent_22%,transparent_72%,rgba(15,23,42,0.35))]" />

              <div className="absolute left-5 top-5 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-black/35 px-3 py-1 text-[11px] font-medium text-white/85 backdrop-blur">
                  {topLabel}
                </span>
                {showDuration ? (
                  <span className="rounded-full bg-black/35 px-3 py-1 text-[11px] font-medium text-white/85 backdrop-blur">
                    {durationLabel}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-2 rounded-full bg-black/35 px-3 py-1 text-[11px] font-medium text-white/85 backdrop-blur">
                  <span className={`h-2 w-2 rounded-full ${networkToneClassName}`} />
                  {networkLabel}
                </span>
              </div>

              <div className="absolute bottom-5 right-5 h-28 w-20 overflow-hidden rounded-[22px] border border-white/15 bg-black/40 shadow-xl sm:h-36 sm:w-24">
                {localStream && !isCameraOff ? (
                  <video ref={localVideoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-white/75">
                    <VideoOff className="h-6 w-6" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <div className="absolute inset-0 scale-125 rounded-full bg-white/10 blur-3xl" />
                <div
                  className={`relative rounded-full p-2 ${
                    callStatus === "calling" || callStatus === "connecting"
                      ? "animate-[pulse_2.5s_ease-in-out_infinite] bg-white/10"
                      : "bg-white/8"
                  }`}
                >
                  <UserAvatar
                    name={displayName}
                    src={avatarUrl}
                    size={isIncoming ? 112 : 124}
                    showStatus={false}
                    className="rounded-full ring-4 ring-white/12"
                  />
                </div>
              </div>

              <p className="mt-6 text-sm font-medium uppercase tracking-[0.34em] text-white/40">{topLabel}</p>
              <h1 className="mt-4 text-center text-3xl font-semibold tracking-tight text-white sm:text-[2.5rem]">{displayName}</h1>
              <p className="mt-3 text-center text-base text-white/70">{statusLabel}</p>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {showDuration ? (
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
                    {durationLabel}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
                  <span className={`h-2 w-2 rounded-full ${networkToneClassName}`} />
                  {networkLabel}
                </span>
              </div>
            </>
          )}

          {errorMessage ? (
            <div className="mt-6 rounded-2xl border border-rose-400/25 bg-rose-500/12 px-4 py-3 text-sm text-rose-100 backdrop-blur">
              {errorMessage}
            </div>
          ) : null}
        </main>

        <footer className="absolute inset-x-0 bottom-0 px-5 pb-8 pt-4">
          <div className="mx-auto flex w-fit items-center gap-4 rounded-full border border-white/10 bg-black/20 px-5 py-4 shadow-[0_24px_80px_-30px_rgba(15,23,42,0.95)] backdrop-blur-xl">
            {isIncoming ? (
              <>
                <CallWindowControlButton
                  label="Decline call"
                  tone="danger"
                  onClick={onDeclineIncoming}
                  disabled={incomingActionLoading !== null}
                >
                  <PhoneOff className="h-5 w-5" />
                </CallWindowControlButton>
                <CallWindowControlButton
                  label="Accept call"
                  tone="accept"
                  onClick={onAcceptIncoming}
                  disabled={incomingActionLoading !== null}
                >
                  <Phone className="h-5 w-5" />
                </CallWindowControlButton>
              </>
            ) : (
              <>
                <CallWindowControlButton label="Present screen" disabled>
                  <MonitorUp className="h-5 w-5" />
                </CallWindowControlButton>
                <CallWindowControlButton label="Add participant" disabled>
                  <UserPlus className="h-5 w-5" />
                </CallWindowControlButton>
                <CallWindowControlButton label={isCameraOff ? "Turn camera on" : "Turn camera off"} onClick={onToggleCamera} active={!isCameraOff}>
                  {isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </CallWindowControlButton>
                <CallWindowControlButton label={isMuted ? "Unmute microphone" : "Mute microphone"} onClick={onToggleMute} active={!isMuted}>
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </CallWindowControlButton>
                <CallWindowControlButton label="End call" tone="danger" onClick={onEndCall}>
                  <PhoneOff className="h-5 w-5" />
                </CallWindowControlButton>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
