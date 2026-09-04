# Ghostline Architecture Audit (Phase 0)

**Status:** Audit only. No application behavior was changed.  
**Date:** 2026-09-02  
**Scope:** Existing repository as-is (TanStack Start + Supabase).  
**Git:** Inspected only. No add/commit/push.

This document is the Phase 0 inventory required before any migration work. Implementation must not start until this audit is reviewed.

---

## 1. Current architecture

Ghostline is a **full-stack SPA + server-function app**, not a separate API service.

```
Browser (React 19)
  ├─ TanStack Router (file routes)
  ├─ TanStack Query (client cache)
  ├─ Direct Supabase JS client
  │    ├─ Auth (session in localStorage / Lovable preview broker)
  │    ├─ Realtime postgres_changes
  │    ├─ Realtime broadcast (typing, WebRTC signaling)
  │    └─ Presence
  └─ TanStack Start server functions (RPC)
       └─ requireSupabaseAuth middleware
            └─ User-scoped Supabase client (Bearer JWT + RLS)
                 └─ PostgreSQL on Supabase
```

There is **no** `src/services/`, `src/repositories/`, or standalone HTTP API. Domain logic lives in `src/lib/*.functions.ts` as `createServerFn` handlers that query PostgREST directly.

Build/runtime:

| Layer | Implementation |
| --- | --- |
| Dev/build | Vite 8 + `@lovable.dev/vite-tanstack-config` |
| SSR/server | TanStack Start + Nitro (Cloudflare default target per vite config comments) |
| Entry | `src/server.ts` wraps Start’s server-entry for HTML 500 pages |
| Start config | `src/start.ts` — global function middleware attaches Auth bearer; request middleware catches errors |

Product identity (preserve):

- Name: **Ghostline**
- Tagline in shell: **Private conversations**
- Landing: **Private by default. Loud when it matters.**
- Package name is still the scaffold `tanstack_start_ts` (not user-facing)

---

## 2. Frontend architecture

### Installed versions (from `package-lock.json`, not assumed ranges)

| Package | `package.json` range | Lockfile version |
| --- | --- | --- |
| `react` / `react-dom` | `^19.2.0` | **19.2.7** |
| `typescript` | `^5.8.3` | 5.8.3 (dev) |
| `vite` | `^8.0.16` | **8.1.4** |
| `@tanstack/react-router` | `^1.170.16` | **1.170.18** |
| `@tanstack/react-start` | `^1.168.26` | **1.168.28** |
| `@tanstack/react-query` | `^5.101.1` | **5.101.2** |
| `tailwindcss` | `^4.2.1` | **4.3.2** |
| `@supabase/supabase-js` | `^2.110.5` | **2.110.5** |
| `zod` | `^3.24.2` | **3.25.76** |
| `react-hook-form` | `^7.71.2` | **7.81.0** |
| `lucide-react` | `^0.575.0` | **0.575.0** |
| `@lovable.dev/cloud-auth-js` | `^1.1.2` | present |
| `@lovable.dev/vite-tanstack-config` | `2.13.1` | 2.13.1 |
| `nitro` | `3.0.260603-beta` | present |

Radix primitives are installed individually (accordion, dialog, etc.). `components.json` is shadcn **new-york** style. Most `src/components/ui/*` files are unused by product routes (scaffold). Product UI is custom in route files + `app-shell`, `command-palette`, `call-*`, `presence-provider`.

**React Hook Form** is only used by the unused shadcn `form.tsx` wrapper. Auth/onboarding/profile use controlled inputs + `zod.safeParse`.

### Routing (`src/routes/`)

