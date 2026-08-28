import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Phone, User, Settings, UserPlus, Search } from "lucide-react";
import { listConversations } from "@/lib/chat.functions";

type Command = {
  id: string;
  label: string;
  hint?: string;
  icon: typeof MessageCircle;
  run: () => void;
};

/** Desktop command palette — Ctrl/Cmd+K. Ctrl/Cmd+N opens contacts (new conversation). */
export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchConversations = useServerFn(listConversations);
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => fetchConversations(),
    enabled: open,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQ("");
        setIdx(0);
      } else if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setOpen(false);
        void navigate({ to: "/contacts" });
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { id: "chats", label: "Go to Chats", icon: MessageCircle, run: () => navigate({ to: "/chats" }) },
      { id: "calls", label: "Go to Calls", icon: Phone, run: () => navigate({ to: "/calls" }) },
      { id: "profile", label: "Go to Profile", icon: User, run: () => navigate({ to: "/profile" }) },
      { id: "settings", label: "Open Settings", icon: Settings, run: () => navigate({ to: "/settings" }) },
      {
        id: "new",
        label: "New conversation",
        hint: "Ctrl N",
        icon: UserPlus,
        run: () => navigate({ to: "/contacts" }),
      },
    ];
    const chats: Command[] = (conversations.data ?? []).map((c) => ({
      id: `conv-${c.id}`,
      label: c.other?.display_name ?? c.other?.username ?? "Ghost",
      hint: "Open chat",
      icon: MessageCircle,
      run: () => navigate({ to: "/chats/$conversationId", params: { conversationId: c.id } }),
    }));
    const needle = q.trim().toLowerCase();
    const all = [...base, ...chats];
    return needle ? all.filter((c) => c.label.toLowerCase().includes(needle)) : all;
  }, [conversations.data, navigate, q]);

  if (!open) return null;

  const runAt = (i: number) => {
    const cmd = commands[i];
    if (!cmd) return;
    setOpen(false);
    cmd.run();
  };

  return (
    <div
      className="fixed inset-0 z-[90] hidden items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm lg:flex"
      onClick={() => setOpen(false)}
    >
      <div
        className="glass animate-rise-in w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(i + 1, commands.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runAt(idx);
              }
            }}
            placeholder="Search chats or type a command"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Esc
          </kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5">
          {commands.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No results</li>
          )}
          {commands.map((c, i) => {
            const Icon = c.icon;
            return (
              <li key={c.id}>
                <button
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => runAt(i)}
                  className={[
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm",
                    i === idx ? "bg-surface-2 text-foreground" : "text-muted-foreground",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate font-medium">{c.label}</span>
                  {c.hint && <span className="text-[11px] text-muted-foreground">{c.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
