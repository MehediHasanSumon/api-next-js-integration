"use client";

import Link from "next/link";
import UserAvatar from "@/components/messenger/UserAvatar";
import type { ThreadItem } from "@/lib/chat-threads";

interface MessengerPreviewPanelProps {
  previewThread: ThreadItem | null;
  previewOnline: boolean;
}

export default function MessengerPreviewPanel({ previewThread, previewOnline }: MessengerPreviewPanelProps) {
  return (
    <section className="hidden h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,#ffffff_0%,#edf4ff_46%,#eef7ff_100%)] animate-[messengerRise_0.5s_ease] lg:flex">
      <div className="border-b border-slate-200/80 bg-white/70 px-5 py-4 backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-700/70">Preview</p>
        <p className="mt-1 text-sm font-semibold text-slate-900">Conversation Snapshot</p>
      </div>

      {previewThread ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-2xl rounded-[28px] border border-white/80 bg-white/88 p-6 shadow-[0_28px_60px_-34px_rgba(15,23,42,0.34)] backdrop-blur">
            <div className="flex items-center gap-4">
              <UserAvatar
                name={previewThread.name}
                size={52}
                isOnline={previewOnline}
                showStatus={previewThread.type === "direct"}
              />
              <div>
                <p className="text-lg font-semibold tracking-tight text-slate-900">{previewThread.name}</p>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{previewThread.handle}</p>
              </div>
            </div>

            <div className="mt-7 space-y-3">
              <div className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,#f8fbff,#f2f6fd)] px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last Message</p>
                <p className="mt-1.5 text-sm leading-6 text-slate-700">{previewThread.lastMessage}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.5)]">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Unread</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{previewThread.unread}</p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.5)]">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Status</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{previewOnline ? "Available now" : "Last seen later"}</p>
                </div>
              </div>
            </div>

            <Link
              href={`/message/t/${previewThread.id}`}
              className="mt-6 inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-800"
            >
              Open Conversation
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div>
            <p className="text-sm font-semibold text-slate-900">No preview available</p>
            <p className="mt-1 text-xs text-slate-500">Please reset filters to see conversations.</p>
          </div>
        </div>
      )}
    </section>
  );
}