| Route file | URL | Role |
| --- | --- | --- |
| `index.tsx` | `/` | Landing; redirects to `/chats` if session exists |
| `auth.tsx` | `/auth` | Email/password + Google (Lovable OAuth) |
| `_authenticated/route.tsx` | layout | `ssr: false`; `supabase.auth.getUser()` or redirect `/auth` |
| `_authenticated/onboarding.tsx` | `/onboarding` | Username + display name |
| `_authenticated/chats.index.tsx` | `/chats` | Conversation list, search, flags, device register |
| `_authenticated/chats.$conversationId.tsx` | `/chats/:id` | Thread, send, realtime, calls entry |
| `_authenticated/contacts.tsx` | `/contacts` | Friends / search users |
| `_authenticated/calls.tsx` | `/calls` | Call history |
| `_authenticated/profile.tsx` | `/profile` | Profile edit, sign out |
| `_authenticated/settings.tsx` | `/settings` | Settings + sign out |
| `_authenticated/starred.tsx` | `/starred` | Starred messages |
| `_authenticated/devices.tsx` | `/devices` | Device list / revoke |
| `_authenticated/blocked.tsx` | `/blocked` | Blocked contacts |

`src/routeTree.gen.ts` is generated. Do not hand-edit.

### Client data flow

```
UI (routes)
  → useServerFn(domainFn) + TanStack Query
  → HTTP RPC to TanStack Start server function
  → requireSupabaseAuth → PostgREST

AND in parallel:

UI
  → supabase.channel(...)  (browser, not server)
  → invalidate Query keys / apply local collapse
```

Optimistic send already exists in `chats.$conversationId.tsx` using `client_id = crypto.randomUUID()`.

### Navigation / branding surfaces (must not be redesigned)

- `src/components/app-shell.tsx` — desktop rail, mobile bottom tabs, Ghost mark
- `src/components/command-palette.tsx` — Ctrl/Cmd+K, Cmd+N
- `src/styles.css` + Manrope in `__root.tsx`
- Landing copy in `src/routes/index.tsx`
- Call overlay: `src/components/calls/call-ui.tsx`

---

## 3. Backend architecture

“Backend” today = **TanStack Start server functions** + **Postgres RLS**.

| File | Server functions |
| --- | --- |
| `src/lib/chat.functions.ts` | Conversations, messages, search, reactions, pins, stars, receipts, flags, leave, block |
| `src/lib/friendships.functions.ts` | List, request, respond, remove |
| `src/lib/profile.functions.ts` | Get/update me, search users |
| `src/lib/devices.functions.ts` | Register, list, revoke |
| `src/lib/calls.functions.ts` | Create, get, update status, list history |

Auth for server functions:

1. Client middleware `attachSupabaseAuth` (`src/integrations/supabase/auth-attacher.ts`, registered in `src/start.ts`) copies `session.access_token` to `Authorization: Bearer`.
2. Server middleware `requireSupabaseAuth` (`src/integrations/supabase/auth-middleware.ts`) validates JWT via `supabase.auth.getClaims(token)`, then creates a **user-scoped** Supabase client with that bearer so **RLS applies**.
3. Handlers use `context.userId` from claims `sub` for writes (good). Some reads still rely only on RLS.

**`supabaseAdmin` (`client.server.ts`) is unused.** Service role exists in env but no application code imports it.

There is no dedicated rate limiter, error type hierarchy, or repository interface.

---

## 4. Database dependencies

Source of truth today: **Supabase PostgreSQL** (`supabase/migrations/*`, generated types in `src/integrations/supabase/types.ts`).  
Project id in `supabase/config.toml`: `niejppurstyuasqngncq`.

### Tables actually used by application code

| Table | Used | Notes |
| --- | --- | --- |
| `profiles` | Yes | Identity; `id` FK → `auth.users` |
| `friendships` | Yes | pending / accepted / **blocked** (no separate blocks table) |
| `conversations` | Yes | `kind` enum currently only `'direct'` |
| `conversation_members` | Yes | `last_read_at`, `muted`, `pinned`, `archived` |
| `messages` | Yes | See schema below |
| `message_hidden` | Yes | Delete-for-me |
| `message_reactions` | Yes | PK `(message_id, user_id, emoji)` |
| `pinned_messages` | Yes | Max 3 per conversation (trigger) |
| `starred_messages` | Yes | Per-user |
| `message_receipts` | Yes | Fan-out on insert trigger |
| `message_edits` | Yes | Read in `getMessageInfo`; written by trigger |
| `calls` | Yes | History + status; signaling is **not** stored here |
| `devices` | Yes | Unique `(user_id, device_key)` |

