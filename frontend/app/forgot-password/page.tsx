"use client";

import { useState } from "react";
import Link from "next/link";
import { AxiosError } from "axios";
import api from "@/lib/axios";
import { normalizeEmail } from "@/lib/utils";
import Input from "@/components/Input";
import Button from "@/components/Button";
import Head from "@/components/Head";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [successMessage, setSuccessMessage] = useState("");

  const validateEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    setSuccessMessage("");

    const newErrors: Record<string, string[]> = {};

    if (!email) {
      newErrors.email = ["Email is required"];
    } else if (!validateEmail(email)) {
      newErrors.email = ["Invalid email format"];
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    try {
      const response = await api.post("/forgot-password", {
        email: normalizeEmail(email),
      });

      setSuccessMessage(response.data?.message || "Reset link sent.");
    } catch (error) {
      const axiosError = error as AxiosError<{ errors?: Record<string, string[]>; message?: string }>;

      if (axiosError.response?.data?.errors) {
        setErrors(axiosError.response.data.errors);
      } else {
        setErrors({ general: [axiosError.response?.data?.message || "Failed to send reset link."] });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Forgot Password</title>
        <meta name="description" content="Request a password reset link" />
      </Head>
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 px-4 dark:bg-slate-900">
        <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/85 p-8 shadow-lg backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/85">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Forgot Password</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Enter your email and we will send you a reset link.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              error={errors.email?.[0]}
            />

            {errors.general && <p className="text-xs text-amber-600 dark:text-amber-400">{errors.general[0]}</p>}
            {successMessage && <p className="text-xs text-emerald-600 dark:text-emerald-400">{successMessage}</p>}

            <Button type="submit" loading={loading} disabled={loading} fullWidth size="lg">
              Send Reset Link
            </Button>
          </form>

          <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">
            Remember your password?{" "}
            <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
              Back to Login
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
