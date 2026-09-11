import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Trash2, Plus, Smile, Send, Loader2, FileText, Film, Music } from "lucide-react";
import { EmojiPickerPopover } from "./emoji-picker-popover";

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
  onCancel?: () => void;
  onSend?: () => void;
  onAddFiles?: (files: File[]) => void;
  isSending?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaPreviewBar({
  stagedFiles,
  caption,
  onCaptionChange,
  onRemove,
  onCancel,
  onSend,
  onAddFiles,
  isSending = false,
}: MediaPreviewBarProps) {
  if (stagedFiles.length === 0) return null;

  const [activeId, setActiveId] = useState<string>(stagedFiles[0]?.id || "");
  const [showEmoji, setShowEmoji] = useState(false);
  const [mounted, setMounted] = useState(false);
  const addFilesInputRef = useRef<HTMLInputElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Ensure activeId remains valid when items are removed
  useEffect(() => {
    if (!stagedFiles.some((f) => f.id === activeId)) {
      setActiveId(stagedFiles[0]?.id || "");
    }
  }, [stagedFiles, activeId]);

  const activeFile = stagedFiles.find((f) => f.id === activeId) || stagedFiles[0];

  // Object URL for active item
  const [activeThumbUrl, setActiveThumbUrl] = useState<string | null>(null);
  const isImage = activeFile?.file.type.startsWith("image/");
  const isVideo = activeFile?.file.type.startsWith("video/");
  const isAudio = activeFile?.file.type.startsWith("audio/");

  useEffect(() => {
    if (activeFile && (isImage || isVideo)) {
      const url = URL.createObjectURL(activeFile.file);
      setActiveThumbUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setActiveThumbUrl(null);
    }
  }, [activeFile?.id, activeFile?.file, isImage, isVideo]);

  const handleAddMoreFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0 && onAddFiles) {
      onAddFiles(files);
    }
    e.target.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && onCancel) {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter" && !e.shiftKey && onSend) {
      e.preventDefault();
      onSend();
    }
  };

  const activeIndex = stagedFiles.findIndex((f) => f.id === activeFile?.id);

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex flex-col justify-between bg-background/98 text-foreground select-none animate-in fade-in duration-150"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Media composition preview"
    >
      {/* Top Action Bar (Header: flex-shrink-0) */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 border-b border-border/40">
        <button
          type="button"
          onClick={onCancel || (() => onRemove(activeFile.id))}
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          aria-label="Cancel and close preview"
        >
          <X className="h-6 w-6" />
        </button>

        <div className="flex flex-col items-center">
          {stagedFiles.length > 1 ? (
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {activeIndex + 1} of {stagedFiles.length}
            </span>
          ) : (
            <span className="text-xs font-semibold text-foreground truncate max-w-[200px] sm:max-w-[320px]">
              {activeFile?.file.name}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground/80">
            {formatBytes(activeFile?.file.size || 0)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            onRemove(activeFile.id);
            if (stagedFiles.length === 1 && onCancel) onCancel();
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors cursor-pointer"
          aria-label={`Remove ${activeFile?.file.name}`}
          title="Remove image"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      {/* Main Hero Media Area (Flex 1, min-h-0, overflow-hidden) */}
      <div className="flex flex-1 min-h-0 items-center justify-center overflow-hidden px-4 py-3 bg-muted/20">
        {isImage && activeThumbUrl ? (
          <img
            src={activeThumbUrl}
            alt={activeFile.file.name}
            className="max-h-full max-w-full w-auto h-auto rounded-2xl object-contain shadow-xl border border-border/30 select-none"
            draggable={false}
          />
        ) : isVideo && activeThumbUrl ? (
          <video
            src={activeThumbUrl}
            controls
            className="max-h-full max-w-full w-auto h-auto rounded-2xl object-contain shadow-xl border border-border/30"
          />
        ) : isAudio ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-card p-8 border border-border/60 shadow-lg">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/15 text-primary">
              <Music className="h-8 w-8" />
            </div>
            <p className="text-sm font-semibold text-foreground">{activeFile.file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(activeFile.file.size)}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-card p-8 border border-border/60 shadow-lg">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-amber-500/15 text-amber-600">
              <FileText className="h-8 w-8" />
            </div>
            <p className="text-sm font-semibold text-foreground">{activeFile.file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(activeFile.file.size)}</p>
          </div>
        )}
      </div>

      {/* Bottom Composition & Controls Area (Footer: flex-shrink-0) */}
      <div className="flex shrink-0 flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 border-t border-border/40 bg-card/60 backdrop-blur-md">
        {/* Thumbnail Tray (if multiple files or add button) */}
        {stagedFiles.length > 1 && (
          <div className="mx-auto flex max-w-lg items-center gap-2 overflow-x-auto py-1 scrollbar-none">
            {stagedFiles.map((sf, index) => {
              const isSelected = sf.id === activeFile?.id;
              const isSfImg = sf.file.type.startsWith("image/");
              return (
                <button
                  key={sf.id}
                  type="button"
                  onClick={() => setActiveId(sf.id)}
                  className={[
                    "relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border transition-all cursor-pointer",
                    isSelected
                      ? "border-primary ring-2 ring-primary scale-105 opacity-100 shadow-md"
                      : "border-border/60 opacity-60 hover:opacity-100",
                  ].join(" ")}
                  aria-label={`Select item ${index + 1}`}
                >
                  {isSfImg ? (
                    <ThumbnailImage file={sf.file} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </button>
              );
            })}

            {onAddFiles && (
              <button
                type="button"
                onClick={() => addFilesInputRef.current?.click()}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                aria-label="Add more media"
                title="Add more photos or videos"
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
          </div>
        )}

        {/* Caption Input & Send Action Bar */}
        <div className="mx-auto flex w-full max-w-xl items-center gap-2.5">
          {stagedFiles.length === 1 && onAddFiles && (
            <button
              type="button"
              onClick={() => addFilesInputRef.current?.click()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              aria-label="Add another attachment"
              title="Add another image"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}

          {/* Unified Caption Bar */}
          <div className="relative flex flex-1 items-center rounded-2xl border border-border bg-muted/40 px-3.5 py-2 backdrop-blur-md focus-within:border-primary/60 focus-within:bg-card transition-colors">
            <input
              ref={captionInputRef}
              type="text"
              value={caption}
              onChange={(e) => onCaptionChange(e.target.value)}
              placeholder="Add a caption…"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none pr-8"
              aria-label="Caption for attachment"
              autoFocus
            />

            <button
              type="button"
              onClick={() => setShowEmoji((v) => !v)}
              className="absolute right-2.5 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Add emoji to caption"
            >
              <Smile className="h-4 w-4" />
            </button>

            {showEmoji && (
              <EmojiPickerPopover
                onSelectEmoji={(emoji) => {
                  onCaptionChange(caption + emoji);
                  captionInputRef.current?.focus();
                }}
                onClose={() => setShowEmoji(false)}
              />
            )}
          </div>

          {/* Send Button */}
          {onSend && (
            <button
              type="button"
              onClick={onSend}
              disabled={isSending}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
              aria-label="Send media"
              title="Send"
            >
              {isSending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Hidden file input for adding more media */}
      <input
        ref={addFilesInputRef}
        type="file"
        multiple
        accept="image/*,video/*,.pdf,.doc,.docx"
        className="sr-only"
        onChange={handleAddMoreFiles}
        aria-hidden
      />
    </div>
  );

  if (!mounted || typeof document === "undefined") {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
}

function ThumbnailImage({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return <div className="h-full w-full bg-muted animate-pulse" />;

  return <img src={url} alt={file.name} className="h-full w-full object-cover" draggable={false} />;
}
