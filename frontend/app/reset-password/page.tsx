"use client";

import { useState } from "react";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import api from "@/lib/axios";
import { normalizeEmail } from "@/lib/utils";
import Input from "@/components/Input";
import Button from "@/components/Button";
import Head from "@/components/Head";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const tokenValue = query.get("token");
    const emailValue = query.get("email");

    if (tokenValue) setToken(tokenValue);
    if (emailValue) setEmail(emailValue);
  }, []);

  const validateEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    setSuccessMessage("");

    const newErrors: Record<string, string[]> = {};

    if (!email) newErrors.email = ["Email is required"];
    else if (!validateEmail(email)) newErrors.email = ["Invalid email format"];

    if (!token) newErrors.token = ["Reset token is required"];
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
      const response = await api.post("/reset-password", {
        token,
        email: normalizeEmail(email),
        password,
        password_confirmation: confirmPassword,
      });

      setSuccessMessage(response.data?.message || "Password reset successful.");

      setTimeout(() => {
        router.push("/login");
      }, 1200);
    } catch (error) {
      const axiosError = error as AxiosError<{ errors?: Record<string, string[]>; message?: string }>;

      if (axiosError.response?.data?.errors) {
        setErrors(axiosError.response.data.errors);
      } else {
        setErrors({ general: [axiosError.response?.data?.message || "Failed to reset password."] });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Reset Password</title>
        <meta name="description" content="Set a new account password" />
      </Head>
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 px-4 dark:bg-slate-900">
        <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/85 p-8 shadow-lg backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/85">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Reset Password</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Enter your new password to complete reset.
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
            <Input
              label="Reset Token"
              type="text"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste token"
              error={errors.token?.[0]}
            />
            <Input
              label="New Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              error={errors.password?.[0]}
            />
            <Input
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter password"
              error={errors.password_confirmation?.[0]}
            />

            {errors.general && <p className="text-xs text-amber-600 dark:text-amber-400">{errors.general[0]}</p>}
            {successMessage && <p className="text-xs text-emerald-600 dark:text-emerald-400">{successMessage}</p>}

            <Button type="submit" loading={loading} disabled={loading}>
              Reset Password
            </Button>
          </form>

          <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">
            Back to{" "}
            <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
              Login
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
