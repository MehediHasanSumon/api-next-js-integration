import type { ReactNode } from "react";
import UserAvatar from "@/components/messenger/UserAvatar";

interface MessengerHeaderProps {
  title: string;
  subtitle?: string;
  subtitleClassName?: string;
  avatarName?: string | null;
  avatarUrl?: string | null;
  actions?: ReactNode;
  isOnline?: boolean;
}

export default function MessengerHeader({
  title,
  subtitle,
  subtitleClassName,
  avatarName,
  avatarUrl,
  actions,
  isOnline = false,
}: MessengerHeaderProps) {
  return (
    <header className="relative z-30 flex items-center justify-between border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.9))] px-5 py-3.5 backdrop-blur">
      <div className="flex items-center gap-3">
        <UserAvatar name={avatarName ?? title} src={avatarUrl ?? null} size={40} isOnline={isOnline} />
        <div>
          <p className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</p>
          {subtitle ? <p className={`text-xs ${subtitleClassName ?? "text-slate-500"}`}>{subtitle}</p> : null}
        </div>
      </div>

      {actions ? <div className="relative z-40 flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
