import type { ReactNode } from "react";

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
    <aside className="flex h-full min-h-0 flex-col border-r border-slate-200/80 bg-white/90 backdrop-blur animate-[messengerRise_0.4s_ease]">
      <div className="border-b border-slate-200/80 px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Messenger</p>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          </div>
          {action}
        </div>

        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
          </svg>
          <input
            type="text"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search Messenger"
            className="h-10 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--messenger-blue)]/30"
          />
        </div>
      </div>

      {filters && <div className="border-b border-slate-200/80 px-3 py-2">{filters}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">{children}</div>
    </aside>
  );
}
