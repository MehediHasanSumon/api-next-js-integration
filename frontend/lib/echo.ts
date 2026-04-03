"use client";

import Echo from "laravel-echo";
import Pusher from "pusher-js";
import api from "@/lib/axios";
import { ensureCsrfCookie } from "@/lib/csrf";

declare global {
  interface Window {
    Pusher: typeof Pusher;
    __laravelEchoInstance?: Echo<"reverb">;
  }
}

let echoInstance: Echo<"reverb"> | null = null;

const normalizeApiUrl = (): string => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured.");
  }

  return apiUrl.replace(/\/$/, "");
};

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const getEcho = (): Echo<"reverb"> | null => {
  if (typeof window === "undefined") {
    return null;
  }

  if (echoInstance) {
    return echoInstance;
  }

  const apiUrl = normalizeApiUrl();
  const key = process.env.NEXT_PUBLIC_REVERB_APP_KEY;
  const wsHost = process.env.NEXT_PUBLIC_REVERB_HOST || window.location.hostname;
  const scheme = process.env.NEXT_PUBLIC_REVERB_SCHEME || (window.location.protocol === "https:" ? "https" : "http");
  const forceTLS = scheme === "https";
  const wsPort = toNumber(process.env.NEXT_PUBLIC_REVERB_PORT, forceTLS ? 443 : 80);

  if (!key) {
    throw new Error("NEXT_PUBLIC_REVERB_APP_KEY is not configured.");
  }

  window.Pusher = Pusher;

  echoInstance = new Echo<"reverb">({
    broadcaster: "reverb",
    key,
    wsHost,
    wsPort,
    wssPort: wsPort,
    forceTLS,
    enabledTransports: ["ws", "wss"],
    withCredentials: true,
    authEndpoint: `${apiUrl}/broadcasting/auth`,
    auth: {
      headers: {
        Accept: "application/json",
      },
    },
    authorizer: (channel: { name: string }) => ({
      authorize: (socketId, callback) => {
        void (async () => {
          try {
            await ensureCsrfCookie();

            const response = await api.post("/broadcasting/auth", {
              socket_id: socketId,
              channel_name: channel.name,
            });

            callback(null, response.data);
          } catch (error) {
            const authError = error instanceof Error ? error : new Error("Broadcast authentication failed.");
            callback(authError, { auth: "" });
          }
        })();
      },
    }),
  });

  window.__laravelEchoInstance = echoInstance;

  return echoInstance;
};

export const disconnectEcho = (): void => {
  if (!echoInstance) {
    return;
  }

  echoInstance.disconnect();
  if (typeof window !== "undefined") {
    delete window.__laravelEchoInstance;
  }
  echoInstance = null;
};
