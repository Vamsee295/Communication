## Phase 3 — Complete 1:1 Messaging

Build the full messaging experience on top of the existing chat foundation. Nothing is encrypted yet — E2EE is Phase 5 per your roadmap.

### Scope (in order)

1. **Emoji reactions** — tap/long-press a bubble → emoji picker (quick set + full picker). One reaction per emoji per user. Reactions render under the bubble with counts; tap to toggle.
2. **Reply** — swipe-right or menu → composer shows a quoted preview. Sent message renders the quoted parent inline and tapping it scrolls to the original.
3. **Edit** — sender-only, menu → composer enters edit mode. Server stamps `edited_at`; bubble shows "edited" label. Edit history retained server-side.
4. **Forward** — menu → sheet listing conversations → send copies with a "Forwarded" tag.
5. **Message info** — menu → sheet with Sent / Delivered / Read timestamps (reuse `message_receipts`).
6. **Search** — search bar in chat list (across conversations) and inside a chat (jump-to-match with highlight).
7. **Pin messages** — per-conversation pins (max 3, like WhatsApp). Pinned bar at top of chat, tap to jump.
8. **Star messages** — personal favorites. New "Starred" screen accessible from Profile.
9. **Multi-select** — long-press enters selection mode → forward / delete / star / copy in bulk.

### Data model

New tables (all with RLS + GRANTs, realtime on where noted):

- `message_reactions(message_id, user_id, emoji)` — unique per triple. **Realtime.**
- `message_edits(id, message_id, previous_body, edited_at)` — append-only history.
- `pinned_messages(conversation_id, message_id, pinned_by, pinned_at)` — max 3 enforced by trigger. **Realtime.**
- `starred_messages(user_id, message_id, starred_at)` — personal.

Column additions to `messages`:
- `reply_to_id uuid` — nullable FK to messages.id
- `forwarded_from_id uuid` — nullable FK (nulled on original delete)
- `edited_at timestamptz` — already implied; ensure column exists

### Server functions (`src/lib/chat.functions.ts` + new modules)

- `toggleReaction({ message_id, emoji })`
- `editMessage({ message_id, body })` — writes to `message_edits`, updates `messages.body` + `edited_at`
- `forwardMessages({ message_ids, conversation_ids })`
- `getMessageInfo({ message_id })` — receipts breakdown
- `searchMessages({ q, conversation_id? })`
- `pinMessage / unpinMessage / listPinned`
- `starMessage / unstarMessage / listStarred`
- Extend `sendMessage` to accept `reply_to_id` and `forwarded_from_id`

### UI

- **Bubble** — refactor into a component with reactions row, quoted-reply header, "edited"/"forwarded" tags, and a context menu (right-click on web, long-press on touch).
- **Composer** — new modes: reply (quoted preview above input), edit (yellow chrome + save/cancel).
- **Chat room** — pinned bar (collapsible), inline search overlay with match navigation, selection mode top bar.
- **Chat list** — search input filtering conversations + matching messages.
- **Profile** — link to `/starred`.

### Not in this phase

- E2EE (Phase 5)
- Media/voice/files (Phase 4)
- Groups
- Disappearing/view-once/hidden chats

### Technical notes

- Backend stays API-first: every action is a `createServerFn` returning plain DTOs, so a future Flutter client hits the same contract.
- Realtime: extend the existing chat channel with subscriptions for `message_reactions` and `pinned_messages` INSERT/DELETE.
- Search uses Postgres `ILIKE` for now (fast enough at MVP scale). Full-text (`tsvector`) can be added later without changing the API shape.
- Reactions/pins/edits/stars all respect existing RLS via `is_conversation_member`.

I'll ship this as one integrated phase, verifying with Playwright at the end. Approve and I'll start with the migration.
