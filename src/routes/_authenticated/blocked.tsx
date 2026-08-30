import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldBan } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { listBlockedContacts, unblockContact } from "@/lib/chat.functions";

export const Route = createFileRoute("/_authenticated/blocked")({
  head: () => ({
    meta: [
      { title: "Blocked contacts · Ghostline" },
      { name: "description", content: "Review and unblock contacts you've blocked on Ghostline." },
      { property: "og:title", content: "Blocked contacts · Ghostline" },
      { property: "og:description", content: "Review and unblock contacts on Ghostline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BlockedPage,
});

function BlockedPage() {
  const fetchBlocked = useServerFn(listBlockedContacts);
  const doUnblock = useServerFn(unblockContact);
  const qc = useQueryClient();

  const blocked = useQuery({ queryKey: ["blocked"], queryFn: () => fetchBlocked() });

  const unblock = useMutation({
    mutationFn: (userId: string) => doUnblock({ data: { user_id: userId } }),
    onSuccess: () => {
      toast.success("Contact unblocked");
      qc.invalidateQueries({ queryKey: ["blocked"] });
      qc.invalidateQueries({ queryKey: ["friendships"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not unblock"),
  });

  const items = blocked.data ?? [];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8 lg:pt-10">
        <h1 className="text-[28px] font-extrabold tracking-tight">Blocked contacts</h1>

        {items.length === 0 ? (
          <div className="panel mt-8 flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <ShieldBan className="h-6 w-6" />
            </div>
            <h2 className="text-base font-bold">Nobody is blocked</h2>
            <p className="max-w-xs text-sm text-muted-foreground">
              Blocked people can't message or call you. You can block someone from the chat list menu.
            </p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-0.5">
            {items.map((p) => {
              const name = p.display_name ?? p.username ?? "Ghost";
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-surface-2/70">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold text-primary ring-1 ring-border">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{name}</p>
                    {p.username && (
                      <p className="truncate text-[12px] text-muted-foreground">@{p.username}</p>
                    )}
                  </div>
                  <button
                    onClick={() => unblock.mutate(p.id)}
                    disabled={unblock.isPending}
                    className="press h-9 shrink-0 rounded-xl border border-border px-4 text-[13px] font-semibold hover:bg-surface-2"
                  >
                    Unblock
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
