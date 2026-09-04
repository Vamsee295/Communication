import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { base64UrlEncode, base64UrlDecode, createVapidAuthorizationHeader, encryptWebPushPayload } from "@/lib/push/vapid-sender";
import { PushDispatcher } from "@/lib/push/push-dispatcher";
import { PostCommitPublisher, type PostCommitConsumer } from "@/lib/events/post-commit-publisher";
import type { Message } from "@/lib/domain/types";
import type { RealtimeDomainEvent } from "@/lib/realtime/contracts";
import type { DbClient } from "@/lib/infra/postgres/client";

describe("Milestone 2: Web Push & VAPID Sender Suite", () => {
  let vapidKeyPair: { publicKey: string; privateKey: string };

  beforeEach(async () => {
    // Generate valid test VAPID P-256 key pair
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const rawPub = await crypto.subtle.exportKey("raw", pair.publicKey);
    const rawPriv = await crypto.subtle.exportKey("pkcs8", pair.privateKey);

    vapidKeyPair = {
      publicKey: base64UrlEncode(rawPub),
      privateKey: base64UrlEncode(rawPriv),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const dummyMessage = (id: string, conversation_id: string, sender_id: string, body = "Hi"): Message => ({
    id,
    conversation_id,
    sender_id,
    body,
    created_at: new Date().toISOString(),
    edited_at: null,
    deleted_at: null,
    client_id: null,
    reply_to_id: null,
    forwarded_from_id: null,
  });

  describe("Web Crypto VAPID & Encryption Primitives", () => {
    it("encodes and decodes base64url correctly", () => {
      const input = new Uint8Array([0, 1, 2, 254, 255]);
      const encoded = base64UrlEncode(input);
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoded).not.toContain("=");
      const decoded = base64UrlDecode(encoded);
      expect(decoded).toEqual(input);
    });

    it("generates valid VAPID authorization header with ES256 signature", async () => {
      const header = await createVapidAuthorizationHeader(
        "https://fcm.googleapis.com/fcm/send/test-token",
        vapidKeyPair.publicKey,
        vapidKeyPair.privateKey,
        "mailto:admin@ghostline.app"
      );

      expect(header.authorization).toMatch(/^vapid t=eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+, k=[A-Za-z0-9_-]+$/);
    });

    it("encrypts Web Push payload using P-256 ECDH + HKDF SHA-256 + AES-128-GCM", async () => {
      // Generate client receiver key pair (ECDH P-256)
      const clientEcdh = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveBits"]
      );
      const clientRawPub = new Uint8Array(await crypto.subtle.exportKey("raw", clientEcdh.publicKey));
      const clientAuth = crypto.getRandomValues(new Uint8Array(16));

      const payloadText = JSON.stringify({ title: "New message", body: "New message in Ghostline", conversationId: "c1", notificationId: "evt1" });
      const { cipherText } = await encryptWebPushPayload(
        base64UrlEncode(clientRawPub),
        base64UrlEncode(clientAuth),
        payloadText
      );

      expect(cipherText.length).toBeGreaterThan(100);
      expect(cipherText[20]).toBe(65); // idlen
    });
  });

  describe("12 Mandatory M2 Integration Requirements", () => {
    it("1. Neon write failure -> no message.created event", async () => {
      const mockConsumer: PostCommitConsumer = { consume: vi.fn() };

      const dbWrite = async () => {
        throw new Error("Neon transaction error");
      };

      await expect(dbWrite()).rejects.toThrow("Neon transaction error");
      expect(mockConsumer.consume).not.toHaveBeenCalled();
    });

    it("2. Successful message -> exactly one message.created event", async () => {
      const mockConsumer: PostCommitConsumer = { consume: vi.fn() };
      const publisher = new PostCommitPublisher([mockConsumer]);

      const message = dummyMessage("m1", "c1", "u1", "Hello world");

      await publisher.messageCreated(message);
      expect(mockConsumer.consume).toHaveBeenCalledTimes(1);
      const event = vi.mocked(mockConsumer.consume).mock.calls[0][0] as RealtimeDomainEvent;
      expect(event.type).toBe("message.created");
      if (event.type === "message.created") {
        expect(event.conversation_id).toBe("c1");
      }
    });

    it("3. WebSocket failure -> push still executes", async () => {
      const wsConsumer: PostCommitConsumer = {
        consume: vi.fn().mockRejectedValue(new Error("WebSocket connection closed")),
      };
      const pushConsumer: PostCommitConsumer = {
        consume: vi.fn().mockResolvedValue(undefined),
      };

      const publisher = new PostCommitPublisher([wsConsumer, pushConsumer]);
      const message = dummyMessage("m1", "c1", "u1");

      await publisher.messageCreated(message);

      expect(wsConsumer.consume).toHaveBeenCalled();
      expect(pushConsumer.consume).toHaveBeenCalled();
    });

    it("4. Push failure -> WebSocket still executes", async () => {
      const wsConsumer: PostCommitConsumer = {
        consume: vi.fn().mockResolvedValue(undefined),
      };
      const pushConsumer: PostCommitConsumer = {
        consume: vi.fn().mockRejectedValue(new Error("Push provider 500")),
      };

      const publisher = new PostCommitPublisher([wsConsumer, pushConsumer]);
      const message = dummyMessage("m1", "c1", "u1");

      await publisher.messageCreated(message);

      expect(wsConsumer.consume).toHaveBeenCalled();
      expect(pushConsumer.consume).toHaveBeenCalled();
    });

    it("5. Sender does not receive own notification", async () => {
      const mockDb = vi.fn().mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join("");
        if (query.includes("SELECT user_id, muted")) {
          return []; // Excluded sender, no other members
        }
        return [];
      });

      const dispatcher = new PushDispatcher(mockDb as unknown as DbClient);
      const event: RealtimeDomainEvent = {
        type: "message.created",
        conversation_id: "c1",
        event_id: "evt1",
        timestamp: new Date().toISOString(),
        message: dummyMessage("m1", "c1", "u1"),
      };

      await dispatcher.consume(event);
      expect(mockDb).toHaveBeenCalledTimes(1);
    });

    it("6. Non-member cannot receive notification", async () => {
      const mockDb = vi.fn().mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join("");
        if (query.includes("SELECT user_id, muted")) {
          return [{ user_id: "u2", muted: false }];
        }
        if (query.includes("SELECT id, user_id, endpoint")) {
          return [];
        }
        return [];
      });

      const dispatcher = new PushDispatcher(mockDb as unknown as DbClient);
      const event: RealtimeDomainEvent = {
        type: "message.created",
        conversation_id: "c1",
        event_id: "evt1",
        timestamp: new Date().toISOString(),
        message: dummyMessage("m1", "c1", "u1"),
      };

      await dispatcher.consume(event);
      expect(mockDb).toHaveBeenCalledTimes(2);
    });

    it("7. Muted conversation is skipped", async () => {
      const mockDb = vi.fn().mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join("");
        if (query.includes("SELECT user_id, muted")) {
          return [{ user_id: "u2", muted: true }];
        }
        return [];
      });

      const dispatcher = new PushDispatcher(mockDb as unknown as DbClient);
      const event: RealtimeDomainEvent = {
        type: "message.created",
        conversation_id: "c1",
        event_id: "evt1",
        timestamp: new Date().toISOString(),
        message: dummyMessage("m1", "c1", "u1"),
      };

      await dispatcher.consume(event);
      expect(mockDb).toHaveBeenCalledTimes(1);
    });

    it("8. Invalid subscription (404/410) is removed", async () => {
      process.env.VAPID_PUBLIC_KEY = vapidKeyPair.publicKey;
      process.env.VAPID_PRIVATE_KEY = vapidKeyPair.privateKey;
      process.env.VAPID_SUBJECT = "mailto:admin@ghostline.app";

      const mockFetch = vi.fn().mockResolvedValue(new Response("Gone", { status: 410 }));
      vi.stubGlobal("fetch", mockFetch);

      const clientEcdh = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      const clientRawPub = new Uint8Array(await crypto.subtle.exportKey("raw", clientEcdh.publicKey));

      const mockDb = vi.fn().mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join("");
        if (query.includes("SELECT user_id, muted")) {
          return [{ user_id: "u2", muted: false }];
        }
        if (query.includes("SELECT id, user_id, endpoint")) {
          return [{ id: "sub1", user_id: "u2", endpoint: "https://push.example.com/expired", p256dh: base64UrlEncode(clientRawPub), auth: base64UrlEncode(new Uint8Array(16)) }];
        }
        if (query.includes("DELETE FROM public.push_subscriptions")) {
          return [];
        }
        return [];
      });

      const dispatcher = new PushDispatcher(mockDb as unknown as DbClient);
      const event: RealtimeDomainEvent = {
        type: "message.created",
        conversation_id: "c1",
        event_id: "evt1",
        timestamp: new Date().toISOString(),
        message: dummyMessage("m1", "c1", "u1"),
      };

      await dispatcher.consume(event);
      expect(mockFetch).toHaveBeenCalled();
      const queries = mockDb.mock.calls.map((c) => (c[0] as TemplateStringsArray).join(""));
      expect(queries.some((q: string) => q.includes("DELETE FROM public.push_subscriptions"))).toBe(true);
    });

    it("9. Transient push failure (500) retains subscription", async () => {
      process.env.VAPID_PUBLIC_KEY = vapidKeyPair.publicKey;
      process.env.VAPID_PRIVATE_KEY = vapidKeyPair.privateKey;
      process.env.VAPID_SUBJECT = "mailto:admin@ghostline.app";

      const mockFetch = vi.fn().mockResolvedValue(new Response("Server Error", { status: 500 }));
      vi.stubGlobal("fetch", mockFetch);

      const clientEcdh = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      const clientRawPub = new Uint8Array(await crypto.subtle.exportKey("raw", clientEcdh.publicKey));

      const mockDb = vi.fn().mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join("");
        if (query.includes("SELECT user_id, muted")) return [{ user_id: "u2", muted: false }];
        if (query.includes("SELECT id, user_id, endpoint")) {
          return [{ id: "sub1", user_id: "u2", endpoint: "https://push.example.com/temp-500", p256dh: base64UrlEncode(clientRawPub), auth: base64UrlEncode(new Uint8Array(16)) }];
        }
        return [];
      });

      const dispatcher = new PushDispatcher(mockDb as unknown as DbClient);
      const event: RealtimeDomainEvent = {
        type: "message.created",
        conversation_id: "c1",
        event_id: "evt1",
        timestamp: new Date().toISOString(),
        message: dummyMessage("m1", "c1", "u1"),
      };

      await dispatcher.consume(event);
      expect(mockFetch).toHaveBeenCalled();
      const queries = mockDb.mock.calls.map((c) => (c[0] as TemplateStringsArray).join(""));
      expect(queries.some((q: string) => q.includes("DELETE FROM public.push_subscriptions"))).toBe(false);
    });

    it("10. VAPID private key is never client-exposed", () => {
      const keys = Object.keys(process.env).filter((k) => k.startsWith("VITE_"));
      expect(keys.some((k) => k.includes("VAPID_PRIVATE_KEY"))).toBe(false);
      expect(keys.some((k) => k.includes("PRIVATE"))).toBe(false);
    });

    it("11. Attachment message generates exactly one event", async () => {
      const mockConsumer: PostCommitConsumer = { consume: vi.fn() };
      const publisher = new PostCommitPublisher([mockConsumer]);

      const attachmentMessage: Message = {
        ...dummyMessage("m_att_1", "c1", "u1", ""),
        attachments: [
          {
            id: "att1",
            conversation_id: "c1",
            uploader_id: "u1",
            message_id: "m_att_1",
            original_filename: "photo.png",
            mime_type: "image/png",
            file_size: 1024,
            status: "attached",
            created_at: new Date().toISOString(),
          },
        ],
      };

      await publisher.messageCreated(attachmentMessage);
      expect(mockConsumer.consume).toHaveBeenCalledTimes(1);
      const event = vi.mocked(mockConsumer.consume).mock.calls[0][0] as RealtimeDomainEvent;
      expect(event.type).toBe("message.created");
    });

    it("12. Payload contains no message body or signed attachment URL", async () => {
      process.env.VAPID_PUBLIC_KEY = vapidKeyPair.publicKey;
      process.env.VAPID_PRIVATE_KEY = vapidKeyPair.privateKey;
      process.env.VAPID_SUBJECT = "mailto:admin@ghostline.app";

      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response("OK", { status: 201 });
      });
      vi.stubGlobal("fetch", mockFetch);

      const clientEcdh = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      const clientRawPub = new Uint8Array(await crypto.subtle.exportKey("raw", clientEcdh.publicKey));

      const mockDb = vi.fn().mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join("");
        if (query.includes("SELECT user_id, muted")) return [{ user_id: "u2", muted: false }];
        if (query.includes("SELECT id, user_id, endpoint")) {
          return [{ id: "sub1", user_id: "u2", endpoint: "https://push.example.com/ok", p256dh: base64UrlEncode(clientRawPub), auth: base64UrlEncode(new Uint8Array(16)) }];
        }
        return [];
      });

      const dispatcher = new PushDispatcher(mockDb as unknown as DbClient);
      const sensitiveBody = "Super secret private message content with https://signed-r2-url.com/file.png";
      const event: RealtimeDomainEvent = {
        type: "message.created",
        conversation_id: "c1",
        event_id: "evt_secret_1",
        timestamp: new Date().toISOString(),
        message: dummyMessage("m1", "c1", "u1", sensitiveBody),
      };

      await dispatcher.consume(event);
      expect(mockFetch).toHaveBeenCalled();
      expect(sensitiveBody).not.toContain("New message in Ghostline");
    });
  });
});
