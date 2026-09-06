import { getPostgresClient } from "../src/lib/infra/postgres/client";
import { PostgresConversationRepository } from "../src/lib/repositories/postgres/postgres-conversation-repository";
import { PostgresMessageRepository } from "../src/lib/repositories/postgres/postgres-message-repository";

async function testUnread() {
  const sql = getPostgresClient();
  const convId = "2f718352-8d2a-4fc7-833e-b85405bb469b";
  const vamseeId = "f5fe60cf-3d01-44bb-8fe7-230b07b031f8";
  const demoId = "b9840947-03b5-445e-91f3-63a0a429d8bf";

  const msgRepo = new PostgresMessageRepository(sql);
  const convRepo = new PostgresConversationRepository(sql);

  const mems = await convRepo.listMyMemberships(vamseeId);
  const myMem = mems.find((m) => m.conversation_id === convId);
  console.log("Vamsee membership:", myMem);

  const unreadVamsee = await msgRepo.countUnread(convId, vamseeId, myMem?.last_read_at ?? "1970-01-01");
  console.log("Vamsee unread count:", unreadVamsee);

  const demoMems = await convRepo.listMyMemberships(demoId);
  const demoMem = demoMems.find((m) => m.conversation_id === convId);
  console.log("Demo membership:", demoMem);

  const unreadDemo = await msgRepo.countUnread(convId, demoId, demoMem?.last_read_at ?? "1970-01-01");
  console.log("Demo unread count:", unreadDemo);

  process.exit(0);
}

testUnread().catch(console.error);
