import type postgres from "postgres";
import type { Repositories } from "@/lib/infra/supabase/create-repositories";
import { PostgresProfileRepository } from "@/lib/repositories/postgres/postgres-profile-repository";
import { PostgresFriendshipRepository } from "@/lib/repositories/postgres/postgres-friendship-repository";
import { PostgresConversationRepository } from "@/lib/repositories/postgres/postgres-conversation-repository";
import { PostgresMessageRepository } from "@/lib/repositories/postgres/postgres-message-repository";
import {
  PostgresPinRepository,
  PostgresReactionRepository,
  PostgresStarRepository,
} from "@/lib/repositories/postgres/postgres-engagement-repository";
import {
  PostgresCallRepository,
  PostgresDeviceRepository,
} from "@/lib/repositories/postgres/postgres-device-call-repository";

export function createPostgresRepositories(db: postgres.Sql, userId: string): Repositories {
  return {
    profiles: new PostgresProfileRepository(db),
    friendships: new PostgresFriendshipRepository(db),
    conversations: new PostgresConversationRepository(db, userId),
    messages: new PostgresMessageRepository(db),
    reactions: new PostgresReactionRepository(db),
    pins: new PostgresPinRepository(db),
    stars: new PostgresStarRepository(db),
    devices: new PostgresDeviceRepository(db),
    calls: new PostgresCallRepository(db),
  };
}
