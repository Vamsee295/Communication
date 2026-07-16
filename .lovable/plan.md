# Phase 2 — Real-time 1:1 Chat

Builds on Phase 1's friends graph. At the end of this phase, two accepted friends can open a chat from the Chats tab and exchange text messages in real time, with typing indicators, delivery/read receipts, presence, and unread badges. No media, no E2EE, no disappearing messages yet — those are Phase 3/4.

## Scope

1. **Conversations model** — 1:1 conversations derived from `friendships` (accepted only). No group chat yet.
2. **Messages** — text-only, server-timestamped, ordered, paginated.
3. **Realtime transport** — Supabase Realtime (Postgres changes + broadcast + presence). Same protocol works from Flutter via `supabase_flutter`.
4. **Receipts** — per-recipient `delivered_at` / `read_at`.
5. **Typing indicators** — Realtime broadcast (ephemeral, not stored).
6. **Presence** — online/last-seen via Realtime presence channel + `profiles.last_seen` fallback.
7. **Unread counts** — computed per conversation, surfaced on Chats tab and bottom-nav badge.
8. **UI** — Chats list (last message preview + unread), Chat room (message bubbles, composer, typing dots, receipts, sticky date separators, keyboard-safe layout), presence dot on avatar.
9. **Frontend-agnostic API** — every operation exposed as a `createServerFn` RPC AND a REST route under `src/routes/api/v1/*` sharing a service layer, so a Flutter client hits identical semantics.

## Database (one migration)

```text
conversations
  id, kind ('direct'), created_at, last_message_at

conversation_members
  conversation_id, user_id, joined_at, last_read_at, muted
  PK (conversation_id, user_id)

messages
  id, conversation_id, sender_id, body (text), created_at, edited_at, deleted_at
  index (conversation_id, created_at desc)

message_receipts
  message_id, user_id, delivered_at, read_at
  PK (message_id, user_id)
```

RLS:
- `conversations` / `messages` / `receipts`: readable only if `auth.uid()` is a member (via a `SECURITY DEFINER` helper `is_conversation_member(_conv, _user)` to avoid recursive policies).
- Insert into `messages` only if sender is a member AND the other member is an accepted friend.
- GRANTs to `authenticated` (+ `service_role`); no `anon`.
- `ALTER PUBLICATION supabase_realtime ADD TABLE messages, message_receipts, conversation_members;`
- Trigger: on `messages` insert → update `conversations.last_message_at` and insert `message_receipts` rows for every other member with `delivered_at = null`.

## Server layer (`src/lib/chat.functions.ts` + `src/routes/api/v1/*`)

- `openDirectConversation({ friendId })` — returns existing or creates a `direct` conversation between the two users (guarded by accepted friendship).
- `listConversations()` — my conversations with other-member profile, last message, unread count.
- `listMessages({ conversationId, before?, limit })` — cursor pagination (created_at, id).
- `sendMessage({ conversationId, body, clientId })` — `clientId` for optimistic dedupe.
- `markRead({ conversationId, upToMessageId })` — sets `read_at` on my receipts and bumps `last_read_at`.
- `editMessage` / `deleteMessage` (soft delete) — sender-only, small time window.

All auth-gated via `requireSupabaseAuth`. REST endpoints under `src/routes/api/v1/conversations/*` and `.../messages/*` reuse the same service functions in `src/server/services/chat.ts`.

## Realtime wiring (browser)

Per open chat room, one Supabase channel:
- `postgres_changes` on `messages` filtered by `conversation_id` → append to cache.
- `postgres_changes` on `message_receipts` filtered by my membership → update receipt state.
- `broadcast` event `typing` (throttled to 1/sec, auto-expires after 3s).
- `presence` track `{ user_id }` for online dot in the room header.

One global channel on app mount:
- `postgres_changes` on `messages` (any conversation I'm a member of, filtered client-side by membership set) → invalidate `["conversations"]` and bump unread.
- Global `presence` channel for friends list.

Teardown on unmount (`supabase.removeChannel`) — no leaking subscriptions.

## UI

- **`/chats`** — replaces the current empty state with a real conversation list: avatar (with presence dot), name, last message preview, timestamp, unread pill. Tap → `/chats/$conversationId`.
- **`/chats/$conversationId`** — sticky header (avatar, name, presence, back), virtualized message list (reverse-infinite scroll), date separators, own vs other bubbles, tail grouping, receipt ticks (sent → delivered → read), typing dots row, composer (autosize textarea, send button, Enter-to-send / Shift+Enter newline), keyboard-safe padding for iOS PWA.
- **Chats tab badge** — total unread across conversations, shown on the bottom-nav Chats icon.
- **From `/contacts`** — "Message" button on accepted friend → `openDirectConversation` → navigate to the room.

Motion: message enter (spring), typing dots (staggered), send-button pulse — kept subtle, matches Phase 1 glassmorphism.

## State & caching (TanStack Query)

- Query keys: `["conversations"]`, `["messages", conversationId]`, `["presence", conversationId]`.
- `sendMessage` uses optimistic update keyed by `clientId`; realtime insert reconciles.
- `markRead` fires on room mount + on scroll-to-bottom; debounced.
- Loader on `/chats/$conversationId` prefetches first page + conversation meta.

## Technical details

- Cursor pagination uses `(created_at, id)` composite to avoid dup/skip at page boundaries.
- Message ordering is by server `created_at`; client sorts defensively.
- Typing broadcast payload: `{ user_id, at }`; consumer keeps a `Map<userId, timeoutId>`.
- Presence: single join per channel; `last_seen` in `profiles` updated on join/leave via `onLeave` handler calling a server fn (throttled).
- Receipts trigger runs `SECURITY DEFINER` to bypass RLS during fanout.
- Realtime channel names namespaced: `chat:conv:{id}`, `chat:global:{userId}`.
- Rate limits (server-side): max 20 messages / 10s per user, max 4KB body.
- Zod schemas in `src/shared/schemas/chat.ts` shared by RPC + REST + client forms.

## What's still NOT in Phase 2

Media/attachments, view-once, E2EE, disappearing messages, group chats, message search, push notifications, voice notes, reactions, replies/threads — all later phases.

## Deliverable

Two Phase-1 friends can open a chat from either Chats or Contacts, exchange messages in real time across tabs/devices, see typing + presence + read receipts, and unread counts stay accurate — with the same REST surface a Flutter client can adopt unchanged.
