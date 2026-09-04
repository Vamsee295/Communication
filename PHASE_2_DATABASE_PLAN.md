# Phase 2 Database Migration Design: Supabase to Neon PostgreSQL

**Document:** `PHASE_2_DATABASE_PLAN.md`  
**Status:** DESIGN & PREPARATION ONLY (Approved for design; implementation blocked pending review)  
**Target Scope:** Persistent Database Migration (PostgreSQL on Neon + Application-Level Authorization + Native Repositories)  
**Retained in Phase 2:** Supabase Auth, Supabase Realtime, WebRTC, TanStack Start Architecture, Existing React 19 UI

---

## Executive Summary

Phase 2 transitions Ghostline's persistent database layer from **Supabase PostgreSQL (with RLS and PostgREST RPC)** to a standard, high-performance **PostgreSQL database hosted on Neon**.

Because Phase 1 cleanly abstracted all data access behind repository interfaces (`src/lib/repositories/ports.ts`) and application services (`src/lib/services/*`), the application layer is already decoupled from Supabase-specific queries. Phase 2 replaces the underlying repository implementations with native PostgreSQL repositories (`PostgresMessageRepository`, `PostgresConversationRepository`, etc.) backed by a connection pool (e.g. `postgres` / `pg` / `kysely` / `drizzle-orm`) and enforces authorization inside application services.

---

## 1. Complete Supabase Database Inventory

This inventory reflects an exact audit of all 9 migration files in `supabase/migrations/` and the live type definitions in `src/integrations/supabase/types.ts`.

### 1.1 Custom Enums

| Enum Name | Values | Used In |
|---|---|---|
| `public.app_role` | `'admin'`, `'moderator'`, `'user'` | `user_roles.role` |
| `public.friendship_status` | `'pending'`, `'accepted'`, `'blocked'` | `friendships.status` |
| `public.conversation_kind` | `'direct'` | `conversations.kind` |
| `public.call_type` | `'voice'`, `'video'` | `calls.call_type` |
| `public.call_status` | `'ringing'`, `'accepted'`, `'declined'`, `'missed'`, `'ended'`, `'failed'` | `calls.status` |

---

### 1.2 Tables and Column Inventory (14 Tables)

#### Table 1: `public.profiles`
- **Columns:**
  - `id`: `UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
  - `username`: `TEXT UNIQUE`
  - `display_name`: `TEXT`
  - `avatar_url`: `TEXT`
  - `bio`: `TEXT`
  - `last_seen`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- **Constraints:**
  - `username_format`: `CHECK (username IS NULL OR (char_length(username) BETWEEN 3 AND 30 AND username ~ '^[a-z0-9_]+$'))`
- **Triggers:**
  - `profiles_set_updated_at`: `BEFORE UPDATE -> public.set_updated_at()`

#### Table 2: `public.user_roles`
- **Columns:**
  - `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `user_id`: `UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
  - `role`: `public.app_role NOT NULL`
  - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- **Constraints:**
  - `UNIQUE (user_id, role)`

#### Table 3: `public.devices`
- **Columns:**
  - `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `user_id`: `UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
  - `device_key`: `TEXT NOT NULL`
  - `device_name`: `TEXT`
  - `platform`: `TEXT NOT NULL DEFAULT 'web'`
  - `user_agent`: `TEXT`
  - `last_seen_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `revoked_at`: `TIMESTAMPTZ`
  - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- **Constraints:**
  - `UNIQUE (user_id, device_key)`

#### Table 4: `public.friendships`
- **Columns:**
  - `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `requester_id`: `UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
  - `addressee_id`: `UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
  - `status`: `public.friendship_status NOT NULL DEFAULT 'pending'`
  - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `responded_at`: `TIMESTAMPTZ`
- **Constraints:**
  - `CHECK (requester_id <> addressee_id)`
  - `UNIQUE (requester_id, addressee_id)`
- **Indexes:**
  - `friendships_requester_idx ON public.friendships(requester_id)`
  - `friendships_addressee_idx ON public.friendships(addressee_id)`

#### Table 5: `public.conversations`
- **Columns:**
  - `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `kind`: `public.conversation_kind NOT NULL DEFAULT 'direct'`
  - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `last_message_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

#### Table 6: `public.conversation_members`
- **Columns:**
  - `conversation_id`: `UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE`
  - `user_id`: `UUID NOT NULL`
  - `joined_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `last_read_at`: `TIMESTAMPTZ NOT NULL DEFAULT 'epoch'`
  - `muted`: `BOOLEAN NOT NULL DEFAULT false`
  - `pinned`: `BOOLEAN NOT NULL DEFAULT false`
  - `archived`: `BOOLEAN NOT NULL DEFAULT false`
