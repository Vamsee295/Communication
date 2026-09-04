import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function getVal(key: string): string {
  const env = fs.readFileSync(".env", "utf8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`)) {
      let v = trimmed.slice(`${key}=`.length).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  return "";
}

const url = getVal("SUPABASE_URL");
const key = getVal("SUPABASE_PUBLISHABLE_KEY");
const supabase = createClient(url, key);

async function inspectBaseline() {
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

  console.log("=== Supabase Production Baseline Inspection ===");
  console.log("Timestamp:", new Date().toISOString());

  for (const table of tables) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) {
      console.log(`Table ${table}: ERROR (${error.message})`);
    } else {
      console.log(`Table ${table}: COUNT = ${count}`);
    }
  }
}

inspectBaseline().catch((e) => {
  console.error("INSPECT_ERROR:", e.message);
  process.exit(1);
});
