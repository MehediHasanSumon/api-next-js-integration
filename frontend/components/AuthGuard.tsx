"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { pingPresence } from "@/lib/presence-api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchUser, markSessionExpired } from "@/store/authSlice";
import { subscribeToSessionExpired } from "@/lib/session-events";

const PRESENCE_HEARTBEAT_INTERVAL_MS = 30 * 1000;

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { loading, user, sessionExpired } = useAppSelector((state) => state.auth);
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
    return subscribeToSessionExpired(() => {
      dispatch(markSessionExpired());
    });
  }, [dispatch]);

  useEffect(() => {
    if (!user || sessionExpired) {
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
  }, [clearHeartbeatInterval, sendPresencePing, sessionExpired, startHeartbeatInterval, user]);

  const loginHref =
    typeof window === "undefined"
      ? "/login"
      : `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zinc-900 dark:border-white"></div>
      </div>
    );
  }

  return (
    <>
      {sessionExpired && user && (
        <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <p className="text-sm text-amber-800">
              Your session expired. Sign in again to continue without losing your current screen state.
            </p>
            <Link
              href={loginHref}
              className="inline-flex shrink-0 items-center rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-700"
            >
              Sign in again
            </Link>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