- **Constraints:**
  - `PRIMARY KEY (conversation_id, user_id)`
- **Indexes:**
  - `conversation_members_user_idx ON public.conversation_members(user_id)`

#### Table 7: `public.messages`
- **Columns:**
  - `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `conversation_id`: `UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE`
  - `sender_id`: `UUID NOT NULL`
  - `body`: `TEXT NOT NULL` (Constraint: `char_length(body) > 0 AND char_length(body) <= 4000`)
  - `client_id`: `TEXT`
  - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `edited_at`: `TIMESTAMPTZ`
  - `deleted_at`: `TIMESTAMPTZ`
  - `reply_to_id`: `UUID REFERENCES public.messages(id) ON DELETE SET NULL`
  - `forwarded_from_id`: `UUID REFERENCES public.messages(id) ON DELETE SET NULL`
- **Indexes:**
  - `messages_conv_created_idx ON public.messages(conversation_id, created_at DESC, id DESC)`
  - `messages_client_dedupe_idx UNIQUE ON public.messages(conversation_id, sender_id, client_id) WHERE client_id IS NOT NULL`
- **Triggers:**
  - `on_message_created`: `AFTER INSERT -> public.handle_new_message()`
  - `record_message_edit_trg`: `BEFORE UPDATE OF body -> public.record_message_edit()`

#### Table 8: `public.message_receipts`
- **Columns:**
  - `message_id`: `UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE`
  - `user_id`: `UUID NOT NULL`
  - `delivered_at`: `TIMESTAMPTZ`
  - `read_at`: `TIMESTAMPTZ`
- **Constraints:**
  - `PRIMARY KEY (message_id, user_id)`
- **Indexes:**
  - `message_receipts_user_idx ON public.message_receipts(user_id)`

#### Table 9: `public.message_hidden`
- **Columns:**
  - `message_id`: `UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE`
  - `user_id`: `UUID NOT NULL`
  - `hidden_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- **Constraints:**
  - `PRIMARY KEY (message_id, user_id)`
- **Indexes:**
  - `message_hidden_user_idx ON public.message_hidden(user_id)`

#### Table 10: `public.message_reactions`
- **Columns:**
  - `message_id`: `UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE`
  - `user_id`: `UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
  - `emoji`: `TEXT NOT NULL`
  - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- **Constraints:**
  - `PRIMARY KEY (message_id, user_id, emoji)`

#### Table 11: `public.message_edits`
- **Columns:**
  - `id`: `UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY`
  - `message_id`: `UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE`
  - `previous_body`: `TEXT NOT NULL`
  - `edited_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

#### Table 12: `public.pinned_messages`
- **Columns:**
  - `conversation_id`: `UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE`
  - `message_id`: `UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE`
  - `pinned_by`: `UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
  - `pinned_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- **Constraints:**
  - `PRIMARY KEY (conversation_id, message_id)`
- **Triggers:**
  - `enforce_pin_limit_trg`: `BEFORE INSERT -> public.enforce_pin_limit()`

#### Table 13: `public.starred_messages`
- **Columns:**
  - `user_id`: `UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
  - `message_id`: `UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE`
  - `starred_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- **Constraints:**
  - `PRIMARY KEY (user_id, message_id)`

