# Phase 3: Backend & Authorization Audit Report
**Document:** `PHASE_3_AUTHORIZATION_AUDIT.md`  
**Date:** September 3, 2026  
**Status:** AUDIT COMPLETE — AWAITING USER REVIEW BEFORE CODE MODIFICATION  

---

## Executive Summary

Phase 3 addresses the server-side authorization architecture of Ghostline.

Under the current architecture, authorization is partially distributed across two boundaries:
1. **Application Services (`src/lib/services/*.ts`)**: Enforces specific business rules (e.g., sender-only edit/delete, 3-pin limit, recipient-only decline of friend request).
2. **Supabase Row-Level Security (RLS)**: Protects lower-level data access (e.g., verifying `is_conversation_member` before reading messages or inserting into `pinned_messages`, checking `auth.uid() = caller_id` on calls).

When `DATA_REPOSITORY_DRIVER=neon` is activated, **Supabase RLS is not active**. Therefore, every security guarantee previously delegated to Supabase RLS must be enforced explicitly in the server-side application service layer.

This audit catalogues all 22 server functions across 5 modules, all repository boundaries, all client-supplied parameters, and identifies specific IDOR vulnerabilities and missing checks that must be hardened before Phase 4.

---

## 1. Current Authentication Flow

```
Client (Browser)
  ↓
Request with Header: Authorization: Bearer <JWT>
  ↓
TanStack Start Server Function Middleware: `requireSupabaseAuth`
  ↓
Validates token structure (3 segments)
  ↓
Calls: supabase.auth.getClaims(token)
  ↓
Extracts: data.claims.sub (Verified User UUID)
  ↓
Injects into TanStack Start Server Context:
  context.userId: string
  context.claims: Record<string, unknown>
  context.supabase: AppSupabase
  ↓
Dispatches: createApp(context)
  ↓
Injects context.userId into AppServices & Repositories
```

### Security Findings on Authentication:
- **Verified Identity:** `context.userId` originates strictly from the cryptographically verified JWT (`data.claims.sub`). It cannot be spoofed by modifying query strings or request bodies.
- **Fail-Closed:** If the `Authorization` header is missing, malformed, or has an invalid signature/expired timestamp, `requireSupabaseAuth` throws `AuthenticationError` (401), immediately halting execution before any server function handler runs.

---

## 2. Protected Server Functions Catalog

All 22 server functions in the codebase are protected by `requireSupabaseAuth`:

### `src/lib/chat.functions.ts` (14 endpoints)
1. `openDirectConversation`: POST `{ friend_id: uuid }`
2. `listConversations`: GET `{}`
3. `getConversation`: GET `{ conversation_id: uuid }`
4. `listMessages`: GET `{ conversation_id: uuid, before?: datetime, limit?: int }`
5. `getMessagesByIds`: POST `{ ids: uuid[] }`
6. `hideMessageForMe`: POST `{ message_id: uuid }`
7. `deleteMessageForEveryone`: POST `{ message_id: uuid }`
8. `sendMessage`: POST `{ conversation_id: uuid, body: string, client_id?, reply_to_id?, forwarded_from_id? }`
9. `editMessage`: POST `{ message_id: uuid, body: string }`
10. `forwardMessages`: POST `{ message_ids: uuid[], conversation_ids: uuid[] }`
11. `getMessageInfo`: POST `{ message_id: uuid }`
12. `searchMessagesInConversation`: POST `{ conversation_id: uuid, q: string }`
13. `searchMessagesGlobal`: POST `{ q: string }`
14. `toggleReaction`: POST `{ message_id: uuid, emoji: string }`
15. `listReactions`: GET `{ conversation_id: uuid }`
16. `listPins`: GET `{ conversation_id: uuid }`
17. `pinMessage`: POST `{ conversation_id: uuid, message_id: uuid }`
18. `unpinMessage`: POST `{ conversation_id: uuid, message_id: uuid }`
19. `toggleStar`: POST `{ message_id: uuid }`
20. `listMyStarred`: GET `{}`
21. `listMyStarIds`: GET `{ conversation_id: uuid }`
22. `markRead`: POST `{ conversation_id: uuid, up_to_created_at: datetime }`
23. `listMyMessageReceipts`: GET `{ conversation_id: uuid }`
24. `setConversationFlags`: POST `{ conversation_id: uuid, pinned?, muted?, archived? }`
25. `markConversationUnread`: POST `{ conversation_id: uuid }`
26. `leaveConversation`: POST `{ conversation_id: uuid }`
27. `blockContact`: POST `{ user_id: uuid }`
28. `listBlockedContacts`: GET `{}`
29. `unblockContact`: POST `{ user_id: uuid }`

