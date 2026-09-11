import { useMemo, useRef, useState } from "react";
import { StickerPicker } from "./sticker-picker";
import { GifPicker, type GifItem } from "./gif-picker";
import type { Sticker } from "@/lib/stickers";
import { Smile, Sparkles, Film } from "lucide-react";

interface EmojiPickerPopoverProps {
  onSelectEmoji: (emoji: string) => void;
  onSelectSticker?: (sticker: Sticker) => void;
  onSelectGif?: (gif: GifItem) => void;
  onClose: () => void;
}

const CATEGORIES: { label: string; icon: string; emojis: string[] }[] = [
  {
    label: "Recent",
    icon: "🕐",
    emojis: ["❤️", "😂", "😮", "😢", "👍", "🔥", "🎉", "💯", "🙏", "✅"],
  },
  {
    label: "Smileys",
    icon: "😊",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇",
      "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚",
      "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥸",
      "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️",
      "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡",
      "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓",
    ],
  },
  {
    label: "Gestures",
    icon: "👋",
    emojis: [
      "👋", "🤚", "🖐️", "✋", "🖖", "🤙", "💪", "🦵", "🦶", "👈",
      "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛",
      "🤜", "🤞", "✌️", "🤟", "🤘", "👌", "🤌", "🤏", "👈", "👉",
      "🙌", "👏", "🤲", "🤝", "🙏", "💅", "🤳", "💋", "👁️", "👅",
    ],
  },
  {
    label: "Hearts",
    icon: "❤️",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝",
    ],
  },
  {
    label: "Symbols",
    icon: "✨",
    emojis: [
      "✨", "🌟", "⭐", "💫", "🌠", "🎯", "🔥", "💥", "💢", "💬",
      "💭", "🗯️", "💤", "💯", "♾️", "🔔", "🔕", "🎵", "🎶", "🎉",
      "🎊", "🎈", "🎁", "🏆", "🥇", "🎀", "🎗️", "✅", "❌", "⚡",
    ],
  },
];

type MainMode = "emoji" | "stickers" | "gifs";

export function EmojiPickerPopover({
  onSelectEmoji,
  onSelectSticker,
  onSelectGif,
  onClose,
}: EmojiPickerPopoverProps) {
  const [mode, setMode] = useState<MainMode>("emoji");
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return null;
    return CATEGORIES.flatMap((c) => c.emojis).filter((emoji) =>
      emoji.includes(query.trim()),
    );
  }, [query]);

  const displayEmojis = filtered ?? CATEGORIES[tab].emojis;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />

      {/* Panel */}
      <div
        className="absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-3xl border border-border bg-card shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Expression picker"
      >
        {/* Main Mode Tabs: Emoji / Stickers / GIFs */}
        <div className="flex items-center border-b border-border/50 bg-muted/30 p-1.5 gap-1">
          <button
            type="button"
            onClick={() => setMode("emoji")}
            className={[
              "flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-1.5 text-xs font-semibold transition",
              mode === "emoji"
                ? "bg-card text-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <Smile className="h-3.5 w-3.5" /> Emojis
          </button>
          <button
            type="button"
            onClick={() => setMode("stickers")}
            className={[
              "flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-1.5 text-xs font-semibold transition",
              mode === "stickers"
                ? "bg-card text-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Stickers
          </button>
          <button
            type="button"
            onClick={() => setMode("gifs")}
            className={[
              "flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-1.5 text-xs font-semibold transition",
              mode === "gifs"
                ? "bg-card text-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <Film className="h-3.5 w-3.5 text-purple-500" /> GIFs
          </button>
        </div>

        {/* Mode Content */}
        {mode === "stickers" && onSelectSticker ? (
          <StickerPicker
            onSelectSticker={(sticker) => {
              onSelectSticker(sticker);
              onClose();
            }}
          />
        ) : mode === "gifs" && onSelectGif ? (
          <GifPicker
            onSelectGif={(gif) => {
              onSelectGif(gif);
              onClose();
            }}
          />
        ) : (
          <div className="flex flex-col">
            {/* Search */}
            <div className="border-b border-border/50 px-3 py-2">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search emoji…"
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                autoFocus
              />
            </div>

            {/* Category tabs (only when not searching) */}
            {!query && (
              <div className="flex gap-0.5 overflow-x-auto border-b border-border/50 px-2 py-1 scrollbar-none">
                {CATEGORIES.map((cat, i) => (
                  <button
                    key={cat.label}
                    type="button"
                    onClick={() => setTab(i)}
                    title={cat.label}
                    className={[
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-sm transition-colors",
                      i === tab ? "bg-primary/10" : "hover:bg-foreground/5",
                    ].join(" ")}
                    aria-label={cat.label}
                    aria-selected={i === tab}
                  >
                    {cat.icon}
                  </button>
                ))}
              </div>
            )}

            {/* Emoji grid */}
            <div className="grid grid-cols-8 gap-0.5 overflow-y-auto p-2" style={{ maxHeight: 200 }}>
              {displayEmojis.length > 0 ? (
                displayEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onSelectEmoji(emoji);
                      onClose();
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-lg transition-transform hover:bg-foreground/5 active:scale-90"
                    aria-label={emoji}
                  >
                    {emoji}
                  </button>
                ))
              ) : (
                <p className="col-span-8 py-4 text-center text-xs text-muted-foreground">
                  No results for "{query}"
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
