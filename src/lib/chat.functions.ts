import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireNotFrozen } from "@/lib/infra/write-gate";
import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import { createApp } from "@/lib/infra/create-app";
import { getPostgresClient } from "@/lib/infra/postgres/client";
import { AttachmentService } from "@/lib/attachments";
import { postCommitPublisher } from "@/lib/events/post-commit-publisher";
import { PushSubscriptionService } from "@/lib/push-subscriptions";
import type {
  ChatProfile,
  ConversationSummary,
  GlobalSearchHit,
  GroupAction,
  GroupAdminAction,
  GroupInviteLink,
  GroupMemberRole,
  GroupPermissions,
  MemberRestriction,
  Message,
  Pin,
  Reaction,
} from "@/lib/domain/types";

export type {
  ChatProfile,
  ConversationSummary,
  GroupAction,
  GroupAdminAction,
  GroupInviteLink,
  GroupMemberRole,
  GroupPermissions,
  MemberRestriction,
};
export type MessageRow = Message;
export type ReactionRow = Reaction;
export type PinRow = Pin;
export type StarRow = { user_id: string; message_id: string; starred_at: string };
export type GlobalHit = GlobalSearchHit;

function app(context: { supabase: AppSupabase; userId: string }) {
  return createApp(context);
}

const pushSubscriptionInput = z.object({ endpoint: z.string().max(2048), p256dh: z.string().max(256), auth: z.string().max(128), user_agent: z.string().max(512).optional() });
export const getVapidPublicKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(() => {
    if (!process.env.VAPID_PUBLIC_KEY) throw new Error("Push notifications are not configured");
    return { public_key: process.env.VAPID_PUBLIC_KEY };
  });
export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => pushSubscriptionInput.parse(data))
  .handler(async ({ data, context }) => { await new PushSubscriptionService(getPostgresClient(), context.userId).upsert(data); return { ok: true as const }; });
export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ endpoint: z.string().max(2048) }).parse(data))
  .handler(async ({ data, context }) => { await new PushSubscriptionService(getPostgresClient(), context.userId).remove(data.endpoint); return { ok: true as const }; });
export const openDirectConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ friend_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.openDirect(data.friend_id));

export const createGroupConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ title: z.string().trim().min(1).max(100), member_ids: z.array(z.string().uuid()).min(1) }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.createGroup(data.title, data.member_ids));

export const addGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid(), member_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.addMember(data.conversation_id, data.member_id));

export const removeGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid(), member_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.removeMember(data.conversation_id, data.member_id));

export const updateGroupMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid(), member_id: z.string().uuid(), role: z.enum(["owner", "admin", "member"]) }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.updateMemberRole(data.conversation_id, data.member_id, data.role));

export const updateGroupTitle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid(), title: z.string().trim().min(1).max(100) }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.updateGroupTitle(data.conversation_id, data.title));

export const updateGroupDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid(), description: z.string().trim().max(500) }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.updateGroupDescription(data.conversation_id, data.description));

export const updateGroupAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid(), avatar_url: z.string().nullable() }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.updateGroupAvatar(data.conversation_id, data.avatar_url));

export const getGroupPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.getGroupPermissions(data.conversation_id));

export const setGroupPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        send_messages: z.boolean().optional(),
        send_media: z.boolean().optional(),
        send_files: z.boolean().optional(),
        send_voice: z.boolean().optional(),
        send_links: z.boolean().optional(),
        create_polls: z.boolean().optional(),
        add_members: z.boolean().optional(),
        pin_messages: z.boolean().optional(),
        change_group_info: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { conversation_id, ...perms } = data;
    return app(context).conversations.setGroupPermissions(conversation_id, perms);
  });

export const listMemberRestrictions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.listMemberRestrictions(data.conversation_id));

export const setMemberRestriction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        target_user_id: z.string().uuid(),
        restricted_until: z.string().nullable().optional(),
        send_messages: z.boolean().optional(),
        send_media: z.boolean().optional(),
        send_files: z.boolean().optional(),
        send_voice: z.boolean().optional(),
        send_links: z.boolean().optional(),
        create_polls: z.boolean().optional(),
        add_members: z.boolean().optional(),
        pin_messages: z.boolean().optional(),
        change_group_info: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { conversation_id, target_user_id, restricted_until, ...perms } = data;
    return app(context).conversations.setMemberRestriction(
      conversation_id,
      target_user_id,
      perms,
      restricted_until ?? null,
    );
  });

