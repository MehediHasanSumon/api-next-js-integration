"use client";

import { X } from "lucide-react";

interface RecordingBarProps {
  recordingSeconds: number;
  onCancel: () => void;
  onSend: () => void;
}

const formatRecordingTime = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export default function RecordingBar({ recordingSeconds, onCancel, onSend }: RecordingBarProps) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm hover:bg-blue-500"
        onClick={onCancel}
        aria-label="Cancel recording"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex flex-1 items-center gap-3 rounded-full bg-[color:var(--messenger-blue)] px-3 py-2 text-white shadow-sm">
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
          onClick={onSend}
          aria-label="Stop recording"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>
        <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-[color:var(--messenger-blue-strong)]">
          {formatRecordingTime(recordingSeconds)}
        </span>
        <button
          type="button"
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
          onClick={onSend}
          aria-label="Send recording"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5l11 7-11 7V5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
