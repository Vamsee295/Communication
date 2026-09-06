import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Ghost, Mail, Loader2, RefreshCw, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { authService } from "@/lib/auth/session";
import { maskEmail } from "@/lib/auth/mask-email";

const searchSchema = z.object({
  email: z.string().optional().default(""),
});

export const Route = createFileRoute("/auth/verify-email")({
  validateSearch: searchSchema,
  component: VerifyEmailPage,
});



function VerifyEmailPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const rawEmail = (search.email ?? "").trim();
  const masked = maskEmail(rawEmail);

  const handleResend = async () => {
    if (!rawEmail) {
      toast.error("Email address missing. Please sign up again.");
      navigate({ to: "/auth", search: { mode: "signup" } as never });
      return;
    }
    if (cooldown > 0) return;

    setResending(true);
    try {
      const { error } = await authService.resendVerificationEmail(
        rawEmail,
        window.location.origin
      );
      if (error) throw error;
      toast.success("Verification link sent! Check your inbox.");
      setCooldown(60);
      const timer = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (err) {
      console.error("[auth resend verification error]", err);
      toast.error("Failed to resend email. Please try again later.");
    } finally {
      setResending(false);
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

        <div className="mt-12 flex flex-col items-center text-center">
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-primary/10 text-primary ring-1 ring-primary/25 shadow-lg">
            <Mail className="h-8 w-8" />
          </div>

          <h1 className="mt-6 text-3xl font-black tracking-tight">Check your email</h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            We sent a verification link to{" "}
            <span className="font-semibold text-foreground">{masked}</span>.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Click the link in the email to activate your Ghostline account.
          </p>
        </div>

        <div className="mt-10 grid gap-3">
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground transition active:scale-[0.98] disabled:opacity-60"
          >
            {resending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {cooldown > 0 ? `Resend email (${cooldown}s)` : "Resend verification email"}
          </button>

          <Link
            to="/auth"
            search={{ mode: "signin" } as never}
            className="flex h-12 items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold text-foreground transition active:scale-[0.98] hover:bg-surface-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>

          <Link
            to="/auth"
            search={{ mode: "signup" } as never}
            className="mt-2 text-center text-xs text-muted-foreground hover:text-foreground transition"
          >
            Used the wrong email? <span className="underline">Change email</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
