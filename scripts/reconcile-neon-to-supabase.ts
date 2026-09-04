/**
 * Ghostline Reverse Synchronization Tool: Neon PostgreSQL -> Supabase
 *
 * Emergency recovery tool to reconcile writes made to Neon during a post-cutover
 * window back into Supabase prior to rolling back traffic.
 *
 * Reconciles:
 * 1. INSERT/UPDATE on mutable entities (profiles, friendships, conversations, conversation_members, messages, devices, calls)
 * 2. Deletes/Hard deletions on messages, reactions, pins, and stars
 * 3. Compound state (message_receipts, message_hidden, message_reactions, pinned_messages, starred_messages)
 *
 * Usage:
 *   npx tsx scripts/reconcile-neon-to-supabase.ts [--dry-run]
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

export async function reconcileNeonToSupabase(options: { dryRun?: boolean; sinceTimestamp?: string } = {}) {
  const isDryRun = options.dryRun ?? process.argv.includes("--dry-run");
  const sinceTimestamp = options.sinceTimestamp || "1970-01-01T00:00:00Z";

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  const neonUrl = process.env.DATABASE_URL;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_PUBLISHABLE_KEY.");
  }
  if (!neonUrl) {
    throw new Error("Missing DATABASE_URL for Neon PostgreSQL source.");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const sql = postgres(neonUrl, { ssl: "require", max: 5 });

  console.log("=== Ghostline Reverse Sync: Neon -> Supabase ===");
  console.log(`Execution Mode: ${isDryRun ? "DRY-RUN (Simulated)" : "LIVE RECONCILIATION"}`);
  console.log(`Reconciling modifications since: ${sinceTimestamp}`);

  const report: Record<string, { readFromNeon: number; upsertedToSupabase: number; deletedFromSupabase: number; status: string }> = {};

  try {
    // 1. Profiles
    const neonProfiles = await sql`SELECT * FROM public.profiles WHERE updated_at >= ${sinceTimestamp}::timestamptz`;
    console.log(`[Reconciling profiles] Found ${neonProfiles.length} rows in Neon.`);
    if (!isDryRun && neonProfiles.length > 0) {
      const { error } = await supabase.from("profiles").upsert(neonProfiles as unknown as Parameters<ReturnType<typeof supabase.from<"profiles">>["upsert"]>[0]);
      if (error) throw new Error(`Failed to upsert profiles into Supabase: ${error.message}`);
    }
    report.profiles = { readFromNeon: neonProfiles.length, upsertedToSupabase: isDryRun ? 0 : neonProfiles.length, deletedFromSupabase: 0, status: isDryRun ? "Dry-run verified" : "Upserted" };

    // 2. Friendships
    const neonFriendships = await sql`SELECT * FROM public.friendships WHERE created_at >= ${sinceTimestamp}::timestamptz OR responded_at >= ${sinceTimestamp}::timestamptz`;
    console.log(`[Reconciling friendships] Found ${neonFriendships.length} rows in Neon.`);
    if (!isDryRun && neonFriendships.length > 0) {
      const { error } = await supabase.from("friendships").upsert(neonFriendships as unknown as Parameters<ReturnType<typeof supabase.from<"friendships">>["upsert"]>[0]);
      if (error) throw new Error(`Failed to upsert friendships into Supabase: ${error.message}`);
    }
    report.friendships = { readFromNeon: neonFriendships.length, upsertedToSupabase: isDryRun ? 0 : neonFriendships.length, deletedFromSupabase: 0, status: isDryRun ? "Dry-run verified" : "Upserted" };

    // 3. Conversations & Members
    const neonConversations = await sql`SELECT * FROM public.conversations WHERE created_at >= ${sinceTimestamp}::timestamptz OR last_message_at >= ${sinceTimestamp}::timestamptz`;
    console.log(`[Reconciling conversations] Found ${neonConversations.length} rows in Neon.`);
    if (!isDryRun && neonConversations.length > 0) {
      const { error } = await supabase.from("conversations").upsert(neonConversations as unknown as Parameters<ReturnType<typeof supabase.from<"conversations">>["upsert"]>[0]);
      if (error) throw new Error(`Failed to upsert conversations into Supabase: ${error.message}`);
    }
    report.conversations = { readFromNeon: neonConversations.length, upsertedToSupabase: isDryRun ? 0 : neonConversations.length, deletedFromSupabase: 0, status: isDryRun ? "Dry-run verified" : "Upserted" };

    const neonMembers = await sql`SELECT * FROM public.conversation_members WHERE joined_at >= ${sinceTimestamp}::timestamptz`;
    console.log(`[Reconciling conversation_members] Found ${neonMembers.length} rows in Neon.`);
    if (!isDryRun && neonMembers.length > 0) {
      const { error } = await supabase.from("conversation_members").upsert(neonMembers as unknown as Parameters<ReturnType<typeof supabase.from<"conversation_members">>["upsert"]>[0]);
      if (error) throw new Error(`Failed to upsert conversation_members into Supabase: ${error.message}`);
    }
    report.conversation_members = { readFromNeon: neonMembers.length, upsertedToSupabase: isDryRun ? 0 : neonMembers.length, deletedFromSupabase: 0, status: isDryRun ? "Dry-run verified" : "Upserted" };

    // 4. Devices
    const neonDevices = await sql`SELECT * FROM public.devices WHERE created_at >= ${sinceTimestamp}::timestamptz OR last_seen_at >= ${sinceTimestamp}::timestamptz`;
    console.log(`[Reconciling devices] Found ${neonDevices.length} rows in Neon.`);
    if (!isDryRun && neonDevices.length > 0) {
      const { error } = await supabase.from("devices").upsert(neonDevices as unknown as Parameters<ReturnType<typeof supabase.from<"devices">>["upsert"]>[0]);
      if (error) throw new Error(`Failed to upsert devices into Supabase: ${error.message}`);
    }
    report.devices = { readFromNeon: neonDevices.length, upsertedToSupabase: isDryRun ? 0 : neonDevices.length, deletedFromSupabase: 0, status: isDryRun ? "Dry-run verified" : "Upserted" };

    // 5. Messages (Includes inserts, edits, and hard-delete synchronization)
    const neonMessages = await sql`
      SELECT * FROM public.messages
      WHERE created_at >= ${sinceTimestamp}::timestamptz
         OR edited_at >= ${sinceTimestamp}::timestamptz
         OR deleted_at >= ${sinceTimestamp}::timestamptz
    `;
    console.log(`[Reconciling messages] Found ${neonMessages.length} modified rows in Neon.`);
    let deletedMessagesCount = 0;
    if (!isDryRun) {
      if (neonMessages.length > 0) {
        const { error } = await supabase
          .from("messages")
          .upsert(neonMessages as unknown as Parameters<ReturnType<typeof supabase.from<"messages">>["upsert"]>[0]);
        if (error) throw new Error(`Failed to upsert messages into Supabase: ${error.message}`);
      }
      
      // Hard delete synchronization: Delete from Supabase if not in Neon
      const neonAllMsgIds = (await sql`SELECT id FROM public.messages`).map((r: { id: string }) => r.id);
      const { data: supaMsgs } = await supabase.from("messages").select("id");
      if (supaMsgs && supaMsgs.length > 0) {
        const neonMsgSet = new Set(neonAllMsgIds);
        const toDelete = supaMsgs.filter((m: { id: string }) => !neonMsgSet.has(m.id)).map((m: { id: string }) => m.id);
        if (toDelete.length > 0) {
          deletedMessagesCount = toDelete.length;
          const { error: delErr } = await supabase.from("messages").delete().in("id", toDelete);
          if (delErr) throw new Error(`Failed to delete orphaned messages from Supabase: ${delErr.message}`);
        }
      }
    }
    report.messages = {
      readFromNeon: neonMessages.length,
      upsertedToSupabase: isDryRun ? 0 : neonMessages.length,
      deletedFromSupabase: deletedMessagesCount,
      status: isDryRun ? "Dry-run verified" : "Synchronized",
    };

    // 6. Message Reactions (Full Set Synchronization for Hard Deletes)
    const neonReactions = await sql`SELECT * FROM public.message_reactions`;
    console.log(`[Reconciling message_reactions] Found ${neonReactions.length} rows in Neon.`);
    let deletedReactionsCount = 0;
    if (!isDryRun) {
      const { data: supaReactions } = await supabase.from("message_reactions").select("message_id, user_id, emoji");
      if (supaReactions && supaReactions.length > 0) {
        const neonReacKeys = new Set(neonReactions.map((r: { message_id: string; user_id: string; emoji: string }) => `${r.message_id}:${r.user_id}:${r.emoji}`));
        const toDelete = supaReactions.filter((r: { message_id: string; user_id: string; emoji: string }) => !neonReacKeys.has(`${r.message_id}:${r.user_id}:${r.emoji}`));
        for (const item of toDelete) {
          deletedReactionsCount++;
          await supabase.from("message_reactions").delete().match({ message_id: item.message_id, user_id: item.user_id, emoji: item.emoji });
        }
      }
      if (neonReactions.length > 0) {
        const { error } = await supabase
          .from("message_reactions")
          .upsert(neonReactions as unknown as Parameters<ReturnType<typeof supabase.from<"message_reactions">>["upsert"]>[0]);
        if (error) throw new Error(`Failed to upsert reactions into Supabase: ${error.message}`);
      }
    }
    report.message_reactions = {
      readFromNeon: neonReactions.length,
      upsertedToSupabase: isDryRun ? 0 : neonReactions.length,
      deletedFromSupabase: deletedReactionsCount,
      status: isDryRun ? "Dry-run verified" : "Synchronized",
    };

    // 7. Pinned Messages (Full Set Synchronization for Hard Deletes)
    const neonPins = await sql`SELECT * FROM public.pinned_messages`;
    console.log(`[Reconciling pinned_messages] Found ${neonPins.length} rows in Neon.`);
    let deletedPinsCount = 0;
    if (!isDryRun) {
      const { data: supaPins } = await supabase.from("pinned_messages").select("conversation_id, message_id");
      if (supaPins && supaPins.length > 0) {
        const neonPinKeys = new Set(neonPins.map((p: { conversation_id: string; message_id: string }) => `${p.conversation_id}:${p.message_id}`));
        const toDelete = supaPins.filter((p: { conversation_id: string; message_id: string }) => !neonPinKeys.has(`${p.conversation_id}:${p.message_id}`));
        for (const item of toDelete) {
          deletedPinsCount++;
          await supabase.from("pinned_messages").delete().match({ conversation_id: item.conversation_id, message_id: item.message_id });
        }
      }
      if (neonPins.length > 0) {
        const { error } = await supabase
          .from("pinned_messages")
          .upsert(neonPins as unknown as Parameters<ReturnType<typeof supabase.from<"pinned_messages">>["upsert"]>[0]);
        if (error) throw new Error(`Failed to upsert pins into Supabase: ${error.message}`);
      }
    }
    report.pinned_messages = {
      readFromNeon: neonPins.length,
      upsertedToSupabase: isDryRun ? 0 : neonPins.length,
      deletedFromSupabase: deletedPinsCount,
      status: isDryRun ? "Dry-run verified" : "Synchronized",
    };

    // 8. Message Receipts
    const neonReceipts = await sql`SELECT * FROM public.message_receipts`;
    console.log(`[Reconciling message_receipts] Found ${neonReceipts.length} rows in Neon.`);
    if (!isDryRun && neonReceipts.length > 0) {
      const { error } = await supabase
        .from("message_receipts")
        .upsert(neonReceipts as unknown as Parameters<ReturnType<typeof supabase.from<"message_receipts">>["upsert"]>[0]);
      if (error) throw new Error(`Failed to upsert receipts into Supabase: ${error.message}`);
    }
    report.message_receipts = {
      readFromNeon: neonReceipts.length,
      upsertedToSupabase: isDryRun ? 0 : neonReceipts.length,
      deletedFromSupabase: 0,
      status: isDryRun ? "Dry-run verified" : "Upserted",
    };

    // 9. Starred Messages (Full Set Synchronization for Hard Deletes)
    const neonStars = await sql`SELECT * FROM public.starred_messages`;
    console.log(`[Reconciling starred_messages] Found ${neonStars.length} rows in Neon.`);
    let deletedStarsCount = 0;
    if (!isDryRun) {
      const { data: supaStars } = await supabase.from("starred_messages").select("user_id, message_id");
      if (supaStars && supaStars.length > 0) {
        const neonStarKeys = new Set(neonStars.map((s: { user_id: string; message_id: string }) => `${s.user_id}:${s.message_id}`));
        const toDelete = supaStars.filter((s: { user_id: string; message_id: string }) => !neonStarKeys.has(`${s.user_id}:${s.message_id}`));
        for (const item of toDelete) {
          deletedStarsCount++;
          await supabase.from("starred_messages").delete().match({ user_id: item.user_id, message_id: item.message_id });
        }
      }
      if (neonStars.length > 0) {
        const { error } = await supabase
          .from("starred_messages")
          .upsert(neonStars as unknown as Parameters<ReturnType<typeof supabase.from<"starred_messages">>["upsert"]>[0]);
        if (error) throw new Error(`Failed to upsert stars into Supabase: ${error.message}`);
      }
    }
    report.starred_messages = {
      readFromNeon: neonStars.length,
      upsertedToSupabase: isDryRun ? 0 : neonStars.length,
      deletedFromSupabase: deletedStarsCount,
      status: isDryRun ? "Dry-run verified" : "Synchronized",
    };

    // 10. Hidden Messages
    const neonHidden = await sql`SELECT * FROM public.message_hidden`;
    console.log(`[Reconciling message_hidden] Found ${neonHidden.length} rows in Neon.`);
    if (!isDryRun && neonHidden.length > 0) {
      const { error } = await supabase
        .from("message_hidden")
        .upsert(neonHidden as unknown as Parameters<ReturnType<typeof supabase.from<"message_hidden">>["upsert"]>[0]);
      if (error) throw new Error(`Failed to upsert hidden messages into Supabase: ${error.message}`);
    }
    report.message_hidden = {
      readFromNeon: neonHidden.length,
      upsertedToSupabase: isDryRun ? 0 : neonHidden.length,
      deletedFromSupabase: 0,
      status: isDryRun ? "Dry-run verified" : "Upserted",
    };

    // 11. Message Edits (Audit history)
    const neonEdits = await sql`SELECT * FROM public.message_edits`;
    console.log(`[Reconciling message_edits] Found ${neonEdits.length} rows in Neon.`);
    if (!isDryRun && neonEdits.length > 0) {
      const { error } = await supabase
        .from("message_edits")
        .upsert(neonEdits as unknown as Parameters<ReturnType<typeof supabase.from<"message_edits">>["upsert"]>[0]);
      if (error) throw new Error(`Failed to upsert edits into Supabase: ${error.message}`);
    }
    report.message_edits = {
      readFromNeon: neonEdits.length,
      upsertedToSupabase: isDryRun ? 0 : neonEdits.length,
      deletedFromSupabase: 0,
      status: isDryRun ? "Dry-run verified" : "Upserted",
    };

    // 12. Calls
    const neonCalls = await sql`
      SELECT * FROM public.calls
      WHERE created_at >= ${sinceTimestamp}::timestamptz
         OR updated_at >= ${sinceTimestamp}::timestamptz
    `;
    console.log(`[Reconciling calls] Found ${neonCalls.length} modified rows in Neon.`);
    if (!isDryRun && neonCalls.length > 0) {
      const { error } = await supabase
        .from("calls")
        .upsert(neonCalls as unknown as Parameters<ReturnType<typeof supabase.from<"calls">>["upsert"]>[0]);
      if (error) throw new Error(`Failed to upsert calls into Supabase: ${error.message}`);
    }
    report.calls = {
      readFromNeon: neonCalls.length,
      upsertedToSupabase: isDryRun ? 0 : neonCalls.length,
      deletedFromSupabase: 0,
      status: isDryRun ? "Dry-run verified" : "Upserted",
    };

    console.table(report);
    return report;
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && process.argv[1].includes("reconcile-neon-to-supabase")) {
  reconcileNeonToSupabase().catch((err) => {
    console.error("Reconciliation error:", err);
    process.exit(1);
  });
}
