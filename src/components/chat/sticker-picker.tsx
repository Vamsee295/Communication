import { useState } from "react";
import { GHOSTLINE_STICKER_PACKS, type Sticker, type StickerPack } from "@/lib/stickers";

interface StickerPickerProps {
  onSelectSticker: (sticker: Sticker) => void;
}

export function StickerPicker({ onSelectSticker }: StickerPickerProps) {
  const [activePackId, setActivePackId] = useState<string>(GHOSTLINE_STICKER_PACKS[0].id);

  const activePack = GHOSTLINE_STICKER_PACKS.find((p) => p.id === activePackId) || GHOSTLINE_STICKER_PACKS[0];

  return (
    <div className="flex h-64 flex-col overflow-hidden">
      {/* Pack tabs */}
      <div className="flex items-center gap-1 border-b border-border/40 px-2 py-1.5 overflow-x-auto shrink-0">
        {GHOSTLINE_STICKER_PACKS.map((pack) => {
          const isSelected = pack.id === activePackId;
          return (
            <button
              key={pack.id}
              type="button"
              onClick={() => setActivePackId(pack.id)}
              className={[
                "flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium transition",
                isSelected
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
              ].join(" ")}
            >
              <span>{pack.icon}</span>
              <span>{pack.title}</span>
            </button>
          );
        })}
      </div>

      {/* Stickers grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-4 gap-3">
          {activePack.stickers.map((sticker) => (
            <button
              key={sticker.id}
              type="button"
              onClick={() => onSelectSticker(sticker)}
              className="group relative flex aspect-square flex-col items-center justify-center rounded-2xl p-1.5 transition hover:bg-foreground/5 hover:scale-105 active:scale-95"
              title={sticker.name}
            >
              <img
                src={sticker.url}
                alt={sticker.name}
                className="h-full w-full object-contain pointer-events-none"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
