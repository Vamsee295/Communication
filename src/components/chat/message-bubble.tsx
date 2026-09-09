import React, { memo } from "react";
import { Forward, Pin, Star, Check, CheckCheck } from "lucide-react";

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
  onToggleSelect: (id: string) => void;
  onOpenMenu: (e: React.MouseEvent | React.TouchEvent, msgId: string) => void;
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
  onToggleSelect,
  onOpenMenu,
  onScrollToParent,
  onReact,
  bubbleRef,
  longPressProps,
}: MessageBubbleProps) {
  const formattedTime = new Date(created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <li
      ref={bubbleRef}
      className={[
        "flex overflow-hidden transition-all duration-[260ms] ease-out",
        mine ? "justify-end" : "justify-start",
        grouped ? "mt-0" : "mt-2",
        removing ? "max-h-0 -translate-y-1 scale-95 opacity-0" : "max-h-none opacity-100",
        isSelected ? "bg-primary/10 rounded-xl" : "",
      ].join(" ")}
    >
      <div className={["flex max-w-[85%] flex-col gap-0.5", mine ? "items-end" : "items-start"].join(" ")}>
        <div
          onClick={() => selectMode && onToggleSelect(id)}
          onContextMenu={(e) => onOpenMenu(e, id)}
          {...longPressProps}
          className={[
            "cursor-default select-none rounded-2xl px-3.5 py-2 text-sm leading-snug shadow",
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
                "mb-1 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-[11px]",
                mine ? "border-primary-foreground/60 bg-primary-foreground/10" : "border-primary bg-foreground/5",
              ].join(" ")}
            >
              <p className="line-clamp-2">{parent.body}</p>
            </button>
          )}

          <p className="whitespace-pre-wrap break-words">{body}</p>

          <div className={["mt-0.5 flex items-center justify-end gap-1 text-[10px]", mine ? "opacity-70" : "text-muted-foreground"].join(" ")}>
            {isPinned && <Pin className="h-2.5 w-2.5" />}
            {isStarred && <Star className="h-2.5 w-2.5 fill-current" />}
            {edited_at && <span className="italic">edited</span>}
            <span>{formattedTime}</span>
            {mine && (
              pending ? (
                <span>…</span>
              ) : receipt?.read_at ? (
                <CheckCheck className="h-3 w-3" />
              ) : receipt?.delivered_at ? (
                <Check className="h-3 w-3" />
              ) : (
                <Check className="h-3 w-3 opacity-50" />
              )
            )}
          </div>
        </div>

        {reactions.length > 0 && (
          <div className={["flex flex-wrap gap-1", mine ? "justify-end" : "justify-start"].join(" ")}>
            {reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReact(id, r.emoji)}
                className={[
                  "glass flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                  r.mine ? "ring-1 ring-primary" : "",
                ].join(" ")}
              >
                <span>{r.emoji}</span>
                <span className="text-muted-foreground">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
});
