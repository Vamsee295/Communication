import React, { useState, useRef, useEffect, memo } from "react";
import {
  Play,
  Pause,
  Download,
  FileText,
  Archive,
  File,
  Image as ImageIcon,
  FileAudio,
  RotateCw,
  Loader2,
  Film,
  Volume2,
  VolumeX,
  Maximize2,
} from "lucide-react";
import type { Attachment } from "@/lib/domain/types";
import { useAuthenticatedMedia } from "@/hooks/use-authenticated-media";
import { downloadAuthenticatedAttachment } from "@/lib/authenticated-media";
import { toast } from "sonner";

// ── Helpers ───────────────────────────────────────────────────────────────

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function getFileIcon(mimeType: string) {
  if (mimeType === "application/pdf") return FileText;
  if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("tar") || mimeType.includes("7z")) return Archive;
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.startsWith("video/")) return Film;
  if (mimeType.startsWith("audio/")) return FileAudio;
  return File;
}

// ── Sub-components ────────────────────────────────────────────────────────

export const ImageAttachment = memo(function ImageAttachment({
  attachment,
  onImageClick,
  flush = false,
  className = "",
}: {
  attachment: Attachment;
  onImageClick?: (attachmentId: string) => void;
  flush?: boolean;
  className?: string;
}) {
  const { url, loading, error, retry } = useAuthenticatedMedia(attachment.id, { autoFetch: true });

  if (loading) {
    return (
      <div className={`flex min-h-[180px] max-h-[300px] w-full max-w-[380px] flex-col items-center justify-center gap-2.5 rounded-2xl bg-foreground/5 p-4 text-center animate-pulse ${className}`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
        <span className="text-[11px] font-medium text-muted-foreground">Loading image…</span>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className={`flex min-h-[140px] w-full max-w-[360px] flex-col items-center justify-center gap-2 rounded-2xl bg-foreground/5 p-4 text-center border border-border/40 ${className}`}>
        <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
        <span className="text-xs font-medium text-muted-foreground">Image unavailable</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void retry();
          }}
          className="mt-1 flex items-center gap-1 rounded-full bg-background px-3 py-1 text-[11px] font-medium text-foreground shadow-sm hover:bg-muted border border-border/50 transition-colors"
        >
          <RotateCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onImageClick?.(attachment.id);
      }}
      className={[
        "group relative overflow-hidden cursor-pointer transition-transform active:scale-[0.99] select-none",
        flush ? "rounded-t-2xl" : "rounded-2xl",
        className,
      ].join(" ")}
    >
      <img
        src={url}
        alt={attachment.original_filename || "Image"}
        className="block w-auto max-w-full max-h-[460px] object-contain rounded-inherit transition-opacity duration-200 group-hover:opacity-95"
        loading="lazy"
        draggable={false}
      />
      {/* Subtle hover gradient */}
      <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/5" />
    </div>
  );
});

