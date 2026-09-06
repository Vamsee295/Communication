/**
 * VanishBanner — displayed at the top of the chat view during an active Vanish Mode session.
 *
 * Shows the Vanish Mode indicator, privacy disclaimer, and an exit button.
 * Keeps Ghostline's premium visual identity: deep navy + soft blue, no aggressive neon.
 */

interface VanishBannerProps {
  onExit: () => void;
}

export function VanishBanner({ onExit }: VanishBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Vanish Mode is active. Messages sent here won't be saved to your Ghostline chat history."
      className="vanish-banner flex flex-col items-center gap-1.5 border-b border-[#1e3a5f]/60 px-4 py-3 text-center"
      style={{
        background: "linear-gradient(135deg, #0b1b33 0%, #0f2546 100%)",
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-base" aria-hidden>🌙</span>
        <p className="text-sm font-bold tracking-wide text-white">Vanish Mode</p>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
          style={{ background: "rgba(37,135,245,0.25)", color: "#7cb9ff" }}
        >
          Active
        </span>
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: "#94b4d4" }}>
        Messages sent here won't be saved to your Ghostline chat history.
      </p>
      <p className="text-[10px]" style={{ color: "#4a7a9e" }}>
        People can still capture what appears on their screen.
      </p>
      <button
        onClick={onExit}
        aria-label="Exit Vanish Mode"
        className="mt-1 rounded-full border px-4 py-1 text-[11px] font-semibold transition hover:brightness-110 active:scale-95"
        style={{
          borderColor: "rgba(37,135,245,0.5)",
          color: "#7cb9ff",
          background: "rgba(37,135,245,0.12)",
        }}
      >
        Exit Vanish Mode
      </button>
    </div>
  );
}
