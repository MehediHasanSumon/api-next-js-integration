import type { ReactNode } from "react";

interface MessengerHeaderProps {
  title: string;
  subtitle?: string;
  subtitleClassName?: string;
  avatarText?: string;
  actions?: ReactNode;
  isOnline?: boolean;
}

export default function MessengerHeader({
  title,
  subtitle,
  subtitleClassName,
  avatarText,
  actions,
  isOnline = false,
}: MessengerHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--messenger-blue)] text-sm font-semibold text-white shadow-sm">
          {avatarText}
          <span
            className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
              isOnline ? "bg-emerald-500" : "bg-slate-300"
            }`}
          />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {subtitle ? <p className={`text-xs ${subtitleClassName ?? "text-slate-500"}`}>{subtitle}</p> : null}
        </div>
      </div>

      {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
    </header>
  );
}
