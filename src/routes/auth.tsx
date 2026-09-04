import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Ghost, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { authService } from "@/lib/auth/session";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "At least 8 characters").max(72),
});

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    // If already authed, bounce
    authService.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chats", replace: true });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await authService.signUpWithPassword(
          parsed.data.email,
          parsed.data.password,
          window.location.origin,
        );
        if (error) throw error;
        toast.success("Welcome to Ghostline");
      } else {
        const { error } = await authService.signInWithPassword(parsed.data.email, parsed.data.password);
        if (error) throw error;
      }
      navigate({ to: "/chats", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Auth failed";
      toast.error(msg.includes("Invalid login") ? "Wrong email or password" : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const result = await authService.signInWithGoogle(window.location.origin);
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/chats", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pt-14 pb-10">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Ghost className="h-4 w-4" />
          </div>
          <span className="font-black">Ghostline</span>
        </Link>

        <div className="mt-12">
          <h1 className="text-3xl font-black tracking-tight">
            {mode === "signup" ? "Create your ghost" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signup"
              ? "Sign up to send disappearing messages."
              : "Sign in to your Ghostline account."}
          </p>
        </div>

        <button
          onClick={handleGoogle}
          disabled={googleLoading}
          className="mt-8 flex h-12 items-center justify-center gap-3 rounded-full bg-white text-sm font-semibold text-black transition active:scale-[0.98] disabled:opacity-60"
        >
          {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
          Continue with Google
        </button>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          or with email
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="grid gap-3">
          <input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-2xl border border-input bg-card px-4 text-sm outline-none focus:border-primary"
            required
          />
          <input
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="Password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 rounded-2xl border border-input bg-card px-4 text-sm outline-none focus:border-primary"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex h-12 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground transition active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="mt-6 text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.995 6.995 0 0 1 5.47 12c0-.73.13-1.43.36-2.09V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
