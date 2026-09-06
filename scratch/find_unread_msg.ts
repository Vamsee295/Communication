import { getPostgresClient } from "../src/lib/infra/postgres/client";

async function findUnreadMsg() {
  const sql = getPostgresClient();
  const convId = "2f718352-8d2a-4fc7-833e-b85405bb469b";
  const vamseeId = "f5fe60cf-3d01-44bb-8fe7-230b07b031f8";

  const rows = await sql`
    SELECT id, sender_id, body, created_at, created_at::text as text_created
    FROM messages
    WHERE conversation_id = ${convId}
      AND sender_id <> ${vamseeId}
      AND created_at > '2026-09-05 11:53:47.738+00'
  `;
  console.log("Unread messages for Vamsee:", rows);
  process.exit(0);
}
findUnreadMsg().catch(console.error);
