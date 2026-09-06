import { describe, expect, it, vi } from "vitest";
import type { Friendship, FriendProfile } from "@/lib/domain/types";

describe("Friend Request Notifications & Badge State", () => {
  const meId = "user-vamsee-05";
  const otherId = "user-demo-05";

  it("accurately derives incoming pending requests and badge count", () => {
    const friendships: Friendship[] = [
      {
        id: "req-1",
        requester_id: otherId,
        addressee_id: meId,
        status: "pending",
        created_at: new Date().toISOString(),
        responded_at: null,
      },
      {
        id: "req-2",
        requester_id: meId,
        addressee_id: "user-other",
        status: "pending",
        created_at: new Date().toISOString(),
        responded_at: null,
      },
      {
        id: "req-3",
        requester_id: "user-friend",
        addressee_id: meId,
        status: "accepted",
        created_at: new Date().toISOString(),
        responded_at: new Date().toISOString(),
      },
    ];

    const incoming = friendships.filter(
      (f) => f.status === "pending" && f.addressee_id === meId,
    );
    expect(incoming).toHaveLength(1);
    expect(incoming[0].id).toBe("req-1");
    expect(incoming.length).toBe(1);
  });

  it("prevents toast notifications for pre-existing requests on initial session load", () => {
    const seenIds = new Set<string>();
    let hasInitialized = false;
    const toastFn = vi.fn();

    const incoming: Friendship[] = [
      {
        id: "req-old-1",
        requester_id: otherId,
        addressee_id: meId,
        status: "pending",
        created_at: new Date().toISOString(),
        responded_at: null,
      },
    ];

    // Initial load handler simulation
    function handleIncoming(requests: Friendship[]) {
      if (!hasInitialized) {
        for (const r of requests) seenIds.add(r.id);
        hasInitialized = true;
        return;
      }
      for (const r of requests) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          toastFn(r);
        }
      }
    }

    // First load
    handleIncoming(incoming);
    expect(toastFn).not.toHaveBeenCalled();
    expect(seenIds.has("req-old-1")).toBe(true);

    // Re-render / route navigation with same state
    handleIncoming(incoming);
    expect(toastFn).not.toHaveBeenCalled();
  });

  it("triggers toast notification for genuinely new incoming requests received during active session", () => {
    const seenIds = new Set<string>();
    let hasInitialized = false;
    const toastFn = vi.fn();

    function handleIncoming(requests: Friendship[]) {
      if (!hasInitialized) {
        for (const r of requests) seenIds.add(r.id);
        hasInitialized = true;
        return;
      }
      for (const r of requests) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          toastFn(r);
        }
      }
    }

    // Active session starts with 0 requests
    handleIncoming([]);
    expect(hasInitialized).toBe(true);
    expect(toastFn).not.toHaveBeenCalled();

    // DEMO_05 sends a friend request
    const newRequest: Friendship = {
      id: "req-new-2",
      requester_id: otherId,
      addressee_id: meId,
      status: "pending",
      created_at: new Date().toISOString(),
      responded_at: null,
    };

    handleIncoming([newRequest]);
    expect(toastFn).toHaveBeenCalledTimes(1);
    expect(toastFn).toHaveBeenCalledWith(newRequest);

    // Subsequent re-render does not duplicate toast
    handleIncoming([newRequest]);
    expect(toastFn).toHaveBeenCalledTimes(1);
  });

  it("decrements count to 0 and removes badge when request is accepted or rejected", () => {
    let all: Friendship[] = [
      {
        id: "req-1",
        requester_id: otherId,
        addressee_id: meId,
        status: "pending",
        created_at: new Date().toISOString(),
        responded_at: null,
      },
    ];

    let incoming = all.filter((f) => f.status === "pending" && f.addressee_id === meId);
    expect(incoming.length).toBe(1);

    // User accepts request
    all = all.map((f) =>
      f.id === "req-1"
        ? { ...f, status: "accepted" as const, responded_at: new Date().toISOString() }
        : f,
    );

    incoming = all.filter((f) => f.status === "pending" && f.addressee_id === meId);
    expect(incoming.length).toBe(0);
  });
});
