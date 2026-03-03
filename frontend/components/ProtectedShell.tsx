"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

interface ProtectedShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export default function ProtectedShell({ title, description, children }: ProtectedShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= 1024 : false));

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-100">
      <div className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-gradient-to-br from-sky-200 via-white to-transparent blur-3xl"></div>
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-gradient-to-br from-amber-200 via-white to-transparent blur-3xl"></div>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Topbar isSidebarOpen={sidebarOpen} onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

      <main className={`relative pt-20 transition-[padding] duration-200 ${sidebarOpen ? "lg:pl-72" : "lg:pl-0"}`}>
        <div className="px-4 pb-10 sm:px-6 lg:px-10">
          <div className="mb-8 flex flex-col gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
            {description && <p className="text-sm text-slate-500">{description}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
