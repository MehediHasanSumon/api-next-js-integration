"use client";

import { useState } from "react";
import Link from "next/link";

export default function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [dropdowns, setDropdowns] = useState({ components: false });
  const componentItems = ["Buttons", "Cards", "Forms"];

  const closeOnMobile = () => {
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-slate-900/40 lg:hidden ${isOpen ? "" : "hidden"}`}
        onClick={onClose}
      ></div>
      
      <aside
        className={`sidebar-transition fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white/90 backdrop-blur ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="border-b border-slate-200 p-4">
          <div className="relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-blue-100 px-3 py-3 shadow-sm">
            <span className="pointer-events-none absolute -right-5 -top-5 h-16 w-16 rounded-full bg-sky-300/25 blur-xl"></span>
            <span className="pointer-events-none absolute -bottom-5 -left-5 h-16 w-16 rounded-full bg-blue-300/20 blur-xl"></span>
            <div className="relative flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold tracking-wide text-white shadow-md">
                DB
              </div>
              <div>
                <p className="text-lg font-extrabold tracking-[0.16em] text-slate-900">DDRBIT</p>
                <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">Control Center</p>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-6">
          <Link
            href="/dashboard"
            className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 px-3.5 py-3 text-sm font-semibold text-white shadow-soft ring-1 ring-slate-800/70 transition-all duration-200 hover:from-slate-800 hover:to-slate-700 hover:shadow-md"
            onClick={closeOnMobile}
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold text-white" aria-hidden="true">D</span>
            <span>Dashboard</span>
          </Link>

          <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:border-slate-300">
            <button
              type="button"
              onClick={() => setDropdowns((prev) => ({ ...prev, components: !prev.components }))}
              className={`flex w-full cursor-pointer items-center justify-between px-3.5 py-3 text-left text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-slate-50 ${dropdowns.components ? "bg-slate-50" : ""}`}
            >
              <span className="flex items-center gap-3">
                <span className="inline-block h-2 w-2 rounded-sm bg-slate-400" aria-hidden="true"></span>
                <span>Components</span>
              </span>
              <svg
                className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${dropdowns.components ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div
              className={`grid overflow-hidden transition-all duration-300 ease-out ${dropdowns.components ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
            >
              <div className="min-h-0">
                <div className="space-y-1 px-3 pb-3 pt-1">
                  {componentItems.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition-all duration-200 hover:bg-slate-100 hover:text-slate-800"
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300" aria-hidden="true"></span>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="mt-2 flex w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3.5 py-3 text-sm font-medium text-slate-700 transition-all duration-200 hover:border-slate-200 hover:bg-white hover:shadow-sm"
          >
            <span className="inline-block h-2 w-2 rounded-sm bg-slate-400" aria-hidden="true"></span>
            <span>Settings</span>
          </button>
        </nav>
      </aside>
    </>
  );
}
