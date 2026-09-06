import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Ghost, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { updateProfile, checkUsernameAvailability } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_]+$/, "Use 3–30 lowercase letters, numbers, or underscores.");

type ValidationState = "empty" | "invalid" | "checking" | "available" | "taken";

function Onboarding() {
  const navigate = useNavigate();
  const router = useRouter();
  const save = useServerFn(updateProfile);
  const check = useServerFn(checkUsernameAvailability);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  const [validationState, setValidationState] = useState<ValidationState>("empty");
  const [validationMessage, setValidationMessage] = useState("Choose a username");

  // Handle debounced checking
  useEffect(() => {
    // Strip '@' if user types it
    const normalized = username.replace(/^@/, "").trim().toLowerCase();
    
    if (normalized.length === 0) {
      setValidationState("empty");
      setValidationMessage("Choose a username");
      return;
    }

    const parsed = usernameSchema.safeParse(normalized);
    if (!parsed.success) {
      setValidationState("invalid");
      setValidationMessage("Use 3–30 letters, numbers, or underscores.");
      return;
    }

    setValidationState("checking");
    setValidationMessage("Checking availability...");

    const t = setTimeout(async () => {
      try {
        const isAvailable = await check({ data: { username: normalized } });
        if (isAvailable) {
          setValidationState("available");
          setValidationMessage("✓ Username available");
        } else {
          setValidationState("taken");
          setValidationMessage("✕ Username already taken");
        }
      } catch {
        setValidationState("invalid");
        setValidationMessage("Could not check availability");
      }
    }, 500);

    return () => clearTimeout(t);
  }, [username, check]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validationState !== "available") return;
    if (!displayName.trim()) {
      toast.error("Add a display name");
      return;
    }

    setSaving(true);
    try {
      const normalized = username.replace(/^@/, "").trim().toLowerCase();
      await save({
        data: {
          username: normalized,
          display_name: displayName.trim(),
        },
      });
      toast.success("Welcome to Ghostline!");
      // Invalidate cache so the route guard sees the new profile
      router.invalidate();
      navigate({ to: "/chats", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F7FAFE]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pt-16 pb-10">
        <div className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#2587F5] text-white glow-primary">
            <Ghost className="h-5 w-5" />
          </div>
          <span className="font-black text-[#0B1B33]">Ghostline</span>
        </div>

        <div className="mt-12 flex-1">
          <h1 className="text-3xl font-black text-[#0B1B33]">Welcome to Ghostline</h1>
          <p className="mt-2 text-sm text-[#64748B]">
            Create your identity so people can find and connect with you.
          </p>

          <form onSubmit={submit} className="mt-10 grid gap-4">
            <div className="grid gap-2">
              <label className="text-xs uppercase tracking-widest text-[#64748B] font-bold">
                Choose your username
              </label>
              <div className="flex items-center rounded-2xl border border-[#DCE8F5] bg-white px-4 focus-within:border-[#2587F5] focus-within:ring-2 focus-within:ring-[#EAF4FF] transition-all">
                <span className="text-sm font-medium text-[#94A3B8]">@</span>
                <input
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ghost_rider"
                  className="h-14 w-full bg-transparent px-2 text-sm font-medium text-[#0B1B33] outline-none placeholder:text-[#94A3B8]"
                  maxLength={30}
                />
              </div>
              
              <div className="flex items-center gap-1.5 px-1 h-5">
                {validationState === "checking" && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#64748B]" />}
                {validationState === "available" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                {validationState === "taken" && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                <span
                  className={[
                    "text-xs font-medium transition-colors",
                    validationState === "empty" ? "text-[#64748B]" : "",
                    validationState === "checking" ? "text-[#64748B]" : "",
                    validationState === "available" ? "text-green-600" : "",
                    validationState === "invalid" ? "text-red-500" : "",
                    validationState === "taken" ? "text-red-500" : "",
                  ].join(" ")}
                >
                  {validationMessage}
                </span>
              </div>
            </div>

            <div className="grid gap-2 mt-4">
              <label className="text-xs uppercase tracking-widest text-[#64748B] font-bold">
                Display name
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ghost Rider"
                className="h-14 rounded-2xl border border-[#DCE8F5] bg-white px-4 text-sm font-medium text-[#0B1B33] outline-none focus:border-[#2587F5] focus:ring-2 focus:ring-[#EAF4FF] transition-all placeholder:text-[#94A3B8]"
                maxLength={60}
              />
            </div>

            <button
              type="submit"
              disabled={saving || validationState !== "available" || !displayName.trim()}
              className="mt-6 flex h-14 items-center justify-center rounded-full bg-[#2587F5] text-base font-bold text-white shadow-[0_4px_14px_rgba(37,135,245,0.3)] transition hover:bg-[#1467D8] disabled:opacity-50 disabled:shadow-none"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
