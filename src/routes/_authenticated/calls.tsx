import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Video,
  Search,
  X,
  Trash2,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  listCalls,
  deleteCallFromHistory,
  deleteCallsFromHistory,
  clearCallHistory,
  type CallHistoryItem,
} from "@/lib/calls.functions";
import { listConversations } from "@/lib/chat.functions";
import { useCalls } from "@/components/calls/call-provider";
import { formatDuration } from "@/lib/webrtc-config";

export const Route = createFileRoute("/_authenticated/calls")({
  head: () => ({
    meta: [
      { title: "Calls · Ghostline" },
      {
        name: "description",
        content: "Your private voice and video call history on Ghostline — encrypted, peer-to-peer, never recorded.",
      },
      { property: "og:title", content: "Calls · Ghostline" },
      { property: "og:description", content: "Private peer-to-peer voice and video calls." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CallsPage,
});

function label(c: CallHistoryItem) {
  if (c.status === "missed" || c.status === "declined") return "Missed";
  return c.direction === "incoming" ? "Incoming" : "Outgoing";
}

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const yesterday = new Date(today.getTime() - 86400000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Today, ${time}`;
  if (yesterday) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

interface ConfirmModalState {
  type: "single" | "bulk" | "clear";
  title: string;
  message: string;
  action: string;
  callId?: string;
  callIds?: string[];
}

function CallsPage() {
  const fetchCalls = useServerFn(listCalls);
  const fetchConversations = useServerFn(listConversations);
  const doDelete = useServerFn(deleteCallFromHistory);
  const doDeleteMany = useServerFn(deleteCallsFromHistory);
  const doClearHistory = useServerFn(clearCallHistory);

  const { startCall } = useCalls();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Long-press and drag refs
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPointerRef = useRef<{ x: number; y: number } | null>(null);
  const isDragActiveRef = useRef(false);

  const calls = useQuery({
    queryKey: ["calls"],
    queryFn: () => fetchCalls(),
    refetchInterval: 20000,
  });
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => fetchConversations(),
  });

  const allCalls = useMemo(() => calls.data ?? [], [calls.data]);

  // Exit selection mode if list becomes empty
  useEffect(() => {
    if (allCalls.length === 0 && isSelectionMode) {
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    }
  }, [allCalls.length, isSelectionMode]);

  // Escape key handler
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

  // Single Delete Mutation
  const deleteSingle = useMutation({
    mutationFn: (callId: string) => doDelete({ data: { call_id: callId } }),
    onMutate: async (callId) => {
      await qc.cancelQueries({ queryKey: ["calls"] });
      const previous = qc.getQueryData<CallHistoryItem[]>(["calls"]);
      if (previous) {
        qc.setQueryData(
          ["calls"],
          previous.filter((c) => c.id !== callId)
        );
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        qc.setQueryData(["calls"], context.previous);
      }
      toast.error("Could not delete call");
    },
    onSuccess: (_data, callId) => {
      toast.success("Call removed from history");
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(callId);
        return next;
      });
      qc.invalidateQueries({ queryKey: ["calls"] });
    },
    onSettled: () => setConfirmModal(null),
  });

  // Bulk Delete Mutation
  const deleteBulk = useMutation({
    mutationFn: (callIds: string[]) => doDeleteMany({ data: { call_ids: callIds } }),
    onMutate: async (callIds) => {
      await qc.cancelQueries({ queryKey: ["calls"] });
      const previous = qc.getQueryData<CallHistoryItem[]>(["calls"]);
      const idSet = new Set(callIds);
      if (previous) {
        qc.setQueryData(
          ["calls"],
          previous.filter((c) => !idSet.has(c.id))
        );
      }
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        qc.setQueryData(["calls"], context.previous);
      }
      toast.error("Could not delete selected calls");
    },
    onSuccess: (_res, callIds) => {
      toast.success(`Removed ${callIds.length} call${callIds.length === 1 ? "" : "s"} from history`);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      qc.invalidateQueries({ queryKey: ["calls"] });
    },
    onSettled: () => setConfirmModal(null),
  });

  // Clear History Mutation
  const clearHistory = useMutation({
    mutationFn: () => doClearHistory(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["calls"] });
      const previous = qc.getQueryData<CallHistoryItem[]>(["calls"]);
      if (previous) {
        qc.setQueryData(["calls"], []);
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(["calls"], context.previous);
      }
      toast.error("Could not clear call history");
    },
    onSuccess: () => {
      toast.success("All call history cleared");
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      qc.invalidateQueries({ queryKey: ["calls"] });
    },
    onSettled: () => setConfirmModal(null),
  });

  const convByPeer = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of conversations.data ?? []) if (c.other?.id) map.set(c.other.id, c.id);
    return map;
  }, [conversations.data]);

  const items = useMemo(() => {
    const list = allCalls;
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) =>
      `${c.peer?.display_name ?? ""} ${c.peer?.username ?? ""}`.toLowerCase().includes(needle)
    );
  }, [allCalls, q]);

  const ring = (c: CallHistoryItem, type: "voice" | "video") => {
    const peerId = c.peer?.id;
    const conversationId = peerId ? convByPeer.get(peerId) ?? c.conversation_id : c.conversation_id;
    if (!peerId) return;
    void startCall({ conversationId, peerId, peer: c.peer, type });
  };

  const toggleSelect = useCallback((id: string) => {
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
  }, []);

  const selectAllCalls = useCallback(() => {
    setSelectedIds(new Set(items.map((c) => c.id)));
    setIsSelectionMode(true);
  }, [items]);

  const cancelSelection = useCallback(() => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  }, []);

  // Pointer events for long press & drag selection
  const handlePointerDownRow = (e: React.PointerEvent<HTMLLIElement>, c: CallHistoryItem) => {
    startPointerRef.current = { x: e.clientX, y: e.clientY };

    longPressTimerRef.current = setTimeout(() => {
      try {
        if ("vibrate" in navigator) {
          navigator.vibrate?.(40);
        }
      } catch {}

      setIsSelectionMode(true);
      setIsDragging(true);
      isDragActiveRef.current = true;
      setSelectedIds((prev) => new Set(prev).add(c.id));
    }, 480);
  };

  const handlePointerMoveContainer = (e: React.PointerEvent) => {
    if (!startPointerRef.current) return;

    const dx = Math.abs(e.clientX - startPointerRef.current.x);
    const dy = Math.abs(e.clientY - startPointerRef.current.y);

    if (!isDragActiveRef.current && (dx > 10 || dy > 10)) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      return;
    }

    if (isDragActiveRef.current && isSelectionMode) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest("[data-call-id]") as HTMLElement | null;
      if (row) {
        const rowId = row.dataset.callId;
        if (rowId) {
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
    isDragActiveRef.current = false;
    setIsDragging(false);
  };

  const handleRowClick = (c: CallHistoryItem) => {
    if (isSelectionMode) {
      toggleSelect(c.id);
    }
  };

  const handleConfirmAction = () => {
    if (!confirmModal) return;
    if (confirmModal.type === "single" && confirmModal.callId) {
      deleteSingle.mutate(confirmModal.callId);
    } else if (confirmModal.type === "bulk" && confirmModal.callIds) {
      deleteBulk.mutate(confirmModal.callIds);
    } else if (confirmModal.type === "clear") {
      clearHistory.mutate();
    }
  };

  return (
    <AppShell>
      <div
        className={`mx-auto w-full max-w-2xl px-5 pb-20 pt-8 lg:pt-10 ${
          isDragging ? "select-none touch-none" : ""
        }`}
        onPointerMove={handlePointerMoveContainer}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Header / Selection Toolbar */}
        {!isSelectionMode ? (
          <header>
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-[28px] font-extrabold tracking-tight text-foreground">Calls</h1>
              {allCalls.length > 0 && (
                <button
                  onClick={() =>
                    setConfirmModal({
                      type: "clear",
                      title: "Clear call history?",
                      message:
                        "This will permanently remove all call records from your history.",
                      action: "Clear",
                    })
                  }
                  title="Clear all call history"
                  aria-label="Clear all call history"
                  className="press flex items-center gap-1.5 rounded-full border border-border/80 bg-surface-1 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive shadow-xs"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Clear History</span>
                </button>
              )}
            </div>

            <div className="focus-glow mt-4 flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/60 px-3.5 py-2.5 shadow-xs">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search calls"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  aria-label="Clear"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </header>
        ) : (
          /* Selection Mode Sticky Toolbar */
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
                onClick={selectAllCalls}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-primary hover:underline"
              >
                Select all
              </button>
              <button
                onClick={() => {
                  if (selectedIds.size === 0) return;
                  setConfirmModal({
                    type: "bulk",
                    title: selectedIds.size === 1 ? "Remove call?" : "Remove calls?",
                    message:
                      selectedIds.size === 1
                        ? "This call will be permanently removed from your call history."
                        : `These ${selectedIds.size} calls will be permanently removed from your call history.`,
                    action: "Delete",
                    callIds: Array.from(selectedIds),
                  });
                }}
                disabled={selectedIds.size === 0 || deleteBulk.isPending}
                className="press flex items-center gap-1.5 rounded-xl bg-destructive px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-destructive/90 disabled:opacity-50"
                aria-label="Delete selected calls"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </header>
        )}

        {/* Call Items List / Empty State */}
        {items.length === 0 ? (
          <div className="panel mt-8 flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-xs">
              <Phone className="h-6 w-6" />
            </div>
            <h2 className="text-base font-bold text-foreground">
              {q ? "No matching calls" : "No calls yet"}
            </h2>
            <p className="max-w-xs text-sm text-muted-foreground">
              {q
                ? "Try searching for another contact name or clear the search filter."
                : "Start a voice or video call from any conversation. Calls are peer-to-peer and never recorded."}
            </p>
            {!q && (
              <Link
                to="/chats"
                className="press mt-2 inline-flex h-10 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-xs"
              >
                Open chats
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                Recent Calls ({items.length})
              </span>
              <span className="text-[11px] text-muted-foreground/70 hidden sm:inline">
                Long press or drag to multi-select
              </span>
            </div>

            <ul className="grid gap-1.5">
              {items.map((c) => {
                const name = c.peer?.display_name ?? c.peer?.username ?? "Ghost";
                const missed = c.status === "missed" || c.status === "declined";
                const Icon = missed
                  ? PhoneMissed
                  : c.direction === "incoming"
                    ? PhoneIncoming
                    : PhoneOutgoing;
                const isSelected = selectedIds.has(c.id);

                return (
                  <li
                    key={c.id}
                    data-call-id={c.id}
                    onPointerDown={(e) => handlePointerDownRow(e, c)}
                    onClick={() => handleRowClick(c)}
                    role={isSelectionMode ? "checkbox" : undefined}
                    aria-checked={isSelectionMode ? isSelected : undefined}
                    aria-selected={isSelected}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        if (isSelectionMode) {
                          e.preventDefault();
                          toggleSelect(c.id);
                        }
                      } else if (e.key === "Delete" || e.key === "Backspace") {
                        setConfirmModal({
                          type: "single",
                          title: "Remove from history?",
                          message: "This call will be permanently removed from your call history.",
                          action: "Delete",
                          callId: c.id,
                        });
                      }
                    }}
                    className={[
                      "glass group relative flex items-center gap-3.5 rounded-2xl px-3.5 py-3 transition cursor-pointer select-none border",
                      isSelected
                        ? "bg-primary/12 border-primary/40 shadow-sm ring-1 ring-primary/30"
                        : "border-border/50 hover:bg-surface-2",
                    ].join(" ")}
                  >
                    {/* Selection Indicator / Avatar */}
                    <div
                      className={[
                        "grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold transition shadow-xs",
                        isSelected
                          ? "bg-primary text-white scale-105"
                          : isSelectionMode
                            ? "bg-muted/40 text-muted-foreground ring-1 ring-border"
                            : missed
                              ? "bg-destructive/10 text-destructive ring-1 ring-destructive/20"
                              : "bg-primary/10 text-primary ring-1 ring-primary/20",
                      ].join(" ")}
                    >
                      {isSelectionMode ? (
                        isSelected ? (
                          <CheckCircle2 className="h-5 w-5 fill-primary text-white" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground/50" />
                        )
                      ) : (
                        name.charAt(0).toUpperCase()
                      )}
                    </div>

                    {/* Peer info & call metadata */}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-[15px] font-semibold ${
                          missed ? "text-destructive" : "text-foreground"
                        }`}
                      >
                        {name}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
                        <Icon
                          className={`h-3.5 w-3.5 shrink-0 ${
                            missed ? "text-destructive" : "text-muted-foreground"
                          }`}
                        />
                        <span>{label(c)}</span>
                        <span>·</span>
                        <span>{when(c.created_at)}</span>
                        {c.status === "ended" && !!c.duration_seconds && c.duration_seconds > 0 && (
                          <>
                            <span>·</span>
                            <span className="tabular-nums font-medium">
                              {formatDuration(c.duration_seconds)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>

                    {/* Actions in normal mode */}
                    {!isSelectionMode && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            ring(c, "voice");
                          }}
                          className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
                          aria-label={`Voice call ${name}`}
                          title="Voice call"
                        >
                          <Phone className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            ring(c, "video");
                          }}
                          className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
                          aria-label={`Video call ${name}`}
                          title="Video call"
                        >
                          <Video className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmModal({
                              type: "single",
                              title: "Remove from history?",
                              message:
                                "This call will be permanently removed from your call history.",
                              action: "Delete",
                              callId: c.id,
                            });
                          }}
                          className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground/60 transition hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive"
                          aria-label="Delete call"
                          title="Delete call"
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
      </div>

      {/* Confirmation Dialog */}
      {confirmModal && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl p-6 bg-card border border-border shadow-2xl animate-scale-in">
            <h2 className="text-[15px] font-bold text-foreground">{confirmModal.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {confirmModal.message}
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                onClick={() => setConfirmModal(null)}
                disabled={
                  deleteSingle.isPending ||
                  deleteBulk.isPending ||
                  clearHistory.isPending
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
                  clearHistory.isPending
                }
                className="h-10 rounded-xl bg-destructive px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleteSingle.isPending ||
                deleteBulk.isPending ||
                clearHistory.isPending
                  ? "Deleting…"
                  : confirmModal.action}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
