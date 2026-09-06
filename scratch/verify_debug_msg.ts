import { getPostgresClient } from "../src/lib/infra/postgres/client";

async function verifyNeonMessage() {
  const sql = getPostgresClient();
  const msgs = await sql`
    SELECT id, conversation_id, sender_id, body, client_id, created_at, edited_at, deleted_at 
    FROM messages 
    WHERE body = 'DEBUG MESSAGE 001'
  `;
  console.log("=== NEON DATABASE QUERY RESULT FOR 'DEBUG MESSAGE 001' ===");
  console.log(JSON.stringify(msgs, null, 2));

  console.log("\n=== TOTAL MESSAGES IN CONVERSATION 2f718352-8d2a-4fc7-833e-b85405bb469b ===");
  const total = await sql`
    SELECT count(*) FROM messages WHERE conversation_id = '2f718352-8d2a-4fc7-833e-b85405bb469b'
  `;
  console.log("Count:", total[0].count);

  process.exit(0);
}

verifyNeonMessage().catch(console.error);
