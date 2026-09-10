import fs from "fs";
import { describe, it, expect, afterAll, beforeAll } from "vitest";

if (fs.existsSync(".env")) {
  const lines = fs.readFileSync(".env", "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [k, ...v] = trimmed.split("=");
      process.env[k.trim()] = v.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
}

import { getPostgresClient } from "@/lib/infra/postgres/client";
import { AttachmentService } from "@/lib/attachments";

import { handleAttachmentApiRequest } from "@/lib/attachments.api";

describe("Ghostline Neon Media Attachments Lifecycle", () => {
  const sql = getPostgresClient();
  let testConversationId: string;
  let testUserId: string;
  const createdMessageIds: string[] = [];

  it("should find an existing conversation and member for testing", async () => {
    const members = await sql`
      SELECT cm.conversation_id, cm.user_id
      FROM public.conversation_members cm
      LIMIT 1;
    `;
    expect(members.length).toBeGreaterThan(0);
    testConversationId = members[0].conversation_id;
    testUserId = members[0].user_id;
  });

  it("should execute START -> PUT BYTEA -> CONFIRM -> SEND -> ACCESS for image", async () => {
    const service = new AttachmentService(sql, testUserId);
    const fakeImageBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

    // 1. START
    const startResult = await service.start({
      conversation_id: testConversationId,
      filename: "test_pixel.png",
      mime_type: "image/png",
      file_size: fakeImageBuffer.length,
    });

    expect(startResult.attachment).toBeDefined();
    expect(startResult.attachment.id).toBeDefined();
    expect(startResult.upload_url).toBe("neon");

    const attachmentId = startResult.attachment.id;

    // 2. PUT BYTEA into Neon
    await sql`
      UPDATE public.attachments
      SET file_data = ${fakeImageBuffer}
      WHERE id = ${attachmentId};
    `;

    // 3. CONFIRM
    const confirmResult = await service.confirm(attachmentId);
    expect(confirmResult.ok).toBe(true);

    // Verify DB status is 'uploaded' and file_data is populated
    const checkAtt = await sql`
      SELECT status, octet_length(file_data) as byte_len
      FROM public.attachments
      WHERE id = ${attachmentId};
    `;
    expect(checkAtt[0].status).toBe("uploaded");
    expect(Number(checkAtt[0].byte_len)).toBe(fakeImageBuffer.length);

    // 4. SEND message with attachment
    const message = await service.send({
      conversation_id: testConversationId,
      body: "Test image message",
      attachment_ids: [attachmentId],
    });

    expect(message.id).toBeDefined();
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0].status).toBe("attached");
    createdMessageIds.push(message.id);

    // 5. ACCESS url
    const access = await service.access(attachmentId);
    expect(access.url).toBe(`/api/attachments/${attachmentId}`);

    // 6. forMessages
    const forMsg = await service.forMessages([message.id]);
    expect(forMsg[message.id]).toHaveLength(1);
    expect(forMsg[message.id][0].id).toBe(attachmentId);
  });

  it("should execute START -> PUT BYTEA -> CONFIRM -> SEND for audio/webm voice recording", async () => {
    const service = new AttachmentService(sql, testUserId);
    const fakeAudioBuffer = Buffer.from("RIFF1234WAVEfmt test audio data here");

    // 1. START with opus codecs string (should normalize gracefully)
    const startResult = await service.start({
      conversation_id: testConversationId,
      filename: "voice_123456.webm",
      mime_type: "audio/webm;codecs=opus",
      file_size: fakeAudioBuffer.length,
    });

    expect(startResult.attachment.mime_type).toBe("audio/webm");
    const attachmentId = startResult.attachment.id;

    // 2. PUT BYTEA
    await sql`
      UPDATE public.attachments
      SET file_data = ${fakeAudioBuffer}
      WHERE id = ${attachmentId};
    `;

    // 3. CONFIRM
    const confirmResult = await service.confirm(attachmentId);
    expect(confirmResult.ok).toBe(true);

    // 4. SEND message
    const message = await service.send({
      conversation_id: testConversationId,
      body: "",
      attachment_ids: [attachmentId],
    });
    expect(message.attachments[0].mime_type).toBe("audio/webm");
    createdMessageIds.push(message.id);
  });

  it("should reject confirm if file_data was not uploaded in Neon mode", async () => {
    const service = new AttachmentService(sql, testUserId);
    const startResult = await service.start({
      conversation_id: testConversationId,
      filename: "empty_test.png",
      mime_type: "image/png",
      file_size: 100,
    });

    // Attempt confirm without putting BYTEA data
    await expect(service.confirm(startResult.attachment.id)).rejects.toThrow();

    // Clean up
    await sql`DELETE FROM public.attachments WHERE id = ${startResult.attachment.id}`;
  });

  it("should return 401 Unauthorized for unauthenticated requests to API route", async () => {
    const req = new Request(`http://localhost/api/attachments/${crypto.randomUUID()}`, {
      method: "GET",
    });
    const res = await handleAttachmentApiRequest(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("should return 400 for malformed attachment ID", async () => {
    const req = new Request("http://localhost/api/attachments/not-a-valid-uuid", {
      method: "GET",
    });
    const res = await handleAttachmentApiRequest(req);
    expect(res.status).toBe(400);
  });

  it("should return 405 for unsupported HTTP methods", async () => {
    const req = new Request(`http://localhost/api/attachments/${crypto.randomUUID()}`, {
      method: "PATCH",
    });
    const res = await handleAttachmentApiRequest(req);
    expect(res.status).toBe(401); // Auth runs first, returns 401 if unauthenticated
  });

  afterAll(async () => {
    if (createdMessageIds.length > 0) {
      await sql`DELETE FROM public.messages WHERE id = ANY(${createdMessageIds})`;
    }
  });
});
