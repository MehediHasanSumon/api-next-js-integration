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
    ? "rounded-full px-4 py-2 text-sm leading-relaxed shadow-[0_16px_34px_-24px_rgba(15,23,42,0.35)]"
    : "rounded-[22px] px-3.5 py-2.5 text-sm leading-relaxed shadow-[0_22px_48px_-30px_rgba(15,23,42,0.34)]";
  const bubbleTone = isTimelineEvent
    ? "border border-slate-200/80 bg-white/92 text-slate-600"
    : isSystem
    ? "border border-amber-200/80 bg-[linear-gradient(180deg,#fff8eb,#fff1d6)] text-amber-900"
    : isRemoved
      ? isMine
        ? "rounded-br-md border border-slate-200/80 bg-slate-100/95 text-slate-500"
        : "rounded-bl-md border border-slate-200/80 bg-slate-100/95 text-slate-500"
    : isMine
      ? "rounded-br-md border border-blue-500/30 bg-[linear-gradient(135deg,var(--messenger-blue),var(--messenger-blue-strong))] text-white"
      : "rounded-bl-md border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff,#f9fbff)] text-slate-800";

  return <div className={`${bubbleBase} ${bubbleTone} ${className ?? ""}`}>{children}</div>;
}
