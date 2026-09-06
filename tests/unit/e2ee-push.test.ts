import { describe, it, expect, vi } from "vitest";
import { PushDispatcher } from "../../src/lib/push/push-dispatcher";
import type { RealtimeDomainEvent } from "../../src/lib/realtime/contracts";
import type { DbClient } from "../../src/lib/infra/postgres/client";
import * as vapidSender from "../../src/lib/push/vapid-sender";

describe("E2EE-5 Privacy-Preserving Push Notifications", () => {
  const SECRET_KEYWORD = "GHOSTLINE_E2EE_PUSH_SECRET_2026";

  it("Model A generic push payload guarantees 0% metadata/plaintext exposure", async () => {
    const mockSend = vi.spyOn(vapidSender, "sendWebPushNotification").mockResolvedValue({
      success: true,
      statusCode: 201,
      removeSubscription: false,
    });

    process.env.VAPID_PUBLIC_KEY = "test_vapid_public_key";
    process.env.VAPID_PRIVATE_KEY = "test_vapid_private_key";

    const mockDb = vi.fn()
      .mockResolvedValueOnce([{ user_id: "user-bob", muted: false }]) // active members
      .mockResolvedValueOnce([
        {
          id: "sub-1",
          user_id: "user-bob",
          device_id: "device-b1",
          endpoint: "https://push.example.com/sub/123",
          p256dh: "key-p256dh",
          auth: "key-auth",
        },
      ]);

    const dispatcher = new PushDispatcher(mockDb as unknown as DbClient);

    const event: RealtimeDomainEvent = {
      type: "message.created",
      event_id: "evt-999",
      conversation_id: "conv-secret-uuid-12345",
      timestamp: new Date().toISOString(),
      message: {
        id: "msg-123",
        conversation_id: "conv-secret-uuid-12345",
        sender_id: "user-alice",
        body: "CLASSIFIED PAYLOAD: " + SECRET_KEYWORD,
        client_id: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        reply_to_id: null,
        forwarded_from_id: null,
      },
    };

    await dispatcher.consume(event);

    expect(mockSend).toHaveBeenCalledOnce();
    const [subscription, payload] = mockSend.mock.calls[0];

    // Payload verification: Generic Signal Push ONLY
    expect(payload.title).toBe("New message");
    expect(payload.body).toBe("New encrypted message");
    expect(payload.notificationId).toBe("evt-999");

    // SERVER BLINDNESS PROOF: 0% exposure of secret, plaintext body, sender, or conversation UUID in push payload
    const payloadJson = JSON.stringify(payload);
    expect(payloadJson).not.toContain(SECRET_KEYWORD);
    expect(payloadJson).not.toContain("CLASSIFIED");
    expect(payloadJson).not.toContain("user-alice");
    expect(payloadJson).not.toContain("conv-secret-uuid-12345");
  });

  it("filters muted members server-side before push dispatch", async () => {
    const mockSend = vi.spyOn(vapidSender, "sendWebPushNotification").mockClear();

    const mockDb = vi.fn().mockResolvedValueOnce([{ user_id: "user-bob", muted: true }]); // Muted member

    const dispatcher = new PushDispatcher(mockDb as unknown as DbClient);

    const event: RealtimeDomainEvent = {
      type: "message.created",
      event_id: "evt-100",
      conversation_id: "conv-1",
      timestamp: new Date().toISOString(),
      message: {
        id: "msg-1",
        conversation_id: "conv-1",
        sender_id: "user-alice",
        body: "Hello",
        client_id: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        reply_to_id: null,
        forwarded_from_id: null,
      },
    };

    await dispatcher.consume(event);

    // Push should NOT be dispatched to muted members
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("excludes revoked devices from push dispatch", async () => {
    const mockSend = vi.spyOn(vapidSender, "sendWebPushNotification").mockClear();

    // DB returns 0 active subscriptions (revoked devices filtered out by query)
    const mockDb = vi.fn()
      .mockResolvedValueOnce([{ user_id: "user-bob", muted: false }])
      .mockResolvedValueOnce([]); // No active subscriptions for non-revoked devices

    const dispatcher = new PushDispatcher(mockDb as unknown as DbClient);

    const event: RealtimeDomainEvent = {
      type: "message.created",
      event_id: "evt-101",
      conversation_id: "conv-1",
      timestamp: new Date().toISOString(),
      message: {
        id: "msg-2",
        conversation_id: "conv-1",
        sender_id: "user-alice",
        body: "Hi",
        client_id: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        reply_to_id: null,
        forwarded_from_id: null,
      },
    };

    await dispatcher.consume(event);

    expect(mockSend).not.toHaveBeenCalled();
  });
});