### `src/lib/calls.functions.ts` (4 endpoints)
1. `createCall`: POST `{ conversation_id: uuid, callee_id: uuid, call_type: "voice" | "video" }`
2. `getCall`: GET `{ call_id: uuid }`
3. `updateCallStatus`: POST `{ call_id: uuid, status, duration_seconds? }`
4. `listCalls`: GET `{}`

### `src/lib/friendships.functions.ts` (4 endpoints)
1. `listFriendships`: GET `{}`
2. `sendFriendRequest`: POST `{ addressee_id: uuid }`
3. `respondToFriendRequest`: POST `{ friendship_id: uuid, action: "accept" | "decline" | "block" }`
4. `removeFriendship`: POST `{ friendship_id: uuid }`

### `src/lib/profile.functions.ts` (3 endpoints)
1. `updateProfile`: POST `{ username?, display_name?, bio?, avatar_url? }`
2. `getMyProfile`: GET `{}`
3. `searchUsers`: POST `{ query: string }`

### `src/lib/devices.functions.ts` (3 endpoints)
1. `registerDevice`: POST `{ device_key, device_name, platform, user_agent? }`
2. `listDevices`: GET `{}`
3. `revokeDevice`: POST `{ device_id: uuid }`

---

## 3. All Client-Controlled IDs & Trust Verification

| Client-Supplied Parameter | Endpoint | Current Usage | Is It Trusted For Authorization? | Audit Verdict |
|---|---|---|:---:|---|
| `friend_id` | `openDirectConversation` | Target friend UUID | No (`this.userId` is caller) | ✅ Safe (Friendship checked) |
| `conversation_id` | `listMessages` | Target conversation | Yes (RLS checked membership) | ⚠️ **IDOR RISK on Neon**: Needs service-level membership check |
| `ids` | `getMessagesByIds` | Target message UUIDs | Yes (RLS filtered inaccessible) | ⚠️ **IDOR RISK on Neon**: Needs service-level message access check |
| `message_id` | `sendMessage.reply_to_id` | Parent message UUID | Unchecked | ⚠️ **CROSS-CHAT RISK**: Must verify parent message is in same conversation |
| `message_ids` | `forwardMessages` | Source message UUIDs | Unchecked | ⚠️ **CROSS-CHAT RISK**: Must verify caller has access to source messages |
| `conversation_ids` | `forwardMessages` | Destination conv UUIDs | Unchecked | ⚠️ **IDOR RISK**: Must verify caller is member of all destination convs |
| `conversation_id` | `listPins`, `pinMessage`, `unpinMessage` | Target conversation | Yes (RLS checked membership) | ⚠️ **IDOR RISK on Neon**: Needs service-level membership check |
| `message_id` | `toggleReaction` | Target message UUID | Yes (RLS checked conv access) | ⚠️ **IDOR RISK on Neon**: Needs service-level check that caller is in message's conv |
| `message_id` | `toggleStar` | Target message UUID | Yes (RLS checked conv access) | ⚠️ **IDOR RISK on Neon**: Needs service-level check that caller is in message's conv |
| `conversation_id` | `markRead` | Target conversation | Yes (RLS checked membership) | ⚠️ **IDOR RISK on Neon**: Needs service-level membership check |
| `conversation_id` | `setConversationFlags` | Target conversation | Yes (Repo queries by `userId`) | ✅ Safe (`WHERE user_id = this.userId`) |
| `call_id` | `getCall` | Target call UUID | Yes (RLS checked participant) | ⚠️ **IDOR RISK on Neon**: Needs service-level check that caller is participant |
| `call_id` | `updateCallStatus` | Target call UUID | Yes (RLS checked participant) | ⚠️ **IDOR RISK on Neon**: Needs service-level check that caller is participant |
| `friendship_id` | `respondToFriendRequest` | Target friendship | Yes (Repo checks addressee) | ✅ Safe (`WHERE addressee_id = this.userId`) |
| `device_id` | `revokeDevice` | Target device | Yes (Repo queries by `userId`) | ✅ Safe (`WHERE user_id = this.userId`) |