### Tables/functions present but unused in app TS

| Object | Status |
| --- | --- |
| `user_roles` | Created on signup trigger; no UI/API |
| `has_role()` | Unused in TS |
| `are_friends()` | Used by RPC `open_direct_conversation` and call INSERT RLS |
| `is_conversation_member()` | Used by RLS |
| `open_direct_conversation(_friend)` | **Only RPC** used from TS |
| `handle_new_user` | Trigger on `auth.users` INSERT → profile + role |
| `handle_new_message` | Bump `last_message_at` + receipt fan-out |
| `record_message_edit` | Sets `edited_at`, inserts `message_edits` |
| `enforce_pin_limit` | 3 pins |
| `set_updated_at` | profiles, calls |

### `messages` columns (already match the target list)

| Column | Present |
| --- | --- |
| `id` UUID PK | Yes (`gen_random_uuid()`) |
| `conversation_id` | Yes |
| `sender_id` | Yes (no FK to `auth.users` in migration) |
| `body` | Yes, 1–4000 chars |
| `client_id` | Yes, nullable |
| `created_at` | Yes |
| `edited_at` | Yes |
| `deleted_at` | Yes **column exists** |
| `reply_to_id` | Yes, SET NULL |
| `forwarded_from_id` | Yes, SET NULL |

Indexes already:

- `messages_conv_created_idx` on `(conversation_id, created_at DESC, id DESC)`
- Partial unique `messages_client_dedupe_idx` on `(conversation_id, sender_id, client_id) WHERE client_id IS NOT NULL`

**Pagination today:** `listMessages` uses `before` as `created_at` only (`lt created_at`). Composite `(created_at, id)` cursor is **not** implemented yet. Index already supports it.

**Delete-for-everyone:** hard `DELETE` from `messages`, not `deleted_at`. UI still has a `deleted_at` preview path (“Message deleted”). Semantics must be preserved or explicitly reconciled in Phase 2.

**Unread counts:** `listConversations` issues **one COUNT query per conversation** (N+1). Must be redesigned for scale, not copied.

### Auth-bound FKs to migrate carefully

Several tables `REFERENCES auth.users(id)`. A Neon/Postgres-only schema needs an application `users` (or keep `profiles.id` as the user PK) plus a replacement for `handle_new_user`.

### Storage schema (DB-adjacent)

Migration adds RLS on `storage.objects` for bucket `avatars`. **No TS code calls `storage.from`.** Profile `avatar_url` is an optional URL string; profile UI shows initials, not uploads.

---

## 5. Realtime dependencies

Realtime is **browser → Supabase Realtime**, not “server publishes after commit.” Persistence is still via server functions + DB (correct direction for messages). After INSERT, **other clients learn via postgres_changes**, then **invalidate React Query** and refetch. Payload is not used as the source of truth for new message bodies (good). Deletes/hides use payload ids to collapse locally.

### postgres_changes (publication `supabase_realtime`)

| Table | Publication | Client consumers |
| --- | --- | --- |
| `messages` | Yes | Thread INSERT/UPDATE/DELETE; inbox INSERT |
| `message_receipts` | Yes | Thread receipts invalidate |
| `conversation_members` | Yes | **No TS subscriber found** |
| `conversations` | Yes | **No TS subscriber found** |
| `message_hidden` | Yes | Thread hide collapse |
| `message_reactions` | Yes | Thread reactions |
| `pinned_messages` | Yes | Thread pins |
| `calls` | Yes | **No TS subscriber** (history is Query; live signaling is broadcast) |
| `friendships` | **Not in publication SQL** | Inbox listens `event: "*"` on `friendships` — may be unreliable unless added later in remote |

### Broadcast

