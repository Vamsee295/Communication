import React, { memo, useState, useRef } from "react";
import {
  Forward,
  Pin,
  Star,
  Check,
  CheckCheck,
  User,
  MapPin,
  ExternalLink,
  Reply,
} from "lucide-react";
import type { Attachment } from "@/lib/domain/types";
import { AttachmentRenderer, AudioAttachment, FileAttachment } from "./attachment-renderer";
import { LinkPreviewCard } from "./link-preview-card";
import { extractUrls } from "@/lib/link-preview.functions";
import { parseStickerMessage } from "@/lib/stickers";
import { parseGifMessage } from "./gif-picker";
import { parseContactMessage } from "./contact-picker-modal";
import { parseLocationMessage } from "./location-picker-modal";

export interface ParentMessageInfo {
  id: string;
  body: string;
  sender_name?: string;
  media_type?: "image" | "video" | "audio" | "file";
}

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
  parent?: ParentMessageInfo | null;
  attachments?: Attachment[];
  themeClass?: string;
  onToggleSelect: (id: string) => void;
  onOpenMenu: (e: React.MouseEvent | React.TouchEvent, msgId: string) => void;
  onImageClick?: (attachmentId: string) => void;
  onScrollToParent?: (parentId: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  onViewContact?: (userId: string) => void;
  onSwipeReply?: (msg: any) => void;
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
  themeClass,
  onToggleSelect,
  onOpenMenu,
  onImageClick,
  onScrollToParent,
  onReact,
  onViewContact,
  onSwipeReply,
  bubbleRef,
  longPressProps,
}: MessageBubbleProps) {
  const formattedTime = new Date(created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Swipe to reply touch gesture
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    longPressProps?.onTouchStart?.(e);
    if (!selectMode && onSwipeReply) {
      setTouchStartX(e.touches[0].clientX);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    longPressProps?.onTouchMove?.(e);
    if (touchStartX !== null && onSwipeReply) {
      const currentX = e.touches[0].clientX;
      const diff = currentX - touchStartX;
      // Only allow swiping right
      if (diff > 0 && diff < 80) {
        setSwipeOffset(diff);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    longPressProps?.onTouchEnd?.(e);
    if (swipeOffset > 45 && onSwipeReply) {
      onSwipeReply({ id, body, sender_id: mine ? "me" : "other" });
    }
    setTouchStartX(null);
    setSwipeOffset(0);
  };

  const hasAttachments = Boolean(attachments && attachments.length > 0);
  const isPureImage = hasAttachments && attachments!.every((a) => a.mime_type.startsWith("image/")) && !body && !parent && !forwarded_from_id;
  const isPureAudio = hasAttachments && attachments!.length === 1 && attachments![0].mime_type.startsWith("audio/") && !body && !parent && !forwarded_from_id;
  const isPureFile = hasAttachments && attachments!.length === 1 && !attachments![0].mime_type.startsWith("image/") && !attachments![0].mime_type.startsWith("audio/") && !body && !parent && !forwarded_from_id;

  // Rich message entities
  const sticker = parseStickerMessage(body);
  const gif = parseGifMessage(body);
  const contact = parseContactMessage(body);
  const location = parseLocationMessage(body);
  const urls = extractUrls(body);

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
        "relative flex overflow-hidden transition-all duration-[260ms] ease-out",
        mine ? "justify-end" : "justify-start",
        grouped ? "mt-0.5" : "mt-2",
        removing ? "max-h-0 -translate-y-1 scale-95 opacity-0" : "max-h-none opacity-100",
        isSelected ? "bg-primary/10 rounded-2xl p-1" : "",
      ].join(" ")}
      style={{
        transform: swipeOffset > 0 ? `translateX(${swipeOffset}px)` : undefined,
      }}
    >
      {/* Swipe to reply icon indicator */}
      {swipeOffset > 20 && (
        <div className="absolute left-1 top-1/2 -translate-y-1/2 flex items-center gap-1 text-primary">
          <Reply className="h-4 w-4 animate-pulse" />
        </div>
      )}

      <div className={["flex max-w-[85%] sm:max-w-[75%] flex-col gap-0.5", mine ? "items-end" : "items-start"].join(" ")}>
        {/* ── Case 1: Sticker Message (Clean, Bubble-less) ────────────── */}
        {sticker ? (
          <div
            onClick={() => selectMode && onToggleSelect(id)}
            onContextMenu={(e) => onOpenMenu(e, id)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={[
              "relative cursor-pointer select-none p-1 transition-transform active:scale-95",
              pending ? "opacity-60" : "",
              failed ? "opacity-60 ring-2 ring-destructive rounded-2xl" : "",
              isSearchHit ? "ring-2 ring-primary rounded-2xl" : "",
            ].join(" ")}
          >
            <img
              src={sticker.url}
              alt={sticker.name}
              className="h-32 w-32 object-contain pointer-events-none drop-shadow-md"
            />
            {renderStatus("subtle")}
          </div>
        ) : gif ? (
          /* ── Case 2: Animated GIF Message ───────────────────────────── */
          <div
            onClick={() => selectMode && onToggleSelect(id)}
            onContextMenu={(e) => onOpenMenu(e, id)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={[
              "relative cursor-pointer select-none rounded-2xl overflow-hidden shadow-sm max-w-[320px] bg-muted/40",
              mine ? "rounded-br-md" : "rounded-bl-md",
              pending ? "opacity-60" : "",
              failed ? "opacity-60 ring-2 ring-destructive" : "",
              isSearchHit ? "ring-2 ring-primary" : "",
            ].join(" ")}
          >
            <img
              src={gif.url}
              alt={gif.title}
              loading="lazy"
              className="max-h-64 w-full object-cover"
            />
            {renderStatus("overlay")}
          </div>
        ) : contact ? (
          /* ── Case 3: Contact Card Message ───────────────────────────── */
          <div
            onClick={() => selectMode && onToggleSelect(id)}
            onContextMenu={(e) => onOpenMenu(e, id)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={[
              "cursor-default select-none rounded-3xl p-3.5 shadow transition-all w-64 max-w-full border",
              mine
                ? "bg-primary text-primary-foreground border-primary-foreground/20 rounded-br-md"
                : "glass border-border/60 rounded-bl-md",
              pending ? "opacity-60" : "",
              failed ? "opacity-60 ring-1 ring-destructive" : "",
              isSearchHit ? "ring-2 ring-primary" : "",
            ].join(" ")}
          >
            <div className="flex items-center gap-3">
              <div
                className={[
                  "grid h-11 w-11 shrink-0 place-items-center rounded-full font-bold text-base shadow-sm",
                  mine ? "bg-white text-primary" : "bg-primary/10 text-primary",
                ].join(" ")}
              >
                {contact.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="truncate text-xs font-bold leading-tight">{contact.displayName}</span>
                <span className={["truncate text-[11px]", mine ? "opacity-80" : "text-muted-foreground"].join(" ")}>
                  @{contact.username}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewContact?.(contact.userId);
              }}
              className={[
                "mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-semibold shadow-sm transition active:scale-[0.99]",
                mine
                  ? "bg-white/20 text-white hover:bg-white/30"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              ].join(" ")}
            >
              <User className="h-3.5 w-3.5" /> View Profile
            </button>
            {renderStatus("bubble")}
          </div>
        ) : location ? (
          /* ── Case 4: Location Card Message ───────────────────────────── */
          <div
            onClick={() => selectMode && onToggleSelect(id)}
            onContextMenu={(e) => onOpenMenu(e, id)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={[
              "cursor-default select-none rounded-3xl p-3.5 shadow transition-all w-64 max-w-full border",
              mine
                ? "bg-primary text-primary-foreground border-primary-foreground/20 rounded-br-md"
                : "glass border-border/60 rounded-bl-md",
              pending ? "opacity-60" : "",
              failed ? "opacity-60 ring-1 ring-destructive" : "",
              isSearchHit ? "ring-2 ring-primary" : "",
            ].join(" ")}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={[
                  "grid h-10 w-10 shrink-0 place-items-center rounded-2xl shadow-sm",
                  mine ? "bg-white text-rose-500" : "bg-rose-500/10 text-rose-500",
                ].join(" ")}
              >
                <MapPin className="h-5 w-5" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="truncate text-xs font-bold leading-tight">
                  {location.label || "Shared Location"}
                </span>
                <span className={["truncate text-[10px] font-mono", mine ? "opacity-80" : "text-muted-foreground"].join(" ")}>
                  {location.latitude.toFixed(4)}°, {location.longitude.toFixed(4)}°
                </span>
              </div>
            </div>

            <a
              href={`https://maps.google.com/?q=${location.latitude},${location.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={[
                "mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-semibold shadow-sm transition active:scale-[0.99]",
                mine
                  ? "bg-white/20 text-white hover:bg-white/30"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              ].join(" ")}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open in Maps
            </a>
            {renderStatus("bubble")}
          </div>
        ) : isPureImage ? (
          /* ── Case 5: Pure Image Message ──────────────────────────────── */
          <div
            onClick={() => selectMode && onToggleSelect(id)}
            onContextMenu={(e) => onOpenMenu(e, id)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
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
          /* ── Case 6: Pure Audio Message ──────────────────────────────── */
          <div
            onClick={() => selectMode && onToggleSelect(id)}
            onContextMenu={(e) => onOpenMenu(e, id)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
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
          /* ── Case 7: Pure File Message ───────────────────────────────── */
          <div
            onClick={() => selectMode && onToggleSelect(id)}
            onContextMenu={(e) => onOpenMenu(e, id)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
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
          /* ── Case 8: Mixed Message (Media + Caption/Reply) ──────────── */
          <div
            onClick={() => selectMode && onToggleSelect(id)}
            onContextMenu={(e) => onOpenMenu(e, id)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={[
              "cursor-default select-none rounded-2xl overflow-hidden text-sm leading-snug shadow transition-all",
              mine ? (themeClass || "bg-primary text-primary-foreground") + " rounded-br-md" : "glass rounded-bl-md",
              pending ? "opacity-60" : "",
              failed ? "opacity-60 ring-1 ring-destructive" : "",
              isSearchHit ? "ring-2 ring-primary" : "",
            ].join(" ")}
          >
            <div className="w-full">
              <AttachmentRenderer
                attachments={attachments!}
                mine={mine}
                onImageClick={onImageClick}
                flush={true}
              />
            </div>

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
                    "mb-1.5 block w-full rounded-lg border-l-2 px-2.5 py-1 text-left text-[11px] transition hover:opacity-90 active:scale-[0.99]",
                    mine ? "border-primary-foreground/70 bg-primary-foreground/15 text-primary-foreground" : "border-primary bg-foreground/5 text-foreground",
                  ].join(" ")}
                >
                  {parent.sender_name && (
                    <p className={["font-semibold truncate text-[10px] mb-0.5", mine ? "text-primary-foreground" : "text-primary"].join(" ")}>
                      ↩ {parent.sender_name}
                    </p>
                  )}
                  <p className="line-clamp-2 opacity-90">
                    {parent.body || (parent.media_type ? `📎 ${parent.media_type}` : "Attachment")}
                  </p>
                </button>
              )}

              {body && <p className="whitespace-pre-wrap break-words">{body}</p>}

              {/* Link Previews */}
              {urls.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {urls.map((u) => (
                    <LinkPreviewCard key={u} url={u} mine={mine} />
                  ))}
                </div>
              )}

              {renderStatus("bubble")}
            </div>
          </div>
        ) : (
          /* ── Case 9: Standard Text-only Message ──────────────────────── */
          <div
            onClick={() => selectMode && onToggleSelect(id)}
            onContextMenu={(e) => onOpenMenu(e, id)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={[
              "cursor-default select-none rounded-2xl px-3.5 py-2 text-sm leading-snug shadow transition-all",
              mine ? (themeClass || "bg-primary text-primary-foreground") + " rounded-br-md" : "glass rounded-bl-md",
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
                  "mb-1.5 block w-full rounded-lg border-l-2 px-2.5 py-1 text-left text-[11px] transition hover:opacity-90 active:scale-[0.99]",
                  mine ? "border-primary-foreground/70 bg-primary-foreground/15 text-primary-foreground" : "border-primary bg-foreground/5 text-foreground",
                ].join(" ")}
              >
                {parent.sender_name && (
                  <p className={["font-semibold truncate text-[10px] mb-0.5", mine ? "text-primary-foreground" : "text-primary"].join(" ")}>
                    ↩ {parent.sender_name}
                  </p>
                )}
                <p className="line-clamp-2 opacity-90">
                  {parent.body || (parent.media_type ? `📎 ${parent.media_type}` : "Attachment")}
                </p>
              </button>
            )}

            <p className="whitespace-pre-wrap break-words">{body}</p>

            {/* Link Previews */}
            {urls.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {urls.map((u) => (
                  <LinkPreviewCard key={u} url={u} mine={mine} />
                ))}
              </div>
            )}

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
