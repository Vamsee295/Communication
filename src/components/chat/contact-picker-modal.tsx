import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, Search, User, Loader2, Send } from "lucide-react";
import { listFriendships } from "@/lib/friendships.functions";
import { getMyProfile } from "@/lib/profile.functions";

interface ContactPickerModalProps {
  onClose: () => void;
  onSendContact: (contact: { userId: string; displayName: string; username: string }) => void;
}

export function ContactPickerModal({ onClose, onSendContact }: ContactPickerModalProps) {
  const fetchFriends = useServerFn(listFriendships);
  const fetchMe = useServerFn(getMyProfile);
  const [search, setSearch] = useState("");

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => fetchMe(),
  });

  const friends = useQuery({
    queryKey: ["friendships"],
    queryFn: () => fetchFriends(),
  });

  const meId = me.data?.id;
  const allFriendships = friends.data?.friendships ?? [];
  const profiles = friends.data?.profiles ?? {};

  const acceptedContacts = allFriendships
    .filter((f) => f.status === "accepted")
    .map((f) => {
      const friendId = f.requester_id === meId ? f.addressee_id : f.requester_id;
      const p = profiles[friendId];
      return {
        userId: friendId,
        displayName: p?.display_name || p?.username || "Friend",
        username: p?.username || "user",
      };
    });

  const filteredContacts = acceptedContacts.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.displayName.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-card shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-foreground">Share Contact</h3>
            <p className="text-xs text-muted-foreground">Select a contact to share</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border/40">
          <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts..."
              className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Contact List */}
        <div className="max-h-72 overflow-y-auto p-2">
          {friends.isLoading || me.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-center p-4 text-xs text-muted-foreground">
              <User className="h-8 w-8 text-muted-foreground/40 mb-1" />
              <p>No contacts found</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredContacts.map((c) => {
                const initial = (c.displayName || c.username || "?").charAt(0).toUpperCase();
                return (
                  <button
                    key={c.userId}
                    type="button"
                    onClick={() => {
                      onSendContact({
                        userId: c.userId,
                        displayName: c.displayName,
                        username: c.username,
                      });
                      onClose();
                    }}
                    className="flex items-center justify-between gap-3 rounded-2xl p-2.5 text-left transition hover:bg-muted/60 active:scale-[0.99] cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                        {initial}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="truncate text-xs font-semibold text-foreground">
                          {c.displayName}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          @{c.username}
                        </span>
                      </div>
                    </div>
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
                      <Send className="h-3.5 w-3.5 translate-x-px" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function parseContactMessage(body: string): { userId: string; displayName: string; username: string } | null {
  if (!body.startsWith("ghostline:contact:")) return null;
  const parts = body.split(":");
  if (parts.length < 5) return null;
  return {
    userId: parts[2],
    displayName: parts[3],
    username: parts[4],
  };
}

export function formatContactPayload(contact: { userId: string; displayName: string; username: string }): string {
  return `ghostline:contact:${contact.userId}:${contact.displayName}:${contact.username}`;
}
