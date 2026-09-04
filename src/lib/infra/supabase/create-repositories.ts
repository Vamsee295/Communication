import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import type {
  CallRepository,
  ConversationRepository,
  DeviceRepository,
  FriendshipRepository,
  MessageRepository,
  PinRepository,
  ProfileRepository,
  ReactionRepository,
  StarRepository,
} from "@/lib/repositories/ports";
import { SupabaseCallRepository, SupabaseDeviceRepository } from "@/lib/repositories/supabase/supabase-device-call-repository";
import { SupabaseConversationRepository } from "@/lib/repositories/supabase/supabase-conversation-repository";
import {
  SupabasePinRepository,
  SupabaseReactionRepository,
  SupabaseStarRepository,
} from "@/lib/repositories/supabase/supabase-engagement-repository";
import { SupabaseFriendshipRepository } from "@/lib/repositories/supabase/supabase-friendship-repository";
import { SupabaseMessageRepository } from "@/lib/repositories/supabase/supabase-message-repository";
import { SupabaseProfileRepository } from "@/lib/repositories/supabase/supabase-profile-repository";

export type Repositories = {
  profiles: ProfileRepository;
  friendships: FriendshipRepository;
  conversations: ConversationRepository;
  messages: MessageRepository;
  reactions: ReactionRepository;
  pins: PinRepository;
  stars: StarRepository;
  devices: DeviceRepository;
  calls: CallRepository;
};

export function createSupabaseRepositories(supabase: AppSupabase): Repositories {
  return {
    profiles: new SupabaseProfileRepository(supabase),
    friendships: new SupabaseFriendshipRepository(supabase),
    conversations: new SupabaseConversationRepository(supabase),
    messages: new SupabaseMessageRepository(supabase),
    reactions: new SupabaseReactionRepository(supabase),
    pins: new SupabasePinRepository(supabase),
    stars: new SupabaseStarRepository(supabase),
    devices: new SupabaseDeviceRepository(supabase),
    calls: new SupabaseCallRepository(supabase),
  };
}