export const VideoAttachment = memo(function VideoAttachment({
  attachment,
  mine,
  onVideoClick,
  flush = false,
  className = "",
}: {
  attachment: Attachment;
  mine: boolean;
  onVideoClick?: (attachmentId: string) => void;
  flush?: boolean;
  className?: string;
}) {
  const { url, loading, error, retry } = useAuthenticatedMedia(attachment.id, { autoFetch: true });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      if (isFinite(v.duration) && v.duration > 0) setDuration(v.duration);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      v.currentTime = 0;
    };

    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);

    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
  }, [url]);

  if (loading) {
    return (
      <div className={`flex min-h-[180px] max-h-[300px] w-full max-w-[380px] flex-col items-center justify-center gap-2.5 rounded-2xl bg-foreground/5 p-4 text-center animate-pulse ${className}`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
        <span className="text-[11px] font-medium text-muted-foreground">Loading video…</span>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className={`flex min-h-[140px] w-full max-w-[360px] flex-col items-center justify-center gap-2 rounded-2xl bg-foreground/5 p-4 text-center border border-border/40 ${className}`}>
        <Film className="h-6 w-6 text-muted-foreground/50" />
        <span className="text-xs font-medium text-muted-foreground">Video unavailable</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void retry();
          }}
          className="mt-1 flex items-center gap-1 rounded-full bg-background px-3 py-1 text-[11px] font-medium text-foreground shadow-sm hover:bg-muted border border-border/50 transition-colors"
        >
          <RotateCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onVideoClick?.(attachment.id);
      }}
      className={[
        "group relative overflow-hidden rounded-2xl bg-black max-w-[380px] w-full select-none cursor-pointer shadow-sm",
        flush ? "rounded-t-2xl" : "",
        className,
      ].join(" ")}
    >
      <video
        ref={videoRef}
        src={url}
        playsInline
        muted={isMuted}
        preload="metadata"
        className="block max-h-[420px] w-full object-contain rounded-inherit"
      />

      {/* Play/Pause overlay button */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <button
          type="button"
          onClick={togglePlay}
          className={[
            "pointer-events-auto grid h-12 w-12 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm shadow-lg transition-transform hover:scale-105 active:scale-95",
            isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100",
          ].join(" ")}
          aria-label={isPlaying ? "Pause video" : "Play video"}
        >
          {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
        </button>
      </div>

      {/* Bottom control pills */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/95 backdrop-blur-sm shadow">
          <span>{duration > 0 ? formatDuration(duration) : "Video"}</span>
        </div>

        <div className="flex items-center gap-1 pointer-events-auto">
          <button
            type="button"
            onClick={toggleMute}
            className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white/90 hover:text-white backdrop-blur-sm transition-colors"
            aria-label={isMuted ? "Unmute video" : "Mute video"}
          >
            {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onVideoClick?.(attachment.id);
            }}
            className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white/90 hover:text-white backdrop-blur-sm transition-colors"
            aria-label="Expand video"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
});

