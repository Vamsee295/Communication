import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { listDevices, revokeDevice } from "@/lib/devices.functions";
import { getDeviceKey } from "@/lib/device-key";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/devices")({
  component: DevicesPage,
});

function DevicesPage() {
  const fetchDevices = useServerFn(listDevices);
  const doRevoke = useServerFn(revokeDevice);
  const qc = useQueryClient();
  const [thisKey, setThisKey] = useState("");

  useEffect(() => { setThisKey(getDeviceKey()); }, []);

  const devices = useQuery({ queryKey: ["devices"], queryFn: () => fetchDevices() });

  const revoke = useMutation({
    mutationFn: (device_id: string) => doRevoke({ data: { device_id } }),
    onMutate: async (device_id) => {
      await qc.cancelQueries({ queryKey: ["devices"] });
      const previous = qc.getQueryData<any[]>(["devices"]);
      if (previous) {
        qc.setQueryData(
          ["devices"],
          previous.map((d) => (d.id === device_id ? { ...d, revoked_at: new Date().toISOString() } : d)),
        );
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        qc.setQueryData(["devices"], context.previous);
      }
      toast.error("Failed to sign out device");
    },
    onSuccess: () => {
      toast.success("Signed out that device");
      qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md px-5 pt-12">
        <header className="flex items-center gap-3">
          <Link
            to="/profile"
            className="grid h-10 w-10 place-items-center rounded-full border border-border"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-black">Devices</h1>
        </header>

        <p className="mt-3 text-sm text-muted-foreground">
          Every device that has signed in. Sign out anywhere you don't recognise.
        </p>

        <ul className="mt-6 grid gap-2">
          {(devices.data ?? []).map((d) => {
            const isThis = d.device_key === thisKey;
            const revoked = !!d.revoked_at;
            return (
              <li key={d.id} className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/20 text-primary">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {d.device_name} {isThis && <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">This device</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.platform} · last seen {new Date(d.last_seen_at).toLocaleString()}
                  </p>
                </div>
                {!isThis && !revoked && (
                  <button
                    onClick={() => revoke.mutate(d.id)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-destructive"
                  >
                    Sign out
                  </button>
                )}
                {revoked && <span className="text-xs text-muted-foreground">Revoked</span>}
              </li>
            );
          })}
          {devices.data?.length === 0 && (
            <li className="glass rounded-2xl px-4 py-8 text-center text-sm text-muted-foreground">
              No devices yet.
            </li>
          )}
        </ul>
      </div>
    </AppShell>
  );
}
