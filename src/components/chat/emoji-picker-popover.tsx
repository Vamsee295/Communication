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
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel: Mobile bottom sheet, Desktop popover */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[75vh] flex-col rounded-t-3xl border-t border-border bg-card/95 shadow-2xl backdrop-blur-xl pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-6 duration-200 sm:absolute sm:inset-x-auto sm:bottom-full sm:right-0 sm:left-auto sm:mb-2 sm:w-80 sm:max-h-none sm:rounded-3xl sm:border sm:bg-card sm:p-0 sm:shadow-2xl sm:slide-in-from-bottom-2 sm:animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Expression picker"
      >
        {/* Mobile drag handle */}
        <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-muted-foreground/30 sm:hidden" />

        {/* Main Mode Tabs: Emoji / Stickers / GIFs */}
        <div className="flex items-center border-b border-border/50 bg-muted/30 p-1.5 gap-1">
          <button
            type="button"
            onClick={() => setMode("emoji")}
            className={[
              "flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-2 text-xs font-semibold transition sm:py-1.5",
              mode === "emoji"
                ? "bg-card text-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <Smile className="h-3.5 w-3.5 text-primary" /> Emojis
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
            <div className="grid grid-cols-8 gap-1 overflow-y-auto p-2.5 max-h-64 sm:max-h-[200px]">
              {displayEmojis.length > 0 ? (
                displayEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onSelectEmoji(emoji);
                      onClose();
                    }}
                    className="flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-xl text-xl sm:text-lg transition-transform hover:bg-foreground/5 active:scale-90 touch-manipulation"
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
