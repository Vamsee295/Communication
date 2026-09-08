/**
 * EphemeralMessageBubble — renders a single ephemeral (Vanish Mode) message.
 *
 * Visually distinct from normal messages:
 *   - Deep navy / soft-blue tint
 *   - 🌙 indicator (outgoing mine) or just navy (incoming)
 *   - Subtle fade-in animation
 *   - No reaction/receipt/edit controls — ephemeral only
 *
 * IMPORTANT: These bubbles must never interact with Neon persistent state.
 */


interface EphemeralMessageBubbleProps {
  message: { id: string; created_at: string; sender_name?: string; body: string };
  mine: boolean;
  /** Show sender name (for group conversations). */
  showName?: boolean;
}

export function EphemeralMessageBubble({ message, mine, showName }: EphemeralMessageBubbleProps) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li
      className={[
        "flex",
        mine ? "justify-end" : "justify-start",
        "animate-vanish-arrive",
      ].join(" ")}
      aria-label={`Vanish message from ${mine ? "you" : message.sender_name}: ${message.body}`}
    >
      <div
        className="max-w-[75%] rounded-2xl px-3.5 py-2.5"
        style={
          mine
            ? {
                background: "linear-gradient(135deg, #0f2f5a 0%, #153a6e 100%)",
                borderRadius: "18px 18px 4px 18px",
                boxShadow: "0 2px 12px rgba(37,135,245,0.18)",
              }
            : {
                background: "rgba(11,27,51,0.85)",
                border: "1px solid rgba(37,135,245,0.18)",
                borderRadius: "18px 18px 18px 4px",
              }
        }
      >
        {showName && !mine && (
          <p className="mb-0.5 text-[10px] font-semibold" style={{ color: "#7cb9ff" }}>
            {message.sender_name}
          </p>
        )}
        <p
          className="break-words text-sm leading-relaxed"
          style={{ color: mine ? "#e8f0ff" : "#c8daf0" }}
        >
          {message.body}
        </p>
        <div className="mt-1 flex items-center justify-end gap-1">
          <span className="text-[9px]" aria-hidden style={{ color: "#4a7a9e" }}>
            {time}
          </span>
          {mine && (
            <span className="text-[10px]" aria-hidden>
              🌙
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
