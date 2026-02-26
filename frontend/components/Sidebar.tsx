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
        className={`sidebar-transition fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 bg-white/90 backdrop-blur ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500 text-white font-semibold">AP</div>
            <div className="text-lg font-semibold tracking-wide">
              <span className="text-rose-500">D</span>
              <span className="text-orange-500">D</span>
              <span className="text-amber-500">R</span>
              <span className="text-emerald-500">B</span>
              <span className="text-sky-500">I</span>
              <span className="text-violet-500">T</span>
            </div>
          </div>
        </div>

        <nav className="h-[calc(100%-4rem)] overflow-y-auto px-4 py-6">
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
