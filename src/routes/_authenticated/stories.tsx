import { createFileRoute } from "@tanstack/react-router";
import { PlaySquare } from "lucide-react";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/stories")({
  component: StoriesPage,
});

function StoriesPage() {
  return (
    <AppShell>
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-accent/20 text-accent">
          <PlaySquare className="h-10 w-10" />
        </div>
        <h1 className="text-2xl font-black">Stories</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          24-hour disappearing stories arrive in a later phase, once media and
          encryption land.
        </p>
      </div>
    </AppShell>
  );
}
