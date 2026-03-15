import type { CSSProperties, ReactNode } from "react";

interface MessengerLayoutProps {
  showInfo: boolean;
  children: ReactNode;
}

export default function MessengerLayout({ showInfo, children }: MessengerLayoutProps) {
  return (
    <div
      className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/80 font-sans shadow-soft"
      style={
        {
          "--messenger-blue": "#1b74e4",
          "--messenger-blue-strong": "#0a66ff",
          "--messenger-soft": "#f0f2f5",
        } as CSSProperties
      }
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(27,116,228,0.12),transparent_40%),radial-gradient(circle_at_85%_85%,rgba(14,165,233,0.12),transparent_45%)]" />
      <div
        className={`relative grid h-auto min-h-[520px] grid-cols-1 transition-[grid-template-columns] duration-300 ease-in-out md:h-[calc(100dvh-7.8rem)] md:min-h-[560px] md:grid-cols-[280px_minmax(0,1fr)] ${
          showInfo ? "lg:grid-cols-[320px_minmax(0,1fr)_280px]" : "lg:grid-cols-[320px_minmax(0,1fr)]"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
