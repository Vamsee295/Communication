import { createFileRoute } from "@tanstack/react-router";
import { Camera } from "lucide-react";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/camera")({
  component: CameraPage,
});

function CameraPage() {
  return (
    <AppShell>
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-primary/15 text-primary">
          <Camera className="h-10 w-10" />
        </div>
        <h1 className="text-2xl font-black">Camera</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          Snap, encrypt, send. The camera-first experience unlocks in Phase 4 with
          encrypted media uploads.
        </p>
      </div>
    </AppShell>
  );
}
