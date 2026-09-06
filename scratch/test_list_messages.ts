import { createPostgresApp } from "../src/lib/infra/create-app";
import { getPostgresClient } from "../src/lib/infra/postgres/client";

async function testList() {
  const userId = "f5fe60cf-3d01-44bb-8fe7-230b07b031f8"; // Vamsee
  const convId = "2f718352-8d2a-4fc7-833e-b85405bb469b"; // Demo conversation

  console.log("Testing app.messages.list for userId:", userId, "convId:", convId);
  try {
    const app = createPostgresApp(userId);
    const messages = await app.messages.list(convId, { limit: 50 });
    console.log("SUCCESS! Returned messages count:", messages.length);
    console.log("Messages:", JSON.stringify(messages, null, 2));

    const { AttachmentService } = await import("../src/lib/attachments");
    const att = new AttachmentService(getPostgresClient(), userId);
    const attResult = await att.forMessages(messages.map((m) => m.id));
    console.log("SUCCESS! AttachmentService.forMessages result:", attResult);
  } catch (err) {
    console.error("FAILED app.messages.list:", err);
  }

  process.exit(0);
}

testList();
