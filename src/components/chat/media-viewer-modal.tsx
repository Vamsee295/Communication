import React, { useCallback, useEffect, useState, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut, Loader2 } from "lucide-react";
import type { Attachment } from "@/lib/domain/types";
import { downloadAuthenticatedAttachment } from "@/lib/authenticated-media";

interface MediaViewerModalProps {
  attachments: Array<Attachment & { url?: string }>;
  startIndex?: number;
  onClose: () => void;
  onRequestUrl?: (attachmentId: string) => Promise<string>;
}

export function MediaViewerModal({
  attachments,
  startIndex = 0,
  onClose,
  onRequestUrl,
}: MediaViewerModalProps) {
  const [index, setIndex] = useState(startIndex);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const current = attachments[index];

  // Load URL for current attachment
  useEffect(() => {
    if (!current) return;
    setZoomed(false);
    if (urls[current.id]) return;
    if (current.url) {
      setUrls((prev) => ({ ...prev, [current.id]: current.url! }));
      return;
    }
    if (!onRequestUrl) return;
    setLoading(true);
    onRequestUrl(current.id)
      .then((url) => setUrls((prev) => ({ ...prev, [current.id]: url })))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [current, urls, onRequestUrl]);

  const goPrev = useCallback(() => {
    setZoomed(false);
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setZoomed(false);
    setIndex((i) => Math.min(attachments.length - 1, i + 1));
  }, [attachments.length]);

  // Touch swipe support for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoomed) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (zoomed || touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;

    // Verify horizontal swipe intent
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX > 0) {
        goPrev();
      } else {
        goNext();
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, goPrev, goNext]);

  if (!current) return null;

  const isImage = current.mime_type.startsWith("image/");
  const isVideo = current.mime_type.startsWith("video/");
  const currentUrl = urls[current.id];

  function formatBytes(n: number) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadAuthenticatedAttachment(current.id, current.original_filename);
    } catch {
      // ignore
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-md select-none animate-fade-in"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between px-4 py-3 z-20 bg-gradient-to-b from-black/80 to-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full text-white/80 hover:text-white hover:bg-white/15 transition-colors active:scale-95"
          aria-label="Close viewer"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="text-center px-2 min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate max-w-xs sm:max-w-md mx-auto">
            {current.original_filename}
          </p>
          {attachments.length > 1 && (
            <p className="text-xs text-white/70 mt-0.5">
              {index + 1} of {attachments.length}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {isImage && (
            <button
              type="button"
              onClick={() => setZoomed((z) => !z)}
              className="grid h-10 w-10 place-items-center rounded-full text-white/80 hover:text-white hover:bg-white/15 transition-colors active:scale-95"
              aria-label={zoomed ? "Zoom out" : "Zoom in"}
            >
              {zoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
            </button>
          )}
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className="grid h-10 w-10 place-items-center rounded-full text-white/80 hover:text-white hover:bg-white/15 transition-colors active:scale-95 disabled:opacity-50"
            aria-label="Download media"
          >
            {isDownloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Main viewport */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-2 sm:p-6">
        {/* Prev Arrow */}
        {index > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="absolute left-3 sm:left-6 z-20 grid h-11 w-11 place-items-center rounded-full bg-black/60 text-white/90 hover:bg-black/90 hover:text-white shadow-lg transition-transform active:scale-90"
            aria-label="Previous"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {/* Media Container */}
        <div
          className="flex h-full w-full items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          {loading && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-white/80" />
              <p className="text-xs text-white/60">Loading media…</p>
            </div>
          )}

          {!loading && currentUrl && isImage && (
            <div
              className={`flex items-center justify-center transition-all duration-200 ${
                zoomed ? "overflow-auto max-h-none max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setZoomed((z) => !z);
              }}
            >
              <img
                src={currentUrl}
                alt={current.original_filename}
                className={`rounded-xl object-contain transition-transform duration-200 select-none ${
                  zoomed ? "scale-150" : "max-h-[80vh] max-w-[90vw]"
                }`}
                draggable={false}
              />
            </div>
          )}

          {!loading && currentUrl && isVideo && (
            <video
              src={currentUrl}
              controls
              className="max-h-[80vh] max-w-[90vw] rounded-xl shadow-2xl"
              autoPlay
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {!loading && currentUrl && !isImage && !isVideo && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex flex-col items-center gap-4 text-center rounded-3xl bg-white/10 p-8 border border-white/15 max-w-sm backdrop-blur-md"
            >
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/15 text-white">
                <Download className="h-8 w-8" />
              </div>
              <div>
                <p className="font-semibold text-white text-base leading-snug">{current.original_filename}</p>
                <p className="text-xs text-white/60 mt-1">{formatBytes(current.file_size)}</p>
              </div>
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className="mt-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-90 transition-opacity"
              >
                {isDownloading ? "Downloading…" : "Download file"}
              </button>
            </div>
          )}

          {!loading && !currentUrl && (
            <p className="text-sm text-white/50">Unable to load attachment</p>
          )}
        </div>

        {/* Next Arrow */}
        {index < attachments.length - 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className="absolute right-3 sm:right-6 z-20 grid h-11 w-11 place-items-center rounded-full bg-black/60 text-white/90 hover:bg-black/90 hover:text-white shadow-lg transition-transform active:scale-90"
            aria-label="Next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {attachments.length > 1 && (
        <div
          className="flex shrink-0 justify-center gap-2 overflow-x-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 z-20 bg-gradient-to-t from-black/80 to-transparent"
          onClick={(e) => e.stopPropagation()}
        >
          {attachments.map((att, i) => (
            <button
              type="button"
              key={att.id}
              onClick={() => {
                setZoomed(false);
                setIndex(i);
              }}
              className={[
                "h-12 w-12 shrink-0 overflow-hidden rounded-xl border-2 transition-all active:scale-95",
                i === index ? "border-primary scale-105 ring-2 ring-primary/40" : "border-white/20 opacity-50 hover:opacity-80",
              ].join(" ")}
              aria-label={`View ${i + 1}`}
            >
              {att.mime_type.startsWith("image/") && urls[att.id] ? (
                <img src={urls[att.id]} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-white/10">
                  <span className="text-[10px] text-white/80 font-bold">
                    {att.mime_type.split("/")[1]?.toUpperCase().slice(0, 3)}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
