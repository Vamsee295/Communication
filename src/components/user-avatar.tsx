/**
 * UserAvatar — shared avatar component for Ghostline.
 *
 * Shows an <img> when avatar_url is present; falls back to the user's initial
 * letter in a blue circle when no avatar is set. Used across the chat list,
 * conversation header, contacts, calls, and profile pages.
 */

interface UserAvatarProps {
  /** Public URL of the uploaded avatar image. Null/undefined → letter fallback. */
  avatarUrl?: string | null;
  /** Display name or username used to derive the fallback initial. */
  name: string;
  /** Tailwind size classes, e.g. "h-11 w-11". Defaults to "h-10 w-10". */
  size?: string;
  /** Extra classes appended to the outer element. */
  className?: string;
  /** Whether to show the online-indicator dot. */
  online?: boolean;
}

/** Deterministic hue from name string → one of 6 pleasant blue/teal/purple shades */
function avatarColor(name: string): string {
  const colors = [
    "bg-[#2587F5] text-white",   // blue
    "bg-[#7C3AED] text-white",   // violet
    "bg-[#0EA5E9] text-white",   // sky
    "bg-[#059669] text-white",   // emerald
    "bg-[#D97706] text-white",   // amber
    "bg-[#DB2777] text-white",   // pink
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function UserAvatar({
  avatarUrl,
  name,
  size = "h-10 w-10",
  className = "",
  online = false,
}: UserAvatarProps) {
  const initial = (name || "?").charAt(0).toUpperCase();
  const colorClass = avatarColor(name);

  return (
    <div className={`relative shrink-0 ${className}`}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className={`${size} rounded-full object-cover ring-2 ring-border`}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
            const sibling = (e.currentTarget as HTMLImageElement)
              .nextElementSibling as HTMLElement | null;
            if (sibling) sibling.style.display = "grid";
          }}
        />
      ) : null}
      {/* Letter fallback — always in DOM, hidden when image loads successfully */}
      <div
        className={`${size} ${colorClass} place-items-center rounded-full text-[13px] font-bold ring-2 ring-border ${avatarUrl ? "hidden" : "grid"}`}
        aria-hidden={!!avatarUrl}
      >
        {initial}
      </div>
      {online && (
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-400 shadow-sm" />
      )}
    </div>
  );
}
