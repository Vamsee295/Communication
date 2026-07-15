import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Ghost, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { updateProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers, underscore only");

function Onboarding() {
  const navigate = useNavigate();
  const save = useServerFn(updateProfile);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid username");
      return;
    }
    if (!displayName.trim()) {
      toast.error("Add a display name");
      return;
    }
    setLoading(true);
    try {
      await save({
        data: {
          username: parsed.data,
          display_name: displayName.trim(),
        },
      });
      toast.success("You're in");
      navigate({ to: "/chats", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pt-16 pb-10">
        <div className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground glow-primary">
            <Ghost className="h-5 w-5" />
          </div>
          <span className="font-black">Ghostline</span>
        </div>

        <div className="mt-12 flex-1">
          <h1 className="text-3xl font-black">Pick your handle</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Friends will find you by this. You can change your name anytime.
          </p>

          <form onSubmit={submit} className="mt-8 grid gap-3">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Username</label>
            <div className="flex items-center rounded-2xl border border-input bg-card px-4 focus-within:border-primary">
              <span className="text-sm text-muted-foreground">@</span>
              <input
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="ghost_rider"
                className="h-12 w-full bg-transparent px-2 text-sm outline-none"
                maxLength={30}
              />
            </div>

            <label className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">Display name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ghost Rider"
              className="h-12 rounded-2xl border border-input bg-card px-4 text-sm outline-none focus:border-primary"
              maxLength={60}
            />

            <button
              type="submit"
              disabled={loading}
              className="mt-6 flex h-14 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground glow-primary disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
