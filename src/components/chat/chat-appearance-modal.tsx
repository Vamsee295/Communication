import { useState } from "react";
import { X, Palette, Check, Sparkles, Image as ImageIcon } from "lucide-react";
import {
  CHAT_THEMES,
  CHAT_WALLPAPERS,
  type ChatThemeId,
  type ChatWallpaperId,
  type ChatAppearanceSettings,
} from "@/lib/chat-themes";

interface ChatAppearanceModalProps {
  currentSettings?: ChatAppearanceSettings | null;
  onClose: () => void;
  onSave: (newSettings: ChatAppearanceSettings) => void;
}

export function ChatAppearanceModal({ currentSettings, onClose, onSave }: ChatAppearanceModalProps) {
  const [selectedTheme, setSelectedTheme] = useState<ChatThemeId>(currentSettings?.themeId ?? "default");
  const [selectedWallpaper, setSelectedWallpaper] = useState<ChatWallpaperId>(currentSettings?.wallpaperId ?? "plain");
  const [opacity, setOpacity] = useState<number>(currentSettings?.wallpaperOpacity ?? 0.05);

  const handleApply = () => {
    onSave({
      themeId: selectedTheme,
      wallpaperId: selectedWallpaper,
      wallpaperOpacity: opacity,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
              <Palette className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Chat Appearance</h3>
              <p className="text-xs text-muted-foreground">Customize colors & wallpaper for this chat</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5 flex flex-col gap-5">
          {/* Themes list */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Color Theme
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {Object.values(CHAT_THEMES).map((theme) => {
                const isSelected = selectedTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setSelectedTheme(theme.id)}
                    className={[
                      "flex items-center gap-2.5 rounded-2xl p-2.5 text-left border transition",
                      isSelected
                        ? "border-primary bg-primary/10 font-semibold shadow-sm"
                        : "border-border/60 hover:bg-muted/50 text-foreground",
                    ].join(" ")}
                  >
                    <span
                      className="h-4 w-4 rounded-full shadow shrink-0"
                      style={{ backgroundColor: theme.accentColor }}
                    />
                    <span className="text-xs truncate flex-1">{theme.name}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Wallpapers */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Wallpaper Pattern
            </label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {Object.entries(CHAT_WALLPAPERS).map(([id, wp]) => {
                const isSelected = selectedWallpaper === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedWallpaper(id as ChatWallpaperId)}
                    className={[
                      "flex flex-col items-center justify-center gap-1 rounded-2xl p-3 text-center border transition",
                      isSelected
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border/60 hover:bg-muted/50 text-muted-foreground",
                    ].join(" ")}
                  >
                    <ImageIcon className="h-4 w-4" />
                    <span className="text-[11px] truncate w-full">{wp.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Wallpaper Opacity */}
          {selectedWallpaper !== "plain" && (
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Pattern Intensity</span>
                <span className="font-mono">{Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.02"
                max="0.25"
                step="0.01"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="mt-2 w-full accent-primary"
              />
            </div>
          )}

          {/* Live Preview Card */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Preview
            </label>
            <div className="mt-2 overflow-hidden rounded-2xl border border-border/60 p-4 bg-muted/20 flex flex-col gap-2">
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md glass px-3 py-1.5 text-xs text-foreground">
                  Hello! How does this look?
                </div>
              </div>
              <div className="flex justify-end">
                <div
                  className={[
                    "rounded-2xl rounded-br-md px-3 py-1.5 text-xs font-medium shadow",
                    CHAT_THEMES[selectedTheme].bubbleClass,
                  ].join(" ")}
                >
                  It looks gorgeous in Ghostline! ✨
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-full px-4 text-xs font-semibold text-muted-foreground hover:bg-muted transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-xs font-bold text-primary-foreground shadow glow-primary hover:opacity-95 transition"
            >
              <Check className="h-3.5 w-3.5" /> Save Appearance
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