---

## 4. Current RLS Dependencies (Vulnerabilities When Running on Neon)

The following 9 security guarantees are currently enforced **only** by Supabase PostgreSQL RLS policies and have **no equivalent check** in the service layer:

1. **`listMessages(conversationId)`**:
   - *Supabase RLS:* `USING (public.is_conversation_member(conversation_id, auth.uid()))`.
   - *Service Layer:* Blindly calls `this.messages.list(conversationId)`.
   - *Neon Risk:* An authenticated User A could pass User B's conversation UUID and read their private messages.
2. **`sendMessage(conversationId)`**:
   - *Supabase RLS:* `WITH CHECK (sender_id = auth.uid() AND public.is_conversation_member(conversation_id, auth.uid()))`.
   - *Service Layer:* Inserts message directly with `sender_id: this.userId` without verifying `this.userId` is in `conversation_members`.
   - *Neon Risk:* User A could inject messages into User B and User C's private conversation.
3. **`getConversation(conversationId)`**:
   - *Supabase RLS:* `USING (public.is_conversation_member(id, auth.uid()))`.
   - *Service Layer:* Reads `this.conversations.getById(conversationId)` without checking membership.
   - *Neon Risk:* User A could view conversation metadata of non-members.
4. **`pinMessage(conversationId, messageId)` & `unpinMessage(conversationId, messageId)`**:
   - *Supabase RLS:* `WITH CHECK (public.is_conversation_member(conversation_id, auth.uid()))`.
   - *Service Layer:* Blindly calls `this.pins.insert(...)` without membership verification.
   - *Neon Risk:* User A could pin or unpin messages in conversations they do not belong to.
5. **`toggleReaction(messageId, emoji)`**:
   - *Supabase RLS:* `WITH CHECK (public.is_conversation_member((SELECT conversation_id FROM messages WHERE id = message_id), auth.uid()))`.
   - *Service Layer:* Blindly inserts into `message_reactions` without checking if caller is in the message's conversation.
   - *Neon Risk:* User A could react to private messages in any conversation.
6. **`toggleStar(messageId)`**:
   - *Supabase RLS:* `WITH CHECK (public.is_conversation_member((SELECT conversation_id FROM messages WHERE id = message_id), auth.uid()))`.
   - *Service Layer:* Toggles star on arbitrary `messageId`.
   - *Neon Risk:* User A could star messages in private conversations they do not belong to.
7. **`createCall(conversation_id, callee_id)`**:
   - *Supabase RLS:* `WITH CHECK (auth.uid() = caller_id AND public.are_friends(caller_id, callee_id) AND public.is_conversation_member(conversation_id, auth.uid()))`.
   - *Service Layer:* Calls `this.calls.insert(...)` without checking conversation membership or friendship status.
   - *Neon Risk:* User A could initiate a call record with any user in any conversation.
8. **`getCall(callId)` & `updateCallStatus(callId, status)`**:
   - *Supabase RLS:* `USING (auth.uid() = caller_id OR auth.uid() = callee_id)`.
   - *Service Layer:* In `updateStatus`, blindly updates `calls` by `id` without checking if `this.userId` is `caller_id` or `callee_id`.
   - *Neon Risk:* User A could terminate or manipulate call status for User B's active call.
