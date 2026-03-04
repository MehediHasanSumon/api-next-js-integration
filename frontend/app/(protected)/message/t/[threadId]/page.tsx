"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import ProtectedShell from "@/components/ProtectedShell";
import Button from "@/components/Button";
import { ChatMessage, threadMessages, threadSummaries } from "@/lib/messages-demo";

interface MessageAttachment {
  id: string;
  kind: "image" | "file";
  name: string;
  size: number;
}

interface MessageItem extends ChatMessage {
  attachments?: MessageAttachment[];
}

type ThreadFilter = "all" | "unread" | "online";
const EMPTY_MESSAGES: MessageItem[] = [];

const seedMessagesByThread = (): Record<string, MessageItem[]> => {
  return threadSummaries.reduce<Record<string, MessageItem[]>>((accumulator, thread) => {
    accumulator[thread.id] = (threadMessages[thread.id] ?? []).map((message) => ({ ...message }));
    return accumulator;
  }, {});
};

const formatFileSize = (size: number): string => {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export default function MessageThreadPage() {
  const params = useParams<{ threadId: string }>();
  const threadId = params?.threadId || "";

  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const [draft, setDraft] = useState("");
  const [messagesByThread, setMessagesByThread] = useState<Record<string, MessageItem[]>>(() => seedMessagesByThread());
  const [attachmentsByThread, setAttachmentsByThread] = useState<Record<string, MessageAttachment[]>>({});
  const [showInfoPanel, setShowInfoPanel] = useState(true);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = useMemo(() => threadSummaries.reduce((sum, thread) => sum + thread.unread, 0), []);
  const onlineCount = useMemo(() => threadSummaries.filter((thread) => thread.online).length, []);

  const filteredThreads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return threadSummaries.filter((thread) => {
      const matchesQuery =
        query === "" ||
        thread.name.toLowerCase().includes(query) ||
        thread.lastMessage.toLowerCase().includes(query) ||
        thread.handle.toLowerCase().includes(query);

      if (!matchesQuery) {
        return false;
      }

      if (filter === "unread") {
        return thread.unread > 0;
      }

      if (filter === "online") {
        return Boolean(thread.online);
      }

      return true;
    });
  }, [filter, searchQuery]);

  const activeThread = threadSummaries.find((thread) => thread.id === threadId) || threadSummaries[0];
  const messages = useMemo(
    () => messagesByThread[activeThread.id] ?? EMPTY_MESSAGES,
    [messagesByThread, activeThread.id]
  );
  const attachments = attachmentsByThread[activeThread.id] ?? [];

  useEffect(() => {
    if (!messageViewportRef.current) {
      return;
    }

    messageViewportRef.current.scrollTo({
      top: messageViewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, threadId]);

  const handleAttachmentSelect = (event: ChangeEvent<HTMLInputElement>, kind: "image" | "file") => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    const mapped = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      kind,
      name: file.name,
      size: file.size,
    }));

    setAttachmentsByThread((previous) => ({
      ...previous,
      [activeThread.id]: [...(previous[activeThread.id] ?? []), ...mapped],
    }));
    event.target.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachmentsByThread((previous) => ({
      ...previous,
      [activeThread.id]: (previous[activeThread.id] ?? []).filter((attachment) => attachment.id !== id),
    }));
  };

  const handleSend = (event: FormEvent) => {
    event.preventDefault();

    const message = draft.trim();
    if (message === "" && attachments.length === 0) {
      return;
    }

    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const messageToSend: MessageItem = {
      id: `${Date.now()}`,
      from: "me",
      text: message || "Sent attachment",
      time,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    setMessagesByThread((previous) => ({
      ...previous,
      [activeThread.id]: [...(previous[activeThread.id] ?? []), messageToSend],
    }));

    setDraft("");
    setAttachmentsByThread((previous) => ({
      ...previous,
      [activeThread.id]: [],
    }));
  };

  return (
    <ProtectedShell title={`${activeThread.name} Chat`} description={`${activeThread.name} conversation`} showPageHeader={false}>
      <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/90">
        <div
          className={`grid h-[calc(100dvh-7.8rem)] min-h-[560px] grid-cols-1 transition-[grid-template-columns] duration-300 ease-in-out ${
            showInfoPanel ? "lg:grid-cols-[320px_minmax(0,1fr)_280px]" : "lg:grid-cols-[320px_minmax(0,1fr)_0px]"
          }`}
        >
          <aside className="flex min-h-0 h-full flex-col border-r border-slate-200/80 bg-white/85">
            <div className="border-b border-slate-200/80 px-4 py-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Chats</h2>
                <Link href="/masseges" className="text-xs font-medium text-blue-600 hover:text-blue-700">
                  Inbox
                </Link>
              </div>

              <div className="relative">
                <svg className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search conversations"
                  className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1 border-b border-slate-200/80 p-2">
              <Button type="button" variant={filter === "all" ? "secondary" : "ghost"} size="sm" className="h-8 text-xs" onClick={() => setFilter("all")}>
                All
              </Button>
              <Button type="button" variant={filter === "unread" ? "secondary" : "ghost"} size="sm" className="h-8 text-xs" onClick={() => setFilter("unread")}>
                Unread {unreadCount > 0 ? `(${unreadCount})` : ""}
              </Button>
              <Button type="button" variant={filter === "online" ? "secondary" : "ghost"} size="sm" className="h-8 text-xs" onClick={() => setFilter("online")}>
                Online ({onlineCount})
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filteredThreads.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                  <p className="text-sm font-medium text-slate-700">No conversations found</p>
                  <p className="mt-1 text-xs text-slate-500">Try a different search or filter.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredThreads.map((thread) => {
                    const active = thread.id === threadId;

                    return (
                      <Link
                        key={thread.id}
                        href={`/message/t/${thread.id}`}
                        className={`flex items-start gap-3 rounded-xl px-2.5 py-2 transition ${
                          active ? "bg-blue-50 ring-1 ring-blue-100" : "hover:bg-slate-100"
                        }`}
                      >
                        <div className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-sm font-semibold text-white">
                          {thread.name.charAt(0)}
                          {thread.online && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-white bg-emerald-500"></span>}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">{thread.name}</p>
                            <span className="shrink-0 text-[11px] text-slate-500">{thread.lastTime}</span>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <p className="truncate text-xs text-slate-500">{thread.lastMessage}</p>
                            {thread.unread > 0 && (
                              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold text-white">
                                {thread.unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <section className={`flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] ${showInfoPanel ? "border-r border-slate-200/80" : ""}`}>
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/85 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-sm font-semibold text-white">
                  {activeThread.name.charAt(0)}
                  {activeThread.online && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-white bg-emerald-500"></span>}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{activeThread.name}</p>
                  <p className="text-xs text-slate-500">{activeThread.online ? "Online" : activeThread.handle}</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" className="text-slate-500" aria-label="Start call">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 19h8a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </Button>
                <Button
                  type="button"
                  variant={showInfoPanel ? "outline" : "ghost"}
                  size="icon"
                  className="text-slate-500"
                  onClick={() => setShowInfoPanel((previous) => !previous)}
                  aria-label="Toggle contact info"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Button>
              </div>
            </div>

            <div ref={messageViewportRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <div className="mx-auto w-fit rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                Today
              </div>

              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.from === "me" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[82%] rounded-2xl px-3 py-2 ${
                      message.from === "me"
                        ? "rounded-br-md bg-blue-600 text-white"
                        : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{message.text}</p>

                    {message.attachments && message.attachments.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {message.attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className={`flex items-center gap-2 rounded-lg px-2 py-1 ${
                              message.from === "me" ? "bg-blue-500/30" : "bg-slate-100"
                            }`}
                          >
                            <span className={`inline-flex h-5 w-5 items-center justify-center rounded ${message.from === "me" ? "bg-blue-400/50 text-white" : "bg-white text-slate-600"}`}>
                              {attachment.kind === "image" ? (
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              ) : (
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-6.518 6.518a4 4 0 105.657 5.657l7.07-7.071a6 6 0 10-8.485-8.485l-7.07 7.071a8 8 0 1011.314 11.314l6.518-6.518" />
                                </svg>
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className={`truncate text-xs font-medium ${message.from === "me" ? "text-white" : "text-slate-700"}`}>{attachment.name}</p>
                              <p className={`text-[11px] ${message.from === "me" ? "text-blue-100" : "text-slate-500"}`}>{formatFileSize(attachment.size)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className={`mt-1 text-[11px] ${message.from === "me" ? "text-blue-100" : "text-slate-500"}`}>{message.time}</p>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSend} className="border-t border-slate-200/80 bg-white px-4 py-3">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => handleAttachmentSelect(event, "image")}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => handleAttachmentSelect(event, "file")}
              />

              {attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <span key={attachment.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                      <span className="font-semibold">{attachment.kind === "image" ? "Photo" : "File"}</span>
                      <span className="max-w-[140px] truncate">{attachment.name}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] text-slate-700 hover:bg-slate-300"
                        aria-label="Remove attachment"
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="icon" className="text-slate-500" onClick={() => imageInputRef.current?.click()} aria-label="Attach photo">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </Button>
                <Button type="button" variant="ghost" size="icon" className="text-slate-500" onClick={() => fileInputRef.current?.click()} aria-label="Attach file">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-6.518 6.518a4 4 0 105.657 5.657l7.07-7.071a6 6 0 10-8.485-8.485l-7.07 7.071a8 8 0 1011.314 11.314l6.518-6.518" />
                  </svg>
                </Button>
                <input
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Type a message..."
                  className="h-10 flex-1 rounded-full border border-slate-300 bg-white px-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <Button type="submit" size="md" className="rounded-full px-4" disabled={draft.trim() === "" && attachments.length === 0}>
                  Send
                </Button>
              </div>
            </form>
          </section>

          <aside
            className={`hidden min-h-0 h-full flex-col overflow-hidden bg-white/85 transition-all duration-300 ease-in-out lg:flex ${
              showInfoPanel ? "opacity-100 translate-x-0" : "pointer-events-none opacity-0 translate-x-2"
            }`}
          >
            <div className="border-b border-slate-200/80 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact Info</p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
                <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-lg font-semibold text-white">
                  {activeThread.name.charAt(0)}
                  {activeThread.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500"></span>}
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-900">{activeThread.name}</p>
                <p className="text-xs text-slate-500">{activeThread.handle}</p>
                <p className="mt-1 text-[11px] font-medium text-emerald-600">{activeThread.online ? "Online now" : "Offline"}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">About</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  Team support channel for release updates, incident follow-ups, and operational coordination.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shared Media</p>
                  <Button type="button" variant="ghost" size="sm" className="h-auto border-0 px-0 py-0 text-[11px] font-medium text-blue-600 shadow-none hover:bg-transparent hover:text-blue-700">
                    View all
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <div key={index} className="aspect-square rounded-md bg-slate-100"></div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-2">
                <Button type="button" variant="ghost" size="sm" fullWidth className="justify-start border-0 text-xs font-medium text-slate-700 shadow-none">
                  Search in conversation
                </Button>
                <Button type="button" variant="ghost" size="sm" fullWidth className="justify-start border-0 text-xs font-medium text-slate-700 shadow-none">
                  Mute notifications
                </Button>
                <Button type="button" variant="ghost" size="sm" fullWidth className="justify-start border-0 text-xs font-medium text-rose-600 shadow-none hover:bg-rose-50">
                  Block / Report
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </ProtectedShell>
  );
}
