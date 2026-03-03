import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 px-4 dark:bg-slate-900">
      <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/85 p-8 text-center shadow-lg backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/85">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Reset Password</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Password reset flow is not wired yet. Contact support or return to login.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          Back to Login
        </Link>
      </div>
    </main>
  );
}