| Event | Channel | Purpose |
| --- | --- | --- |
| `typing` | `chat:conv:{conversationId}` | Typing indicator (3s timeout) |
| `call-offer` | `calls:signal:{userId}` | SDP offer |
| `call-answer` | same | SDP answer |
| `ice-candidate` | same | ICE |
| `call-decline` | same | Decline |
| `call-end` | same | Hangup / miss notify |

Signaling topics are **per user id**, not conversation. Caller subscribes to callee’s channel to send. This is the coupling to replace with a WebSocket signaling abstraction.

### Presence

| Channel | Purpose |
| --- | --- |
| `presence:ghostline` | Global online set (`PresenceProvider`) |
| `chat:conv:{id}` | In-thread present ids |

`profiles.last_seen` is **read** for labels but **never updated** in TS (stale “last seen” except when online via presence).

---

## 6. Auth dependencies

### Sign-in

| Method | Path |
| --- | --- |
| Email + password | `supabase.auth.signUp` / `signInWithPassword` in `auth.tsx` |
| Google | `lovable.auth.signInWithOAuth("google")` then `supabase.auth.setSession(result.tokens)` |

Apple/Microsoft/Lovable providers exist on the Lovable helper but UI only exposes Google.

### Session

- Persist: `persistSession: true`, `autoRefreshToken: true`
- Storage: `brokeredPreviewStorage()` — Lovable iframe postMessage broker, else `localStorage`
- Restore: `getSession` / `getUser` on landing, auth page, `_authenticated` layout
- Router invalidation: `__root.tsx` `onAuthStateChange` SIGNED_IN / SIGNED_OUT / USER_UPDATED

### Protected routes

`/_authenticated/*` is client-only (`ssr: false`). Guard is **client Supabase session**, not a server cookie. Server functions independently require Bearer JWT.

### Logout

`supabase.auth.signOut()` on profile and settings; Query cache cleared on profile.

### Onboarding

After login, chats page redirects to `/onboarding` if `profiles.username` is null. Profile row is created by DB trigger on `auth.users`.

### Security notes (current)

- Server identity from JWT `sub` — **do not regress**.
- Several handlers throw `new Error(error.message)` — PostgREST/SQL text can leak.
- `revokeDevice` filters by `device_id` only (RLS still owner-only).
- `respondToFriendRequest` accept/block does not re-check addressee in the update filter (RLS does).
- `blockContact` / `unblockContact` use PostgREST `.or()` with interpolated UUIDs (validated as uuid by Zod).
- Unblock sets status to **`accepted`**, restoring friendship — preserve this semantics.

**Recommendation:** Keep Supabase Auth through database/realtime extraction (Phase 2–4). Replace auth last (Phase 7), after a verified session replacement.

---

## 7. WebRTC dependencies

| File | Role |
| --- | --- |
| `src/components/calls/call-provider.tsx` | PeerConnection, media, states, signaling, ring timeout 35s |
| `src/components/calls/call-ui.tsx` | Overlay + incoming dialog |
| `src/lib/webrtc-config.ts` | ICE servers |
| `src/lib/calls.functions.ts` | Persist call row + status |

### States (preserve)

`IDLE | OUTGOING | RINGING | CONNECTING | CONNECTED | RECONNECTING | DECLINED | MISSED | ENDED | FAILED`

Plus mute, camera off, duration tick, ICE candidate queue before remote description.

### ICE

- Default STUN: `stun:stun.l.google.com:19302`
- Optional TURN via **client** env: `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`

**Problem:** TURN username/credential are `VITE_*` (bundled into the browser). Target architecture should issue short-lived TURN credentials from the server.

Media path is native `RTCPeerConnection` — **do not replace** with a third-party calling SDK. Replace only the `supabase.channel` send/subscribe transport.

Call **history** is independent of signaling (Postgres `calls` table). Live ringing uses broadcast; if the callee never receives the offer, DB may still show `ringing`.

---

## 8. Storage dependencies

| Layer | Reality |
| --- | --- |
| Supabase Storage bucket `avatars` | RLS policies exist |
| Application uploads | **None** |
| `avatar_url` | Optional URL on `profiles`; UI uses initials |
| Chat attachments / voice notes | **Not implemented** |

