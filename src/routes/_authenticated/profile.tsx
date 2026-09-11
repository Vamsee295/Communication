import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Loader2,
  LogOut,
  Save,
  Settings,
  ShieldBan,
  Smartphone,
  Star,
  User,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  getMyProfile,
  updateProfile,
  checkUsernameAvailability,
} from "@/lib/profile.functions";
import { authService } from "@/lib/auth/session";
import { rotateDeviceKey } from "@/lib/device-key";
import { clearMediaCache } from "@/lib/authenticated-media";
import { normalizeUsername, validateUsername } from "@/lib/username";
import type { UsernameAvailabilityResult } from "@/lib/repositories/ports";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your profile · Ghostline" },
      {
        name: "description",
        content:
          "Edit your Ghostline display name, bio, and unique @username, and jump into privacy settings.",
      },
      { property: "og:title", content: "Your profile · Ghostline" },
      {
        property: "og:description",
        content: "Edit your Ghostline identity and privacy settings.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const saveProfile = useServerFn(updateProfile);
  const checkAvailability = useServerFn(checkUsernameAvailability);

  const profile = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<UsernameAvailabilityResult | null>(null);

  const checkDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (profile.data) {
      setDisplayName(profile.data.display_name ?? "");
      setBio(profile.data.bio ?? "");
      const initialUsername = profile.data.username ?? "";
      setUsernameInput(initialUsername);
      if (initialUsername) {
        setAvailability({
          available: true,
          isCurrent: true,
          username: initialUsername.toLowerCase(),
        });
      }
    }
  }, [profile.data]);

  // Handle username input with debounce and smart availability checking
  const handleUsernameChange = (val: string) => {
    // Strip leading @ and normalize for checking
    const raw = val.replace(/^@+/, "");
    setUsernameInput(raw);

    if (checkDebounceRef.current) {
      clearTimeout(checkDebounceRef.current);
    }

    const normalized = normalizeUsername(raw);
    const currentCanonical = (profile.data?.username ?? "").toLowerCase();

    if (!normalized) {
      setChecking(false);
      setAvailability({
        available: false,
        username: "",
        reason: "invalid",
        error: "Enter a username",
      });
      return;
    }

    // If unchanged from current profile username
    if (normalized === currentCanonical) {
      setChecking(false);
      setAvailability({
        available: true,
        isCurrent: true,
        username: normalized,
      });
      return;
    }

    // Local syntax validation before sending network request
    const localValidation = validateUsername(normalized);
    if (!localValidation.valid) {
      setChecking(false);
      setAvailability({
        available: false,
        username: normalized,
        reason: localValidation.reason === "reserved" ? "reserved" : "invalid",
        error: localValidation.error,
      });
      return;
    }

    setChecking(true);
    setAvailability(null);

    checkDebounceRef.current = setTimeout(async () => {
      try {
        const res = await checkAvailability({ data: { username: normalized } });
        setAvailability(res);
      } catch (err: unknown) {
        setAvailability({
          available: false,
          username: normalized,
          reason: "invalid",
          error: err instanceof Error ? err.message : "Couldn't check availability",
        });
      } finally {
        setChecking(false);
      }
    }, 350);
  };

  const save = useMutation({
    mutationFn: async () => {
      const normalized = normalizeUsername(usernameInput);
      return saveProfile({
        data: {
          display_name: displayName.trim(),
          bio: bio.trim(),
          username: normalized || undefined,
        },
      });
    },
    onSuccess: (updated) => {
      toast.success("Profile saved");
      qc.setQueryData(["me"], updated);
      qc.invalidateQueries({ queryKey: ["me"] });
      if (updated.username) {
        setAvailability({
          available: true,
          isCurrent: true,
          username: updated.username.toLowerCase(),
        });
      }
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg);
      // If error is conflict/taken, update availability state to reflect taken
      if (msg.toLowerCase().includes("available") || msg.toLowerCase().includes("taken")) {
        setAvailability({
          available: false,
          username: normalizeUsername(usernameInput),
          reason: "taken",
          error: "Username is no longer available. Please choose another username.",
        });
      }
    },
  });

  const signOut = async () => {
    clearMediaCache();
    rotateDeviceKey();
    await qc.cancelQueries();
    qc.clear();
    await authService.signOut();
    toast.success("Signed out successfully.");
    navigate({ to: "/auth", replace: true });
  };

  const initial = (
    displayName ||
    profile.data?.display_name ||
    usernameInput ||
    profile.data?.username ||
    "?"
  )
    .charAt(0)
    .toUpperCase();

  const isSaveDisabled =
    save.isPending ||
    checking ||
    (availability !== null && !availability.available);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md px-5 pt-12 pb-24">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/chats"
              className="grid h-10 w-10 place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground transition"
              aria-label="Back to chats"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-3xl font-black tracking-tight">Profile</h1>
          </div>
          <button
            onClick={signOut}
            className="grid h-10 w-10 place-items-center rounded-full border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 transition"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        {/* Avatar and current @handle display */}
        <div className="mt-8 flex flex-col items-center">
          <div className="grid h-24 w-24 place-items-center rounded-full bg-primary text-primary-foreground text-3xl font-black shadow-md shadow-primary/20">
            {initial}
          </div>
          <p className="mt-3 text-sm font-semibold text-primary">
            @{profile.data?.username ?? "…"}
          </p>
        </div>

        {/* Profile Editing Form */}
        <div className="mt-8 grid gap-5">
          {/* Display Name */}
          <div className="grid gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Display Name
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              placeholder="Your name"
              className="h-12 rounded-2xl border border-input bg-card px-4 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition"
            />
          </div>

          {/* Username Field with Live Availability */}
          <div className="grid gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Username
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-4 select-none font-bold text-muted-foreground text-sm">
                @
              </span>
              <input
                value={usernameInput}
                onChange={(e) => handleUsernameChange(e.target.value)}
                maxLength={30}
                placeholder="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                className="h-12 w-full rounded-2xl border border-input bg-card pl-8 pr-10 text-sm font-medium lowercase outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition"
              />
              <div className="absolute right-3.5 flex items-center">
                {checking && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                {!checking && availability?.isCurrent && (
                  <Check className="h-4 w-4 text-primary" />
                )}
                {!checking && availability?.available && !availability.isCurrent && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                )}
                {!checking && availability && !availability.available && (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
              </div>
            </div>

            {/* Live Availability Status */}
            <div className="min-h-[20px] px-1">
              {checking && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  Checking availability…
                </p>
              )}

              {!checking && availability?.isCurrent && (
                <p className="flex items-center gap-1 text-xs text-primary font-medium">
                  <Check className="h-3 w-3" />
                  Current username
                </p>
              )}

              {!checking && availability?.available && !availability.isCurrent && (
                <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="h-3 w-3" />
                  @{availability.username} is available
                </p>
              )}

              {!checking && availability && !availability.available && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1 text-xs text-destructive font-medium">
                    <XCircle className="h-3 w-3 shrink-0" />
                    {availability.error ?? "Username is already taken"}
                  </p>

                  {/* Suggestion Chips */}
                  {availability.suggestions &&
                    availability.suggestions.length > 0 && (
                      <div className="pt-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                          Available suggestions
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {availability.suggestions.map((sug) => (
                            <button
                              key={sug}
                              type="button"
                              onClick={() => handleUsernameChange(sug)}
                              className="rounded-full border border-primary/25 bg-primary/5 hover:bg-primary/15 px-3 py-1 text-xs font-semibold text-primary transition active:scale-95"
                            >
                              @{sug}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>

          {/* Bio Field */}
          <div className="grid gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={280}
              rows={3}
              placeholder="A brief bio…"
              className="rounded-2xl border border-input bg-card px-4 py-3 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition resize-none"
            />
          </div>

          {/* Save Button */}
          <button
            onClick={() => save.mutate()}
            disabled={isSaveDisabled}
            className="mt-1 flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 transition hover:bg-primary/95 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.99]"
          >
            {save.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Save Changes
              </>
            )}
          </button>
        </div>

        {/* Quick Links Section */}
        <div className="mt-10 grid gap-2.5">
          <Link
            to="/settings"
            className="panel flex items-center gap-3 rounded-2xl px-4 py-3.5 transition hover:bg-muted/40"
          >
            <Settings className="h-5 w-5 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Settings</p>
              <p className="text-xs text-muted-foreground">
                Privacy, notifications, appearance
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Link
            to="/contacts"
            className="panel flex items-center gap-3 rounded-2xl px-4 py-3.5 transition hover:bg-muted/40"
          >
            <User className="h-5 w-5 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Find People</p>
              <p className="text-xs text-muted-foreground">
                Search by name or @username
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Link
            to="/starred"
            className="panel flex items-center gap-3 rounded-2xl px-4 py-3.5 transition hover:bg-muted/40"
          >
            <Star className="h-5 w-5 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Starred messages</p>
              <p className="text-xs text-muted-foreground">Your saved favorites</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Link
            to="/devices"
            className="panel flex items-center gap-3 rounded-2xl px-4 py-3.5 transition hover:bg-muted/40"
          >
            <Smartphone className="h-5 w-5 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Devices</p>
              <p className="text-xs text-muted-foreground">
                Manage where you're signed in
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Link
            to="/blocked"
            className="panel flex items-center gap-3 rounded-2xl px-4 py-3.5 transition hover:bg-muted/40"
          >
            <ShieldBan className="h-5 w-5 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Blocked contacts</p>
              <p className="text-xs text-muted-foreground">
                People who can't reach you
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
