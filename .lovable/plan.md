# Snapchat-style Messenger — Web MVP Plan

You confirmed a phased build. This plan covers **Phase 1: Foundation** only. When Phase 1 is working end-to-end, I'll plan Phase 2 (Real-time Chat), then Phase 3 (E2EE), etc. Each phase ships a working app.

## Reality check on the stack

You listed Flutter + NestJS + Prisma + Cloudflare R2 + Socket.IO. Lovable builds **web apps on TanStack Start (React 19 + Vite)** with **Lovable Cloud** (Postgres, Auth, Storage, server functions) as the backend. So the MVP will use:

- **Frontend:** TanStack Start, React 19, Tailwind v4, shadcn — Snapchat-inspired PWA (installable on phones).
- **Backend:** TanStack server functions + server routes (frontend-agnostic HTTP + RPC). Any future Flutter app calls the exact same endpoints.
- **DB / Auth / Storage:** Lovable Cloud (Postgres + RLS, Auth, Storage buckets — Supabase under the hood).
- **Realtime (Phase 2):** Supabase Realtime channels (WebSocket). Same protocol works from Flutter via `supabase_flutter`.
- **E2EE (Phase 3):** `libsignal-client` (WASM) in browser; Flutter uses `libsignal_protocol_dart`. Server only ever sees ciphertext.

NestJS / Prisma / R2 / Socket.IO aren't part of Lovable — swapping to Cloud gets you an equivalent stack with zero infra work, and the API contract stays portable.

## Phase 1 scope — Foundation

Ships a working app where a user can sign up, log in from multiple devices, edit their profile, find other users, send/accept friend requests, and see their contact list. No messaging yet.

### 1. Enable Lovable Cloud
Provisions Postgres, Auth, Storage, and secrets automatically.

### 2. Database schema (migration)
- `profiles` — 1:1 with `auth.users` (id FK, username unique, display_name, avatar_url, bio, last_seen, created_at). Trigger auto-creates on signup.
- `user_roles` + `app_role` enum + `has_role()` SECURITY DEFINER (per platform rules — roles never on profiles).
- `devices` — id, user_id, device_name, platform (web/ios/android), last_seen_at, revoked_at. Multi-device session tracking.
- `friendships` — requester_id, addressee_id, status (`pending`/`accepted`/`blocked`), created_at, responded_at. Unique on ordered pair.
- RLS on everything, scoped to `auth.uid()`. Explicit `GRANT`s per platform rules.

### 3. Authentication (email first)
- Email + password sign-up / sign-in (phone OTP deferred — needs SMS provider; add in a later phase).
- Auto-confirm on for MVP so testing doesn't need mailbox round-trips.
- `_authenticated/` route gate (integration-managed) protects the app shell.
- Root `onAuthStateChange` invalidates router + query cache on sign-in/out/user-updated.
- Sign-out hygiene: cancel queries → clear cache → `signOut()` → replace-navigate to `/auth`.

### 4. Multi-device sessions
- On successful sign-in, upsert a row in `devices` with a browser-generated device id (stored in `localStorage`), user-agent-derived name, `platform: 'web'`.
- Update `last_seen_at` on each app load.
- Settings → **Devices** page lists all sessions with a "Sign out this device" (sets `revoked_at`; a global sign-out button signs out the browser session too).

### 5. Profiles
- `/onboarding` after first sign-in: pick username (unique, validated with zod), display name, optional avatar upload to a `avatars` storage bucket (public).
- `/settings/profile` to edit later.

### 6. Contacts / Friends
- `/contacts` — tabbed: **Friends**, **Requests** (incoming + outgoing), **Find people**.
- Find people: search by username (server function, RLS-safe, returns only public profile fields).
- Send request → creates `pending` friendship. Accept / decline / block from Requests tab.
- Accepted friends appear in Friends list; this list is what Phase 2's chat will draw from.

### 7. Snapchat-style shell (visual foundation only, no camera yet)
- Bottom tab bar: **Chats** (placeholder empty state), **Camera** (placeholder), **Stories** (placeholder), **Profile**.
- Dark theme by default, glassmorphism accents, rounded cards, subtle spring animations (`motion/react`). Camera-first swipe gestures land in Phase 6 polish.
- PWA manifest so it installs to a phone home screen.

### 8. Backend architecture (frontend-agnostic from day 1)
- All data access goes through **server functions** in `src/lib/*.functions.ts` with zod `inputValidator` + `requireSupabaseAuth` middleware. These are typed RPC for the web app.
- The same operations are also exposed as **REST endpoints under `src/routes/api/v1/*`** (JSON in/out, bearer-token auth via Supabase JWT), so a future Flutter client hits identical semantics — no rewrites. Both call the same underlying service layer in `src/server/services/*.ts`.
- Zod schemas live in `src/shared/schemas/*` and are reused by RPC, REST, and the client.

## Design direction

Snapchat-inspired isn't a single look — I'd like to lock the vibe before building the shell. After you approve this plan I'll generate 3 rendered design directions (dark glassmorphism, high-contrast neo-brutalist, soft neon gradient — or your call) for the auth + chats-shell + profile surfaces, and you pick one.

## What's NOT in Phase 1 (comes later, don't worry)
- Any messaging, realtime, typing, presence → Phase 2
- E2EE, Signal Protocol, key exchange → Phase 3
- Media upload, encrypted blobs, view-once → Phase 4
- Disappearing messages, block/report → Phase 5
- Camera, stories, URL previews, push notifications, search → Phase 6
- Phone OTP, voice/video calls, AI features → future phases

## Deliverable at end of Phase 1
A deployable PWA where two testers can sign up, add each other as friends, and see each other in their contacts list from multiple devices — with a clean API surface a Flutter app could adopt unchanged.

Approve to build Phase 1, or tell me what to adjust (e.g. skip PWA, phone OTP first, different design vibe).