Phase 6 should introduce an object-storage **interface** and a `files` metadata table; do not migrate a non-existent media pipeline.

---

## 9. Technical debt

1. UI and data access mixed: giant route files call server fns and Supabase Realtime directly.
2. No repository/service layer; swapping Postgres provider requires rewriting every handler.
3. N+1 unread counts; last-message fetch is heuristic (`limit convIds * 4`).
4. Message pagination is timestamp-only despite a composite index.
5. `deleted_at` vs hard delete inconsistency.
6. Friendship postgres_changes may not be in publication.
7. `last_seen` never written.
8. Unused shadcn/Radix surface + unused `user_roles`.
9. `supabaseAdmin` dead code; service role still required by generated client if instantiated.
10. Errors are unstructured strings.
11. No automated tests; `package.json` has no `test` / `typecheck` scripts.
12. `.env` is present and **not listed in `.gitignore`** — secret leakage risk (do not commit further secrets).
13. Lovable-specific: preview auth broker, cloud OAuth, vite tanstack config, error reporting to `__lovableEvents`.
14. Branding copy still says “disappearing messages” / “end-to-end encrypted” in meta tags; product behavior is **not** E2E encryption and messages persist. Marketing vs implementation mismatch (do not silently change copy unless asked).
15. `conversation_members.user_id` / `messages.sender_id` lack FKs to users.
16. Global presence channel is not conversation-scoped (fine at small scale).
17. Call signaling has no authentication of SDP beyond “you subscribed to a public-ish realtime topic pattern”; moving to WS must authorize participants.
18. `listReactions` / `listMyStarIds` scan last 500 messages in a conversation.

---

## 10. Migration risks

| Risk | Why it matters |
| --- | --- |
| Auth break | Every route and server fn depends on Supabase JWT |
| Dual-write windows | Clients on old Realtime vs new WS will miss events |
| RLS removal without backend checks | Direct PostgREST today; new API must reimplement membership checks |
| `auth.users` FK | Cannot dump schema onto Neon without a users table + signup trigger equivalent |
| `open_direct_conversation` | Security-definer RPC; easy to get wrong in app SQL |
| Hard delete + realtime DELETE payload | Needs `REPLICA IDENTITY FULL`; WS events must include enough to collapse UI |
| WebRTC NAT | Google STUN only; production mobile/corporate needs TURN |
| Optimistic + idempotency | Already works; must keep unique `(conversation, sender, client_id)` |
| Lovable OAuth | Google login may fail if `@lovable.dev/cloud-auth-js` is removed too early |
| Data migration | Existing production rows live on Supabase; dump/restore is a later ops step (not this phase) |
| Nitro/Cloudflare vs new WS server | Start’s default deploy target may not fit a long-lived WebSocket process; architecture must choose hosting for WS separately |
| UI regressions | Chat thread file is ~1400 lines; API shape changes will touch it |

**Rollback (Phase 0):** This file only. Later phases: keep Supabase live; feature-flag new repositories behind existing `createServerFn` signatures.

---

## 11. Proposed architecture

Keep TanStack Router/Start and the React UI. Extract ports; swap adapters over phases.

```
React UI (unchanged look)
  → application hooks / query keys (existing)
  → API client (today: useServerFn; later same RPC or REST)
  → application services (auth, chat, social, calls, devices)
  → repositories (Postgres)
  → PostgreSQL (Neon later; not created in this audit)
       ↳ after COMMIT: realtime publisher
            ↳ WebSocket gateway (conversation rooms + user signaling rooms)
  → storage port (noop / URL metadata until Phase 6)
  → WebRTC (existing PC) → signaling port → WS
```

**PostgreSQL is source of truth.** WebSocket is a notification bus. On reconnect: REST/RPC `listMessages` since cursor, then resume events.

**Do not add** Redis, Kafka, Elasticsearch, Kubernetes, or extra microservices in the first migration.

