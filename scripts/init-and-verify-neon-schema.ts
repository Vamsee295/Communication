import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

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
  const schemaPath = path.resolve(process.cwd(), "src/lib/infra/postgres/schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  console.log("Applying Ghostline PostgreSQL schema to Neon database...");
  const sql = postgres(url, { ssl: "require", max: 1 });

  try {
    await sql.unsafe(schemaSql);
    console.log("SCHEMA_APPLIED_SUCCESSFULLY: true");

    // Catalog query to verify schema elements
    // 1. Tables
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;

    // 2. Enums
    const enums = await sql`
      SELECT t.typname AS enum_name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname
      ORDER BY t.typname;
    `;

    // 3. Triggers
    const triggers = await sql`
      SELECT trigger_name, event_object_table
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
      ORDER BY event_object_table, trigger_name;
    `;

    // 4. Custom Indexes
    const indexes = await sql`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname NOT LIKE '%_pkey'
      ORDER BY tablename, indexname;
    `;

    // 5. Foreign Keys
    const foreignKeys = await sql`
      SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public'
      ORDER BY tc.table_name, kcu.column_name;
    `;

    console.log("\n--- DISCOVERED CATALOG COUNTS ---");
    console.log("ACTUAL_TABLE_COUNT:", tables.length);
    console.log("TABLES:", tables.map((t) => t.table_name).join(", "));
    console.log("ACTUAL_ENUM_COUNT:", enums.length);
    console.log("ENUMS:", enums.map((e) => `${e.enum_name} (${(e.enum_values as string[]).join("|")})`).join(", "));
    console.log("ACTUAL_TRIGGER_COUNT:", triggers.length);
    console.log("TRIGGERS:", triggers.map((t) => `${t.trigger_name} on ${t.event_object_table}`).join(", "));
    console.log("ACTUAL_INDEX_COUNT (custom):", indexes.length);
    console.log("INDEXES:", indexes.map((i) => `${i.indexname} (${i.tablename})`).join(", "));
    console.log("ACTUAL_FK_COUNT:", foreignKeys.length);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("SCHEMA_INIT_ERROR:", err.message);
  process.exit(1);
});
