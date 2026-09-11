import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Smartphone,
  Laptop,
  Tablet,
  Monitor,
  Trash2,
  CheckCircle2,
  Circle,
  X,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  listDevices,
  revokeDevice,
  deleteDevice,
  deleteDevices,
  clearRevokedDevices,
} from "@/lib/devices.functions";
import { getDeviceKey } from "@/lib/device-key";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { Device } from "@/lib/domain/types";

export const Route = createFileRoute("/_authenticated/devices")({
  component: DevicesPage,
});

function getDeviceIcon(platform: string, userAgent?: string | null) {
  const p = (platform || "").toLowerCase();
  const ua = (userAgent || "").toLowerCase();
  if (p.includes("mobile") || p.includes("ios") || p.includes("android") || ua.includes("iphone") || ua.includes("android")) {
    return <Smartphone className="h-5 w-5" />;
  }
  if (p.includes("tablet") || ua.includes("ipad")) {
    return <Tablet className="h-5 w-5" />;
  }
  if (p.includes("mac") || p.includes("laptop")) {
    return <Laptop className="h-5 w-5" />;
  }
  return <Monitor className="h-5 w-5" />;
}

interface ConfirmModalState {
  type: "single" | "bulk" | "clear";
  title: string;
  message: string;
  action: string;
  deviceId?: string;
  deviceIds?: string[];
}