Suggested layout (adapt to existing `src/lib` + add `server/` only when a real server process exists):

```
src/lib/domain/          # types, zod, errors (no IO)
src/lib/services/        # orchestration used by server fns
src/lib/ports/           # realtime, storage, signaling interfaces
src/integrations/supabase/  # stay until Phase 7
```

When a standalone API/WS process is added:

```
server/auth/
server/services/
server/repositories/
server/realtime/
server/calls/
```

Do not duplicate both until Start can no longer host WS.

---

## 12. Migration phases (do not skip)

| Phase | Goal | App must still work? |
| --- | --- | --- |
| **0** | This audit | Yes (no code change) |
| **1** | Extract ports/services; UI still calls same server fns | Yes |
| **2** | Postgres schema + repositories (can still run against Supabase Postgres first) | Yes |
| **3** | Server fns call services/repos; stop using `supabase.from` in handlers | Yes |
| **4** | WebSocket publisher + client adapter; dual-run with Supabase Realtime if needed | Yes |
| **5** | Point WebRTC signaling at WS only | Yes |
| **6** | Storage port + metadata table; no fake uploads | Yes |
| **7** | Remove Supabase Realtime/DB/RPC/types; auth last | Only after parity |

**Stop after Phase 0 until review.**

---

## Migration matrix

| Current Supabase feature | Current location | Replacement | Status |
| --- | --- | --- | --- |
| Auth (email/password) | `auth.tsx`, `client.ts` | Keep temporarily; later session service | **Keep (Phase 7 last)** |
| Auth (Google via Lovable) | `integrations/lovable`, `auth.tsx` | OIDC adapter later | **Keep** |
| Session attach to server fns | `auth-attacher.ts`, `start.ts` | Same pattern, swap token issuer | **Keep pattern** |
| JWT verify + RLS client | `auth-middleware.ts` | Verify session → `userId`; repo uses DB as service user + explicit authz | Phase 3 |
| Database / PostgREST | `*.functions.ts` | PostgreSQL repositories (Neon later) | Phase 2–3 |
| RPC `open_direct_conversation` | `chat.functions.ts` | Service + transaction | Phase 3 |
| RLS | SQL migrations | Backend authorization + DB constraints | Phase 2–3 |
| Realtime postgres_changes | chats routes | WS events after commit | Phase 4 |
| Broadcast typing | `chats.$conversationId.tsx` | WS `typing.started/stopped` | Phase 4 |
| Presence | `presence-provider.tsx` | WS presence | Phase 4 |
| Call signaling broadcast | `call-provider.tsx` | WS signaling port | Phase 5 |
| Storage avatars | SQL policies only | Object storage port | Phase 6 |
| Generated `Database` types | `integrations/supabase/types.ts` | App domain types | Phase 7 |
| `supabaseAdmin` | `client.server.ts` unused | Delete when unused | Phase 7 |
| Triggers (`handle_new_user`, receipts, edits, pins) | SQL | App transactions or Postgres triggers on new DB | Phase 2 |

---

## Environment variables (inventory)

**Client-bundled (`import.meta.env` / `VITE_*`):**

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key |
| `VITE_STUN_SERVER_URL` | STUN URLs (comma-separated); default Google STUN |
| `VITE_TURN_URL` | TURN URLs |
| `VITE_TURN_USERNAME` | TURN user (**should not stay client-secret**) |
| `VITE_TURN_CREDENTIAL` | TURN secret (**should not stay client-secret**) |

**Server-only (`process.env`):**

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Same project URL for SSR/middleware |
| `SUPABASE_PUBLISHABLE_KEY` | Middleware user client |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client (unused in app code today) |

No `.env.example` exists. Creating one is Phase 1/docs work, placeholders only.

---

## Tests, lint, build

| Check | Present |
| --- | --- |
| Unit/e2e tests | **None** |
| `npm test` | **None** |
| `lint` | `eslint .` |
| `build` | `vite build` |
| CI / GitHub Actions | **None** (do not add unless requested) |
| `vercel.json` | **None** (do not add) |

