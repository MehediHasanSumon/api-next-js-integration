"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= 1024 : false));

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-100">
      <div className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-gradient-to-br from-sky-200 via-white to-transparent blur-3xl"></div>
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-gradient-to-br from-amber-200 via-white to-transparent blur-3xl"></div>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Topbar isSidebarOpen={sidebarOpen} onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

      <main className={`relative pt-20 transition-[padding] duration-200 ${sidebarOpen ? "lg:pl-72" : "lg:pl-0"}`}>
        <div className="px-4 pb-10 sm:px-6 lg:px-10">
          <div className="mb-8 flex flex-col gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">Dashboard Overview</h1>
            <p className="text-sm text-slate-500">Monitor product health, revenue signals, and live operations across teams.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-soft">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-500">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">+12%</span>
              </div>
              <p className="mt-4 text-sm text-slate-500">Total Users</p>
              <p className="text-2xl font-semibold text-slate-900">24,532</p>
              <p className="mt-2 text-xs text-slate-400">Active in last 30 days</p>
            </div>

            <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-soft">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">+5.4%</span>
              </div>
              <p className="mt-4 text-sm text-slate-500">Total Revenue</p>
              <p className="text-2xl font-semibold text-slate-900">$45,231</p>
              <p className="mt-2 text-xs text-slate-400">Q1 pipeline closed</p>
            </div>

            <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-soft">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                </div>
                <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">-2.1%</span>
              </div>
              <p className="mt-4 text-sm text-slate-500">Bounce Rate</p>
              <p className="text-2xl font-semibold text-slate-900">42.3%</p>
              <p className="mt-2 text-xs text-slate-400">Lower is better</p>
            </div>

            <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-soft">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">+18%</span>
              </div>
              <p className="mt-4 text-sm text-slate-500">Page Views</p>
              <p className="text-2xl font-semibold text-slate-900">84.2k</p>
              <p className="mt-2 text-xs text-slate-400">Live in last hour</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
