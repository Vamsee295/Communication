import { useState, useMemo } from "react";
import { Search, Loader2 } from "lucide-react";

export interface GifItem {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  category: string;
}

// Curated high-performance animated reactions
export const CURATED_GIFS: GifItem[] = [
  {
    id: "g1",
    title: "Awesome Celebration",
    category: "party",
    url: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif",
    previewUrl: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/200w.gif",
  },
  {
    id: "g2",
    title: "Mind Blown Wow",
    category: "wow",
    url: "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif",
    previewUrl: "https://media.giphy.com/media/26ufdipQqU2lhNA4g/200w.gif",
  },
  {
    id: "g3",
    title: "Laughing Out Loud",
    category: "laugh",
    url: "https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif",
    previewUrl: "https://media.giphy.com/media/10JhviFuU2gWD6/200w.gif",
  },
  {
    id: "g4",
    title: "Heart Love Hug",
    category: "heart",
    url: "https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/giphy.gif",
    previewUrl: "https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/200w.gif",
  },
  {
    id: "g5",
    title: "Thumbs Up Yes",
    category: "yes",
    url: "https://media.giphy.com/media/111ebonMs90YLu/giphy.gif",
    previewUrl: "https://media.giphy.com/media/111ebonMs90YLu/200w.gif",
  },
  {
    id: "g6",
    title: "Popcorn Watching",
    category: "trending",
    url: "https://media.giphy.com/media/gl0mkIZOW6Nwc/giphy.gif",
    previewUrl: "https://media.giphy.com/media/gl0mkIZOW6Nwc/200w.gif",
  },
  {
    id: "g7",
    title: "Dancing Party",
    category: "party",
    url: "https://media.giphy.com/media/DhstvI3zZ598Nb1rFf/giphy.gif",
    previewUrl: "https://media.giphy.com/media/DhstvI3zZ598Nb1rFf/200w.gif",
  },
  {
    id: "g8",
    title: "Cat Vibing",
    category: "trending",
    url: "https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/giphy.gif",
    previewUrl: "https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/200w.gif",
  },
  {
    id: "g9",
    title: "No Way Sad",
    category: "sad",
    url: "https://media.giphy.com/media/9Y5BbDSkSTiY8/giphy.gif",
    previewUrl: "https://media.giphy.com/media/9Y5BbDSkSTiY8/200w.gif",
  },
  {
    id: "g10",
    title: "Cool Shades",
    category: "trending",
    url: "https://media.giphy.com/media/62PP2yEIAZF6g/giphy.gif",
    previewUrl: "https://media.giphy.com/media/62PP2yEIAZF6g/200w.gif",
  },
];

interface GifPickerProps {
  onSelectGif: (gif: GifItem) => void;
}

export function GifPicker({ onSelectGif }: GifPickerProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const categories = [
    { id: "all", label: "🔥 All" },
    { id: "trending", label: "✨ Trending" },
    { id: "laugh", label: "😂 Laugh" },
    { id: "heart", label: "💖 Love" },
    { id: "yes", label: "👍 Yes" },
    { id: "wow", label: "😮 Wow" },
    { id: "party", label: "🎉 Party" },
  ];

  const filteredGifs = useMemo(() => {
    return CURATED_GIFS.filter((g) => {
      const matchesCat = activeCategory === "all" || g.category === activeCategory;
      const matchesSearch = !search.trim() || g.title.toLowerCase().includes(search.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [search, activeCategory]);

  return (
    <div className="flex h-64 flex-col overflow-hidden">
      {/* Search Input */}
      <div className="p-2 border-b border-border/40">
        <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-1.5 text-xs">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search GIFs..."
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1 border-b border-border/40 px-2 py-1 overflow-x-auto shrink-0">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveCategory(c.id)}
            className={[
              "rounded-lg px-2 py-0.5 text-[11px] font-medium shrink-0 transition",
              activeCategory === c.id
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            ].join(" ")}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* GIFs Grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredGifs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-xs text-muted-foreground p-4">
            <p>No GIFs found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filteredGifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onSelectGif(gif)}
                className="group relative aspect-video overflow-hidden rounded-xl bg-muted/40 transition hover:opacity-90 active:scale-95"
              >
                <img
                  src={gif.previewUrl}
                  alt={gif.title}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100 truncate text-left">
                  {gif.title}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function parseGifMessage(body: string): { url: string; title: string } | null {
  if (!body.startsWith("ghostline:gif:")) return null;
  const parts = body.split(":");
  if (parts.length < 3) return null;
  const url = parts.slice(2, parts.length - 1).join(":");
  const title = parts[parts.length - 1];
  return { url, title };
}

export function formatGifPayload(gif: GifItem): string {
  return `ghostline:gif:${gif.url}:${gif.title}`;
}
