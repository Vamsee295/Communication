import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import { createSupabaseRepositories, type Repositories } from "@/lib/infra/supabase/create-repositories";
import { NoopRateLimiter, type RateLimiter } from "@/lib/ports/rate-limit";
import { AuthService } from "@/lib/services/auth.service";
import { CallService } from "@/lib/services/call.service";
import { ConversationService } from "@/lib/services/conversation.service";
import { DeviceService } from "@/lib/services/device.service";
import { FriendshipService } from "@/lib/services/friendship.service";
import { MessageService } from "@/lib/services/message.service";
import { PinService } from "@/lib/services/pin.service";
import { ProfileService } from "@/lib/services/profile.service";
import { ReactionService } from "@/lib/services/reaction.service";
import { StarService } from "@/lib/services/star.service";

import { AuthorizationPolicies } from "@/lib/auth/authorization";

export type AppServices = {
  auth: AuthService;
  profiles: ProfileService;
  friendships: FriendshipService;
  conversations: ConversationService;
  messages: MessageService;
  reactions: ReactionService;
  pins: PinService;
  stars: StarService;
  devices: DeviceService;
  calls: CallService;
  policies: AuthorizationPolicies;
};

export function createServices(
  userId: string,
  repos: Repositories,
  rateLimiter: RateLimiter = new NoopRateLimiter(),
): AppServices {
  const policies = new AuthorizationPolicies({
    conversations: repos.conversations,
    messages: repos.messages,
    calls: repos.calls,
    friendships: repos.friendships,
  });

  return {
    auth: new AuthService(userId),
    profiles: new ProfileService(userId, repos.profiles),
    friendships: new FriendshipService(userId, repos.friendships, repos.profiles),
    conversations: new ConversationService(
      userId,
      repos.conversations,
      repos.messages,
      repos.profiles,
      repos.friendships,
      policies.conversations,
    ),
    messages: new MessageService(
      userId,
      repos.messages,
      repos.conversations,
      repos.profiles,
      rateLimiter,
      policies.conversations,
      policies.messages,
    ),
    reactions: new ReactionService(
      userId,
      repos.reactions,
      repos.messages,
      policies.messages,
      policies.conversations,
    ),
    pins: new PinService(
      userId,
      repos.pins,
      repos.messages,
      policies.conversations,
      policies.messages,
    ),
    stars: new StarService(
      userId,
      repos.stars,
      repos.messages,
      repos.conversations,
      repos.profiles,
      policies.messages,
      policies.conversations,
    ),
    devices: new DeviceService(userId, repos.devices),
    calls: new CallService(userId, repos.calls, repos.profiles, policies.calls),
    policies,
  };
}

export function createSupabaseApp(supabase: AppSupabase, userId: string): AppServices {
  return createServices(userId, createSupabaseRepositories(supabase));
}
