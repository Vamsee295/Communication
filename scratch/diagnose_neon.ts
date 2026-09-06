import { getPostgresClient } from "../src/lib/infra/postgres/client";

async function diagnose() {
  const sql = getPostgresClient();

  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  console.log("=== ALL PUBLIC TABLES IN NEON ===");
  console.log(JSON.stringify(tables.map((t) => t.table_name), null, 2));

  process.exit(0);
}

diagnose().catch((err) => {
  console.error("DIAGNOSE ERROR:", err);
  process.exit(1);
});
