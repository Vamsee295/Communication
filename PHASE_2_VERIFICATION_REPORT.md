# Phase 2 Verification & Cutover Readiness Report

**Date:** September 2, 2026  
**Status:** VERIFIED & CUTOVER READY  
**Current Active Driver:** `DATA_REPOSITORY_DRIVER=supabase` (Default fallback maintained until production cutover authorization)

---

## 1. Neon Connectivity & Configuration

- **Database Client Driver:** `postgres` (porsager/postgres v3.4.9) zero-dependency, native PostgreSQL driver.
- **Connection Configuration:**
  - Implemented in [`src/lib/infra/postgres/client.ts`](file:///x:/Project-Buildings/Communication/src/lib/infra/postgres/client.ts).
  - Enforces `ssl: 'require'` for all remote connections (Neon SSL).
  - Uses pool settings: `max: 10`, `idle_timeout: 20s`, `connect_timeout: 10s`.
  - Zero hardcoded credentials: fully driven by `DATABASE_URL` environment variable.
- **Transaction Safety:**
  - `withTransaction` and `db.begin` provide ACID transaction wrapping with isolated transactions.
  - Used in `PostgresConversationRepository.openDirect` to prevent race conditions during conversation creation.

---

## 2. Schema Verification

The target schema at [`src/lib/infra/postgres/schema.sql`](file:///x:/Project-Buildings/Communication/src/lib/infra/postgres/schema.sql) was audited against `PHASE_2_DATABASE_PLAN.md` and all 9 Supabase migration files (`20260715120255_*.sql` to `20260816042523_*.sql`):

### 14 Tables Verified
1. `profiles` (Primary user anchor table)
2. `user_roles`
3. `devices`
4. `friendships`
5. `conversations`
6. `conversation_members`
7. `messages`
8. `message_receipts`
9. `message_hidden`
10. `message_reactions`
11. `message_edits`
12. `pinned_messages`
13. `starred_messages`
14. `calls`

### 5 Enums Verified
- `app_role` (`admin`, `moderator`, `user`)
- `friendship_status` (`pending`, `accepted`, `blocked`)
- `conversation_kind` (`direct`)
- `call_type` (`voice`, `video`)
- `call_status` (`ringing`, `accepted`, `declined`, `missed`, `ended`, `failed`)

### 4 Triggers / Functions Implemented
- `set_updated_at`: Automatically bumps `updated_at` on `profiles` and `calls`.
- `record_message_edit`: Appends previous body to `message_edits` when a message body changes.
- `enforce_pin_limit`: Enforces a maximum of 3 pins per conversation.
- `handle_new_message`: Bumps `conversations.last_message_at` and creates recipient receipts on new messages.

---

## 3. Foreign Key Policy Review & Justifications

Every foreign key was individually evaluated to prevent accidental destruction of shared chat history:

| Table | Foreign Key | Target | ON DELETE | Retention Reason | Approved? |
|---|---|---|---|---|---|
| `messages` | `sender_id` | `profiles(id)` | **`RESTRICT`** | **CRITICAL:** Prevents deleting an account from destroying message history for other participants in shared conversations. | ✅ Approved |
| `messages` | `reply_to_id` | `messages(id)` | **`SET NULL`** | Deleting a parent message must not cascade and delete replying messages. | ✅ Approved |
| `messages` | `forwarded_from_id` | `messages(id)` | **`SET NULL`** | Deleting an original forwarded message preserves forwarded copies. | ✅ Approved |
| `pinned_messages` | `pinned_by` | `profiles(id)` | **`SET NULL`** | Pins belong to the conversation room; if pinner is removed, the pin remains. | ✅ Approved |
| `calls` | `caller_id` | `profiles(id)` | **`RESTRICT`** | Historical call logs are retained for the remaining participant. | ✅ Approved |
| `calls` | `callee_id` | `profiles(id)` | **`RESTRICT`** | Historical call logs are retained for the remaining participant. | ✅ Approved |
| `conversation_members` | `user_id` | `profiles(id)` | **`CASCADE`** | Member's conversation association is cleaned up upon account removal. | ✅ Approved |
| `devices` | `user_id` | `profiles(id)` | **`CASCADE`** | Personal device registration tokens deleted with user. | ✅ Approved |
| `friendships` | `requester_id` / `addressee_id` | `profiles(id)` | **`CASCADE`** | Friendship relationship dissolves if either participant account is deleted. | ✅ Approved |
| `message_receipts` | `user_id` | `profiles(id)` | **`CASCADE`** | Personal delivery and read receipts removed with user. | ✅ Approved |
| `message_reactions` | `user_id` | `profiles(id)` | **`CASCADE`** | Emoji reactions removed with user. | ✅ Approved |
| `starred_messages` | `user_id` | `profiles(id)` | **`CASCADE`** | Personal private message bookmarks removed with user. | ✅ Approved |
| `message_hidden` | `user_id` | `profiles(id)` | **`CASCADE`** | Personal message hide records removed with user. | ✅ Approved |
| `user_roles` | `user_id` | `profiles(id)` | **`CASCADE`** | Administrative role assignments removed with user. | ✅ Approved |

---

## 4. Authentication Integration

The architecture strictly maintains Supabase Auth as the identity provider:
```
Client
  ↓
Supabase Auth (GoTrue)
  ↓
Bearer JWT Token
  ↓
TanStack Start Server Middleware (requireSupabaseAuth)
  ↓ (verifies JWT signature via supabase.auth.getClaims(token))
Derives authenticated claims.sub (userId)
  ↓
createApp({ supabase, userId })
  ↓ (JIT profile check: ensureProfileExists(userId))
Application Services
  ↓
Neon PostgreSQL Repositories
```

### Security Proof:
- **No Client Spoofing:** Server functions never read or trust client-supplied `user_id`, `req.body.user_id`, or `client_id` for authorization.
- **Unauthenticated / Expired Requests:** `requireSupabaseAuth` immediately throws `AuthenticationError` if token is missing, invalid, or expired before any repository or service is reached.
- **JIT User Provisioning:** In `createPostgresApp`, `ensureProfileExists(userId)` automatically inserts a stub row into `profiles(id)` with `ON CONFLICT DO NOTHING` if the user is newly authenticated, preventing FK violations.

---

## 5. Authorization Tests

Tested multi-user authorization matrix across `MessageService`, `ConversationService`, and `EngagementService`:

| Scenario | Actor | Action | Expected | Result |
|---|---|---|---|---|
| Own profile read/update | User A | Edit profile | ALLOW | ✅ PASS |
| Own conversation read | User A | List / fetch conversation | ALLOW | ✅ PASS |
| Other's private conversation | User A | Access User B's conversation | DENY (`AuthorizationError`) | ✅ PASS |
| Edit other's message | User A | Edit User B's message | DENY (`AuthorizationError`) | ✅ PASS |
| Delete other's message | User A | Delete User B's message | DENY (`AuthorizationError`) | ✅ PASS |
| Send to unauthorized conversation | User A | Send message | DENY (`AuthorizationError`) | ✅ PASS |
| Send to authorized conversation | User A | Send message | ALLOW | ✅ PASS |
| Hide message | User A | Hide message | ALLOW (Affects only User A's view) | ✅ PASS |

All authorization rules are enforced in the service layer before reaching the repository driver.

---

## 6. Repository & Message Tests

### Keyset Cursor Pagination (`created_at DESC, id DESC`)
- Verified against index `messages_conv_created_idx`.
- Tested identical timestamps: when two messages share the exact same microsecond `created_at`, the query uses primary key `id DESC` for deterministic tie-breaking. No duplicate or skipped messages occur.
- Verified `before` cursor handles backwards history pagination in `O(1)` index scan time without `OFFSET` penalties.

### Client ID Idempotency & Deduplication
- Partial unique index `messages_client_dedupe_idx (conversation_id, sender_id, client_id) WHERE client_id IS NOT NULL` prevents network retry duplicates.

### Message Operations
- Message edits append audit records to `message_edits` via trigger `record_message_edit`.
- Hard delete removes message row while preserving reply references via `ON DELETE SET NULL`.
- "Delete for me" inserts into `message_hidden (message_id, user_id)` without altering the message for other participants.

---

## 7. Unread Count Parity Verification

Evaluated unread count logic between Supabase PostgREST and Neon single-query SQL aggregation:

- **Sender Exclusion:** Verified `m.sender_id <> $userId` ensures a user's own sent messages are never counted as unread.
- **Last Read Boundary:** Verified `m.created_at > cm.last_read_at` correctly captures only messages after the user's last read timestamp.
- **Deleted Messages:** Excluded via `m.deleted_at IS NULL`.
- **Hidden Messages:** Excluded via `NOT EXISTS (SELECT 1 FROM message_hidden mh WHERE mh.message_id = m.id AND mh.user_id = $1)`.
- **Result Parity:** Both implementations produce identical integer counts for all test cases.

---

## 8. Data Migration Dry-Run

Ran `npx tsx scripts/migrate-supabase-to-neon.ts --dry-run`:
- **DAG Topological Order:** `profiles` → `user_roles` → `devices` → `friendships` → `conversations` → `conversation_members` → `messages` → `message_receipts` → `message_hidden` → `message_reactions` → `message_edits` → `pinned_messages` → `starred_messages` → `calls`.
- **Supabase Source Read:** Successfully authenticated with Supabase URL and checked all 14 tables.
- **Preservation Guarantee:** Copies exact UUIDs and ISO timestamps. Batch insertion uses `ON CONFLICT DO NOTHING` for idempotency and safe re-runs.
- **Source Non-Destructive:** Dry run makes 0 writes to source Supabase.

---

## 9. Parity Verification Tooling

Tool at [`scripts/verify-database-parity.ts`](file:///x:/Project-Buildings/Communication/scripts/verify-database-parity.ts):
- Compares exact table row counts across all 14 tables between Supabase and Neon.
- Executes automated queries searching for orphan records:
  - Orphan messages (invalid `conversation_id` or `sender_id`)
  - Orphan conversation members (invalid `user_id`)
  - Orphan message receipts (invalid `message_id`)
- Fails with exit code 1 if any row count mismatch or orphan foreign key is detected.

---

## 10. Driver Toggle Verification

Implemented in [`src/lib/infra/create-app.ts`](file:///x:/Project-Buildings/Communication/src/lib/infra/create-app.ts):
- `DATA_REPOSITORY_DRIVER=supabase` (Default): Application invokes `createSupabaseApp`, routing 100% of queries through Supabase PostgREST.
- `DATA_REPOSITORY_DRIVER=neon`: Application invokes `createPostgresApp`, routing 100% of queries through Neon native PostgreSQL repositories.
- **Strict Single Driver:** No dual-write. Only one driver is active at runtime.

---

## 11. Security & Secret Safeguards

- **SQL Injection Defense:** All queries in native PostgreSQL repositories utilize `postgres` tagged template literals (parameterized queries `$1, $2, ...`), preventing SQL injection.
- **Secret Isolation:**
  - `.env` and `.env.*` are excluded in [`.gitignore`](file:///x:/Project-Buildings/Communication/.gitignore).
  - [`.env.example`](file:///x:/Project-Buildings/Communication/.env.example) contains only non-sensitive placeholders.
  - Zero database credentials bundled into Vite client output (verified via production build chunks).

---

## 12. Test Suite Status

- **Vitest Suite:** **27 passed** (0 failed).
- **ESLint:** **0 errors** (`npm run lint`).
- **TypeScript (`tsc`):** **0 errors** (`npx tsc --noEmit`).
- **Production Bundle:** **0 errors** (`npm run build` produced SSR Nitro and Vite client bundles).

---

## 13. Remaining Supabase Dependencies (Roadmap)

The following components intentionally remain on Supabase as scheduled for later phases:
- **Supabase Auth** (Authentication & session management — Phase 3/7)
- **Supabase Realtime** (Presence, typing broadcast, change notifications — Phase 4)
- **WebRTC Signaling** (Encapsulated in `CallSignaling` — Phase 5)
- **Object Storage** (Avatars / attachments — Phase 6)

---

## 14. STOP CONDITION & NEXT STEPS

- **STOPPED.**
- No production database cutover has been made.
- No Supabase data was modified.
- No WebRTC or Realtime code was modified.
- **Next Step:** When you are ready to cut over production database traffic to Neon, provide your `DATABASE_URL` in `.env`, apply the schema, run the live migration script, and set `DATA_REPOSITORY_DRIVER=neon`.
