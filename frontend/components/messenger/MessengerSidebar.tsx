import type { ReactNode } from "react";
import { MessengerSearchIcon } from "@/components/icons/messenger-icons";

interface MessengerSidebarProps {
  title: string;
  action?: ReactNode;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters?: ReactNode;
  children: ReactNode;
}

export default function MessengerSidebar({
  title,
  action,
  searchValue,
  onSearchChange,
  filters,
  children,
}: MessengerSidebarProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,248,255,0.92))] backdrop-blur">
      <div className="border-b border-slate-200/80 px-4 pb-4 pt-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-700/70">Messenger</p>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
          </div>
          {action}
        </div>

        <div className="relative">
          <MessengerSearchIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search Messenger"
            className="h-11 w-full rounded-2xl border border-white/80 bg-white/90 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_10px_24px_-18px_rgba(15,23,42,0.45)] focus:outline-none focus:ring-2 focus:ring-[color:var(--messenger-blue)]/20"
          />
        </div>
      </div>

      {filters && <div className="border-b border-slate-200/80 bg-white/55 px-3 py-3">{filters}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">{children}</div>
    </aside>
  );
}
