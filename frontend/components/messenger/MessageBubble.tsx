import type { ReactNode } from "react";

interface MessageBubbleProps {
  isMine: boolean;
  isSystem?: boolean;
  className?: string;
  children: ReactNode;
}

export default function MessageBubble({ isMine, isSystem = false, className, children }: MessageBubbleProps) {
  const bubbleBase = "rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm";
  const bubbleTone = isSystem
    ? "border border-amber-200/70 bg-amber-50 text-amber-900"
    : isMine
      ? "rounded-br-md bg-[linear-gradient(135deg,var(--messenger-blue),var(--messenger-blue-strong))] text-white"
      : "rounded-bl-md border border-slate-200 bg-white text-slate-800";

  return <div className={`${bubbleBase} ${bubbleTone} ${className ?? ""}`}>{children}</div>;
}
