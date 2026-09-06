import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Star, StarOff } from "lucide-react";
import { listMyStarred, toggleStar } from "@/lib/chat.functions";

export const Route = createFileRoute("/_authenticated/starred")({
  component: StarredPage,
});

function StarredPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchStars = useServerFn(listMyStarred);
  const doToggle = useServerFn(toggleStar);
  const items = useQuery({ queryKey: ["starred"], queryFn: () => fetchStars() });

  const unstar = useMutation({
    mutationFn: (id: string) => doToggle({ data: { message_id: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["starred"] }),
  });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-10">
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/profile" })}
          className="grid h-10 w-10 place-items-center rounded-full border border-border"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Favorites</p>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Star className="h-5 w-5 fill-primary text-primary" /> Starred
          </h1>
        </div>
      </header>

      <div className="mt-8 flex-1 pb-16">
        {(items.data ?? []).length === 0 ? (
          <div className="glass mt-8 flex flex-col items-center gap-3 rounded-3xl px-6 py-14 text-center">
            <Star className="h-8 w-8 text-primary" />
            <h2 className="text-lg font-bold">Nothing starred yet</h2>
            <p className="max-w-xs text-sm text-muted-foreground">
              Long-press a message and tap Star to keep it here.
            </p>
          </div>
        ) : (
          <ul className="grid gap-2">
            {(items.data ?? []).map((item) => {
              const name = item.other?.display_name ?? item.other?.username ?? "Ghost";
              return (
                <li key={item.message.id} className="glass rounded-2xl px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-muted-foreground">
                        {name} · {new Date(item.message.created_at).toLocaleString()}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                        {item.message.body}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() =>
                          navigate({
                            to: "/chats/$conversationId",
                            params: { conversationId: item.message.conversation_id },
                          })
                        }
                        className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold hover:bg-secondary/70"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => unstar.mutate(item.message.id)}
                        className="grid h-7 w-full place-items-center rounded-full text-muted-foreground hover:text-destructive"
                        aria-label="Unstar"
                      >
                        <StarOff className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
