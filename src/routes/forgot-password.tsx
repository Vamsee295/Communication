import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Ghost, Mail, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { authService } from "@/lib/auth/session";
import { maskEmail } from "@/lib/auth/mask-email";
import { clearRevocationReason } from "@/lib/auth/session-revocation";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot Password · Ghostline" },
      {
        name: "description",
        content: "Reset your Ghostline password securely via email.",
      },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [lastSubmittedEmail, setLastSubmittedEmail] = useState("");

  useEffect(() => {
    // Isolate password recovery from any stale device logout state
    clearRevocationReason();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      clearRevocationReason();
      const redirectTo = `${window.location.origin}/reset-password`;
      await authService.resetPasswordForEmail(trimmedEmail, redirectTo);
      
      // Always show generic success for anti-enumeration protection
      setLastSubmittedEmail(trimmedEmail);
      setSubmitted(true);
      toast.success("Password reset link sent to your email.");
    } catch (err) {
      console.error("[forgot-password error]", err);
      // Protect email enumeration even on error
      setLastSubmittedEmail(trimmedEmail);
      setSubmitted(true);
      toast.success("Password reset link sent to your email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-[#F7FAFE] text-[#0B1B33] flex flex-col justify-between overflow-x-hidden selection:bg-primary/20">
      {/* Background Subtle Gradient Blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/2 -right-40 h-[400px] w-[400px] rounded-full bg-[#EAF4FF] blur-3xl opacity-70" />
      </div>

      {/* Top Navbar */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-white shadow-sm">
            <Ghost className="h-5 w-5" />
          </div>
          <span className="text-xl font-black tracking-tight text-[#0B1B33]">Ghostline</span>
        </Link>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-8">
        <div className="w-full max-w-[420px] rounded-3xl border border-[#DCE8F5] bg-white p-8 sm:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {!submitted ? (
            <>
              {/* Header Icon */}
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF4FF] text-primary">
                <Mail className="h-7 w-7" />
              </div>

              <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-[#0B1B33]">
                Forgot your password?
              </h1>
              <p className="mt-2.5 text-sm text-[#64748B] leading-relaxed">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
                <div className="relative">
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-[52px] w-full rounded-xl border border-[#DCE8F5] bg-[#F5FAFF] px-4 text-[15px] text-[#0B1B33] outline-none placeholder:text-[#94A3B8] transition-all focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                    required
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-bold text-white shadow-sm transition active:scale-[0.98] hover:bg-primary/90 disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending reset link...
                    </>
                  ) : (
                    "Send reset link"
                  )}
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-[#DCE8F5]/60 flex items-center justify-center">
                <Link
                  to="/auth"
                  search={{ mode: "signin" } as never}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#64748B] hover:text-primary transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Sign In
                </Link>
              </div>
            </>
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF4FF] text-primary">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>

              <h2 className="text-2xl font-bold tracking-tight text-[#0B1B33]">
                Password reset link sent
              </h2>

              <p className="mt-3 text-sm text-[#64748B] leading-relaxed">
                Check your email for a link to reset your password. If an account exists for{" "}
                <span className="font-semibold text-[#0B1B33]">{maskEmail(lastSubmittedEmail)}</span>,
                we have sent instructions to regain access.
              </p>

              <p className="mt-2 text-xs text-[#94A3B8] leading-relaxed">
                If you don't see it within a few minutes, please check your spam or junk folder.
              </p>

              <div className="mt-8 flex flex-col gap-3">
                <Link
                  to="/auth"
                  search={{ mode: "signin" } as never}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-bold text-white shadow-sm transition active:scale-[0.98] hover:bg-primary/90"
                >
                  Back to Sign In
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setEmail("");
                  }}
                  className="text-xs font-semibold text-[#64748B] hover:text-primary transition-colors py-2"
                >
                  Didn't receive email? Try again
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-[#94A3B8]">
        Ghostline &copy; {new Date().getFullYear()} · Encrypted & Private Communication
      </footer>
    </main>
  );
}
