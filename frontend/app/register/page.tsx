"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/axios";
import { AxiosError } from "axios";

export default function Register() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    if (!name) newErrors.name = ["Name is required"];
    if (!email) newErrors.email = ["Email is required"];
    else if (!validateEmail(email)) newErrors.email = ["Invalid email format"];
    if (!password) newErrors.password = ["Password is required"];
    else if (password.length < 8) newErrors.password = ["Password must be at least 8 characters"];
    if (!confirmPassword) newErrors.password_confirmation = ["Please confirm your password"];
    else if (password !== confirmPassword) newErrors.password_confirmation = ["Passwords do not match"];

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    try {
      await api.post('/register', {
        name,
        email,
        password,
        password_confirmation: confirmPassword,
      });
      router.push("/dashboard");
    } catch (error) {
      const axiosError = error as AxiosError<{ errors?: Record<string, string[]> }>;
      setErrors(axiosError.response?.data?.errors || { general: ["Network error. Please try again."] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-100 dark:bg-slate-900">
      <div className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-gradient-to-br from-sky-200 via-white to-transparent dark:from-sky-900 dark:via-slate-800 blur-3xl"></div>
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-gradient-to-br from-amber-200 via-white to-transparent dark:from-amber-900 dark:via-slate-800 blur-3xl"></div>

      <main className="relative flex min-h-screen items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-2xl border border-white/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-800/80 p-8 shadow-lg backdrop-blur-sm">
          <div className="mb-6 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">Get started</p>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Create your account</h1>
          </div>
          {errors.general && (
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400 rounded-xl text-xs">
              {errors.general[0]}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm bg-white dark:bg-slate-700 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none ${
                  errors.name ? "border-red-500 focus:border-red-500" : "border-slate-200 dark:border-slate-600 focus:border-blue-500"
                }`}
                placeholder="Your full name"
              />
              {errors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name[0]}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm bg-white dark:bg-slate-700 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none ${
                  errors.email ? "border-red-500 focus:border-red-500" : "border-slate-200 dark:border-slate-600 focus:border-blue-500"
                }`}
                placeholder="you@example.com"
              />
              {errors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.email[0]}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm bg-white dark:bg-slate-700 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none ${
                  errors.password ? "border-red-500 focus:border-red-500" : "border-slate-200 dark:border-slate-600 focus:border-blue-500"
                }`}
                placeholder="At least 8 characters"
              />
              {errors.password && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.password[0]}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm bg-white dark:bg-slate-700 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none ${
                  errors.password_confirmation ? "border-red-500 focus:border-red-500" : "border-slate-200 dark:border-slate-600 focus:border-blue-500"
                }`}
                placeholder="Re-enter your password"
              />
              {errors.password_confirmation && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.password_confirmation[0]}</p>}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 dark:bg-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-blue-400 dark:disabled:bg-blue-700 disabled:cursor-not-allowed"
            >
              {loading ? "Loading..." : "Create Account"}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
