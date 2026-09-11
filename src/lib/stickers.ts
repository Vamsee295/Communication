export interface Sticker {
  id: string;
  packId: string;
  name: string;
  emojiFallback: string;
  url: string; // SVG data URI or hosted asset URL
}

export interface StickerPack {
  id: string;
  title: string;
  author: string;
  icon: string;
  stickers: Sticker[];
}

// Inline SVGs for fast, self-contained, crisp vector rendering
function createSvgDataUrl(svgInner: string, viewBox = "0 0 100 100"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100" height="100">${svgInner}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const GHOSTLINE_STICKER_PACKS: StickerPack[] = [
  {
    id: "ghostly",
    title: "Ghostly",
    author: "Ghostline Studio",
    icon: "👻",
    stickers: [
      {
        id: "ghost_hello",
        packId: "ghostly",
        name: "Wave Hello",
        emojiFallback: "👋",
        url: createSvgDataUrl(`
          <defs>
            <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#38bdf8"/>
              <stop offset="100%" stop-color="#2563eb"/>
            </linearGradient>
          </defs>
          <path d="M50 15 C30 15 25 35 25 60 C25 80 32 85 40 78 C48 88 52 88 60 78 C68 88 75 80 75 60 C75 35 70 15 50 15 Z" fill="url(#g1)" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.15))"/>
          <circle cx="42" cy="45" r="4" fill="#ffffff"/>
          <circle cx="58" cy="45" r="4" fill="#ffffff"/>
          <ellipse cx="50" cy="55" rx="5" ry="3" fill="#ffffff"/>
          <path d="M72 48 Q85 35 88 45 Q85 55 72 52 Z" fill="#38bdf8"/>
        `),
      },
      {
        id: "ghost_love",
        packId: "ghostly",
        name: "Heart Eyes",
        emojiFallback: "💖",
        url: createSvgDataUrl(`
          <defs>
            <linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f43f5e"/>
              <stop offset="100%" stop-color="#e11d48"/>
            </linearGradient>
          </defs>
          <path d="M50 15 C30 15 25 35 25 60 C25 80 32 85 40 78 C48 88 52 88 60 78 C68 88 75 80 75 60 C75 35 70 15 50 15 Z" fill="#ffffff" filter="drop-shadow(0 4px 8px rgba(244,63,94,0.3))"/>
          <path d="M40 40 Q43 33 46 40 Q43 47 40 40 Z" fill="url(#g2)" transform="scale(1.2) translate(-6,-6)"/>
          <path d="M54 40 Q57 33 60 40 Q57 47 54 40 Z" fill="url(#g2)" transform="scale(1.2) translate(-6,-6)"/>
          <path d="M45 56 Q50 63 55 56" stroke="#f43f5e" stroke-width="3" stroke-linecap="round" fill="none"/>
        `),
      },
      {
        id: "ghost_fire",
        packId: "ghostly",
        name: "Lit Fire",
        emojiFallback: "🔥",
        url: createSvgDataUrl(`
          <defs>
            <linearGradient id="g3" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f59e0b"/>
              <stop offset="100%" stop-color="#ef4444"/>
            </linearGradient>
          </defs>
          <path d="M50 10 Q70 30 65 50 Q85 40 75 80 Q60 95 50 90 Q30 95 25 75 Q15 45 40 35 Q35 25 50 10 Z" fill="url(#g3)" filter="drop-shadow(0 4px 8px rgba(239,68,68,0.3))"/>
          <circle cx="42" cy="55" r="4" fill="#ffffff"/>
          <circle cx="58" cy="55" r="4" fill="#ffffff"/>
          <ellipse cx="50" cy="67" rx="6" ry="4" fill="#ffffff"/>
        `),
      },
      {
        id: "ghost_party",
        packId: "ghostly",
        name: "Party Mode",
        emojiFallback: "🎉",
        url: createSvgDataUrl(`
          <path d="M50 25 C30 25 25 45 25 70 C25 90 32 95 40 88 C48 98 52 98 60 88 C68 98 75 90 75 70 C75 45 70 25 50 25 Z" fill="#38bdf8"/>
          <!-- Party hat -->
          <polygon points="50,5 35,28 65,28" fill="#facc15"/>
          <circle cx="50" cy="5" r="3" fill="#f43f5e"/>
          <circle cx="42" cy="55" r="4" fill="#ffffff"/>
          <circle cx="58" cy="55" r="4" fill="#ffffff"/>
          <path d="M43 65 Q50 72 57 65" stroke="#ffffff" stroke-width="3" stroke-linecap="round" fill="none"/>
        `),
      },
      {
        id: "ghost_cool",
        packId: "ghostly",
        name: "Sunglasses Cool",
        emojiFallback: "😎",
        url: createSvgDataUrl(`
          <path d="M50 15 C30 15 25 35 25 60 C25 80 32 85 40 78 C48 88 52 88 60 78 C68 88 75 80 75 60 C75 35 70 15 50 15 Z" fill="#0ea5e9"/>
          <!-- Sunglasses -->
          <rect x="32" y="42" width="16" height="12" rx="4" fill="#0f172a"/>
          <rect x="52" y="42" width="16" height="12" rx="4" fill="#0f172a"/>
          <line x1="48" y1="46" x2="52" y2="46" stroke="#0f172a" stroke-width="3"/>
          <path d="M45 62 Q50 67 55 62" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" fill="none"/>
        `),
      },
      {
        id: "ghost_mindblown",
        packId: "ghostly",
        name: "Mind Blown",
        emojiFallback: "🤯",
        url: createSvgDataUrl(`
          <defs>
            <linearGradient id="g4" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#a855f7"/>
              <stop offset="100%" stop-color="#6366f1"/>
            </linearGradient>
          </defs>
          <path d="M50 30 C30 30 25 45 25 70 C25 90 32 95 40 88 C48 98 52 98 60 88 C68 98 75 90 75 70 C75 45 70 30 50 30 Z" fill="url(#g4)"/>
          <!-- Explosion -->
          <path d="M25 25 Q35 10 50 15 Q65 10 75 25 Q90 30 75 40 Q50 35 25 25 Z" fill="#fbbf24"/>
          <circle cx="40" cy="55" r="5" fill="#ffffff"/>
          <circle cx="60" cy="55" r="5" fill="#ffffff"/>
          <circle cx="40" cy="55" r="2" fill="#000000"/>
          <circle cx="60" cy="55" r="2" fill="#000000"/>
          <ellipse cx="50" cy="68" rx="7" ry="5" fill="#000000"/>
        `),
      },
    ],
  },
  {
    id: "neon",
    title: "Neon Vibes",
    author: "Ghostline Cyber",
    icon: "⚡",
    stickers: [
      {
        id: "neon_bolt",
        packId: "neon",
        name: "Lightning Flash",
        emojiFallback: "⚡",
        url: createSvgDataUrl(`
          <polygon points="55,10 25,50 48,50 42,90 75,45 52,45" fill="#facc15" stroke="#eab308" stroke-width="2" filter="drop-shadow(0 0 8px rgba(250,204,21,0.8))"/>
        `),
      },
      {
        id: "neon_rocket",
        packId: "neon",
        name: "To The Moon",
        emojiFallback: "🚀",
        url: createSvgDataUrl(`
          <path d="M50 15 Q75 35 65 65 L50 60 L35 65 Q25 35 50 15 Z" fill="#38bdf8" filter="drop-shadow(0 0 6px rgba(56,189,248,0.7))"/>
          <circle cx="50" cy="38" r="6" fill="#ffffff"/>
          <polygon points="50,62 42,85 50,78 58,85" fill="#f43f5e"/>
        `),
      },
      {
        id: "neon_shield",
        packId: "neon",
        name: "Encrypted Secure",
        emojiFallback: "🛡️",
        url: createSvgDataUrl(`
          <path d="M50 15 L80 28 C80 65 50 85 50 85 C50 85 20 65 20 28 Z" fill="#10b981" filter="drop-shadow(0 0 6px rgba(16,185,129,0.7))"/>
          <path d="M40 48 L47 55 L62 38" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        `),
      },
      {
        id: "neon_thumbsup",
        packId: "neon",
        name: "Super Like",
        emojiFallback: "👍",
        url: createSvgDataUrl(`
          <path d="M35 45 L35 80 L25 80 L25 45 Z M42 45 L50 20 Q56 20 56 28 L56 38 L75 38 Q82 38 80 48 L75 75 Q73 80 66 80 L42 80 Z" fill="#6366f1" filter="drop-shadow(0 0 6px rgba(99,102,241,0.7))"/>
        `),
      },
    ],
  },
];

export function parseStickerMessage(body: string): Sticker | null {
  if (!body.startsWith("ghostline:sticker:")) return null;
  const parts = body.split(":");
  if (parts.length < 4) return null;
  const packId = parts[2];
  const stickerId = parts[3];

  const pack = GHOSTLINE_STICKER_PACKS.find((p) => p.id === packId);
  if (!pack) return null;
  const sticker = pack.stickers.find((s) => s.id === stickerId);
  return sticker ?? null;
}

export function formatStickerPayload(sticker: Sticker): string {
  return `ghostline:sticker:${sticker.packId}:${sticker.id}:${sticker.name}`;
}
