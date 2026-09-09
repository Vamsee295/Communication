import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, LogOut, Save, Settings, ShieldBan, Smartphone, Star } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { getMyProfile, updateProfile } from "@/lib/profile.functions";
import { authService } from "@/lib/auth/session";
import { rotateDeviceKey } from "@/lib/device-key";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your profile · Ghostline" },
      {
        name: "description",
        content: "Edit your Ghostline display name, bio and username, and jump into privacy settings.",
      },
      { property: "og:title", content: "Your profile · Ghostline" },
      { property: "og:description", content: "Edit your Ghostline identity and privacy settings." },
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

  const profile = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (profile.data) {
      setDisplayName(profile.data.display_name ?? "");
      setBio(profile.data.bio ?? "");
    }
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () => saveProfile({ data: { display_name: displayName, bio } }),
    onSuccess: () => {
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const signOut = async () => {
    rotateDeviceKey();
    await qc.cancelQueries();
    qc.clear();
    await authService.signOut();
    toast.success("Signed out successfully.");
    navigate({ to: "/auth", replace: true });
  };

  const initial = (profile.data?.display_name ?? profile.data?.username ?? "?").charAt(0).toUpperCase();

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md px-5 pt-12">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-black">Profile</h1>
          <button
            onClick={signOut}
            className="grid h-10 w-10 place-items-center rounded-full border border-border text-muted-foreground hover:text-destructive"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <div className="mt-8 flex flex-col items-center">
          <div className="grid h-24 w-24 place-items-center rounded-full bg-primary text-primary-foreground text-3xl font-black glow-primary">
            {initial}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            @{profile.data?.username ?? "…"}
          </p>
        </div>

        <div className="mt-8 grid gap-3">
          <label className="text-xs uppercase tracking-widest text-muted-foreground">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
            className="h-12 rounded-2xl border border-input bg-card px-4 text-sm outline-none focus:border-primary"
          />
          <label className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={280}
            rows={3}
            placeholder="A haunting one-liner…"
            className="rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="mt-2 flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> Save
          </button>
        </div>

        <div className="mt-8 grid gap-2 pb-16">
          <Link to="/settings" className="panel flex items-center gap-3 rounded-2xl px-4 py-4">
            <Settings className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="font-semibold">Settings</p>
              <p className="text-xs text-muted-foreground">Privacy, notifications, appearance</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Link to="/starred" className="panel flex items-center gap-3 rounded-2xl px-4 py-4">
            <Star className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="font-semibold">Starred messages</p>
              <p className="text-xs text-muted-foreground">Your saved favorites</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Link to="/devices" className="panel flex items-center gap-3 rounded-2xl px-4 py-4">
            <Smartphone className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="font-semibold">Devices</p>
              <p className="text-xs text-muted-foreground">Manage where you're signed in</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Link to="/blocked" className="panel flex items-center gap-3 rounded-2xl px-4 py-4">
            <ShieldBan className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="font-semibold">Blocked contacts</p>
              <p className="text-xs text-muted-foreground">People who can't reach you</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