export const removeMemberRestriction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid(), target_user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.removeMemberRestriction(data.conversation_id, data.target_user_id));

export const createGroupInviteLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        expires_at: z.string().nullable().optional(),
        max_uses: z.number().int().min(1).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    app(context).conversations.createInviteLink(
      data.conversation_id,
      data.expires_at ?? null,
      data.max_uses ?? null,
    ),
  );

export const revokeGroupInviteLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid(), link_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.revokeInviteLink(data.conversation_id, data.link_id));

export const listGroupInviteLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.listInviteLinks(data.conversation_id));

export const joinGroupViaInviteLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ token: z.string().trim().min(1) }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.joinViaInviteLink(data.token));

export const listGroupAdminActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.listAdminActions(data.conversation_id));

async function cleanupVanishMessages() {
  if (process.env.DATA_REPOSITORY_DRIVER?.toLowerCase() !== "neon") return;
  try {
    const db = getPostgresClient();
    await db`
      DELETE FROM public.messages
      WHERE is_vanish = true
        AND id IN (
           SELECT m.id
           FROM public.messages m
           JOIN public.message_receipts mr ON m.id = mr.message_id
           WHERE m.is_vanish = true
             AND mr.user_id != m.sender_id
             AND mr.read_at IS NOT NULL
             AND (
               m.conversation_id IN (SELECT id FROM public.conversations WHERE vanish_session_active_until < NOW() - INTERVAL '30 seconds')
               OR mr.read_at < NOW() - INTERVAL '5 minutes'
             )
        )
    `;
  } catch (e) {
    console.error("Failed to clean up stale vanish messages", e);
  }
}

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversationSummary[]> => {
    await cleanupVanishMessages();
    return app(context).conversations.list();
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await cleanupVanishMessages();
    return app(context).conversations.get(data.conversation_id);
  });

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        before: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<MessageRow[]> => {
    const messages = await app(context).messages.list(data.conversation_id, { before: data.before, limit: data.limit });
    if (messages.length && process.env.DATA_REPOSITORY_DRIVER?.toLowerCase() === "neon") {
      try {
        const attachments = await new AttachmentService(getPostgresClient(), context.userId).forMessages(messages.map((m) => m.id));
        return messages.map((m) => ({ ...m, attachments: attachments[m.id] ?? [] }));
      } catch {
        return messages.map((m) => ({ ...m, attachments: [] }));
      }
    }
    return messages;
  });

const attachmentInput = z.object({ conversation_id: z.string().uuid(), filename: z.string(), mime_type: z.string(), file_size: z.number().int() });
export const startAttachmentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => attachmentInput.parse(data))
  .handler(({ data, context }) => new AttachmentService(getPostgresClient(), context.userId).start(data));
export const confirmAttachmentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ attachment_id: z.string().uuid() }).parse(data))
  .handler(({ data, context }) => new AttachmentService(getPostgresClient(), context.userId).confirm(data.attachment_id));
export const getAttachmentAccessUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ attachment_id: z.string().uuid() }).parse(data))
  .handler(({ data, context }) => new AttachmentService(getPostgresClient(), context.userId).access(data.attachment_id));
export const sendAttachmentMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid(), body: z.string().max(4000).default(""), attachment_ids: z.array(z.string().uuid()).min(1).max(10), client_id: z.string().max(64).optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const message = await new AttachmentService(getPostgresClient(), context.userId).send(data);
    await postCommitPublisher.messageCreated(message);
    return message;
  });

export const getMessagesByIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<MessageRow[]> => {
    const messages = await app(context).messages.getByIds(data.ids);
    if (messages.length && process.env.DATA_REPOSITORY_DRIVER?.toLowerCase() === "neon") {
      try {
        const attachments = await new AttachmentService(getPostgresClient(), context.userId).forMessages(messages.map((m) => m.id));
        return messages.map((m) => ({ ...m, attachments: attachments[m.id] ?? [] }));
      } catch {
        return messages.map((m) => ({ ...m, attachments: [] }));
      }
    }
    return messages;
  });

export const hideMessageForMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ message_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).messages.hide(data.message_id));