---

## Files that must change (eventually, not now)

High coupling — will change across phases:

- `src/lib/chat.functions.ts`
- `src/lib/friendships.functions.ts`
- `src/lib/profile.functions.ts`
- `src/lib/devices.functions.ts`
- `src/lib/calls.functions.ts`
- `src/integrations/supabase/**`
- `src/start.ts` (middleware)
- `src/routes/_authenticated/chats.index.tsx` (Realtime)
- `src/routes/_authenticated/chats.$conversationId.tsx` (Realtime + typing)
- `src/components/presence-provider.tsx`
- `src/components/calls/call-provider.tsx` (signaling only)
- `src/lib/webrtc-config.ts` (TURN credential strategy)
- `src/routes/auth.tsx`, `_authenticated/route.tsx`, `index.tsx`, `__root.tsx` (auth last)
- `src/integrations/lovable/index.ts` (auth last)
- `supabase/migrations/**` → new schema docs/SQL (additive)

New files expected later: ports, services, repositories, `ARCHITECTURE.md`, `DATABASE.md`, `REALTIME.md`, `WEBRTC.md`, `MIGRATION.md`, `ENVIRONMENT.md`, `.env.example`.

---

## Files that should not change (unless a tiny API-shape fix is required)

Preserve look and product chrome:

- `src/components/app-shell.tsx`
- `src/components/calls/call-ui.tsx` (behavior wiring may change; visuals no)
- `src/components/command-palette.tsx` (data source only if API unchanged)
- `src/styles.css` and shadcn `src/components/ui/*` (unused scaffold — leave)
- Landing/marketing JSX structure and Ghostline copy in `index.tsx`
- Branding in profile/settings/chats chrome
- `src/routeTree.gen.ts` (generated)
- `AGENTS.md` Lovable git-history warning
- `vite.config.ts` unless WS hosting forces it (defer)

Do **not** redesign UI, swap WebRTC media, or delete features to make migration easier.

---

## Chat / call / auth behavior to preserve (parity checklist)

**Auth:** signup, signin, Google, session restore, logout, onboarding username.

**Chat:** open DM (friends only), list, send (idempotent `client_id`), optimistic UI, reload, pagination, edit, delete for me, delete for everyone, reply, forward, reaction toggle, pin/unpin (max 3), star, search in-thread and global, mute/pin/archive, mark unread, leave, receipts.

**Social:** friend request, reverse auto-accept, accept/decline/block, remove, blocked list, unblock→accepted.

**Calls:** voice/video, accept/decline, 35s miss, hangup, mute, camera, reconnecting UI, failed, history.

**Devices:** register on chats load, list, revoke.

---

## Proposed event model (design only — not implemented)

```json
{
  "type": "message.created",
  "conversationId": "<uuid>",
  "messageId": "<uuid>",
  "timestamp": "<iso>",
  "payload": {}
}
```

Candidates: `message.created|updated|deleted`, `message.reaction.created|deleted`, `message.pin.created|deleted`, `conversation.updated`, `typing.started|stopped`, `presence.updated`, plus signaling events (`call.offer|answer|ice|decline|end`) on the user signaling room.

Publish **after** DB commit only.

---

## Phase 1 preview (not started)

When approved, Phase 1 should:

- Add domain types + Zod already used in server fns
- Add ports (`RealtimePublisher`, `CallSignaling`, `ObjectStorage`) with **Supabase adapters**
- Route existing server fns through thin services **without changing HTTP/UI contracts**
- Not create Neon, not add WS server, not remove Supabase

**Rollback:** delete new adapter files; keep `*.functions.ts` calling Supabase as today.

---

## Audit completeness

Inspected: `package.json` / lockfile, `src/` routes/components/lib/integrations, all `supabase/migrations`, env usage, WebRTC, error helpers, tests (none), vite/eslint/tsconfig, Lovable integrations.

**Not done (ops, by design):** connecting to production DB, dumping live data, creating Neon, deploying, git commits.
