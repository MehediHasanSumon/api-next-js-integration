"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { logout } from "@/store/authSlice";
import Button from "@/components/Button";

export default function Topbar({
  onMenuClick,
  isSidebarOpen,
}: {
  onMenuClick: () => void;
  isSidebarOpen: boolean;
}) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const [showProfile, setShowProfile] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const userInitial = (user?.name?.trim().charAt(0) || "U").toUpperCase();
  const userRole = user?.roles?.[0] || "Member";

  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      await dispatch(logout()).unwrap();
      router.replace("/login");
    } finally {
      setLoggingOut(false);
      setShowProfile(false);
    }
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!profileMenuRef.current) {
        return;
      }

      if (!profileMenuRef.current.contains(event.target as Node)) {
        setShowProfile(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur transition-[padding] duration-200 ${isSidebarOpen ? "lg:pl-[19rem]" : "lg:pl-4"}`}
    >
      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={onMenuClick}
          variant="outline"
          size="icon"
          className="text-slate-600"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </Button>
        <div className="hidden md:block">
          <p className="text-sm text-slate-500">Dashboard</p>
          <p className="text-sm font-semibold text-slate-900">Overview</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="icon" className="relative rounded-full text-slate-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500"></span>
        </Button>

        <div ref={profileMenuRef} className="relative">
          <Button
            type="button"
            onClick={() => setShowProfile(!showProfile)}
            variant="outline"
            size="md"
            className="h-10 rounded-xl border-slate-200 bg-white px-2.5 shadow-none hover:bg-slate-50"
            aria-haspopup="menu"
            aria-expanded={showProfile}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500 text-xs font-semibold text-white">
              {userInitial}
            </div>
            <div className="hidden text-left md:block">
              <p className="max-w-[140px] truncate text-sm font-semibold text-slate-900">{user?.name || "User"}</p>
              <p className="text-xs text-slate-500">{userRole}</p>
            </div>
            <svg
              className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${showProfile ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </Button>
          {showProfile && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="truncate text-sm font-semibold text-slate-900">{user?.name || "User"}</p>
                <p className="truncate text-xs text-slate-500">{user?.email || "No email"}</p>
                <p className="mt-1 inline-flex rounded-md bg-white px-2 py-0.5 text-[11px] font-medium capitalize text-slate-600">
                  {userRole}
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="md"
                fullWidth
                className="justify-start rounded-lg border-0 px-3 text-sm font-medium text-slate-700 shadow-none"
                onClick={() => setShowProfile(false)}
              >
                My Profile
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="md"
                fullWidth
                className="justify-start rounded-lg border-0 px-3 text-sm font-medium text-slate-700 shadow-none"
                onClick={() => setShowProfile(false)}
              >
                Settings
              </Button>

              <div className="my-2 border-t border-slate-100"></div>

              <Button
                type="button"
                onClick={handleLogout}
                variant="ghost"
                size="md"
                fullWidth
                disabled={loggingOut}
                className="justify-start rounded-lg border-0 px-3 text-sm font-medium text-rose-600 shadow-none hover:bg-rose-50 disabled:opacity-100"
              >
                {loggingOut ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" className="opacity-25" stroke="currentColor" strokeWidth="3"></circle>
                      <path d="M21 12a9 9 0 00-9-9" className="opacity-90" stroke="currentColor" strokeWidth="3" strokeLinecap="round"></path>
                    </svg>
                    Logging out...
                  </span>
                ) : (
                  "Logout"
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