export const deleteMessageForEveryone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ message_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    if (process.env.DATA_REPOSITORY_DRIVER?.toLowerCase() === "neon") await new AttachmentService(getPostgresClient(), context.userId).cleanupForMessage(data.message_id);
    return app(context).messages.deleteForEveryone(data.message_id);
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
        client_id: z.string().max(64).optional(),
        reply_to_id: z.string().uuid().optional().nullable(),
        forwarded_from_id: z.string().uuid().optional().nullable(),
        is_vanish: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<MessageRow> => {
    const message = await app(context).messages.send(data);
    await postCommitPublisher.messageCreated(message);
    return message;
  });

export const editMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z
      .object({
        message_id: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<MessageRow> =>
    app(context).messages.edit(data.message_id, data.body),
  );

export const forwardMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z
      .object({
        message_ids: z.array(z.string().uuid()).min(1).max(50),
        conversation_ids: z.array(z.string().uuid()).min(1).max(20),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    app(context).messages.forward(data.message_ids, data.conversation_ids),
  );

export const getMessageInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ message_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).messages.getInfo(data.message_id));

export const searchMessagesInConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        q: z.string().trim().min(1).max(100),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<MessageRow[]> =>
    app(context).messages.searchInConversation(data.conversation_id, data.q),
  );

export const searchMessagesGlobal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ q: z.string().trim().min(1).max(100) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<GlobalHit[]> => app(context).messages.searchGlobal(data.q));

export const toggleReaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z
      .object({
        message_id: z.string().uuid(),
        emoji: z.string().min(1).max(24),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => app(context).reactions.toggle(data.message_id, data.emoji));

export const listReactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ conversation_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<ReactionRow[]> =>
    app(context).reactions.listForConversation(data.conversation_id),
  );

export const closeVanishSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    // Only participants can do this, so check membership first to prevent abuse
    await app(context).conversations.get(data.conversation_id);
    return { ok: true };
  });

export const pingVanishSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await app(context).conversations.get(data.conversation_id);
    if (process.env.DATA_REPOSITORY_DRIVER?.toLowerCase() === "neon") {
       await getPostgresClient()`UPDATE public.conversations SET vanish_session_active_until = NOW() + INTERVAL '30 seconds' WHERE id = ${data.conversation_id}`;
    }
    return { ok: true };
  });

export const finalizeVanishSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await app(context).conversations.get(data.conversation_id);
    if (process.env.DATA_REPOSITORY_DRIVER?.toLowerCase() === "neon") {
       await getPostgresClient()`UPDATE public.conversations SET vanish_session_active_until = NOW() - INTERVAL '1 minute' WHERE id = ${data.conversation_id}`;
       await cleanupVanishMessages();
    }
    return { ok: true };
  });

export const toggleDisappearingMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid(), enabled: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    await app(context).conversations.get(data.conversation_id);
    if (process.env.DATA_REPOSITORY_DRIVER?.toLowerCase() === "neon") {
       await app(context).conversations.setDisappearingMessages!(data.conversation_id, data.enabled);
    }
    return { ok: true };
  });

export const listPins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ conversation_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => app(context).pins.list(data.conversation_id));

export const pinMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        message_id: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    app(context).pins.pin(data.conversation_id, data.message_id),
  );

export const unpinMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        message_id: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    app(context).pins.unpin(data.conversation_id, data.message_id),
  );

export const toggleStar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ message_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).stars.toggle(data.message_id));

export const listMyStarred = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => app(context).stars.listMine());

export const listMyStarIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ conversation_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => app(context).stars.listIdsInConversation(data.conversation_id));

export const markRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        up_to_created_at: z
          .string()
          .optional()
          .transform((val) => {
            if (!val) return new Date().toISOString();
            const d = new Date(val);
            return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
          }),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    app(context).messages.markRead(data.conversation_id, data.up_to_created_at),
  );

export const listMyMessageReceipts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ conversation_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => app(context).messages.listMyReceipts(data.conversation_id));

export const setConversationFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        pinned: z.boolean().optional(),
        muted: z.boolean().optional(),
        archived: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { conversation_id, ...patch } = data;
    return app(context).conversations.setFlags(conversation_id, patch);
  });

export const markConversationUnread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.markUnread(data.conversation_id));

export const leaveConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.leave(data.conversation_id));

export const blockContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.blockContact(data.user_id));

export const listBlockedContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => app(context).conversations.listBlocked());

export const unblockContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).conversations.unblockContact(data.user_id));
