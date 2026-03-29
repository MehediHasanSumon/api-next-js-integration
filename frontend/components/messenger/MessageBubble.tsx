import type { ReactNode } from "react";

interface MessageBubbleProps {
  isMine: boolean;
  isSystem?: boolean;
  isRemoved?: boolean;
  isTimelineEvent?: boolean;
  className?: string;
  children: ReactNode;
}

export default function MessageBubble({
  isMine,
  isSystem = false,
  isRemoved = false,
  isTimelineEvent = false,
  className,
  children,
}: MessageBubbleProps) {
  const bubbleBase = isTimelineEvent
    ? "rounded-full px-4 py-2 text-sm leading-relaxed"
    : "rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm";
  const bubbleTone = isTimelineEvent
    ? "border border-slate-200 bg-white/90 text-slate-600 shadow-sm"
    : isSystem
    ? "border border-amber-200/70 bg-amber-50 text-amber-900"
    : isRemoved
      ? isMine
        ? "rounded-br-md border border-slate-200 bg-slate-100 text-slate-500"
        : "rounded-bl-md border border-slate-200 bg-slate-100 text-slate-500"
    : isMine
      ? "rounded-br-md bg-[linear-gradient(135deg,var(--messenger-blue),var(--messenger-blue-strong))] text-white"
      : "rounded-bl-md border border-slate-200 bg-white text-slate-800";

  return <div className={`${bubbleBase} ${bubbleTone} ${className ?? ""}`}>{children}</div>;
}
