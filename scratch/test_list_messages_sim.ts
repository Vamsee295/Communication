import { getPostgresClient } from "../src/lib/infra/postgres/client";
import { createApp } from "../src/lib/infra/create-app";
import { AttachmentService } from "../src/lib/attachments";

async function verifyListMessagesFlow() {
  const userId = "f5fe60cf-3d01-44bb-8fe7-230b07b031f8"; // Vamsee
  const convId = "2f718352-8d2a-4fc7-833e-b85405bb469b"; // Demo conversation

  const fakeContext = { supabase: {} as any, userId };
  const app = createApp(fakeContext);

  console.log("1. Calling app.messages.list()...");
  const messages = await app.messages.list(convId, { limit: 50 });
  console.log("Returned messages count from app:", messages.length);

  console.log("2. Simulating listMessages server function logic...");
  let finalMessages = messages;
  if (messages.length && process.env.DATA_REPOSITORY_DRIVER?.toLowerCase() === "neon") {
    try {
      const attachments = await new AttachmentService(getPostgresClient(), userId).forMessages(messages.map((m) => m.id));
      finalMessages = messages.map((m) => ({ ...m, attachments: attachments[m.id] ?? [] }));
    } catch (err) {
      console.log("AttachmentService threw error, handled by try/catch fallback:", (err as Error).message);
      finalMessages = messages.map((m) => ({ ...m, attachments: [] }));
    }
  }

  console.log("Final messages count returned to frontend:", finalMessages.length);
  console.log("Message bodies:", finalMessages.map((m) => `[${m.sender_id === userId ? "MINE" : "THEIRS"}] ${m.body}`));

  process.exit(0);
}

verifyListMessagesFlow().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
