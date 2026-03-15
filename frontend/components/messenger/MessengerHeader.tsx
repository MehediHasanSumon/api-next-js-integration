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
    <header className="flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 py-3">
      <div className="flex items-center gap-3">
        <UserAvatar name={avatarName ?? title} src={avatarUrl ?? null} size={40} isOnline={isOnline} />
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {subtitle ? <p className={`text-xs ${subtitleClassName ?? "text-slate-500"}`}>{subtitle}</p> : null}
        </div>
      </div>

      {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
    </header>
  );
}