export const AudioAttachment = memo(function AudioAttachment({
  attachment,
  mine,
  className = "",
}: {
  attachment: Attachment;
  mine: boolean;
  className?: string;
}) {
  const { url, loading, error, retry } = useAuthenticatedMedia(attachment.id, { autoFetch: true });

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);

  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !url) return;

    const handleTimeUpdate = () => setProgress(audio.currentTime);

    // Resolve finite duration for WebM Blobs where Chrome reports Infinity
    const handleLoadedMetadata = () => {
      if (audio.duration === Infinity || isNaN(audio.duration)) {
        audio.currentTime = 1e101;
        const onSeeked = () => {
          audio.removeEventListener("seeked", onSeeked);
          if (isFinite(audio.duration) && audio.duration > 0) {
            setDuration(audio.duration);
          }
          audio.currentTime = 0;
        };
        audio.addEventListener("seeked", onSeeked);
      } else if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    const handleDurationChange = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      audio.currentTime = 0;
    };
    const handleError = () => setAudioError(true);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [url]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || error || audioError) return;
    if (!audio.paused) {
      audio.pause();
    } else {
      if (audio.ended || (duration > 0 && audio.currentTime >= duration)) {
        audio.currentTime = 0;
      }
      audio.play().catch(() => setAudioError(true));
    }
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextRate: 1 | 1.5 | 2 = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !duration || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    audio.currentTime = newTime;
    setProgress(newTime);
  };

  if (loading) {
    return (
      <div className={["flex items-center gap-2.5 rounded-2xl px-4 py-2.5 w-64 max-w-full text-xs font-medium shadow-sm", mine ? "bg-primary text-primary-foreground" : "bg-card text-foreground border border-border/60", className].join(" ")}>
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        <span>Loading voice note…</span>
      </div>
    );
  }

  if (error || audioError || !url) {
    return (
      <div className={["flex items-center gap-2.5 p-3 rounded-2xl text-xs font-medium shadow-sm", mine ? "bg-primary text-primary-foreground" : "bg-card text-foreground border border-border/60", className].join(" ")}>
        <FileAudio className="h-4 w-4 shrink-0 opacity-70" />
        <span>Audio unavailable</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setAudioError(false);
            void retry();
          }}
          className={["ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors", mine ? "bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30" : "bg-muted text-foreground hover:bg-muted/80"].join(" ")}
        >
          <RotateCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }

  const progressPercent = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
  const displayTime = duration > 0 ? (isPlaying || progress > 0 ? formatDuration(progress) : formatDuration(duration)) : (progress > 0 ? formatDuration(progress) : "0:00");

  return (
    <div className="flex flex-col gap-1.5 w-68 sm:w-76 max-w-full">
      <div
        onClick={(e) => e.stopPropagation()}
        className={[
          "flex items-center gap-2.5 rounded-2xl px-3 py-2.5 w-full select-none shadow-sm transition-colors",
          mine ? "bg-primary text-primary-foreground" : "bg-card text-foreground border border-border/60",
          className,
        ].join(" ")}
      >
        <audio ref={audioRef} src={url} preload="auto" playsInline />

        <button
          type="button"
          onClick={togglePlay}
          className={[
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95 shadow-sm",
            mine ? "bg-white text-primary hover:bg-white/90" : "bg-primary text-primary-foreground hover:bg-primary/90",
          ].join(" ")}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current ml-0.5" />
          )}
        </button>

        <div className="flex-1 cursor-pointer h-6 flex items-center group relative min-w-0" onClick={handleSeek}>
          {/* Track background */}
          <div className={["h-1.5 w-full rounded-full overflow-hidden", mine ? "bg-white/30" : "bg-muted"].join(" ")}>
            {/* Progress fill */}
            <div
              className={["h-full transition-all duration-75 ease-linear", mine ? "bg-white" : "bg-primary"].join(" ")}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {/* Scrubber thumb */}
          <div
            className={["absolute h-3 w-3 rounded-full top-1/2 -translate-y-1/2 -ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow", mine ? "bg-white" : "bg-primary"].join(" ")}
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        {/* Playback speed cycle */}
        <button
          type="button"
          onClick={cycleSpeed}
          className={[
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tracking-tight transition-transform active:scale-90",
            mine ? "bg-white/20 text-white hover:bg-white/30" : "bg-muted text-muted-foreground hover:text-foreground",
          ].join(" ")}
          title="Change playback speed"
        >
          {playbackRate}×
        </button>

        <span className={["text-[11px] font-semibold shrink-0 tabular-nums min-w-[28px] text-right", mine ? "text-primary-foreground/90" : "text-muted-foreground"].join(" ")}>
          {displayTime}
        </span>
      </div>
    </div>
  );
});

