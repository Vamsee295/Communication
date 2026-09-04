import postgres from "postgres";
import fs from "node:fs";

function getEnvUrl(): string {
  const env = fs.readFileSync(".env", "utf8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("DATABASE_URL=")) {
      let val = trimmed.slice("DATABASE_URL=".length).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return val;
    }
  }
  throw new Error("DATABASE_URL not found in .env");
}

async function main() {
  const url = getEnvUrl();
  const parsed = new URL(url);
  console.log("TARGET_HOST_DOMAIN:", parsed.hostname.endsWith(".neon.tech") ? "NEON_TECH_VERIFIED" : "UNKNOWN");
  console.log("TLS_MODE:", parsed.searchParams.get("sslmode") || "require");

  const sql = postgres(url, { ssl: "require", max: 1 });
  try {
    const [res] = await sql`
      SELECT 
        current_database() as db_name, 
        current_schema() as schema_name, 
        version() as pg_version, 
        current_user as db_user
    `;
    console.log("CONNECTED_OK: true");
    console.log("DATABASE_NAME:", res.db_name);
    console.log("SCHEMA_NAME:", res.schema_name);
    console.log("PG_VERSION:", res.pg_version.split(" ")[0], res.pg_version.split(" ")[1]);

    // Check existing tables
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    console.log("PUBLIC_TABLE_COUNT:", tables.length);
    console.log("PUBLIC_TABLES:", tables.map((t) => t.table_name).join(", "));
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("CONN_ERROR:", err.message);
  process.exit(1);
});
