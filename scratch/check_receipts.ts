import { getPostgresClient } from "../src/lib/infra/postgres/client";

async function run() {
  const sql = getPostgresClient();
  const triggers = await sql`
    SELECT trigger_name, event_manipulation, event_object_table, action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'messages';
  `;
  console.log("TRIGGERS ON messages:", triggers);

  const receiptsCount = await sql`SELECT count(*) FROM public.message_receipts;`;
  console.log("message_receipts count:", receiptsCount);

  const sampleReceipts = await sql`SELECT * FROM public.message_receipts ORDER BY message_id DESC LIMIT 10;`;
  console.log("sample message_receipts:", sampleReceipts);

  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
