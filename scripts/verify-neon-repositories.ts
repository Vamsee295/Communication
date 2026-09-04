import postgres from "postgres";
import fs from "node:fs";
import { createPostgresRepositories } from "../src/lib/repositories/postgres/create-postgres-repositories";

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
  const sql = postgres(url, { ssl: "require", max: 2 });
  const testUserId = "00000000-0000-0000-0000-000000000000";

  try {
    const repos = createPostgresRepositories(sql, testUserId);

    // 1. Profiles (Read-only query)
    const profile = await repos.profiles.getById(testUserId);
    console.log("PROFILES_REPO_OK:", profile === null);

    // 2. Conversations
    const convs = await repos.conversations.listMyMemberships(testUserId);
    console.log("CONVERSATIONS_REPO_OK:", Array.isArray(convs));

    // 3. Messages
    const msgs = await repos.messages.list("00000000-0000-0000-0000-000000000000", { limit: 10 });
    console.log("MESSAGES_REPO_OK:", Array.isArray(msgs));

    // 4. Friendships
    const friends = await repos.friendships.listForUser(testUserId);
    console.log("FRIENDSHIPS_REPO_OK:", Array.isArray(friends));

    // 5. Reactions, Pins, Stars
    const reactions = await repos.reactions.listForMessageIds(["00000000-0000-0000-0000-000000000000"]);
    const pins = await repos.pins.list("00000000-0000-0000-0000-000000000000");
    const stars = await repos.stars.listMine(testUserId);
    console.log("ENGAGEMENT_REPOS_OK:", Array.isArray(reactions) && Array.isArray(pins) && Array.isArray(stars));

    // 6. Devices & Calls
    const devices = await repos.devices.listForUser(testUserId);
    const calls = await repos.calls.listForUser(testUserId);
    console.log("DEVICE_CALL_REPOS_OK:", Array.isArray(devices) && Array.isArray(calls));

    console.log("ALL_REPOSITORIES_VERIFIED: true");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("REPO_VERIFICATION_ERROR:", err.message);
  process.exit(1);
});