9. **`forwardMessages(message_ids, conversation_ids)`**:
   - *Current Code:* Fetches `getByIds(message_ids)` and inserts into `conversation_ids` without checking caller's membership in source or destination conversations.
   - *Neon Risk:* User A could forward messages from conversations they cannot access, or inject messages into unauthorized target conversations.

---

## 5. Status of `user_roles` and Administrative Permissions

- **Schema Existence:** The table `public.user_roles` and enum `app_role ('admin', 'moderator', 'user')` exist in both Supabase migrations and Neon schema.
- **Application Usage:** The application codebase has **zero references** to `user_roles`, `app_role`, or `has_role`. No admin routes, moderator views, or elevated permissions exist in the UI or server functions.
- **Audit Recommendation:** Maintain `user_roles` in schema for future role-based authorization, but **do not invent fake or unused admin features** in Phase 3. Isolate authorization strictly to user-scoped resource ownership and conversation membership.

---

## 6. Recommended Phase 3 Implementation Architecture

To eliminate all 9 IDOR risks and replace Supabase RLS without scattering duplicate queries, we will introduce a centralized authorization policy layer in `src/lib/auth/`:

### A. Central Policy Helper: `src/lib/auth/authorization.ts`
```ts
export class AuthorizationPolicy {
  constructor(private readonly repos: Repositories) {}

  async requireConversationMember(userId: string, conversationId: string): Promise<void>;
  async requireMessageAccess(userId: string, messageId: string): Promise<Message>;
  async requireMessageOwner(userId: string, messageId: string): Promise<Message>;
  async requireCallParticipant(userId: string, callId: string): Promise<Call>;
  async requireFriendshipAccess(userId: string, friendshipId: string): Promise<Friendship>;
}
```

### B. Wire into Application Services
Every service receives the validated `userId` and calls the appropriate policy check before dispatching to repositories:
- `MessageService.list`: Asserts `requireConversationMember(this.userId, conversationId)`.
- `MessageService.send`: Asserts `requireConversationMember(this.userId, input.conversation_id)`. If `reply_to_id` is supplied, asserts parent belongs to `input.conversation_id`.
- `MessageService.forward`: Asserts caller belongs to all destination conversations and has access to all source messages.
- `ReactionService.toggle`: Asserts caller belongs to the message's conversation.
- `PinService.pin` / `unpin`: Asserts caller belongs to `conversationId`.
- `StarService.toggle`: Asserts caller belongs to message's conversation.
- `CallService.create`: Asserts caller is in `conversation_id` and is friends with `callee_id`.
- `CallService.updateStatus`: Asserts caller is `caller_id` or `callee_id`.

---

## 7. Plan Verification & Multi-User Testing Strategy

Expand the test suite in `tests/unit/authorization.test.ts` to test:
1. **User A vs User B Conversation Isolation:**
   - User A reading User B's conversation -> Throws `AuthorizationError`.
   - User A sending to User B's conversation -> Throws `AuthorizationError`.
2. **Message Integrity:**
   - User A editing/deleting User B's message -> Throws `AuthorizationError`.
   - User A replying with a `reply_to_id` from a different conversation -> Throws `ValidationError`.
   - User A forwarding messages from conversations they cannot access -> Throws `AuthorizationError`.
3. **Engagement Isolation:**
   - User A reacting to User B's private message -> Throws `AuthorizationError`.
   - User A pinning in User B's private conversation -> Throws `AuthorizationError`.
   - User A starring User B's private message -> Throws `AuthorizationError`.
4. **Call Security:**
   - User A updating call status on User B and User C's call -> Throws `AuthorizationError`.
   - User A viewing call details of an unauthorized call -> Throws `AuthorizationError`.
5. **Driver Invariance:**
   - Verify that all authorization tests execute identically regardless of whether the driver is `supabase` or `neon`.

---

## 8. STOP CONDITION & NEXT STEP

- **AUDIT COMPLETE.**
- No source code was modified during this audit.
- No git operations were executed.
- Please review this audit report. Once you approve the proposed policy layer and implementation plan, I will proceed to implement the backend authorization hardening.
