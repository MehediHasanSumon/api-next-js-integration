"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/axios";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/user')
      .then(() => setLoading(false))
      .catch(() => router.push('/login'));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center">
        <p className="text-xl text-zinc-600 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  return <>{children}</>;
}
