export type CallNetworkQuality = "excellent" | "good" | "poor" | "reconnecting" | "unavailable";

export interface CallQualitySample {
  roundTripTimeMs: number | null;
  connectionState?: string | null;
  iceConnectionState?: string | null;
  reconnecting?: boolean;
}

export const formatCallDuration = (durationSeconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(durationSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  }

  return [minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
};

export const classifyCallNetworkQuality = ({
  roundTripTimeMs,
  connectionState,
  iceConnectionState,
  reconnecting = false,
}: CallQualitySample): CallNetworkQuality => {
  if (reconnecting || connectionState === "disconnected" || connectionState === "failed" || iceConnectionState === "disconnected") {
    return "reconnecting";
  }

  if (connectionState === "connecting" || iceConnectionState === "checking") {
    return "unavailable";
  }

  if (roundTripTimeMs === null || !Number.isFinite(roundTripTimeMs)) {
    return "unavailable";
  }

  if (roundTripTimeMs <= 150) {
    return "excellent";
  }

  if (roundTripTimeMs <= 350) {
    return "good";
  }

  return "poor";
};

export const getNetworkQualityLabel = (quality: CallNetworkQuality): string => {
  switch (quality) {
    case "excellent":
      return "Excellent network";
    case "good":
      return "Good network";
    case "poor":
      return "Poor network";
    case "reconnecting":
      return "Reconnecting";
    default:
      return "Checking network";
  }
};

export const getNetworkQualityToneClassName = (quality: CallNetworkQuality): string => {
  switch (quality) {
    case "excellent":
      return "bg-emerald-500";
    case "good":
      return "bg-amber-400";
    case "poor":
      return "bg-rose-500";
    case "reconnecting":
      return "bg-sky-500";
    default:
      return "bg-slate-300";
  }
};

export const readCallQualitySampleFromStats = (statsReport: RTCStatsReport): CallQualitySample => {
  let selectedRttMs: number | null = null;

  statsReport.forEach((report) => {
    if (report.type !== "candidate-pair") {
      return;
    }

    const nominated = "nominated" in report ? report.nominated : false;
    const state = "state" in report ? report.state : null;
    const currentRoundTripTime = "currentRoundTripTime" in report ? report.currentRoundTripTime : null;

    if (!nominated && state !== "succeeded") {
      return;
    }

    if (typeof currentRoundTripTime !== "number" || !Number.isFinite(currentRoundTripTime)) {
      return;
    }

    selectedRttMs = Math.round(currentRoundTripTime * 1000);
  });

  return {
    roundTripTimeMs: selectedRttMs,
  };
};
