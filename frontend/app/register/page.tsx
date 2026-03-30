"use client";

import { useState } from "react";
import Link from "next/link";
import api from "@/lib/axios";
import { AxiosError } from "axios";
import { normalizeEmail } from "@/lib/utils";
import Input from "@/components/Input";
import Button from "@/components/Button";
import Head from "@/components/Head";

export default function Register() {
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
        email: normalizeEmail(email),
        password,
        password_confirmation: confirmPassword,
      });
      await api.get("/user");
      window.location.assign("/dashboard");
    } catch (error) {
      const axiosError = error as AxiosError<{ errors?: Record<string, string[]> }>;
      setErrors(axiosError.response?.data?.errors || { general: ["Network error. Please try again."] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Create Account</title>
        <meta name="description" content="Create your dashboard account" />
      </Head>
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
            <Input
              label="Name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              error={errors.name?.[0]}
            />
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
              placeholder="At least 8 characters"
              error={errors.password?.[0]}
            />
            <Input
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              error={errors.password_confirmation?.[0]}
            />
            <Button type="submit" disabled={loading} loading={loading} fullWidth size="lg">
              Create Account
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium cursor-pointer">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
    </>
  );
}
