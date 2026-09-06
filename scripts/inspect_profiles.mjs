import fs from "node:fs";
import postgres from "postgres";

function getDatabaseUrl() {
  const envContent = fs.readFileSync(".env", "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("DATABASE_URL=")) {
      let val = trimmed.replace("DATABASE_URL=", "");
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      return val;
    }
  }
  throw new Error("DATABASE_URL not found");
}

async function main() {
  const sql = postgres(getDatabaseUrl(), { ssl: "require" });
  try {
    const profiles = await sql`SELECT id, username, display_name, created_at FROM public.profiles;`;
    console.log("Profiles in Neon:");
    console.table(profiles);
  } finally {
    await sql.end();
  }
}

main();
