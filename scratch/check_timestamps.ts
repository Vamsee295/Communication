import { getPostgresClient } from "../src/lib/infra/postgres/client";

async function checkDates() {
  const sql = getPostgresClient();
  const members = await sql`SELECT user_id, conversation_id, last_read_at, last_read_at::text as last_read_text FROM conversation_members`;
  console.log("=== MEMBERS LAST READ ===");
  console.log(members);
  const msgs = await sql`SELECT id, sender_id, created_at, created_at::text as created_text FROM messages ORDER BY created_at DESC LIMIT 5`;
  console.log("=== MESSAGES CREATED AT ===");
  console.log(msgs);
  process.exit(0);
}
checkDates().catch(console.error);
