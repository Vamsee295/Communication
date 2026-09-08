import { useState } from "react";
import {
  X,
  Phone,
  Video,
  Search,
  Bell,
  BellOff,
  ShieldBan,
  Trash2,
  Lock,
  Copy,
  Check,
  User,
} from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import type { ChatProfile } from "@/lib/domain/types";
import { toast } from "sonner";

export interface UserProfileSheetProps {
  user: ChatProfile;
  isOnline: boolean;
  statusLabel: string;
  isMuted: boolean;
  onClose: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onSearch: () => void;
  onToggleMute: () => void;
  onClearChat: () => void;
  onBlock: () => void;
}

export function UserProfileSheet({
  user,
  isOnline,
  statusLabel,
  isMuted,
  onClose,
  onVoiceCall,
  onVideoCall,
  onSearch,
  onToggleMute,
  onClearChat,
  onBlock,
}: UserProfileSheetProps) {
  const [copied, setCopied] = useState(false);
  const name = user.display_name ?? user.username ?? "Ghost";

  const copyId = () => {
    navigator.clipboard.writeText(user.id);
    setCopied(true);
    toast.success("User ID copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-border bg-card p-6 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto flex flex-col"
      >
        {/* Header bar */}
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <h3 className="text-base font-bold text-foreground">Contact Info</h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted text-muted-foreground transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Profile Header */}
        <div className="flex flex-col items-center text-center pt-6 pb-4">
          <div className="relative mb-3">
            <UserAvatar
              avatarUrl={user.avatar_url}
              name={name}
              size="h-20 w-20"
              online={isOnline}
            />
          </div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">{name}</h2>
          {user.username && (
            <p className="mt-0.5 text-xs text-muted-foreground font-mono">@{user.username}</p>
          )}

          <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-border/60 bg-surface-2/60">
            <span
              className={`h-2 w-2 rounded-full ${
                isOnline ? "bg-success animate-pulse" : "bg-muted-foreground/40"
              }`}
            />
            <span className={isOnline ? "text-success font-semibold" : "text-muted-foreground"}>
              {statusLabel || (isOnline ? "Online" : "Offline")}
            </span>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="grid grid-cols-4 gap-2.5 py-3 border-y border-border/50">
          <button
            onClick={() => {
              onClose();
              onVoiceCall();
            }}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 hover:bg-surface-2 transition group"
            title="Voice call"
          >
            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition">
              <Phone className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-medium text-foreground">Audio</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onVideoCall();
            }}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 hover:bg-surface-2 transition group"
            title="Video call"
          >
            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition">
              <Video className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-medium text-foreground">Video</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onSearch();
            }}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 hover:bg-surface-2 transition group"
            title="Search in chat"
          >
            <div className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-foreground group-hover:bg-primary/20 transition">
              <Search className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-medium text-foreground">Search</span>
          </button>

          <button
            onClick={onToggleMute}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 hover:bg-surface-2 transition group"
            title={isMuted ? "Unmute notifications" : "Mute notifications"}
          >
            <div
              className={`grid h-10 w-10 place-items-center rounded-full transition ${
                isMuted
                  ? "bg-amber-500/15 text-amber-500"
                  : "bg-surface-2 text-foreground group-hover:bg-primary/20"
              }`}
            >
              {isMuted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            </div>
            <span className="text-[11px] font-medium text-foreground">
              {isMuted ? "Muted" : "Mute"}
            </span>
          </button>
        </div>

        {/* Details section */}
        <div className="space-y-4 py-4">
          <div className="rounded-2xl border border-border bg-surface-2/40 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  User ID
                </p>
                <p className="font-mono text-xs text-foreground truncate max-w-[240px]">
                  {user.id}
                </p>
              </div>
              <button
                onClick={copyId}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border/70 hover:bg-surface-2 text-muted-foreground transition"
                title="Copy ID"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface-2/40 p-3.5 flex items-start gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">Privacy & Protection</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Voice and video calls connect peer-to-peer and are encrypted in transit (DTLS-SRTP). Messages are protected and never indexed.
              </p>
            </div>
          </div>
        </div>

        {/* Danger actions */}
        <div className="pt-2 border-t border-border/50 space-y-2">
          <button
            onClick={() => {
              onClose();
              onClearChat();
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-medium text-destructive hover:bg-destructive/10 transition"
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            Clear chat history
          </button>
          <button
            onClick={() => {
              onClose();
              onBlock();
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-medium text-destructive hover:bg-destructive/10 transition"
          >
            <ShieldBan className="h-4 w-4 shrink-0" />
            Block {name}
          </button>
        </div>
      </div>
    </div>
  );
}
