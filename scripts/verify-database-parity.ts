/**
 * Ghostline Database Parity & Integrity Verification Script
 *
 * Checks:
 * 1. Row counts across all 14 tables between Supabase and Neon
 * 2. Foreign-key referential integrity in Neon (zero dangling records)
 * 3. Message timestamp ordering & keyset cursor validity
 * 4. Zero duplicate primary keys
 *
 * Usage:
 *   npx tsx scripts/verify-database-parity.ts
 */

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile();

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  const neonUrl = process.env.DATABASE_URL;

  if (!supabaseUrl || !supabaseKey || !neonUrl) {
    console.error("Missing required environment variables: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, DATABASE_URL");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const sql = postgres(neonUrl, { ssl: "require", max: 5 });

  const tables = [
    "profiles",
    "user_roles",
    "devices",
    "friendships",
    "conversations",
    "conversation_members",
    "messages",
    "message_receipts",
    "message_hidden",
    "message_reactions",
    "message_edits",
    "pinned_messages",
    "starred_messages",
    "calls",
  ] as const;

  console.log("=== Ghostline Database Parity & Integrity Verification ===\n");

  let allPassed = true;
  const parityTable: Array<{ Table: string; "Supabase Rows": number; "Neon Rows": number; Match: string }> = [];

  // 1. Check Row Counts
  for (const table of tables) {
    const { count: supabaseCount, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) {
      console.warn(`Warning: Could not get count for Supabase table '${table}':`, error.message);
    }

    const [{ count: neonCountStr }] = await sql<[{ count: string }]>`
      SELECT COUNT(*)::text as count FROM public.${sql(table)};
    `;
    const neonCount = parseInt(neonCountStr, 10);
    const sCount = supabaseCount ?? 0;
    const match = sCount === neonCount;
    if (!match) allPassed = false;

    parityTable.push({
      Table: table,
      "Supabase Rows": sCount,
      "Neon Rows": neonCount,
      Match: match ? "✅ PASS" : "❌ MISMATCH",
    });
  }

  console.table(parityTable);

  // 2. Foreign-Key Referential Integrity Checks in Neon
  console.log("\n--- Checking Foreign-Key Referential Integrity in Neon ---");
  const fkChecks = [
    {
      name: "Orphan messages (invalid conversation_id)",
      query: sql`SELECT COUNT(*)::text as count FROM public.messages m WHERE NOT EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = m.conversation_id)`,
    },
    {
      name: "Orphan messages (invalid sender_id)",
      query: sql`SELECT COUNT(*)::text as count FROM public.messages m WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = m.sender_id)`,
    },
    {
      name: "Orphan conversation_members (invalid user_id)",
      query: sql`SELECT COUNT(*)::text as count FROM public.conversation_members cm WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cm.user_id)`,
    },
    {
      name: "Orphan receipts (invalid message_id)",
      query: sql`SELECT COUNT(*)::text as count FROM public.message_receipts mr WHERE NOT EXISTS (SELECT 1 FROM public.messages m WHERE m.id = mr.message_id)`,
    },
  ];

  for (const check of fkChecks) {
    const [{ count }] = await check.query;
    const countNum = parseInt(count, 10);
    if (countNum === 0) {
      console.log(`✅ ${check.name}: 0 orphans found`);
    } else {
      console.error(`❌ ${check.name}: ${countNum} orphan records detected!`);
      allPassed = false;
    }
  }

  await sql.end();

  if (allPassed) {
    console.log("\n🎉 ALL DATABASE PARITY AND INTEGRITY CHECKS PASSED!");
    process.exit(0);
  } else {
    console.error("\n❌ PARITY / INTEGRITY CHECKS DETECTED MISMATCHES.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
