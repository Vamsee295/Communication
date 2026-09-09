import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, KeyRound, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { authService } from "@/lib/auth/session";

export const Route = createFileRoute("/_authenticated/change-password")({
  head: () => ({
    meta: [
      { title: "Change Password · Ghostline" },
      {
        name: "description",
        content: "Update your Ghostline account password securely.",
      },
      { property: "og:title", content: "Change Password · Ghostline" },
      { property: "og:description", content: "Update your Ghostline account password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!currentPassword) {
      setErrorMsg("Please enter your current password.");
      toast.error("Please enter your current password.");
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      setErrorMsg("New password must be at least 8 characters.");
      toast.error("New password must be at least 8 characters.");
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMsg("New password must be different from your current password.");
      toast.error("New password must be different from your current password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("New passwords do not match.");
      toast.error("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await authService.changePassword(currentPassword, newPassword);

      if (error) {
        const message = error.message || "Failed to update password. Please try again.";
        setErrorMsg(message);
        toast.error(message);
        return;
      }

      // Clear password values from memory/state
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      toast.success("Password changed successfully.");
      navigate({ to: "/settings" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMsg(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md px-5 pb-16 pt-8 lg:pt-10">
        <header className="flex items-center gap-3">
          <Link
            to="/settings"
            className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-surface text-foreground transition hover:bg-surface-2 active:scale-95"
            aria-label="Back to settings"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight text-foreground">Change Password</h1>
          </div>
        </header>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Update your Ghostline account password. Your new password must be at least 8 characters long.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-foreground">Account Security</p>
              <p className="text-[12px] text-muted-foreground">Managed securely via Supabase Auth</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {errorMsg && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-xs font-medium text-destructive">
                {errorMsg}
              </div>
            )}

            {/* Current Password */}
            <div>
              <label
                htmlFor="current-password"
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Current Password
              </label>
              <div className="relative flex items-center rounded-xl border border-border bg-surface-2/40 transition-all focus-within:border-primary focus-within:bg-surface focus-within:ring-2 focus-within:ring-primary/10">
                <input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  className="h-11 w-full rounded-xl bg-transparent px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((v) => !v)}
                  className="pr-3.5 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label
                htmlFor="new-password"
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                New Password
              </label>
              <div className="relative flex items-center rounded-xl border border-border bg-surface-2/40 transition-all focus-within:border-primary focus-within:bg-surface focus-within:ring-2 focus-within:ring-primary/10">
                <input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  className="h-11 w-full rounded-xl bg-transparent px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="pr-3.5 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label
                htmlFor="confirm-password"
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Repeat New Password
              </label>
              <div className="relative flex items-center rounded-xl border border-border bg-surface-2/40 transition-all focus-within:border-primary focus-within:bg-surface focus-within:ring-2 focus-within:ring-primary/10">
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  className="h-11 w-full rounded-xl bg-transparent px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="pr-3.5 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="press mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Changing password...
                </>
              ) : (
                "Change Password"
              )}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
