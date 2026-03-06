const DEFAULT_ONLINE_WINDOW_MS = 90 * 1000;

const toTimestamp = (input: string | number | Date | null | undefined): number | null => {
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }

  if (input instanceof Date) {
    const timestamp = input.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  const timestamp = Date.parse(input);
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const resolveServerClockOffsetMs = (serverTime: string | null | undefined): number | null => {
  const serverTimestamp = toTimestamp(serverTime);
  if (serverTimestamp === null) {
    return null;
  }

  return serverTimestamp - Date.now();
};

export const getNowFromServerOffset = (serverClockOffsetMs: number | null | undefined): number => {
  if (serverClockOffsetMs === null || serverClockOffsetMs === undefined || !Number.isFinite(serverClockOffsetMs)) {
    return Date.now();
  }

  return Date.now() + serverClockOffsetMs;
};

export const formatLastSeen = (
  lastSeenAt: string | null | undefined,
  now: string | number | Date,
  onlineWindowMs = DEFAULT_ONLINE_WINDOW_MS
): string | null => {
  const lastSeenTimestamp = toTimestamp(lastSeenAt);
  const nowTimestamp = toTimestamp(now);

  if (lastSeenTimestamp === null || nowTimestamp === null) {
    return null;
  }

  const diffMs = Math.max(0, nowTimestamp - lastSeenTimestamp);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;

  if (diffMs <= onlineWindowMs) {
    return "Online";
  }

  if (diffMs < hourMs) {
    const minutes = Math.max(1, Math.floor(diffMs / minuteMs));
    return `${minutes} min ago`;
  }

  const hours = Math.max(1, Math.floor(diffMs / hourMs));
  return `${hours} hr ago`;
};

