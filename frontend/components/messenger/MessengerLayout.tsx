import type { CSSProperties, ReactNode } from "react";

interface MessengerLayoutProps {
  showInfo: boolean;
  children: ReactNode;
}

export default function MessengerLayout({ showInfo, children }: MessengerLayoutProps) {
  return (
    <div
      className="relative overflow-hidden rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,251,255,0.9))] font-sans shadow-[0_30px_90px_-34px_rgba(15,23,42,0.34)]"
      style={
        {
          "--messenger-blue": "#2563eb",
          "--messenger-blue-strong": "#1d4ed8",
          "--messenger-soft": "#eef4ff",
        } as CSSProperties
      }
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(37,99,235,0.16),transparent_34%),radial-gradient(circle_at_82%_88%,rgba(14,165,233,0.14),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.25),rgba(248,250,252,0.12))]" />
      <div
        className={`relative grid h-auto min-h-[520px] grid-cols-1 transition-[grid-template-columns] duration-300 ease-in-out md:h-[calc(100dvh-7.8rem)] md:min-h-[560px] md:grid-cols-[300px_minmax(0,1fr)] ${
          showInfo ? "lg:grid-cols-[320px_minmax(0,1fr)_280px]" : "lg:grid-cols-[320px_minmax(0,1fr)]"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
