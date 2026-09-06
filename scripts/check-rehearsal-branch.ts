import postgres from "postgres";

const url = process.env.DATABASE_URL || "postgresql://user:password@localhost:5432/neondb";

async function main() {
  console.log("Connecting to ghostline-migration-rehearsal branch...");
  const sql = postgres(url, { ssl: "require", max: 1, connect_timeout: 10 });
  try {
    const [res] = await sql`SELECT current_database() as db, version() as ver`;
    console.log("CONNECTED:", res.db, res.ver.split(" ")[0], res.ver.split(" ")[1]);

    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    console.log("TABLE_COUNT:", tables.length);
    console.log("TABLES:", tables.map((t) => t.table_name).join(", "));
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
