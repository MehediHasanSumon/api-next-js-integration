"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { pingPresence } from "@/lib/presence-api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchUser } from "@/store/authSlice";

const PRESENCE_HEARTBEAT_INTERVAL_MS = 30 * 1000;

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { loading, user } = useAppSelector((state) => state.auth);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingInFlightRef = useRef(false);

  const clearHeartbeatInterval = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const sendPresencePing = useCallback(async () => {
    if (!user || pingInFlightRef.current) {
      return;
    }

    pingInFlightRef.current = true;
    try {
      await pingPresence();
    } catch {
      // Heartbeat is best-effort and should not block the app.
    } finally {
      pingInFlightRef.current = false;
    }
  }, [user]);

  const startHeartbeatInterval = useCallback(() => {
    clearHeartbeatInterval();

    if (!user || document.visibilityState !== "visible") {
      return;
    }

    heartbeatIntervalRef.current = setInterval(() => {
      void sendPresencePing();
    }, PRESENCE_HEARTBEAT_INTERVAL_MS);
  }, [clearHeartbeatInterval, sendPresencePing, user]);

  useEffect(() => {
    dispatch(fetchUser()).unwrap().catch(() => router.push('/login'));
  }, [dispatch, router]);

  useEffect(() => {
    if (!user) {
      clearHeartbeatInterval();
      return;
    }

    void sendPresencePing();
    startHeartbeatInterval();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void sendPresencePing();
        startHeartbeatInterval();
      } else {
        clearHeartbeatInterval();
      }
    };

    const handleWindowFocus = () => {
      void sendPresencePing();
      startHeartbeatInterval();
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearHeartbeatInterval();
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearHeartbeatInterval, sendPresencePing, startHeartbeatInterval, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zinc-900 dark:border-white"></div>
      </div>
    );
  }

  return <>{children}</>;
}
