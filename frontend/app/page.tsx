import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <h1 className="text-4xl font-bold text-black dark:text-white">Welcome Home</h1>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <Link href="/" className="flex h-12 w-full items-center justify-center rounded-full bg-zinc-900 px-5 text-white transition-colors hover:bg-zinc-700 md:w-[158px]">
            Home
          </Link>
          <Link href="/login" className="flex h-12 w-full items-center justify-center rounded-full bg-zinc-900 px-5 text-white transition-colors hover:bg-zinc-700 md:w-[158px]">
            Login
          </Link>
          <Link href="/register" className="flex h-12 w-full items-center justify-center rounded-full bg-zinc-900 px-5 text-white transition-colors hover:bg-zinc-700 md:w-[158px]">
            Register
          </Link>
          <Link href="/dashboard" className="flex h-12 w-full items-center justify-center rounded-full bg-zinc-900 px-5 text-white transition-colors hover:bg-zinc-700 md:w-[158px]">
            Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