function DevicesPage() {
  const fetchDevices = useServerFn(listDevices);
  const doRevoke = useServerFn(revokeDevice);
  const doDelete = useServerFn(deleteDevice);
  const doDeleteMany = useServerFn(deleteDevices);
  const doClearRevoked = useServerFn(clearRevokedDevices);

  const qc = useQueryClient();
  const [thisKey, setThisKey] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Long press and drag tracking refs
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPointerRef = useRef<{ x: number; y: number } | null>(null);
  const dragAnchorIdRef = useRef<string | null>(null);
  const isDragActiveRef = useRef(false);
  const containerRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    setThisKey(getDeviceKey());
  }, []);

  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: () => fetchDevices(),
  });

  const allDevices = useMemo(() => devicesQuery.data ?? [], [devicesQuery.data]);

  const { revokedDevices, activeDevices } = useMemo(() => {
    const revoked: Device[] = [];
    const active: Device[] = [];
    for (const d of allDevices) {
      if (d.revoked_at) {
        revoked.push(d);
      } else {
        active.push(d);
      }
    }
    return { revokedDevices: revoked, activeDevices: active };
  }, [allDevices]);

  const revokedIdSet = useMemo(
    () => new Set(revokedDevices.map((d) => d.id)),
    [revokedDevices]
  );

  // Exit selection mode if all revoked devices are gone
  useEffect(() => {
    if (revokedDevices.length === 0 && isSelectionMode) {
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    }
  }, [revokedDevices.length, isSelectionMode]);

  // Handle global escape key to cancel selection or close modal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmModal) {
          setConfirmModal(null);
        } else if (isSelectionMode || selectedIds.size > 0) {
          setIsSelectionMode(false);
          setSelectedIds(new Set());
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmModal, isSelectionMode, selectedIds.size]);

  // Revoke Mutation
  const revoke = useMutation({
    mutationFn: (device_id: string) => doRevoke({ data: { device_id } }),
    onMutate: async (device_id) => {
      await qc.cancelQueries({ queryKey: ["devices"] });
      const previous = qc.getQueryData<Device[]>(["devices"]);
      if (previous) {
        qc.setQueryData(
          ["devices"],
          previous.map((d) =>
            d.id === device_id ? { ...d, revoked_at: new Date().toISOString() } : d
          )
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

  // Single Delete Mutation
  const deleteSingle = useMutation({
    mutationFn: (device_id: string) => doDelete({ data: { device_id } }),
    onMutate: async (device_id) => {
      await qc.cancelQueries({ queryKey: ["devices"] });
      const previous = qc.getQueryData<Device[]>(["devices"]);
      if (previous) {
        qc.setQueryData(
          ["devices"],
          previous.filter((d) => d.id !== device_id)
        );
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        qc.setQueryData(["devices"], context.previous);
      }
      toast.error("Failed to delete device record");
    },
    onSuccess: (_data, device_id) => {
      toast.success("Device record removed");
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(device_id);
        return next;
      });
      qc.invalidateQueries({ queryKey: ["devices"] });
    },
    onSettled: () => {
      setConfirmModal(null);
    },
  });

  // Bulk Delete Mutation
  const deleteBulk = useMutation({
    mutationFn: (device_ids: string[]) => doDeleteMany({ data: { device_ids } }),
    onMutate: async (device_ids) => {
      await qc.cancelQueries({ queryKey: ["devices"] });
      const previous = qc.getQueryData<Device[]>(["devices"]);
      const idSet = new Set(device_ids);
      if (previous) {
        qc.setQueryData(
          ["devices"],
          previous.filter((d) => !idSet.has(d.id))
        );
      }
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        qc.setQueryData(["devices"], context.previous);
      }
      toast.error("Failed to delete selected devices");
    },
    onSuccess: (_res, device_ids) => {
      toast.success(`Removed ${device_ids.length} device record${device_ids.length === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      qc.invalidateQueries({ queryKey: ["devices"] });
    },
    onSettled: () => {
      setConfirmModal(null);
    },
  });

  // Clear Revoked Mutation
  const clearAllRevoked = useMutation({
    mutationFn: () => doClearRevoked(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["devices"] });
      const previous = qc.getQueryData<Device[]>(["devices"]);
      if (previous) {
        qc.setQueryData(
          ["devices"],
          previous.filter((d) => !d.revoked_at)
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(["devices"], context.previous);
      }
      toast.error("Failed to clear revoked devices");
    },
    onSuccess: () => {
      toast.success("All revoked device records cleared");
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      qc.invalidateQueries({ queryKey: ["devices"] });
    },
    onSettled: () => {
      setConfirmModal(null);
    },
  });

  // Toggle selection for a single device ID
  const toggleSelect = useCallback((id: string) => {
    if (!revokedIdSet.has(id)) return; // protect active devices
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (next.size === 0) {
        setIsSelectionMode(false);
      } else {
        setIsSelectionMode(true);
      }
      return next;
    });
  }, [revokedIdSet]);

  const selectAllRevoked = useCallback(() => {
    setSelectedIds(new Set(revokedDevices.map((d) => d.id)));
    setIsSelectionMode(true);
  }, [revokedDevices]);

  const cancelSelection = useCallback(() => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  }, []);

  // Pointer & Drag handlers
  const handlePointerDownRow = (e: React.PointerEvent<HTMLLIElement>, device: Device) => {
    if (!device.revoked_at) return; // ignore active devices

    startPointerRef.current = { x: e.clientX, y: e.clientY };
    dragAnchorIdRef.current = device.id;

    // Start long-press timer (500ms)
    longPressTimerRef.current = setTimeout(() => {
      try {
        if ("vibrate" in navigator) {
          navigator.vibrate?.(40);
        }
      } catch {}

      setIsSelectionMode(true);
      setIsDragging(true);
      isDragActiveRef.current = true;
      setSelectedIds((prev) => new Set(prev).add(device.id));
    }, 480);
  };

  const handlePointerMoveContainer = (e: React.PointerEvent) => {
    if (!startPointerRef.current) return;

    const dx = Math.abs(e.clientX - startPointerRef.current.x);
    const dy = Math.abs(e.clientY - startPointerRef.current.y);

    // Cancel long press timer if user starts scrolling / moving significantly before 480ms
    if (!isDragActiveRef.current && (dx > 10 || dy > 10)) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      return;
    }

    // If drag selection is active, detect crossed rows
    if (isDragActiveRef.current && isSelectionMode) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest("[data-device-id]") as HTMLElement | null;
      if (row) {
        const rowId = row.dataset.deviceId;
        const isRevoked = row.dataset.revoked === "true";
        if (rowId && isRevoked) {
          setSelectedIds((prev) => {
            if (!prev.has(rowId)) {
              return new Set(prev).add(rowId);
            }
            return prev;
          });
        }
      }
    }
  };

  const handlePointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    startPointerRef.current = null;
    dragAnchorIdRef.current = null;
    isDragActiveRef.current = false;
    setIsDragging(false);
  };

  // Row click handler
  const handleRowClick = (device: Device) => {
    if (!device.revoked_at) return;
    if (isSelectionMode) {
      toggleSelect(device.id);
    }
  };

  // Confirm action handler
  const handleConfirmAction = () => {
    if (!confirmModal) return;
    if (confirmModal.type === "single" && confirmModal.deviceId) {
      deleteSingle.mutate(confirmModal.deviceId);
    } else if (confirmModal.type === "bulk" && confirmModal.deviceIds) {
      deleteBulk.mutate(confirmModal.deviceIds);
    } else if (confirmModal.type === "clear") {
      clearAllRevoked.mutate();
    }
  };

  return (
    <AppShell>
      <div
        className={`mx-auto w-full max-w-md px-5 pt-12 pb-20 ${
          isDragging ? "select-none touch-none" : ""
        }`}
        onPointerMove={handlePointerMoveContainer}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Normal Header / Selection Mode Toolbar */}
        {!isSelectionMode ? (
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link
                to="/profile"
                className="grid h-10 w-10 place-items-center rounded-full border border-border transition hover:bg-surface-2"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-foreground">Devices</h1>
              </div>
            </div>

            {revokedDevices.length > 0 && (
              <button
                onClick={() =>
                  setConfirmModal({
                    type: "clear",
                    title: "Clear revoked devices?",
                    message:
                      "This will permanently remove all revoked device records from your account.",
                    action: "Clear",
                  })
                }
                title="Clear all revoked devices"
                aria-label="Clear all revoked devices"
                className="press flex items-center gap-1.5 rounded-full border border-border/80 bg-surface-1 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive shadow-xs"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear Revoked</span>
              </button>
            )}
          </header>
        ) : (
          /* Active Selection Mode Sticky Toolbar */
          <header className="glass sticky top-4 z-30 flex items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2.5 shadow-lg backdrop-blur-xl animate-scale-in">
            <div className="flex items-center gap-2.5">
              <button
                onClick={cancelSelection}
                className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-foreground/10"
                aria-label="Cancel selection"
              >
                <X className="h-4 w-4 text-foreground" />
              </button>
              <span className="text-sm font-bold text-foreground">
                {selectedIds.size} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={selectAllRevoked}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-primary hover:underline"
              >
                Select all
              </button>
              <button
                onClick={() => {
                  if (selectedIds.size === 0) return;
                  setConfirmModal({
                    type: "bulk",
                    title: selectedIds.size === 1 ? "Delete device?" : "Delete devices?",
                    message:
                      selectedIds.size === 1
                        ? "This will permanently remove this revoked device record."
                        : `This will permanently remove ${selectedIds.size} revoked device records.`,
                    action: "Delete",
                    deviceIds: Array.from(selectedIds),
                  });
                }}
                disabled={selectedIds.size === 0 || deleteBulk.isPending}
                className="press flex items-center gap-1.5 rounded-xl bg-destructive px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-destructive/90 disabled:opacity-50"
                aria-label="Delete selected devices"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </header>
        )}

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Every device that has signed in. Sign out anywhere you don't recognise.
        </p>

        {/* Section 1: Active Devices */}
        {activeDevices.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold tracking-wider text-muted-foreground uppercase">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Active Devices
            </h2>
            <ul className="grid gap-2">
              {activeDevices.map((d) => {
                const isThis = d.device_key === thisKey;
                return (
                  <li
                    key={d.id}
                    data-device-id={d.id}
                    data-revoked="false"
                    className="glass flex items-center gap-3.5 rounded-2xl border border-border/60 px-4 py-3.5 transition shadow-xs"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary shadow-xs ring-1 ring-primary/20">
                      {getDeviceIcon(d.platform, d.user_agent)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-bold text-sm text-foreground">
                        <span className="truncate">{d.device_name || "Unknown Device"}</span>
                        {isThis && (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-extrabold text-primary ring-1 ring-primary/30">
                            This device
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground mt-0.5">
                        {d.platform} · last active{" "}
                        {new Date(d.last_seen_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    {!isThis && (
                      <button
                        onClick={() => revoke.mutate(d.id)}
                        disabled={revoke.isPending}
                        className="press shrink-0 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive transition hover:bg-destructive hover:text-white"
                        aria-label={`Sign out ${d.device_name}`}
                      >
                        Sign out
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Section 2: Revoked Devices / Device Logs */}
        {revokedDevices.length > 0 && (
          <div className="mt-8">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                Revoked Devices ({revokedDevices.length})
              </h2>
              <span className="text-[11px] text-muted-foreground/70 hidden sm:inline">
                Long press or drag to multi-select
              </span>
            </div>

            <ul ref={containerRef} className="grid gap-2">
              {revokedDevices.map((d) => {
                const isSelected = selectedIds.has(d.id);
                return (
                  <li
                    key={d.id}
                    data-device-id={d.id}
                    data-revoked="true"
                    onPointerDown={(e) => handlePointerDownRow(e, d)}
                    onClick={() => handleRowClick(d)}
                    role={isSelectionMode ? "checkbox" : undefined}
                    aria-checked={isSelectionMode ? isSelected : undefined}
                    aria-selected={isSelected}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        if (isSelectionMode) {
                          e.preventDefault();
                          toggleSelect(d.id);
                        }
                      }
                    }}
                    className={[
                      "glass group flex items-center gap-3.5 rounded-2xl px-4 py-3.5 transition cursor-pointer select-none",
                      isSelected
                        ? "bg-primary/12 border border-primary/40 shadow-sm ring-1 ring-primary/30"
                        : "border border-border/50 hover:bg-surface-2",
                    ].join(" ")}
                  >
                    {/* Device Icon / Selection Indicator */}
                    <div
                      className={[
                        "grid h-10 w-10 shrink-0 place-items-center rounded-full transition shadow-xs",
                        isSelected
                          ? "bg-primary text-white scale-105"
                          : isSelectionMode
                            ? "bg-muted/40 text-muted-foreground ring-1 ring-border"
                            : "bg-muted/40 text-muted-foreground",
                      ].join(" ")}
                    >
                      {isSelectionMode ? (
                        isSelected ? (
                          <CheckCircle2 className="h-5 w-5 fill-primary text-white" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground/50" />
                        )
                      ) : (
                        getDeviceIcon(d.platform, d.user_agent)
                      )}
                    </div>

                    {/* Device Details */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-sm text-foreground/80">
                        {d.device_name || "Device"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground mt-0.5">
                        {d.platform} · revoked{" "}
                        {d.revoked_at
                          ? new Date(d.revoked_at).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : new Date(d.last_seen_at).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Action column */}
                    {!isSelectionMode && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground/70 bg-muted/40 px-2 py-0.5 rounded-md">
                          Revoked
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmModal({
                              type: "single",
                              title: "Delete device?",
                              message:
                                "This will permanently remove this revoked device record.",
                              action: "Delete",
                              deviceId: d.id,
                            });
                          }}
                          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground/60 transition hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive focus-visible:outline-none"
                          title="Delete device"
                          aria-label="Delete device"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Empty State */}
        {allDevices.length === 0 && (
          <div className="glass rounded-2xl px-6 py-12 text-center text-muted-foreground border border-border/50 mt-6">
            <Smartphone className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm font-semibold text-foreground">No devices yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Devices you sign into Ghostline with will appear here.
            </p>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      {confirmModal && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl p-6 bg-card border border-border shadow-2xl animate-scale-in">
            <h2 className="text-[15px] font-bold text-foreground">
              {confirmModal.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {confirmModal.message}
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                onClick={() => setConfirmModal(null)}
                disabled={
                  deleteSingle.isPending ||
                  deleteBulk.isPending ||
                  clearAllRevoked.isPending
                }
                className="h-10 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition hover:bg-surface-2 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={
                  deleteSingle.isPending ||
                  deleteBulk.isPending ||
                  clearAllRevoked.isPending
                }
                className="h-10 rounded-xl bg-destructive px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleteSingle.isPending ||
                deleteBulk.isPending ||
                clearAllRevoked.isPending
                  ? "Deleting..."
                  : confirmModal.action}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
