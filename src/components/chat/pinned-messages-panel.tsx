import React, { useCallback } from "react";
import { X, Pin, PinOff, ChevronUp, ChevronDown } from "lucide-react";
import type { MessageRow, PinRow } from "@/lib/chat.functions";

interface PinnedMessagesPanelProps {
  pins: PinRow[];
  messages: MessageRow[];
  activePinIndex: number;
  onSetActiveIndex: (index: number) => void;
  onJump: (messageId: string) => void;
  onUnpin: (messageId: string) => void;
  onCollapse: () => void;
  onOpenPanel: () => void;
  isPanelOpen: boolean;
}

export function PinnedMessagesPanel({
  pins,
  messages,
  activePinIndex,
  onSetActiveIndex,
  onJump,
  onUnpin,
  onCollapse,
  onOpenPanel,
  isPanelOpen,
}: PinnedMessagesPanelProps) {
  const total = pins.length;

  const messageById = React.useMemo(() => {
    const map = new Map<string, MessageRow>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const activePin = pins[activePinIndex];
  const activeMessage = activePin ? messageById.get(activePin.message_id) : undefined;

  const goPrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const next = (activePinIndex - 1 + total) % total;
      onSetActiveIndex(next);
      const msg = messageById.get(pins[next].message_id);
      if (msg) onJump(msg.id);
    },
    [activePinIndex, total, pins, messageById, onSetActiveIndex, onJump],
  );

  const goNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const next = (activePinIndex + 1) % total;
      onSetActiveIndex(next);
      const msg = messageById.get(pins[next].message_id);
      if (msg) onJump(msg.id);
    },
    [activePinIndex, total, pins, messageById, onSetActiveIndex, onJump],
  );

  if (total === 0) return null;

  return (
    <>
      {/* Compact banner — always visible when pins exist */}
      <div className="glass sticky top-[68px] z-20 flex w-full items-stretch border-b border-border">
        {/* Left: Active indicator bar */}
        <div className="w-0.5 shrink-0 rounded-r bg-primary" />

        {/* Center: pin content — clicking jumps to active pin */}
        <button
          onClick={() => activeMessage && onJump(activeMessage.id)}
          className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2 text-left"
          aria-label={`Jump to pinned message ${activePinIndex + 1} of ${total}`}
        >
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary font-semibold">
            <Pin className="h-2.5 w-2.5" />
            Pinned message {total > 1 ? `${activePinIndex + 1} / ${total}` : ""}
          </span>
          <p className="mt-0.5 truncate text-xs text-foreground">
            {activeMessage?.body || "📎 Media attachment"}
          </p>
        </button>

        {/* Right: navigation + controls */}
        <div className="flex shrink-0 items-center gap-0.5 pr-1.5">
          {total > 1 && (
            <>
              <button
                onClick={goPrev}
                className="grid h-7 w-7 place-items-center rounded-full hover:bg-foreground/10 transition-colors"
                aria-label="Previous pinned message"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={goNext}
                className="grid h-7 w-7 place-items-center rounded-full hover:bg-foreground/10 transition-colors"
                aria-label="Next pinned message"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onOpenPanel(); }}
            className="grid h-7 w-7 place-items-center rounded-full hover:bg-foreground/10 transition-colors"
            aria-label="View all pinned messages"
          >
            <Pin className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCollapse(); }}
            className="grid h-7 w-7 place-items-center rounded-full hover:bg-foreground/10 transition-colors"
            aria-label="Hide pinned banner"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Full panel overlay */}
      {isPanelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={onOpenPanel}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Panel */}
          <div
            className="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-surface border border-border shadow-2xl max-h-[70vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel header */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-3 shrink-0">
              <Pin className="h-4 w-4 text-primary shrink-0" />
              <h2 className="flex-1 font-semibold text-sm text-foreground">
                Pinned Messages
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {total} {total === 1 ? "message" : "messages"}
                </span>
              </h2>
              <button
                onClick={onOpenPanel}
                className="grid h-8 w-8 place-items-center rounded-full hover:bg-foreground/10 transition-colors"
                aria-label="Close pinned messages panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Pin list */}
            <ul className="overflow-y-auto flex-1 divide-y divide-border">
              {pins.map((pin, idx) => {
                const msg = messageById.get(pin.message_id);
                const pinnedDate = new Date(pin.pinned_at).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                });
                const msgTime = msg
                  ? new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : null;

                return (
                  <li key={pin.message_id} className="group">
                    <div className="flex items-start gap-3 px-4 py-3">
                      {/* Index indicator */}
                      <div
                        className={[
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                          idx === activePinIndex
                            ? "bg-primary text-primary-foreground"
                            : "bg-foreground/10 text-muted-foreground",
                        ].join(" ")}
                      >
                        {idx + 1}
                      </div>

                      {/* Message content */}
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          onSetActiveIndex(idx);
                          if (msg) onJump(msg.id);
                          onOpenPanel();
                        }}
                      >
                        <p className="line-clamp-3 text-sm text-foreground leading-snug">
                          {msg?.body || "📎 Media attachment"}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Pinned {pinnedDate}
                          {msgTime && ` · sent at ${msgTime}`}
                        </p>
                      </button>

                      {/* Unpin button */}
                      <button
                        onClick={() => onUnpin(pin.message_id)}
                        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Unpin message ${idx + 1}`}
                      >
                        <PinOff className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
