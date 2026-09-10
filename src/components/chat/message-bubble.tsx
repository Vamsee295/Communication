import React, { memo } from "react";
import { Forward, Pin, Star, Check, CheckCheck } from "lucide-react";
import type { Attachment } from "@/lib/domain/types";
import { AttachmentRenderer, AudioAttachment, FileAttachment } from "./attachment-renderer";

export interface MessageBubbleProps {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  edited_at?: string | null;
  forwarded_from_id?: string | null;
  reply_to_id?: string | null;
  mine: boolean;
  grouped: boolean;
  removing: boolean;
  isSelected: boolean;
  selectMode: boolean;
  isPinned: boolean;
  isStarred: boolean;
  isSearchHit: boolean;
  pending?: boolean;
  failed?: boolean;
  receipt?: { delivered_at?: string | null; read_at?: string | null };
  reactions: Array<{ emoji: string; count: number; mine: boolean }>;
  parent?: { id: string; body: string } | null;
  attachments?: Attachment[];
  onToggleSelect: (id: string) => void;
  onOpenMenu: (e: React.MouseEvent | React.TouchEvent, msgId: string) => void;
  onImageClick?: (attachmentId: string) => void;
  onScrollToParent?: (parentId: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  bubbleRef?: (el: HTMLLIElement | null) => void;
  longPressProps?: Record<string, any>;
}

export const MessageBubble = memo(function MessageBubble({
  id,
  body,
  created_at,
  edited_at,
  forwarded_from_id,
  mine,
  grouped,
  removing,
  isSelected,
  selectMode,
  isPinned,
  isStarred,
  isSearchHit,
  pending,
  failed,
  receipt,
  reactions,
  parent,
  attachments,
  onToggleSelect,
  onOpenMenu,
  onImageClick,
  onScrollToParent,
  onReact,
  bubbleRef,
  longPressProps,
}: MessageBubbleProps) {
  const formattedTime = new Date(created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const hasAttachments = Boolean(attachments && attachments.length > 0);
  const isPureImage = hasAttachments && attachments!.every((a) => a.mime_type.startsWith("image/")) && !body && !parent && !forwarded_from_id;
  const isPureAudio = hasAttachments && attachments!.length === 1 && attachments![0].mime_type.startsWith("audio/") && !body && !parent && !forwarded_from_id;
  const isPureFile = hasAttachments && attachments!.length === 1 && !attachments![0].mime_type.startsWith("image/") && !attachments![0].mime_type.startsWith("audio/") && !body && !parent && !forwarded_from_id;

  const renderStatus = (theme: "bubble" | "overlay" | "subtle") => {
    const isOverlay = theme === "overlay";
    const isSubtle = theme === "subtle";

    return (
      <div
        className={[
          "flex items-center gap-1 text-[10px] select-none",
          isOverlay
            ? "absolute bottom-2 right-2 rounded-full bg-black/60 backdrop-blur-md px-2 py-0.5 text-white/95 shadow"
            : isSubtle
            ? "mt-1 justify-end text-muted-foreground px-1"
            : mine
            ? "opacity-75 justify-end mt-1 text-primary-foreground"
            : "text-muted-foreground justify-end mt-1",
        ].join(" ")}
      >
        {isPinned && <Pin className="h-2.5 w-2.5" />}
        {isStarred && <Star className="h-2.5 w-2.5 fill-current" />}
        {edited_at && <span className="italic">edited</span>}
        <span>{formattedTime}</span>
        {mine && (
          pending ? (
            <span>…</span>
          ) : receipt?.read_at ? (
            <CheckCheck className={["h-3 w-3", isOverlay ? "text-sky-300" : ""].join(" ")} />
          ) : receipt?.delivered_at ? (
            <Check className="h-3 w-3" />
          ) : (
            <Check className="h-3 w-3 opacity-50" />
          )
        )}
      </div>
    );
  };

  return (
    <li
      ref={bubbleRef}
      className={[
        "flex overflow-hidden transition-all duration-[260ms] ease-out",
        mine ? "justify-end" : "justify-start",
        grouped ? "mt-0.5" : "mt-2",
        removing ? "max-h-0 -translate-y-1 scale-95 opacity-0" : "max-h-none opacity-100",
        isSelected ? "bg-primary/10 rounded-2xl p-1" : "",
      ].join(" ")}
    >
      <div className={["flex max-w-[85%] sm:max-w-[75%] flex-col gap-0.5", mine ? "items-end" : "items-start"].join(" ")}>
        {/* ── Case 1: Pure Image Message ──────────────────────────────── */}
        {isPureImage ? (
          <div
            onClick={() => selectMode && onToggleSelect(id)}
            onContextMenu={(e) => onOpenMenu(e, id)}
            {...longPressProps}
            className={[
              "relative cursor-pointer select-none rounded-2xl overflow-hidden shadow-sm transition-all",
              mine ? "rounded-br-md" : "rounded-bl-md",
              pending ? "opacity-60" : "",
              failed ? "opacity-60 ring-2 ring-destructive" : "",
              isSearchHit ? "ring-2 ring-primary" : "",
            ].join(" ")}
          >
            <AttachmentRenderer
              attachments={attachments!}
              mine={mine}
              onImageClick={onImageClick}
            />
            {renderStatus("overlay")}
          </div>
        ) : isPureAudio ? (
          /* ── Case 2: Pure Audio Message ──────────────────────────────── */
          <div
            onClick={() => selectMode && onToggleSelect(id)}
            onContextMenu={(e) => onOpenMenu(e, id)}
            {...longPressProps}
            className={[
              "relative cursor-default select-none rounded-2xl transition-all",
              mine ? "rounded-br-md" : "rounded-bl-md",
              pending ? "opacity-60" : "",
              failed ? "opacity-60 ring-2 ring-destructive" : "",
              isSearchHit ? "ring-2 ring-primary" : "",
            ].join(" ")}
          >
            <AudioAttachment
              attachment={attachments![0]}
              mine={mine}
              className={mine ? "rounded-br-md" : "rounded-bl-md"}
            />
            {renderStatus("subtle")}
          </div>
        ) : isPureFile ? (
          /* ── Case 3: Pure File Message ───────────────────────────────── */
          <div
            onClick={() => selectMode && onToggleSelect(id)}
            onContextMenu={(e) => onOpenMenu(e, id)}
            {...longPressProps}
            className={[
              "relative cursor-default select-none rounded-2xl transition-all",
              mine ? "rounded-br-md" : "rounded-bl-md",
              pending ? "opacity-60" : "",
              failed ? "opacity-60 ring-2 ring-destructive" : "",
              isSearchHit ? "ring-2 ring-primary" : "",
            ].join(" ")}
          >
            <FileAttachment
              attachment={attachments![0]}
              mine={mine}
              className={mine ? "rounded-br-md" : "rounded-bl-md"}
            />
            {renderStatus("subtle")}
          </div>
        ) : hasAttachments ? (
          /* ── Case 4: Mixed Message (Media + Caption/Reply) ──────────── */
          <div
            onClick={() => selectMode && onToggleSelect(id)}
            onContextMenu={(e) => onOpenMenu(e, id)}
            {...longPressProps}
            className={[
              "cursor-default select-none rounded-2xl overflow-hidden text-sm leading-snug shadow transition-all",
              mine ? "bg-primary text-primary-foreground rounded-br-md" : "glass rounded-bl-md",
              pending ? "opacity-60" : "",
              failed ? "opacity-60 ring-1 ring-destructive" : "",
              isSearchHit ? "ring-2 ring-primary" : "",
            ].join(" ")}
          >
            {/* Flush media on top */}
            <div className="w-full">
              <AttachmentRenderer
                attachments={attachments!}
                mine={mine}
                onImageClick={onImageClick}
                flush={true}
              />
            </div>

            {/* Content section below media */}
            <div className="px-3.5 pt-2 pb-2">
              {forwarded_from_id && (
                <p className={["mb-1 flex items-center gap-1 text-[10px] italic", mine ? "opacity-80" : "text-muted-foreground"].join(" ")}>
                  <Forward className="h-2.5 w-2.5" /> Forwarded
                </p>
              )}

              {parent && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onScrollToParent?.(parent.id);
                  }}
                  className={[
                    "mb-1.5 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-[11px]",
                    mine ? "border-primary-foreground/60 bg-primary-foreground/10" : "border-primary bg-foreground/5",
                  ].join(" ")}
                >
                  <p className="line-clamp-2">{parent.body}</p>
                </button>
              )}

              {body && <p className="whitespace-pre-wrap break-words">{body}</p>}
              {renderStatus("bubble")}
            </div>
          </div>
        ) : (
          /* ── Case 5: Standard Text-only Message ──────────────────────── */
          <div
            onClick={() => selectMode && onToggleSelect(id)}
            onContextMenu={(e) => onOpenMenu(e, id)}
            {...longPressProps}
            className={[
              "cursor-default select-none rounded-2xl px-3.5 py-2 text-sm leading-snug shadow transition-all",
              mine ? "bg-primary text-primary-foreground rounded-br-md" : "glass rounded-bl-md",
              pending ? "opacity-60" : "",
              failed ? "opacity-60 ring-1 ring-destructive" : "",
              isSearchHit ? "ring-2 ring-primary" : "",
            ].join(" ")}
          >
            {forwarded_from_id && (
              <p className={["mb-1 flex items-center gap-1 text-[10px] italic", mine ? "opacity-80" : "text-muted-foreground"].join(" ")}>
                <Forward className="h-2.5 w-2.5" /> Forwarded
              </p>
            )}

            {parent && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onScrollToParent?.(parent.id);
                }}
                className={[
                  "mb-1.5 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-[11px]",
                  mine ? "border-primary-foreground/60 bg-primary-foreground/10" : "border-primary bg-foreground/5",
                ].join(" ")}
              >
                <p className="line-clamp-2">{parent.body}</p>
              </button>
            )}

            <p className="whitespace-pre-wrap break-words">{body}</p>
            {renderStatus("bubble")}
          </div>
        )}

        {reactions.length > 0 && (
          <div className={["flex flex-wrap gap-1 mt-0.5", mine ? "justify-end" : "justify-start"].join(" ")}>
            {reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReact(id, r.emoji)}
                className={[
                  "glass flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] hover:scale-105 active:scale-95 transition-transform",
                  r.mine ? "ring-1 ring-primary" : "",
                ].join(" ")}
              >
                <span>{r.emoji}</span>
                <span className="text-muted-foreground font-medium">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
});

