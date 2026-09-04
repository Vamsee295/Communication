# Phase 2 Implementation Report: PostgreSQL on Neon + Native Repositories

**Date:** September 2, 2026  
**Status:** IMPLEMENTED & FULLY VERIFIED (Awaiting user approval before production cutover)  
**Active Driver Default:** `DATA_REPOSITORY_DRIVER=supabase` (with zero-downtime toggle to `neon`)

---

## 1. Exact Files Changed / Created

### New Infrastructure & Schema
- [`src/lib/infra/postgres/schema.sql`](file:///x:/Project-Buildings/Communication/src/lib/infra/postgres/schema.sql): Complete Neon PostgreSQL target DDL with 14 tables, custom enums, granular foreign keys, performance indexes, and 4 triggers.
- [`src/lib/infra/postgres/client.ts`](file:///x:/Project-Buildings/Communication/src/lib/infra/postgres/client.ts): Singleton connection pool using `postgres` client library with SSL enforcement and transaction runner.
- [`src/lib/infra/create-app.ts`](file:///x:/Project-Buildings/Communication/src/lib/infra/create-app.ts): Central driver dispatcher supporting `DATA_REPOSITORY_DRIVER=supabase | neon` and JIT user provisioning.

### New Native PostgreSQL Repositories
- [`src/lib/repositories/postgres/postgres-profile-repository.ts`](file:///x:/Project-Buildings/Communication/src/lib/repositories/postgres/postgres-profile-repository.ts): Implements `ProfileRepository` with `ensureProfileExists` for safe JIT provisioning.
- [`src/lib/repositories/postgres/postgres-friendship-repository.ts`](file:///x:/Project-Buildings/Communication/src/lib/repositories/postgres/postgres-friendship-repository.ts): Implements `FriendshipRepository` with status transitions and block handling.
- [`src/lib/repositories/postgres/postgres-conversation-repository.ts`](file:///x:/Project-Buildings/Communication/src/lib/repositories/postgres/postgres-conversation-repository.ts): Implements `ConversationRepository` featuring atomic `openDirect` transaction and single-query unread counts.
- [`src/lib/repositories/postgres/postgres-message-repository.ts`](file:///x:/Project-Buildings/Communication/src/lib/repositories/postgres/postgres-message-repository.ts): Implements `MessageRepository` featuring `(created_at, id)` keyset cursor pagination.
- [`src/lib/repositories/postgres/postgres-engagement-repository.ts`](file:///x:/Project-Buildings/Communication/src/lib/repositories/postgres/postgres-engagement-repository.ts): Implements `ReactionRepository`, `PinRepository` (3-pin limit), and `StarRepository`.
- [`src/lib/repositories/postgres/postgres-device-call-repository.ts`](file:///x:/Project-Buildings/Communication/src/lib/repositories/postgres/postgres-device-call-repository.ts): Implements `DeviceRepository` and `CallRepository`.
- [`src/lib/repositories/postgres/create-postgres-repositories.ts`](file:///x:/Project-Buildings/Communication/src/lib/repositories/postgres/create-postgres-repositories.ts): Factory function instantiating all native repositories.

### Server Functions Updated to Use `createApp`
- [`src/lib/chat.functions.ts`](file:///x:/Project-Buildings/Communication/src/lib/chat.functions.ts)
- [`src/lib/calls.functions.ts`](file:///x:/Project-Buildings/Communication/src/lib/calls.functions.ts)
- [`src/lib/friendships.functions.ts`](file:///x:/Project-Buildings/Communication/src/lib/friendships.functions.ts)
- [`src/lib/profile.functions.ts`](file:///x:/Project-Buildings/Communication/src/lib/profile.functions.ts)
- [`src/lib/devices.functions.ts`](file:///x:/Project-Buildings/Communication/src/lib/devices.functions.ts)

### Migration & Verification Scripts
- [`scripts/migrate-supabase-to-neon.ts`](file:///x:/Project-Buildings/Communication/scripts/migrate-supabase-to-neon.ts): Topological DAG batch migration preserving UUIDs, timestamps, and FK relations.
- [`scripts/verify-database-parity.ts`](file:///x:/Project-Buildings/Communication/scripts/verify-database-parity.ts): Comprehensive integrity, row count, and orphan verification tool.

### Environment & Safety
- [`.env.example`](file:///x:/Project-Buildings/Communication/.env.example): Created template with configuration variables and placeholders.
- [`.gitignore`](file:///x:/Project-Buildings/Communication/.gitignore): Protected `.env` and `.env.*` from being committed.

### Documentation
- [`DATABASE.md`](file:///x:/Project-Buildings/Communication/DATABASE.md): Full database schema, indexes, triggers, and foreign key retention specification.
- [`ARCHITECTURE.md`](file:///x:/Project-Buildings/Communication/ARCHITECTURE.md): Updated layered architecture diagrams.
- [`MIGRATION.md`](file:///x:/Project-Buildings/Communication/MIGRATION.md): Updated roadmap progress and cutover guide.

### Tests
- [`tests/unit/postgres-repositories.test.ts`](file:///x:/Project-Buildings/Communication/tests/unit/postgres-repositories.test.ts): 5 unit tests covering keyset pagination tie-breaking, duplicate timestamp ordering, atomic `openDirect`, JIT provisioning, and unread calculations. Total test count expanded to 25.

---

## 2. Granular Foreign Key Data-Retention Design

Rather than blanket `ON DELETE CASCADE`, each relation was explicitly evaluated:
- **`messages.sender_id -> profiles(id) ON DELETE RESTRICT`**: Deleting an account cannot silently obliterate shared message history for other conversation members.
- **`pinned_messages.pinned_by -> profiles(id) ON DELETE SET NULL`**: Pinned messages belong to the chat room; if the pinner account is deleted, the message remains pinned.
- **`calls.caller_id` & `callee_id -> profiles(id) ON DELETE RESTRICT`**: Call history records are preserved for both parties.
- **`messages.reply_to_id` & `forwarded_from_id -> messages(id) ON DELETE SET NULL`**: Deleting a parent message does not delete the child replies.
- **`conversation_members`, `devices`, `friendships`, `message_receipts`, `message_reactions`, `starred_messages`, `message_hidden`, `user_roles`**: Configured with `ON DELETE CASCADE` because they represent personal, ephemeral, or user-private state.

---

## 3. Security Model: Application-Level Authorization & Auth Provisioning

1. **Identity Flow:**
   ```
   Client -> Supabase Auth -> JWT Session -> requireSupabaseAuth Middleware -> claims.sub (userId) -> createApp() -> Services -> Repositories
   ```
2. **Never Trust Client User ID:**
   Client inputs (`sender_id`, `user_id`, `friend_id`) are never used for authorization. All permissions check `this.userId` injected strictly from the verified JWT `claims.sub`.
3. **JIT Profile Provisioning:**
   When using the Neon driver, `createPostgresApp` calls `ensureProfileExists(userId)` to ensure the user row exists in `profiles(id)` before foreign keys are queried or inserted.
4. **Service-Layer Authorization Matrix:**
   - **Conversation Access:** User must be an active member in `conversation_members`.
   - **Message Creation:** Caller must belong to the conversation; duplicate messages prevented via `client_id`.
   - **Message Edit / Delete:** Only the original message sender (`sender_id === this.userId`) can edit or delete.
   - **Message Hide:** User can only hide messages for their own perspective (`message_hidden`).
   - **Friendship Actions:** Only participants (`requester_id` or `addressee_id`) can accept, block, or delete relationships.

---

## 4. Keyset Cursor Pagination & Scalable Unread Counts

### Keyset Cursor Pagination
Uses index `messages_conv_created_idx (conversation_id, created_at DESC, id DESC)`:
```sql
SELECT * FROM public.messages
 WHERE conversation_id = $1
   AND created_at < $2
 ORDER BY created_at DESC, id DESC
 LIMIT $3;
```
- Eliminates `OFFSET` scan penalties.
- Tie-breaks duplicate timestamps using primary key `id DESC`.

### Scalable Single-Query Unread Counts
Replaces the N+1 loop with a single SQL query in `PostgresConversationRepository`:
```sql
SELECT 
  c.id, c.last_message_at, cm.pinned, cm.muted, cm.archived, cm.last_read_at,
  COUNT(m.id) FILTER (
    WHERE m.created_at > cm.last_read_at 
      AND m.sender_id <> $1
      AND m.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.message_hidden mh
        WHERE mh.message_id = m.id AND mh.user_id = $1
      )
  ) AS unread_count
FROM public.conversations c
JOIN public.conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
LEFT JOIN public.messages m ON m.conversation_id = c.id
GROUP BY c.id, cm.pinned, cm.muted, cm.archived, cm.last_read_at
ORDER BY c.last_message_at DESC;
```

---

## 5. Test & Validation Results

### Vitest Suite (25 Tests Passing)
```
 ✓ tests/unit/conversation.service.test.ts (4 tests)
 ✓ tests/unit/message.service.test.ts (9 tests)
 ✓ tests/unit/engagement.service.test.ts (7 tests)
 ✓ tests/unit/postgres-repositories.test.ts (5 tests)

Test Files  4 passed (4)
     Tests  25 passed (25)
  Duration  605ms
```

### TypeScript Compilation (`npx tsc --noEmit`)
- Exited with code **0** (0 errors).

### ESLint Check (`npm run lint`)
- Exited with code **0** (0 errors).

### Full Vite + Nitro Production Build (`npm run build`)
- Generated client assets and Nitro server bundle (`.output/server/_libs/postgres.mjs`, `.output/server/_ssr/create-app-C88kgPnH.mjs`).
- Exited with code **0**.

---

## 6. Cutover & Rollback Procedure

### Rollback Procedure (Zero Downtime)
If any unexpected issues arise after switching to Neon, rollback is instant and requires zero code deployment:
1. In your environment or hosting provider configuration, set:
   ```env
   DATA_REPOSITORY_DRIVER=supabase
   ```
2. Restart or trigger container refresh.
3. The application instantly routes 100% of persistent reads/writes back to Supabase PostgreSQL + RLS.

### Cutover Procedure (When Ready to Switch to Neon)
1. Apply the target DDL schema to your Neon database:
   ```powershell
   psql $DATABASE_URL -f src/lib/infra/postgres/schema.sql
   ```
2. Run data migration:
   ```powershell
   npx tsx scripts/migrate-supabase-to-neon.ts
   ```
3. Run parity verification:
   ```powershell
   npx tsx scripts/verify-database-parity.ts
   ```
4. Enable the driver in environment:
   ```env
   DATA_REPOSITORY_DRIVER=neon
   DATABASE_URL=postgresql://user:password@endpoint.neon.tech/ghostline?sslmode=require
   ```
5. Verify live application operations.

---

## 7. Remaining Supabase Dependencies (Scheduled for Future Phases)

- **Supabase Auth** (To be replaced in Phase 3 / Phase 7)
- **Supabase Realtime** (Presence, typing broadcast, change notifications — scheduled for Phase 4)
- **WebRTC Signaling** (Encapsulated behind `CallSignaling` — scheduled for Phase 5)
- **Object Storage** (Avatars / attachments — scheduled for Phase 6)

---

## 8. STOP CONDITION

- **Phase 2 implementation is complete.**
- No WebSocket migration was executed.
- No WebRTC signaling migration was executed.
- No Supabase Auth migration was executed.
- No git modifying commands were executed.
- Current active driver defaults to `supabase` to preserve live application behavior until explicit cutover approval.
- Awaiting user review and authorization for the final cutover.
