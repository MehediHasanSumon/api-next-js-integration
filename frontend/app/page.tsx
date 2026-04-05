import Link from "next/link";

const highlights = [
  {
    title: "Realtime Messaging",
    description: "Direct chat, group conversations, typing state, reactions, forwarding, and private attachments.",
  },
  {
    title: "Presence and Activity",
    description: "Online status tracking, live message updates, and shared team visibility across conversations.",
  },
  {
    title: "Admin Control",
    description: "Manage users, roles, and permissions from a clean dashboard with filters and bulk actions.",
  },
];

const shortcuts = [
  { href: "/login", label: "Sign In" },
  { href: "/register", label: "Create Account" },
  { href: "/dashboard", label: "Open Dashboard" },
  { href: "/messages", label: "Go to Messages" },
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#eef4ff_46%,#f7f1e8_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-6rem] h-72 w-72 rounded-full bg-sky-200/60 blur-3xl" />
        <div className="absolute right-[-6rem] top-24 h-80 w-80 rounded-full bg-amber-200/50 blur-3xl" />
        <div className="absolute bottom-[-5rem] left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-100/70 blur-3xl" />
      </div>

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 pb-10 pt-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between rounded-full border border-white/70 bg-white/65 px-4 py-3 shadow-soft backdrop-blur sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-700">Unified Workspace</p>
            <h1 className="text-sm font-semibold text-slate-900 sm:text-base">Team Chat and Admin Suite</h1>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            <Link
              href="/login"
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Get Started
            </Link>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[minmax(0,1.1fr)_460px] lg:py-16">
          <div>
            <div className="inline-flex rounded-full border border-sky-200 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
              Messenger, Presence, RBAC
            </div>

            <h2 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              One place to manage conversations, teams, and daily operations.
            </h2>

            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              This workspace combines realtime messaging, direct and group collaboration, presence tracking, and
              admin management into a single flow.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Explore Dashboard
              </Link>
              <Link
                href="/messages"
                className="inline-flex items-center rounded-full border border-slate-300 bg-white/85 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
              >
                Open Messages
              </Link>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {highlights.map((item) => (
                <article
                  key={item.title}
                  className="rounded-3xl border border-white/80 bg-white/75 p-5 shadow-soft backdrop-blur"
                >
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-x-10 top-8 -z-10 h-32 rounded-full bg-sky-200/50 blur-3xl" />
            <div className="rounded-[2rem] border border-white/80 bg-white/80 p-5 shadow-soft backdrop-blur sm:p-6">
              <div className="rounded-[1.6rem] bg-slate-950 p-5 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Live Status</p>
                    <h3 className="mt-2 text-xl font-semibold">Workspace Overview</h3>
                  </div>
                  <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                    Systems Healthy
                  </span>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Unread Threads</p>
                    <p className="mt-2 text-3xl font-semibold">18</p>
                    <p className="mt-2 text-xs text-slate-300">Across inbox, requests, and archived follow-ups.</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Online Members</p>
                    <p className="mt-2 text-3xl font-semibold">42</p>
                    <p className="mt-2 text-xs text-slate-300">Presence heartbeat is active for visible teammates.</p>
                  </div>
                </div>

                <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Conversation Activity</p>
                      <p className="mt-1 text-xs text-slate-400">Realtime message, reaction, and activity events</p>
                    </div>
                    <span className="text-xs font-semibold text-sky-300">Streaming</span>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl bg-white/5 px-4 py-3">
                      <p className="text-sm font-medium">Product Team</p>
                      <p className="mt-1 text-xs text-slate-400">New attachments, replies, and read receipts synced.</p>
                    </div>
                    <div className="rounded-2xl bg-white/5 px-4 py-3">
                      <p className="text-sm font-medium">Support Room</p>
                      <p className="mt-1 text-xs text-slate-400">Presence updates and moderation actions available.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[1.6rem] border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Quick Access</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {shortcuts.map((shortcut) => (
                    <Link
                      key={shortcut.href}
                      href={shortcut.href}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                    >
                      {shortcut.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
