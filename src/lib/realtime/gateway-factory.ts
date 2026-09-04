import { RealtimeGateway, type TokenVerifier } from "./gateway";
import { getRepositoryDriver } from "@/lib/infra/create-app";
import { getPostgresClient } from "@/lib/infra/postgres/client";
import { PostgresConversationRepository } from "@/lib/repositories/postgres/postgres-conversation-repository";
import type { ConversationRepository } from "@/lib/repositories/ports";
import { supabase } from "@/integrations/supabase/client";

/**
 * Creates or configures a RealtimeGateway with the appropriate ConversationRepository
 * based on the active DATA_REPOSITORY_DRIVER (Neon vs Supabase).
 */
export function createProductionRealtimeGateway(
  verifyToken?: TokenVerifier,
  customConversationRepo?: ConversationRepository,
): RealtimeGateway {
  const tokenVerifier: TokenVerifier =
    verifyToken ||
    (async (token: string) => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);
      if (error || !user) {
        throw new Error("Invalid or expired authentication token");
      }
      return user.id;
    });

  let conversationRepo: ConversationRepository | undefined = customConversationRepo;

  if (!conversationRepo) {
    if (getRepositoryDriver() === "neon") {
      const sql = getPostgresClient();
      // Service-level conversation repo for gateway authorization
      conversationRepo = new PostgresConversationRepository(sql, "system-realtime-gateway");
    }
  }

  return new RealtimeGateway(tokenVerifier, conversationRepo);
}
