import { getPostgresClient } from "../src/lib/infra/postgres/client";

async function run() {
  const sql = getPostgresClient();
  const messages = await sql`
    SELECT id, conversation_id, sender_id, body, created_at
    FROM public.messages
    ORDER BY created_at DESC
    LIMIT 5;
  `;
  console.log("LATEST 5 MESSAGES:", messages);

  for (const m of messages) {
    const receipts = await sql`
      SELECT * FROM public.message_receipts WHERE message_id = ${m.id};
    `;
    console.log(`Receipts for msg ${m.id} (${m.body}):`, receipts);
  }

  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
