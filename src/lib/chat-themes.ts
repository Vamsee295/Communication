export type ChatThemeId =
  | "default"
  | "midnight"
  | "ocean"
  | "lavender"
  | "sunset"
  | "forest"
  | "minimal";

export type ChatWallpaperId = "plain" | "dots" | "grid" | "constellation" | "geometry";

export interface ChatThemeConfig {
  id: ChatThemeId;
  name: string;
  accentColor: string;
  bubbleClass: string;
  backgroundClass: string;
}

export interface ChatAppearanceSettings {
  themeId: ChatThemeId;
  wallpaperId: ChatWallpaperId;
  wallpaperOpacity: number; // 0.0 to 1.0
}

export const CHAT_THEMES: Record<ChatThemeId, ChatThemeConfig> = {
  default: {
    id: "default",
    name: "Ghostline Blue",
    accentColor: "#2587F5",
    bubbleClass: "bg-primary text-primary-foreground",
    backgroundClass: "bg-background",
  },
  midnight: {
    id: "midnight",
    name: "Midnight Navy",
    accentColor: "#3b82f6",
    bubbleClass: "bg-blue-600 text-white",
    backgroundClass: "bg-slate-950/5",
  },
  ocean: {
    id: "ocean",
    name: "Ocean Teal",
    accentColor: "#06b6d4",
    bubbleClass: "bg-cyan-600 text-white",
    backgroundClass: "bg-cyan-950/5",
  },
  lavender: {
    id: "lavender",
    name: "Lavender Lilac",
    accentColor: "#8b5cf6",
    bubbleClass: "bg-purple-600 text-white",
    backgroundClass: "bg-purple-950/5",
  },
  sunset: {
    id: "sunset",
    name: "Sunset Rose",
    accentColor: "#f43f5e",
    bubbleClass: "bg-rose-600 text-white",
    backgroundClass: "bg-rose-950/5",
  },
  forest: {
    id: "forest",
    name: "Forest Mint",
    accentColor: "#10b981",
    bubbleClass: "bg-emerald-600 text-white",
    backgroundClass: "bg-emerald-950/5",
  },
  minimal: {
    id: "minimal",
    name: "Slate Monochrome",
    accentColor: "#475569",
    bubbleClass: "bg-slate-800 text-white",
    backgroundClass: "bg-slate-500/5",
  },
};

export const CHAT_WALLPAPERS: Record<ChatWallpaperId, { name: string; patternCss: string }> = {
  plain: {
    name: "Clean Plain",
    patternCss: "none",
  },
  dots: {
    name: "Polka Dots",
    patternCss: "radial-gradient(currentColor 1px, transparent 1px)",
  },
  grid: {
    name: "Modern Grid",
    patternCss:
      "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
  },
  constellation: {
    name: "Constellation",
    patternCss: "radial-gradient(currentColor 1.5px, transparent 1.5px)",
  },
  geometry: {
    name: "Geometric",
    patternCss: "repeating-linear-gradient(45deg, currentColor, currentColor 1px, transparent 0, transparent 20px)",
  },
};

const THEME_STORAGE_KEY_PREFIX = "ghostline_theme_";
const memoryThemeStore = new Map<string, ChatAppearanceSettings>();

export function getConversationAppearance(conversationId: string): ChatAppearanceSettings {
  if (memoryThemeStore.has(conversationId)) {
    return memoryThemeStore.get(conversationId)!;
  }
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(`${THEME_STORAGE_KEY_PREFIX}${conversationId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        memoryThemeStore.set(conversationId, parsed);
        return parsed;
      }
    }
  } catch {}
  return { themeId: "default", wallpaperId: "plain", wallpaperOpacity: 0.05 };
}

export function saveConversationAppearance(conversationId: string, settings: ChatAppearanceSettings): void {
  memoryThemeStore.set(conversationId, settings);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(`${THEME_STORAGE_KEY_PREFIX}${conversationId}`, JSON.stringify(settings));
    }
  } catch {}
}
