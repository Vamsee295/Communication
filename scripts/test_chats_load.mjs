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

async function testUser(userId, name) {
  const sql = postgres(getDatabaseUrl(), { ssl: "require" });
  try {
    console.log(`\n=== TESTING FOR USER: ${name} (${userId}) ===`);

    console.log("1. Checking Profile...");
    const profile = await sql`SELECT * FROM public.profiles WHERE id = ${userId}`;
    console.log("Profile:", profile[0]);

    console.log("2. Checking Devices...");
    const devices = await sql`SELECT * FROM public.devices WHERE user_id = ${userId}`;
    console.log("Devices count:", devices.length);

    console.log("3. Checking Friendships...");
    const friendships = await sql`
      SELECT f.*, p.username, p.display_name
      FROM public.friendships f
      JOIN public.profiles p ON (p.id = CASE WHEN f.requester_id = ${userId} THEN f.addressee_id ELSE f.requester_id END)
      WHERE f.requester_id = ${userId} OR f.addressee_id = ${userId};
    `;
    console.log("Friendships count:", friendships.length);
    console.log("Friendships:", friendships);

    console.log("4. Checking Memberships & Conversations...");
    const memberships = await sql`
      SELECT cm.conversation_id, cm.role, cm.pinned, cm.muted, cm.archived, cm.last_read_at,
             c.kind, c.title, c.created_by, c.last_message_at
      FROM public.conversation_members cm
      JOIN public.conversations c ON c.id = cm.conversation_id
      WHERE cm.user_id = ${userId};
    `;
    console.log("Memberships count:", memberships.length);
    console.log("Memberships:", memberships);

    console.log("5. Checking Other Members of those conversations...");
    if (memberships.length > 0) {
      const convIds = memberships.map(m => m.conversation_id);
      const allMembers = await sql`
        SELECT cm.conversation_id, cm.user_id, cm.role, p.username, p.display_name
        FROM public.conversation_members cm
        LEFT JOIN public.profiles p ON p.id = cm.user_id
        WHERE cm.conversation_id = ANY(${convIds});
      `;
      console.log("All conversation members:", allMembers);
    }
  } finally {
    await sql.end();
  }
}

async function main() {
  const vamseeId = "f5fe60cf-3d01-44bb-8fe7-230b07b031f8";
  const demoId = "b9840947-03b5-445e-91f3-63a0a429d8bf";
  await testUser(vamseeId, "VAMSEE_05");
  await testUser(demoId, "DEMO_05");
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