#### Table 14: `public.calls`
- **Columns:**
  - `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `conversation_id`: `UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE`
  - `caller_id`: `UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
  - `callee_id`: `UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
  - `call_type`: `public.call_type NOT NULL DEFAULT 'voice'`
  - `status`: `public.call_status NOT NULL DEFAULT 'ringing'`
  - `started_at`: `TIMESTAMPTZ`
  - `ended_at`: `TIMESTAMPTZ`
  - `duration_seconds`: `INTEGER NOT NULL DEFAULT 0`
  - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- **Indexes:**
  - `calls_caller_idx ON public.calls (caller_id, created_at DESC)`
  - `calls_callee_idx ON public.calls (callee_id, created_at DESC)`
  - `calls_conversation_idx ON public.calls (conversation_id, created_at DESC)`
- **Triggers:**
  - `calls_set_updated_at`: `BEFORE UPDATE -> public.set_updated_at()`

---

### 1.3 Database Functions and RPCs

1. `public.set_updated_at()`: Sets `NEW.updated_at = now()`.
2. `public.handle_new_user()`: Auto-creates `profiles` and `user_roles` records when `auth.users` row is inserted.
3. `public.has_role(_user_id uuid, _role app_role)`: Checks role assignment.
4. `public.is_conversation_member(_conv uuid, _user uuid)`: Returns boolean membership check.
5. `public.are_friends(_a uuid, _b uuid)`: Checks if an accepted friendship exists between `_a` and `_b`.
6. `public.open_direct_conversation(_friend uuid)`: PostgREST RPC function to get or create a direct conversation.
7. `public.handle_new_message()`: Automatically updates `conversations.last_message_at` and fans out unread rows in `message_receipts`.
8. `public.enforce_pin_limit()`: Raises exception if conversation already has 3 pins.
9. `public.record_message_edit()`: Automatically inserts into `message_edits` when a message body is updated.

---

## 2. Table-by-Table Migration Design

Below is the mapping from the current Supabase PostgreSQL table to the Target Neon PostgreSQL table.

| Supabase Table | Neon Table | Target Types / Changes | Foreign Key Strategy |
|---|---|---|---|
| `profiles` | `profiles` | Exact columns preserved. | `id UUID PRIMARY KEY` (Anchor for all user data) |
| `user_roles` | `user_roles` | Exact columns preserved. | `user_id UUID REFERENCES profiles(id) ON DELETE CASCADE` |
| `devices` | `devices` | Exact columns preserved. | `user_id UUID REFERENCES profiles(id) ON DELETE CASCADE` |
| `friendships` | `friendships` | Exact columns preserved. | `requester_id REFERENCES profiles(id)`, `addressee_id REFERENCES profiles(id)` |
| `conversations` | `conversations` | Exact columns preserved. | None |
| `conversation_members` | `conversation_members` | Exact columns preserved. | `conversation_id REFERENCES conversations(id)`, `user_id REFERENCES profiles(id)` |
| `messages` | `messages` | Exact columns preserved. | `conversation_id REFERENCES conversations(id)`, `sender_id REFERENCES profiles(id)` |
| `message_receipts` | `message_receipts` | Exact columns preserved. | `message_id REFERENCES messages(id)`, `user_id REFERENCES profiles(id)` |
| `message_hidden` | `message_hidden` | Exact columns preserved. | `message_id REFERENCES messages(id)`, `user_id REFERENCES profiles(id)` |
| `message_reactions` | `message_reactions` | Exact columns preserved. | `message_id REFERENCES messages(id)`, `user_id REFERENCES profiles(id)` |
| `message_edits` | `message_edits` | Exact columns preserved. | `message_id REFERENCES messages(id)` |
| `pinned_messages` | `pinned_messages` | Exact columns preserved. | `conversation_id REFERENCES conversations(id)`, `message_id REFERENCES messages(id)`, `pinned_by REFERENCES profiles(id)` |
| `starred_messages` | `starred_messages` | Exact columns preserved. | `user_id REFERENCES profiles(id)`, `message_id REFERENCES messages(id)` |
| `calls` | `calls` | Exact columns preserved. | `conversation_id REFERENCES conversations(id)`, `caller_id REFERENCES profiles(id)`, `callee_id REFERENCES profiles(id)` |

---

## 3. Auth User Dependencies

### 3.1 The Problem
In Supabase, `auth.users` is a system table in the `auth` schema managed by GoTrue. Many `public` tables reference `auth.users(id) ON DELETE CASCADE`.
In Neon, the `auth` schema and `auth.users` table do not exist because authentication remains on Supabase Auth during Phase 2.

### 3.2 Evaluation of 3 Options

#### Option A: Create an `auth.users` stub table in Neon
- **Mechanism:** Create schema `auth` and table `auth.users(id UUID PRIMARY KEY, email TEXT, created_at TIMESTAMPTZ)`.
- **Pros:** Preserves existing DDL foreign keys verbatim.
- **Cons:** Fakes an internal Supabase schema in Neon; creates technical debt that must be untangled later when Auth is migrated.

#### Option B: Remove Foreign Keys on `user_id` (Soft References)
- **Mechanism:** Keep `user_id UUID NOT NULL` without foreign key constraints.
- **Pros:** Zero cross-table constraint overhead.
- **Cons:** Loses database-level referential integrity and database-level `ON DELETE CASCADE`.

#### Option C: Make `profiles` the Primary User Anchor Table in Neon (RECOMMENDED)
- **Mechanism:**
  In Ghostline, `public.profiles` has a 1-to-1 relationship with every registered user, using the exact same `UUID` as their Supabase Auth ID.
  In Neon:
  1. `profiles.id` is the primary key representing users.
  2. All other tables (`user_roles`, `devices`, `friendships`, `conversation_members`, `calls`, etc.) declare foreign keys referencing `profiles(id) ON DELETE CASCADE`.
  3. When an authenticated user hits the application, if their profile does not yet exist in Neon (e.g. newly registered via Supabase Auth), the application server layer automatically provisions/upserts their `profiles` row using claims from their validated JWT.
- **Why Option C is Recommended:**
  - 100% database-enforced referential integrity within Neon.
  - Zero mock `auth` schema pollution.
  - Prepares the data architecture cleanly for Phase 3/7 (Auth migration).

---

## 4. RLS Policy Migration to Application Authorization

In Supabase, Postgres RLS inspected `auth.uid()` on every SQL query. In Neon, connection pooling uses an application service database user, so all security checks are enforced in the **Application Services layer** (`src/lib/services/*`).

| Table / Policy | Supabase RLS Rule | Target Application Authorization Enforcement |
|---|---|---|
| `profiles: View` | `authenticated USING (true)` | Handled in `ProfileService.getById`, `searchUsers`. Caller must be authenticated (`requireSupabaseAuth`). |
| `profiles: Insert/Update` | `auth.uid() = id` | `ProfileService.updateMe` always binds target ID strictly to `this.userId` from verified JWT. |
| `friendships: View` | `requester_id = auth.uid() OR addressee_id = auth.uid()` | `FriendshipService.list` passes `this.userId` to `friendships.listForUser(userId)`, returning only caller's friendships. |
| `friendships: Create` | `requester_id = auth.uid() AND requester != addressee` | `FriendshipService.sendRequest` binds `requester_id = this.userId`, validates `addressee !== this.userId`. |
| `friendships: Update/Delete` | `requester_id = auth.uid() OR addressee_id = auth.uid()` | `FriendshipService.respond` & `remove` check that caller is participant before mutation. |
| `conversations: Read` | `is_conversation_member(id, auth.uid())` | `ConversationService.get` and `list` query memberships for `this.userId` first; throws `AuthorizationError` if caller is not a member. |
| `messages: Read` | `is_conversation_member(conversation_id, auth.uid())` | `MessageService.list` verifies caller membership via `ConversationRepository` before returning messages. |
| `messages: Send` | `sender_id = auth.uid() AND is_conversation_member(...)` | `MessageService.send` validates membership and sets `sender_id = this.userId`. Client-supplied sender ID is ignored. |
| `messages: Edit` | `sender_id = auth.uid()` | `MessageService.edit` loads message; if `msg.sender_id !== this.userId`, throws `AuthorizationError`. |
| `messages: Delete` | `sender_id = auth.uid()` | `MessageService.deleteForEveryone` loads message; if `msg.sender_id !== this.userId`, throws `AuthorizationError`. |
| `message_hidden: Insert/Read` | `user_id = auth.uid() AND member(conversation)` | `MessageService.hide` binds `userId = this.userId`. Filter is applied automatically in `MessageService.list`. |
| `message_reactions: Toggle` | `user_id = auth.uid() AND member(conversation)` | `ReactionService.toggle` checks conversation membership and sets `user_id = this.userId`. |
| `pinned_messages: Pin/Unpin` | `is_conversation_member(conversation_id, auth.uid())` | `PinService.pin/unpin` validates caller is conversation member; validates max 3 pins. |
| `starred_messages: Manage` | `user_id = auth.uid() AND is_conversation_member(...)` | `StarService.toggle` verifies caller membership and binds `user_id = this.userId`. |
| `calls: Create/Update` | `caller_id = auth.uid() AND are_friends(...)` | `CallService.create` checks `areFriends(this.userId, calleeId)` and conversation membership. |

---

## 5. RPC & Stored Function Migration

### 5.1 `open_direct_conversation(_friend uuid)`
- **Current Behavior:** Stored PL/pgSQL function executing in transaction: validates friends, finds existing conversation, or inserts `conversations` + `conversation_members`.
- **Target Implementation:**
  Implemented in `PostgresConversationRepository.openDirect(friendId: string)`:
  ```ts
  await db.transaction(async (tx) => {
    // 1. Verify friendship
    const isFriend = await tx.areFriends(this.userId, friendId);
    if (!isFriend) throw new AuthorizationError("Not friends");

    // 2. Find existing direct conversation
    const existing = await tx.findDirectConversationBetween(this.userId, friendId);
    if (existing) return existing.id;

    // 3. Create conversation and memberships atomically
    const conv = await tx.insertConversation({ kind: "direct" });
    await tx.insertMembers([
      { conversation_id: conv.id, user_id: this.userId },
      { conversation_id: conv.id, user_id: friendId },
    ]);
    return conv.id;
  });
  ```

### 5.2 Triggers Migration (Database Triggers vs. Service Logic)
1. **`set_updated_at()`:** Retained as native PostgreSQL trigger in Neon.
2. **`record_message_edit()`:** Retained as a native PostgreSQL trigger (`BEFORE UPDATE OF body ON messages`) to guarantee audit history regardless of query path.
3. **`enforce_pin_limit()`:** Retained as a native trigger and duplicated in `PinService` for fast user feedback.
4. **`handle_new_message()`:**
   - In Supabase, this trigger updated `conversations.last_message_at` and inserted empty `message_receipts`.
   - In Neon, we retain this trigger in SQL for sub-millisecond atomic consistency on message insert.

---

## 6. Message Schema & Delete Semantics Decision

### 6.1 Schema Confirmation
The target `messages` table schema in Neon:
```sql
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 4000),
  client_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  forwarded_from_id UUID REFERENCES public.messages(id) ON DELETE SET NULL
);
```

### 6.2 Hard Delete vs. Soft Delete Decision
- **Current Behavior:**
  When a user deletes a message for everyone, `deleteForEveryone` currently executes a SQL hard `DELETE FROM messages WHERE id = $1`.
- **Target Recommendation:**
  Keep `deleted_at` column in Neon.
  In Phase 2 repository implementation:
  - Phase 2 maintains compatibility with the existing hard DELETE behavior: `hardDelete(id)` remains available and operational.
  - In addition, implement `softDelete(id)`: `UPDATE messages SET deleted_at = now(), body = '' WHERE id = $1`.
  - A feature flag or user decision can switch between hard delete and soft delete with zero schema modification required.

---

## 7. Index Strategy

The following indexes are designed for Neon PostgreSQL to maximize query performance:

```sql
-- 1. Conversation Message Retrieval & Cursor Pagination
-- Crucial: (conversation_id, created_at DESC, id DESC) allows indexed keyset pagination
CREATE INDEX messages_conv_created_idx ON public.messages (conversation_id, created_at DESC, id DESC);

-- 2. Client Deduplication (Idempotency)
CREATE UNIQUE INDEX messages_client_dedupe_idx ON public.messages (conversation_id, sender_id, client_id)
  WHERE client_id IS NOT NULL;

-- 3. Sender Index
CREATE INDEX messages_sender_idx ON public.messages (sender_id, created_at DESC);

-- 4. Foreign Key Lookup Indexes (prevents table scans on cascades & joins)
CREATE INDEX messages_reply_to_idx ON public.messages (reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX messages_forwarded_from_idx ON public.messages (forwarded_from_id) WHERE forwarded_from_id IS NOT NULL;

-- 5. Receipts & Engagement
CREATE INDEX message_receipts_user_idx ON public.message_receipts (user_id);
CREATE INDEX message_receipts_msg_idx ON public.message_receipts (message_id);
CREATE INDEX message_reactions_msg_idx ON public.message_reactions (message_id);
CREATE INDEX message_hidden_user_idx ON public.message_hidden (user_id);
CREATE INDEX pinned_messages_conv_idx ON public.pinned_messages (conversation_id);
CREATE INDEX starred_messages_user_idx ON public.starred_messages (user_id, starred_at DESC);

-- 6. Conversation List & Memberships
CREATE INDEX conversation_members_user_idx ON public.conversation_members (user_id);
CREATE INDEX conversations_last_msg_idx ON public.conversations (last_message_at DESC);

-- 7. Calls History
CREATE INDEX calls_caller_idx ON public.calls (caller_id, created_at DESC);
CREATE INDEX calls_callee_idx ON public.calls (callee_id, created_at DESC);
CREATE INDEX calls_conv_idx ON public.calls (conversation_id, created_at DESC);
```

---

## 8. Pagination Strategy (Keyset Cursor Pagination)

### 8.1 The Flaw in Timestamp-Only Pagination
If multiple messages share the exact same microsecond timestamp, timestamp-only pagination (`created_at < $1`) can skip messages or duplicate them across page boundaries.

### 8.2 Target Keyset Cursor Design
We use a composite cursor of `(created_at, id)`:
- **Cursor Format:** `Base64(JSON({ createdAt: string, id: string }))`
- **SQL Keyset Condition:**
  ```sql
  SELECT * FROM public.messages
   WHERE conversation_id = $1
     AND (created_at, id) < ($2, $3)
   ORDER BY created_at DESC, id DESC
   LIMIT $4;
  ```
- **Benefits:**
  - Guaranteed `O(1)` index seek utilizing `messages_conv_created_idx`.
  - Immune to concurrent inserts shifting offsets.
  - Zero duplicate or skipped messages even if timestamps collide.

---

## 9. Scalable Unread Count Strategy

### 9.1 The Current N+1 Issue
`ConversationService.list()` currently issues:
1. `listMyMemberships` (1 query)
2. `getSummaries` (1 query)
3. `listMembers` (1 query)
4. `listRecentPreview` (1 query)
5. `countUnread` in a loop across all conversation IDs (**N queries!**)

### 9.2 The Single-Query Solution for Neon
In `PostgresConversationRepository.list()`, compute unread counts in a single aggregation query:

```sql
SELECT 
  c.id,
  c.last_message_at,
  cm.pinned,
  cm.muted,
  cm.archived,
  cm.last_read_at,
  COUNT(m.id) FILTER (
    WHERE m.created_at > cm.last_read_at 
      AND m.sender_id <> $1
  ) AS unread_count
FROM public.conversations c
JOIN public.conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
LEFT JOIN public.messages m ON m.conversation_id = c.id
GROUP BY c.id, cm.pinned, cm.muted, cm.archived, cm.last_read_at
ORDER BY c.last_message_at DESC;
```
This replaces `N + 4` queries with **1 query**, reducing database latency by over 90% for active chat accounts.

---

## 10. Data Migration Strategy

### 10.1 Dependency DAG & Migration Sequence
To respect foreign key constraints, data must be exported and imported in strict topological order:

```
1. profiles
   ├── 2. user_roles
   ├── 3. devices
   ├── 4. friendships
   └── 5. conversations
       ├── 6. conversation_members
       └── 7. messages
           ├── 8. message_receipts
           ├── 9. message_hidden
           ├── 10. message_reactions
           ├── 11. message_edits
           ├── 12. pinned_messages
           ├── 13. starred_messages
           └── 14. calls
```

### 10.2 Preserving Data Fidelity
- **UUIDs:** All primary keys and foreign keys are preserved verbatim.
- **Timestamps:** Timestamps must be transferred as ISO-8601 UTC strings without alteration.
- **Foreign Key Enforcement:** During initial batch import, foreign key checks can be temporarily deferred (`SET session_replication_role = 'replica';`) and re-enabled with validation after transfer.

---

## 11. Cutover Strategy

### 11.1 Evaluated Approaches
- **Option A (Maintenance Window / Downtime):** Put application in read-only maintenance mode (5–10 minutes), dump from Supabase, restore to Neon, switch environment variables, verify, and reopen.
- **Option B (Dual-Write):** Application writes to both Supabase and Neon simultaneously for a transitional period. High complexity and risk of desynchronization.
- **Option C (Initial Copy + Fast Catch-up Cutover - RECOMMENDED):**
  1. Perform initial bulk sync from Supabase to Neon while app is running.
  2. Announce a short 2-minute maintenance window.
  3. Pause writes, sync delta (records created after initial sync), update database connection string to Neon, and unpause.

---

## 12. Rollback Strategy

1. **Keep Supabase Active During Phase 2:**
   Supabase PostgreSQL is not decommissioned during Phase 2.
2. **Configuration Toggle:**
   The application will support an environment variable:
   ```env
   DATA_REPOSITORY_DRIVER=neon  # or 'supabase'
   ```
3. **Instant Rollback:**
   If any data integrity or authorization issue arises in Neon, changing `DATA_REPOSITORY_DRIVER=supabase` immediately points the application back to Supabase without redeploying code.

---

## 13. Integration Test Plan

When implementing native PostgreSQL repositories in Phase 2, the following test matrix will be executed against a real PostgreSQL test instance (e.g. Neon preview branch or local Postgres test container):

1. **Authorization Tests:**
   - Non-member querying conversation messages -> throws `AuthorizationError`.
   - Non-sender attempting to edit message -> throws `AuthorizationError`.
   - Non-sender attempting delete-for-everyone -> throws `AuthorizationError`.
   - Non-friend attempting to open direct conversation -> throws `AuthorizationError`.
2. **Message Tests:**
   - Message insertion, client-id idempotency deduplication.
   - Keyset cursor pagination (fetching forward, backward, boundary conditions).
   - Edit trigger: verifies row added to `message_edits` with previous body.
   - Hard delete and hide operations.
3. **Engagement Tests:**
   - Toggle reaction on/off.
   - Pin limits: attempting to insert a 4th pin throws exception.
   - Star listing ordered by `starred_at DESC`.
4. **Conversation Tests:**
   - Atomic `openDirect` handling existing vs new conversation.
   - Single-query unread count calculation accuracy across read/unread states.
5. **Call Tests:**
   - Create call record with caller/callee.
   - Update call status to `accepted` and `ended` with duration calculation.

---

## 14. Risks & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| **Missing Auth User in Neon** | FK violation if user signs up on Supabase Auth and writes to Neon | Application-level JIT upsert into `profiles` upon JWT verification. |
| **Connection Pool Exhaustion** | Server functions exhausting Neon pool on high concurrency | Use `@neondatabase/serverless` driver or PgBouncer pooled connection strings. |
| **Realtime desynchronization** | Supabase Realtime still listens to Supabase Postgres while Neon holds new data | Phase 2 keeps Supabase Realtime bridge or synchronizes change events until Phase 4 (WebSocket). |

---

## 15. Implementation Order for Phase 2

1. **Step 1:** Create target Neon database schema using `001_neon_schema.sql` (incorporating all tables, constraints, and indexes).
2. **Step 2:** Configure database connection layer with connection pooling.
3. **Step 3:** Implement native PostgreSQL repositories (`PostgresMessageRepository`, `PostgresConversationRepository`, etc.) implementing `src/lib/repositories/ports.ts`.
4. **Step 4:** Run full integration test suite comparing Supabase repository behavior against Neon repository behavior.
5. **Step 5:** Execute data migration script from Supabase to Neon and verify data checksums.
6. **Step 6:** Switch active repository driver and monitor application telemetry.

---

## STOP CONDITION NOTICE

This document serves as the **Design and Preparation artifact only**.  
No database has been created, no schemas have been applied to Neon, and no production code has been modified. Phase 2 implementation will begin only upon explicit review and instruction.
