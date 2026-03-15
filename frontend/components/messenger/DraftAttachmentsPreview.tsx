interface DraftAttachmentPreviewItem {
  id: string;
  file: File;
  previewUrl: string | null;
  status: "uploading" | "ready" | "error";
  progress: number;
  error: string | null;
}

interface DraftAttachmentsPreviewProps {
  items: DraftAttachmentPreviewItem[];
  onRemove: (id: string) => void;
  onOpenImage: (url: string, name: string) => void;
  formatFileSize: (size: number) => string;
}

export default function DraftAttachmentsPreview({
  items,
  onRemove,
  onOpenImage,
  formatFileSize,
}: DraftAttachmentsPreviewProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {items.map((item) => {
        const isImage = item.previewUrl !== null;

        return (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-2 py-1 text-xs text-slate-700 shadow-sm"
          >
            {isImage ? (
              <button
                type="button"
                onClick={() => onOpenImage(item.previewUrl ?? "", item.file.name)}
                className="rounded-md"
                aria-label={`Open image ${item.file.name}`}
              >
                <img src={item.previewUrl ?? ""} alt={item.file.name} className="h-10 w-10 rounded-md object-cover" />
              </button>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M14.752 11.168l-6.518 6.518a4 4 0 105.657 5.657l7.07-7.071a6 6 0 10-8.485-8.485l-7.07 7.071a8 8 0 1011.314 11.314l6.518-6.518"
                  />
                </svg>
              </div>
            )}
            <div className="min-w-0">
              <p className="max-w-[120px] truncate font-medium text-slate-700">{item.file.name}</p>
              <p className="text-[11px] text-slate-500">
                {formatFileSize(item.file.size)}
                {item.status === "uploading" && ` · ${item.progress}%`}
                {item.status === "error" && " · failed"}
              </p>
              {item.status === "uploading" && (
                <div className="mt-1 h-1 w-full rounded-full bg-slate-200">
                  <div
                    className="h-1 rounded-full bg-slate-600 transition-[width]"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}
              {item.error && <p className="text-[11px] text-rose-600">{item.error}</p>}
            </div>
            <button
              type="button"
              className="ml-auto text-slate-400 hover:text-slate-700"
              onClick={() => onRemove(item.id)}
              aria-label="Remove attachment"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
