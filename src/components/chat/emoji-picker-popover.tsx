import { useMemo, useRef, useState } from "react";

interface EmojiPickerPopoverProps {
  onSelect: (emoji: string) => void;
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

export function EmojiPickerPopover({ onSelect, onClose }: EmojiPickerPopoverProps) {
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
        className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Emoji picker"
      >
        {/* Search */}
        <div className="border-b border-border px-3 py-2">
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emoji…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>

        {/* Category tabs (only when not searching) */}
        {!query && (
          <div className="flex gap-0.5 overflow-x-auto border-b border-border px-2 py-1.5 scrollbar-none">
            {CATEGORIES.map((cat, i) => (
              <button
                key={cat.label}
                type="button"
                onClick={() => setTab(i)}
                title={cat.label}
                className={[
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base transition-colors",
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
                onClick={() => { onSelect(emoji); onClose(); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-xl transition-transform hover:bg-foreground/5 active:scale-90"
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
    </>
  );
}
