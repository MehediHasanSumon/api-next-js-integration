import type { Attachment } from "@/types/chat";

interface AttachmentItem {
  attachment: Attachment;
  url: string | null;
}

interface MessageAttachmentsProps {
  attachments: Attachment[];
  isMine: boolean;
  playingVoiceId: string | null;
  resolveAttachmentUrl: (attachment: Attachment) => string | null;
  onOpenImage: (url: string, name: string) => void;
  onPlayVoice: (attachmentId: string, url: string) => void;
  formatFileSize: (size: number) => string;
}

const waveformHeights = [6, 14, 10, 18, 8, 16, 12, 6, 14];

const formatDuration = (durationMs: number | null): string => {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) {
    return "--:--";
  }

  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export default function MessageAttachments({
  attachments,
  isMine,
  playingVoiceId,
  resolveAttachmentUrl,
  onOpenImage,
  onPlayVoice,
  formatFileSize,
}: MessageAttachmentsProps) {
  const attachmentItems: AttachmentItem[] = attachments.map((attachment) => ({
    attachment,
    url: resolveAttachmentUrl(attachment),
  }));

  const imageAttachments = attachmentItems.filter(
    (item) => item.attachment.attachment_type === "image" && item.url
  );
  const audioAttachments = attachmentItems.filter((item) => {
    const type = item.attachment.attachment_type as string;
    const isAudioType = type === "voice" || type === "audio";
    const isAudioMime = (item.attachment.mime_type ?? "").startsWith("audio/");
    return (isAudioType || isAudioMime) && item.url;
  });
  const fileAttachments = attachmentItems.filter((item) => {
    const type = item.attachment.attachment_type as string;
    if (type === "image" && item.url) {
      return false;
    }
    const isAudioType = type === "voice" || type === "audio";
    const isAudioMime = (item.attachment.mime_type ?? "").startsWith("audio/");
    if ((isAudioType || isAudioMime) && item.url) {
      return false;
    }
    return true;
  });

  return (
    <div className="mt-2 space-y-2">
      {imageAttachments.length > 0 && (
        <div className={`${imageAttachments.length > 1 ? "grid grid-cols-2 gap-2" : ""}`}>
          {imageAttachments.map(({ attachment, url }) => {
            const attachmentName =
              attachment.original_name || attachment.storage_path.split("/").pop() || "Image";

            return (
              <button
                key={String(attachment.id)}
                type="button"
                onClick={() => onOpenImage(url as string, attachmentName)}
                className={`overflow-hidden rounded-2xl border ${isMine ? "border-blue-200/40" : "border-slate-200"} ${
                  imageAttachments.length > 1 ? "h-36" : "h-60"
                } w-full bg-slate-100/30`}
                aria-label={`Open image ${attachmentName}`}
              >
                <img src={url as string} alt={attachmentName} className="h-full w-full object-cover" />
              </button>
            );
          })}
        </div>
      )}

      {audioAttachments.map(({ attachment, url }) => {
        const attachmentKey = String(attachment.id);
        const isPlaying = playingVoiceId === attachmentKey;

        return (
          <div
            key={attachmentKey}
            className="flex items-center gap-3 rounded-full bg-[color:var(--messenger-blue)] px-3 py-2 text-white"
          >
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[color:var(--messenger-blue-strong)] shadow-sm"
              onClick={() => onPlayVoice(attachmentKey, url as string)}
              aria-label="Play voice message"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5l11 7-11 7V5z" />
              </svg>
            </button>
            <div className="flex flex-1 items-center gap-1">
              {waveformHeights.map((height, index) => (
                <span
                  key={`${attachmentKey}-wave-${index}`}
                  className={`w-1 rounded-full ${isPlaying ? "bg-white" : "bg-white/80"}`}
                  style={{ height }}
                />
              ))}
            </div>
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-[color:var(--messenger-blue-strong)]">
              {formatDuration(attachment.duration_ms ?? null)}
            </span>
          </div>
        );
      })}

      {fileAttachments.map(({ attachment, url }) => {
        const attachmentName =
          attachment.original_name || attachment.storage_path.split("/").pop() || "Attachment";
        const attachmentUrl = url;
        const isImageAttachment = attachment.attachment_type === "image";

        return (
          <div
            key={String(attachment.id)}
            className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${
              isMine ? "bg-white/20" : "bg-slate-100"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
                  isMine ? "bg-white/30 text-white" : "bg-white text-slate-600"
                }`}
              >
                {isImageAttachment ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M14.752 11.168l-6.518 6.518a4 4 0 105.657 5.657l7.07-7.071a6 6 0 10-8.485-8.485l-7.07 7.071a8 8 0 1011.314 11.314l6.518-6.518"
                    />
                  </svg>
                )}
              </span>
              <div className="min-w-0">
                <p className={`truncate text-xs font-medium ${isMine ? "text-white" : "text-slate-700"}`}>
                  {attachmentName}
                </p>
                <p className={`text-[11px] ${isMine ? "text-blue-100" : "text-slate-500"}`}>
                  {formatFileSize(attachment.size_bytes)}
                </p>
              </div>
            </div>
            {attachmentUrl && (
              <a
                href={attachmentUrl}
                target="_blank"
                rel="noreferrer"
                download
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  isMine ? "bg-white/80 text-slate-700 hover:bg-white" : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Download
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
