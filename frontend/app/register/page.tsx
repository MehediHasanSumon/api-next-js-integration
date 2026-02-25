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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-md p-8 bg-white dark:bg-zinc-900 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-8 text-black dark:text-white">
          Register
        </h1>

        {errors.general && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg text-sm">
            {errors.general[0]}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-800 text-black dark:text-white ${
                errors.name ? "border-red-500" : "border-zinc-300 dark:border-zinc-700"
              }`}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name[0]}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-800 text-black dark:text-white ${
                errors.email ? "border-red-500" : "border-zinc-300 dark:border-zinc-700"
              }`}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email[0]}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-800 text-black dark:text-white ${
                errors.password ? "border-red-500" : "border-zinc-300 dark:border-zinc-700"
              }`}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password[0]}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-800 text-black dark:text-white ${
                errors.password_confirmation ? "border-red-500" : "border-zinc-300 dark:border-zinc-700"
              }`}
            />
            {errors.password_confirmation && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password_confirmation[0]}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed cursor-pointer text-white font-medium rounded-lg transition-colors"
          >
            {loading ? "Loading..." : "Register"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 hover:underline font-medium">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
