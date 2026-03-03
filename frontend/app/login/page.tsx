"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/axios";
import { AxiosError } from "axios";
import { normalizeEmail } from "@/lib/utils";
import Input from "@/components/Input";
import Button from "@/components/Button";
import Checkbox from "@/components/Checkbox";
import Head from "@/components/Head";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const validateEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Frontend validation
    const newErrors: Record<string, string[]> = {};
    if (!email) newErrors.email = ["Email is required"];
    else if (!validateEmail(email)) newErrors.email = ["Invalid email format"];
    if (!password) newErrors.password = ["Password is required"];

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      await api.post("/login", {
        email: normalizeEmail(email),
        password,
        remember: rememberMe,
      });
      router.push("/dashboard");
    } catch (error) {
      const axiosError = error as AxiosError<{ errors?: Record<string, string[]>; message?: string }>;
      if (axiosError.response?.data?.errors) {
        setErrors(axiosError.response.data.errors);
      } else {
        setErrors({ general: [axiosError.response?.data?.message || "Login failed"] });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Sign In</title>
        <meta name="description" content="Sign in to your dashboard account" />
      </Head>
      <div className="relative min-h-screen overflow-hidden bg-slate-100 dark:bg-slate-900">
      <div className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-gradient-to-br from-sky-200 via-white to-transparent dark:from-sky-900 dark:via-slate-800 blur-3xl"></div>
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-gradient-to-br from-amber-200 via-white to-transparent dark:from-amber-900 dark:via-slate-800 blur-3xl"></div>

      <main className="relative flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-white/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-800/80 p-8 shadow-lg backdrop-blur-sm">
          <div className="mb-6 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">Welcome back</p>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Sign in to Dashboard</h1>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              error={errors.email?.[0]}
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              error={errors.password?.[0]}
            />
            {errors.general && <p className="text-xs text-amber-600 dark:text-amber-400">{errors.general[0]}</p>}
            <div className="flex items-center justify-between text-sm">
              <Checkbox
                label="Remember me"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <Link href="/forgot-password" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer">
                Forgot password?
              </Link>
            </div>
            <Button type="submit" disabled={loading} loading={loading}>
              Sign In
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium cursor-pointer">
              Create account
            </Link>
          </p>
        </div>
      </main>
    </div>
    </>
  );
}
