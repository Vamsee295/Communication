import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Ghost, KeyRound, Eye, EyeOff, Loader2, ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { authService } from "@/lib/auth/session";
import { rotateDeviceKey } from "@/lib/device-key";
import { clearRevocationReason } from "@/lib/auth/session-revocation";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password · Ghostline" },
      {
        name: "description",
        content: "Create a new secure password for your Ghostline account.",
      },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [isVerifying, setIsVerifying] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;
    clearRevocationReason();

    // Check existing session on mount
    const checkSession = async () => {
      try {
        const { data: { session } } = await authService.getSession();
        if (!mounted) return;

        if (session) {
          setHasRecoverySession(true);
          setIsVerifying(false);
        } else {
          // If not immediately available, give Supabase hash parser a short window
          const timeout = setTimeout(() => {
            if (mounted && !hasRecoverySession) {
              setIsVerifying(false);
            }
          }, 1500);

          return () => clearTimeout(timeout);
        }
      } catch (err) {
        if (mounted) {
          setIsVerifying(false);
        }
      }
    };

    // Listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = authService.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setHasRecoverySession(true);
        setIsVerifying(false);
      }
    });

    checkSession();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setUpdating(true);
    try {
      const { error } = await authService.updateUserPassword(password);
      if (error) {
        toast.error(error.message || "Failed to update password. Please try again.");
        return;
      }

      // Success flow
      setSuccess(true);
      toast.success("Password updated successfully!");

      // Rotate local device key for clean future authentication
      rotateDeviceKey();

      // Sign out recovery session so the user signs in fresh with the new password
      await authService.signOut().catch(() => {});
    } catch (err) {
      console.error("[reset-password update error]", err);
      toast.error("An unexpected error occurred. Please request a new reset link.");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-[#F7FAFE] text-[#0B1B33] flex flex-col justify-between overflow-x-hidden selection:bg-primary/20">
      {/* Background Blobs */}
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
          
          {isVerifying ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm font-semibold text-[#64748B]">Verifying recovery link...</p>
            </div>
          ) : success ? (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF4FF] text-primary">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>

              <h2 className="text-2xl font-bold tracking-tight text-[#0B1B33]">
                Password updated
              </h2>

              <p className="mt-3 text-sm text-[#64748B] leading-relaxed">
                Your password has been changed successfully. You can now sign in with your new password.
              </p>

              <div className="mt-8">
                <Link
                  to="/auth"
                  search={{ mode: "signin" } as never}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-bold text-white shadow-sm transition active:scale-[0.98] hover:bg-primary/90"
                >
                  Sign In with new password
                </Link>
              </div>
            </div>
          ) : !hasRecoverySession ? (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/60">
                <AlertTriangle className="h-8 w-8" />
              </div>

              <h2 className="text-2xl font-bold tracking-tight text-[#0B1B33]">
                Invalid or expired link
              </h2>

              <p className="mt-3 text-sm text-[#64748B] leading-relaxed">
                Your password reset link is invalid or has expired. Please request a new reset link.
              </p>

              <div className="mt-8 flex flex-col gap-3">
                <Link
                  to="/forgot-password"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-bold text-white shadow-sm transition active:scale-[0.98] hover:bg-primary/90"
                >
                  Request a new reset link
                </Link>

                <Link
                  to="/auth"
                  search={{ mode: "signin" } as never}
                  className="inline-flex items-center justify-center gap-2 text-xs font-semibold text-[#64748B] hover:text-primary transition-colors py-2"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Header Icon */}
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF4FF] text-primary">
                <KeyRound className="h-7 w-7" />
              </div>

              <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-[#0B1B33]">
                Create a new password
              </h1>
              <p className="mt-2.5 text-sm text-[#64748B] leading-relaxed">
                Enter your new secure password below to regain access to your account.
              </p>

              <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
                {/* New Password */}
                <div className="relative flex items-center rounded-xl border border-[#DCE8F5] bg-[#F5FAFF] transition-all focus-within:border-primary focus-within:bg-white focus-within:ring-4 focus-within:ring-primary/10">
                  <input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="New password (min 8 chars)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-[52px] w-full rounded-xl bg-transparent px-4 text-[15px] text-[#0B1B33] outline-none placeholder:text-[#94A3B8]"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="pr-4 text-[#94A3B8] hover:text-[#64748B] transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                {/* Confirm New Password */}
                <div className="relative flex items-center rounded-xl border border-[#DCE8F5] bg-[#F5FAFF] transition-all focus-within:border-primary focus-within:bg-white focus-within:ring-4 focus-within:ring-primary/10">
                  <input
                    id="confirm-new-password"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-[52px] w-full rounded-xl bg-transparent px-4 text-[15px] text-[#0B1B33] outline-none placeholder:text-[#94A3B8]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="pr-4 text-[#94A3B8] hover:text-[#64748B] transition-colors"
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={updating}
                  className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-bold text-white shadow-sm transition active:scale-[0.98] hover:bg-primary/90 disabled:opacity-60"
                >
                  {updating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Updating password...
                    </>
                  ) : (
                    "Update password"
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