export const FileAttachment = memo(function FileAttachment({
  attachment,
  mine,
  className = "",
}: {
  attachment: Attachment;
  mine: boolean;
  className?: string;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const Icon = getFileIcon(attachment.mime_type);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadError(false);

    try {
      await downloadAuthenticatedAttachment(attachment.id, attachment.original_filename);
    } catch {
      setDownloadError(true);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={[
        "flex items-center gap-3 rounded-2xl p-3 border shadow-sm transition-all select-none w-64 sm:w-72 max-w-full",
        mine ? "bg-primary text-primary-foreground border-primary-foreground/20" : "bg-card text-foreground border-border/70 hover:border-border",
        className,
      ].join(" ")}
    >
      <div className={["grid h-10 w-10 shrink-0 place-items-center rounded-xl", mine ? "bg-white/20 text-white" : "bg-primary/10 text-primary"].join(" ")}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <span className={["truncate text-xs font-semibold leading-tight", mine ? "text-white" : "text-foreground"].join(" ")}>
          {attachment.original_filename}
        </span>
        <span className={["text-[10px] mt-0.5", mine ? "text-white/80" : "text-muted-foreground"].join(" ")}>
          {formatBytes(attachment.file_size)}
          {downloadError && " • Failed"}
        </span>
      </div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={isDownloading}
        className={[
          "grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors",
          mine ? "hover:bg-white/20 text-white" : "hover:bg-muted text-muted-foreground hover:text-foreground",
        ].join(" ")}
        aria-label={`Download ${attachment.original_filename}`}
      >
        {isDownloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </button>
    </div>
  );
});

// ── Main Renderer ─────────────────────────────────────────────────────────

export interface AttachmentRendererProps {
  attachments: Attachment[];
  mine: boolean;
  onImageClick?: (attachmentId: string) => void;
  flush?: boolean;
}

export const AttachmentRenderer = memo(function AttachmentRenderer({
  attachments,
  mine,
  onImageClick,
  flush = false,
}: AttachmentRendererProps) {
  if (!attachments || attachments.length === 0) return null;

  const imageAttachments = attachments.filter((a) => a.mime_type.startsWith("image/"));
  const videoAttachments = attachments.filter((a) => a.mime_type.startsWith("video/"));
  const otherAttachments = attachments.filter(
    (a) => !a.mime_type.startsWith("image/") && !a.mime_type.startsWith("video/")
  );

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Multiple image gallery grid */}
      {imageAttachments.length === 1 ? (
        <ImageAttachment
          key={imageAttachments[0].id}
          attachment={imageAttachments[0]}
          onImageClick={onImageClick}
          flush={flush}
        />
      ) : imageAttachments.length === 2 ? (
        <div className="grid grid-cols-2 gap-1.5 w-full max-w-[420px]">
          {imageAttachments.map((att) => (
            <ImageAttachment
              key={att.id}
              attachment={att}
              onImageClick={onImageClick}
              className="h-36 sm:h-44 w-full object-cover"
            />
          ))}
        </div>
      ) : imageAttachments.length === 3 ? (
        <div className="grid grid-cols-2 gap-1.5 w-full max-w-[420px]">
          <ImageAttachment
            attachment={imageAttachments[0]}
            onImageClick={onImageClick}
            className="col-span-2 h-44 w-full object-cover"
          />
          <ImageAttachment
            attachment={imageAttachments[1]}
            onImageClick={onImageClick}
            className="h-32 w-full object-cover"
          />
          <ImageAttachment
            attachment={imageAttachments[2]}
            onImageClick={onImageClick}
            className="h-32 w-full object-cover"
          />
        </div>
      ) : imageAttachments.length === 4 ? (
        <div className="grid grid-cols-2 gap-1.5 w-full max-w-[420px]">
          {imageAttachments.map((att) => (
            <ImageAttachment
              key={att.id}
              attachment={att}
              onImageClick={onImageClick}
              className="h-32 sm:h-36 w-full object-cover"
            />
          ))}
        </div>
      ) : imageAttachments.length >= 5 ? (
        <div className="grid grid-cols-2 gap-1.5 w-full max-w-[420px]">
          <ImageAttachment
            attachment={imageAttachments[0]}
            onImageClick={onImageClick}
            className="h-32 w-full object-cover"
          />
          <ImageAttachment
            attachment={imageAttachments[1]}
            onImageClick={onImageClick}
            className="h-32 w-full object-cover"
          />
          <ImageAttachment
            attachment={imageAttachments[2]}
            onImageClick={onImageClick}
            className="h-32 w-full object-cover"
          />
          {/* 4th thumbnail with +N overlay */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              onImageClick?.(imageAttachments[3].id);
            }}
            className="relative h-32 w-full cursor-pointer overflow-hidden rounded-2xl group"
          >
            <ImageAttachment
              attachment={imageAttachments[3]}
              onImageClick={onImageClick}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xs transition-opacity group-hover:bg-black/70">
              <span className="text-lg font-bold text-white tracking-wide">
                +{imageAttachments.length - 3}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Video attachments */}
      {videoAttachments.map((att) => (
        <VideoAttachment
          key={att.id}
          attachment={att}
          mine={mine}
          onVideoClick={onImageClick}
          flush={flush}
        />
      ))}

      {/* Audio / Documents */}
      {otherAttachments.map((att) => {
        if (att.mime_type.startsWith("audio/")) {
          return <AudioAttachment key={att.id} attachment={att} mine={mine} />;
        }
        return <FileAttachment key={att.id} attachment={att} mine={mine} />;
      })}
    </div>
  );
});
