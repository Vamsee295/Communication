import React, { useEffect, useState } from "react";
import { X, FileText, Film, Music, Loader2 } from "lucide-react";

export interface StagedFile {
  id: string;
  file: File;
  objectUrl?: string;
  /** 0–1 */
  progress?: number;
  error?: string;
  attachmentId?: string;
}

interface MediaPreviewBarProps {
  stagedFiles: StagedFile[];
  caption: string;
  onCaptionChange: (value: string) => void;
  onRemove: (id: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StagedItemThumbnail({ sf, onRemove }: { sf: StagedFile; onRemove: () => void }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const isImage = sf.file.type.startsWith("image/");
  const isVideo = sf.file.type.startsWith("video/");
  const isAudio = sf.file.type.startsWith("audio/");

  useEffect(() => {
    if (isImage) {
      const url = URL.createObjectURL(sf.file);
      setThumbUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [sf.file, isImage]);

  const progress = sf.progress ?? 0;
  const hasError = Boolean(sf.error);
  const isUploading = !hasError && progress > 0 && progress < 1;
  const isDone = !hasError && progress >= 1;

  return (
    <div className="group relative flex-shrink-0 select-none">
      <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-border/80 bg-muted/60 shadow-sm transition-all group-hover:border-primary/50">
        {isImage && thumbUrl ? (
          <img
            src={thumbUrl}
            alt={sf.file.name}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : isVideo ? (
          <div className="flex h-full w-full items-center justify-center bg-foreground/5">
            <Film className="h-6 w-6 text-foreground/40" />
          </div>
        ) : isAudio ? (
          <div className="flex h-full w-full items-center justify-center bg-primary/10">
            <Music className="h-6 w-6 text-primary" />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-amber-500/10 px-1">
            <FileText className="h-5 w-5 text-amber-600" />
            <span className="truncate text-[9px] font-bold text-amber-700 max-w-full px-1">
              {sf.file.name.split(".").pop()?.toUpperCase()}
            </span>
          </div>
        )}

        {/* Upload progress indicator */}
        {(isUploading || isDone) && !hasError && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
            <div
              className={["h-full transition-all", isDone ? "bg-emerald-500" : "bg-primary"].join(" ")}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}

        {/* Error badge */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-destructive/80 text-white">
            <span className="text-[10px] font-semibold">Error</span>
          </div>
        )}
      </div>

      {/* Remove button badge */}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-foreground text-background shadow-md hover:bg-foreground/80 transition-transform active:scale-90"
        aria-label={`Remove ${sf.file.name}`}
      >
        <X className="h-3 w-3" />
      </button>

      {/* Subtle filename below thumbnail */}
      <p className="mt-1 w-20 truncate text-center text-[10px] font-medium text-muted-foreground leading-tight">
        {sf.file.name}
      </p>
    </div>
  );
}

export function MediaPreviewBar({ stagedFiles, caption, onCaptionChange, onRemove }: MediaPreviewBarProps) {
  if (stagedFiles.length === 0) return null;

  return (
    <div className="card-elevated mb-2 overflow-hidden rounded-2xl border border-border/80 bg-card p-3 shadow-lg animate-scale-in">
      {/* Thumbnails strip */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
        {stagedFiles.map((sf) => (
          <StagedItemThumbnail key={sf.id} sf={sf} onRemove={() => onRemove(sf.id)} />
        ))}
      </div>

      {/* Inline caption input */}
      <div className="mt-2.5 flex items-center rounded-xl bg-surface-2 px-3 py-2 border border-border/50">
        <input
          type="text"
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value)}
          placeholder="Add a caption…"
          className="w-full bg-transparent text-xs sm:text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Caption for attachment"
          autoFocus
        />
      </div>
    </div>
  );
}

