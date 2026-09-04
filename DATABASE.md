# Ghostline Database Architecture (Neon PostgreSQL)

## Overview

Ghostline's persistent database layer uses **PostgreSQL on Neon**. 

All 14 tables, custom enums, indexes, and triggers are defined in [`src/lib/infra/postgres/schema.sql`](file:///x:/Project-Buildings/Communication/src/lib/infra/postgres/schema.sql).

---

## 1. Schema Inventory & Entity Retention Policies

### User Anchor Table
- **`profiles`**: Anchor table for user identities.
  - `id UUID PRIMARY KEY`: Matches the verified Supabase Auth JWT identity (`claims.sub`).
  - Contains `username`, `display_name`, `avatar_url`, `bio`, `last_seen`, `created_at`, `updated_at`.
  - Check constraint: `username_format` ensures alphanumeric lowercase (3–30 characters).

### Granular Foreign Key Data-Retention Policies

| Table | Foreign Key | Target | On Delete Action | Rationale |
|---|---|---|---|---|
| `messages` | `sender_id` | `profiles(id)` | **`RESTRICT`** | **Prevents accidental deletion of a user from destroying shared communication history.** Threads remain readable. |
| `messages` | `reply_to_id` | `messages(id)` | **`SET NULL`** | Deleting a parent message preserves the reply message body. |
| `messages` | `forwarded_from_id` | `messages(id)` | **`SET NULL`** | Deleting the origin message preserves the forwarded message. |
| `pinned_messages` | `pinned_by` | `profiles(id)` | **`SET NULL`** | **The pin belongs to the conversation.** If the pinner is deleted, the pin remains active. |
| `calls` | `caller_id` | `profiles(id)` | **`RESTRICT`** | **Preserves call records for the other participant.** |
| `calls` | `callee_id` | `profiles(id)` | **`RESTRICT`** | **Preserves call records for the other participant.** |
| `conversation_members`| `user_id` | `profiles(id)` | **`CASCADE`** | Account deletion cleans up membership records. |
| `devices` | `user_id` | `profiles(id)` | **`CASCADE`** | Device tokens are private to that user. |
| `friendships` | `requester_id` / `addressee_id` | `profiles(id)` | **`CASCADE`** | Friendships cease if an account is deleted. |
| `message_receipts` | `user_id` | `profiles(id)` | **`CASCADE`** | Read/delivery receipts are user-specific. |
| `message_hidden` | `user_id` | `profiles(id)` | **`CASCADE`** | Personal hide preferences deleted with user. |
| `message_reactions`| `user_id` | `profiles(id)` | **`CASCADE`** | Emoji reactions deleted with user. |
| `starred_messages` | `user_id` | `profiles(id)` | **`CASCADE`** | Personal bookmarks deleted with user. |
| `user_roles` | `user_id` | `profiles(id)` | **`CASCADE`** | Administrative roles deleted with user. |

---

## 2. Core Indexes & Query Purposes

1. **`messages_conv_created_idx (conversation_id, created_at DESC, id DESC)`**:
   - **Query Purpose**: Powers O(1) keyset cursor pagination for chat history. Composite `(created_at, id)` guarantees unambiguous tie-breaking on identical timestamps.
2. **`messages_client_dedupe_idx (conversation_id, sender_id, client_id) WHERE client_id IS NOT NULL`**:
   - **Query Purpose**: Unique partial index preventing duplicate message creation during network retries (idempotency).
3. **`messages_sender_idx (sender_id, created_at DESC)`**:
   - **Query Purpose**: Sender activity queries, audit lookups, and account deletion checks.
4. **`conversation_members_user_idx (user_id)`**:
   - **Query Purpose**: Fast lookup of all conversations belonging to the authenticated user.
5. **`conversations_last_msg_idx (last_message_at DESC)`**:
   - **Query Purpose**: Sorting conversations in the sidebar by most recent activity.
6. **`message_receipts_user_idx (user_id)` & `message_receipts_msg_idx (message_id)`**:
   - **Query Purpose**: Batch read receipt marking and delivery receipt verification.
7. **`starred_messages_user_idx (user_id, starred_at DESC)`**:
   - **Query Purpose**: Fast listing of a user's starred messages.
8. **`pinned_messages_conv_idx (conversation_id)`**:
   - **Query Purpose**: Retrieving up to 3 pinned messages for a conversation header.
9. **`friendships_requester_idx` & `friendships_addressee_idx`**:
   - **Query Purpose**: Bi-directional friend list retrieval and block list checks.

---

## 3. Database Triggers

- **`set_updated_at`**: Automatically bumps `updated_at = now()` on `profiles` and `calls`.
- **`record_message_edit`**: Appends historical message body snapshots to `message_edits` when a message body is edited, and updates `edited_at`.
- **`enforce_pin_limit`**: Enforces a strict ceiling of **3 pinned messages** per conversation at the database level.
- **`handle_new_message`**: Atomically updates `conversations.last_message_at` and generates initial `message_receipts` for other conversation members upon message insertion.

---

## 4. Keyset Cursor Pagination Specification

Chat message history uses keyset pagination:
```sql
SELECT id, conversation_id, sender_id, body, client_id,
       created_at::text, edited_at::text, deleted_at::text,
       reply_to_id, forwarded_from_id
  FROM public.messages
 WHERE conversation_id = $1
   AND created_at < $2
 ORDER BY created_at DESC, id DESC
 LIMIT $3;
```
- Cursor: ISO timestamp (`before`).
- Tie-breaking: Primary key `id DESC` resolves identical microsecond timestamps.
- Zero OFFSET scanning overhead.

---

## 5. Unread Count Single-Query Optimization

Replaced the Supabase N+1 query loop with a single SQL aggregation query in `PostgresConversationRepository`:
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
This reduces database round trips for the chat list from `N + 4` queries to **1 single query**.
