import api from "@/lib/axios";

export interface PresencePingResponse {
  message: string;
  server_time: string;
  data: {
    user_id: number;
    is_online: boolean;
    last_seen_at: string | null;
    last_active_at: string | null;
    online_window_seconds: number;
  };
}

export interface PresenceStatusItem {
  user_id: number;
  is_online: boolean;
  last_seen_at: string | null;
}

export interface PresenceStatusResponse {
  message: string;
  server_time: string;
  online_window_seconds: number;
  data: PresenceStatusItem[];
}

export const pingPresence = async (): Promise<PresencePingResponse> => {
  const { data } = await api.post<PresencePingResponse>("/presence/ping");
  return data;
};

export const getPresenceStatus = async (ids: number[]): Promise<PresenceStatusResponse> => {
  const normalizedIds = Array.from(new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));

  if (normalizedIds.length === 0) {
    return {
      message: "Presence status fetched.",
      server_time: new Date().toISOString(),
      online_window_seconds: 90,
      data: [],
    };
  }

  const { data } = await api.get<PresenceStatusResponse>("/presence/status", {
    params: {
      ids: normalizedIds.join(","),
    },
  });

  return data;
};
