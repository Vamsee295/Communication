import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMessages, type MessageRow } from "@/lib/chat.functions";
import type { Attachment } from "@/lib/domain/types";
import { useAuthenticatedMedia } from "@/hooks/use-authenticated-media";
import { downloadAuthenticatedAttachment } from "@/lib/authenticated-media";
import {
  ImageIcon,
  FileText,
  Link as LinkIcon,
  Download,
  Loader2,
  Film,
  ExternalLink,
} from "lucide-react";
import { formatBytes, getFileIcon } from "./attachment-renderer";

interface SharedMediaGalleryProps {
  conversationId: string;
  onOpenMedia?: (attachmentId: string, allMedia: Attachment[]) => void;
}

type Tab = "media" | "files" | "links";

function MediaGridItem({
  attachment,
  onClick,
}: {
  attachment: Attachment;
  onClick: () => void;
}) {
  const { url, loading } = useAuthenticatedMedia(attachment.id, { autoFetch: true });
  const isVideo = attachment.mime_type.startsWith("video/");

  return (
    <div
      onClick={onClick}
      className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl bg-muted/60 transition hover:opacity-90 active:scale-95"
    >
      {loading ? (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/50" />
        </div>
      ) : url ? (
        isVideo ? (
          <div className="relative h-full w-full bg-black">
            <video src={url} className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Film className="h-5 w-5 text-white/90 drop-shadow" />
            </div>
          </div>
        ) : (
          <img
            src={url}
            alt={attachment.original_filename}
            className="h-full w-full object-cover select-none"
            loading="lazy"
          />
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
        </div>
      )}
    </div>
  );
}

function FileRow({ attachment }: { attachment: Attachment }) {
  const [downloading, setDownloading] = useState(false);
  const Icon = getFileIcon(attachment.mime_type);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadAuthenticatedAttachment(attachment.id, attachment.original_filename);
    } catch {
      // ignore
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl p-2.5 hover:bg-surface-2 transition border border-border/40">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">
            {attachment.original_filename}
          </p>
          <span className="text-[10px] text-muted-foreground">
            {formatBytes(attachment.file_size)}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition disabled:opacity-50"
        aria-label="Download file"
      >
        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function SharedMediaGallery({
  conversationId,
  onOpenMedia,
}: SharedMediaGalleryProps) {
  const [activeTab, setActiveTab] = useState<Tab>("media");
  const fetchMessages = useServerFn(listMessages);

  const { data: messages = [], isLoading } = useQuery<MessageRow[]>({
    queryKey: ["messages", conversationId],
    queryFn: () => fetchMessages({ data: { conversation_id: conversationId, limit: 200 } }),
  });

  const { mediaAttachments, fileAttachments, sharedLinks } = useMemo(() => {
    const media: Attachment[] = [];
    const files: Attachment[] = [];
    const links: Array<{ url: string; date: string }> = [];

    const urlRegex = /(https?:\/\/[^\s]+)/g;

    for (const msg of messages) {
      if (msg.attachments) {
        for (const att of msg.attachments) {
          if (att.mime_type.startsWith("image/") || att.mime_type.startsWith("video/")) {
            media.push(att);
          } else if (!att.mime_type.startsWith("audio/")) {
            files.push(att);
          }
        }
      }

      if (msg.body) {
        const found = msg.body.match(urlRegex);
        if (found) {
          for (const u of found) {
            links.push({ url: u, date: msg.created_at });
          }
        }
      }
    }

    return { mediaAttachments: media, fileAttachments: files, sharedLinks: links };
  }, [messages]);

  return (
    <div className="flex flex-col gap-3">
      {/* Tabs bar */}
      <div className="flex rounded-xl bg-surface-2 p-1 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("media")}
          className={`flex-1 rounded-lg py-1.5 transition text-center ${
            activeTab === "media"
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Media ({mediaAttachments.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("files")}
          className={`flex-1 rounded-lg py-1.5 transition text-center ${
            activeTab === "files"
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Files ({fileAttachments.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("links")}
          className={`flex-1 rounded-lg py-1.5 transition text-center ${
            activeTab === "links"
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Links ({sharedLinks.length})
        </button>
      </div>

      {/* Tab content */}
      <div className="min-h-[140px] max-h-64 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : activeTab === "media" ? (
          mediaAttachments.length > 0 ? (
            <div className="grid grid-cols-3 gap-1.5">
              {mediaAttachments.map((att) => (
                <MediaGridItem
                  key={att.id}
                  attachment={att}
                  onClick={() => onOpenMedia?.(att.id, mediaAttachments)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground">
              <ImageIcon className="h-6 w-6 mb-1.5 opacity-40" />
              <span>No photos or videos shared yet</span>
            </div>
          )
        ) : activeTab === "files" ? (
          fileAttachments.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {fileAttachments.map((att) => (
                <FileRow key={att.id} attachment={att} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground">
              <FileText className="h-6 w-6 mb-1.5 opacity-40" />
              <span>No documents shared yet</span>
            </div>
          )
        ) : (
          sharedLinks.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {sharedLinks.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-xl p-2.5 hover:bg-surface-2 transition border border-border/40 group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition">
                      <LinkIcon className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-primary group-hover:underline">
                        {l.url}
                      </p>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(l.date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </a>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground">
              <LinkIcon className="h-6 w-6 mb-1.5 opacity-40" />
              <span>No shared links yet</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
