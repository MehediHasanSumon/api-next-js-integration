import type { ReactNode } from "react";

interface MessengerInfoPanelProps {
  show: boolean;
  title?: string;
  children: ReactNode;
}

export default function MessengerInfoPanel({ show, title = "Details", children }: MessengerInfoPanelProps) {
  return (
    <aside
      className={`hidden h-full min-h-0 flex-col overflow-hidden border-l border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(245,249,255,0.94))] backdrop-blur lg:flex transition-all duration-300 ease-in-out ${
        show ? "opacity-100 translate-x-0" : "pointer-events-none opacity-0 translate-x-2"
      }`}
    >
      <div className="border-b border-slate-200/80 px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-700/65">{title}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
    </aside>
  );
}
