# Ghostline System Architecture (Phase 1)

**Status:** Phase 1 Complete (Architecture Abstraction)  
**Date:** 2026-09-02  
**Framework:** TanStack Start (SPA + SSR Server Functions) + React 19 + TypeScript  
**Database/Backend:** Supabase PostgreSQL + RLS + RPC + Auth + Realtime (Isolated via Ports & Services)

---

## 1. Overview & Layered Architecture

Ghostline has been refactored in Phase 1 to introduce a clean, provider-independent architectural boundary between user interfaces / transport layers and data access / infrastructure.

The target design isolates Supabase as an implementation detail behind application services and repository interfaces:

```
┌─────────────────────────────────────────────────────────────┐
│                       React 19 UI                           │
│  (Routes in src/routes, App Shell, Call Provider, Presence) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│           TanStack Start Server Functions / Routes          │
│   (src/lib/*.functions.ts with requireSupabaseAuth check)   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Application Services                     │
│                (src/lib/services/*.service.ts)              │
│    MessageService, ConversationService, ReactionService,    │
│       PinService, StarService, CallService, DeviceService   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Repository Interfaces                    │
│                (src/lib/repositories/ports.ts)              │
│  MessageRepository, ConversationRepository, ProfileRepo...  │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼ (driver: 'supabase')         ▼ (driver: 'neon')
┌──────────────────────────────┐ ┌──────────────────────────────┐
│    Supabase Repositories     │ │     Postgres Repositories    │
│ (src/lib/repositories/       │ │ (src/lib/repositories/       │
│  supabase/*)                 │ │  postgres/*)                 │
└──────────────┬───────────────┘ └──────────────┬───────────────┘
               │                                │
               ▼                                ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│      Supabase Platform       │ │       Neon PostgreSQL        │
│ (PostgreSQL + RLS + RPC)     │ │ (Postgres + Native SQL/Tx)   │
└──────────────────────────────┘ └──────────────────────────────┘
```

---

## 2. Core Architectural Principles

1. **Repository Driver Abstraction (`DATA_REPOSITORY_DRIVER`):**
   The application supports seamless toggling between `DATA_REPOSITORY_DRIVER=supabase` (default fallback) and `DATA_REPOSITORY_DRIVER=neon`. All server functions dispatch through `createApp(context)` in `src/lib/infra/create-app.ts`. Strict single-driver operation prevents dual-write anomalies.
2. **Provider-Independent Domain Types:**
   All domain entities (`Message`, `Conversation`, `Profile`, `Friendship`, `Reaction`, `Pin`, `Star`, `Call`, `Device`) are defined in `src/lib/domain/types.ts`. Application services and UI components consume these domain types rather than generated database schemas.
3. **Application-Level Authorization Replaces RLS:**
   Every security constraint (conversation membership, sender edit/delete checks, pin limits, friendship checks) is verified explicitly in the application service layer before invoking repositories.
4. **Atomic RPC Replacement:**
   Supabase's `open_direct_conversation` RPC is replaced by native PostgreSQL transactions in `PostgresConversationRepository.openDirect`, preventing concurrency race conditions and ensuring ACID guarantees.
   All domain entities (`Message`, `Conversation`, `Profile`, `Friendship`, `Reaction`, `Pin`, `Star`, `Call`, `Device`) are defined in `src/lib/domain/types.ts`. Application services and UI components consume these domain types rather than generated database schemas.
2. **Provider-Independent Application Errors:**
   PostgREST error codes (e.g. `PGRST116`, `23505`, RLS rejections) are translated into explicit domain error classes (`AuthenticationError`, `AuthorizationError`, `ValidationError`, `NotFoundError`, `ConflictError`, `RateLimitError`, `InternalError`) defined in `src/lib/domain/errors.ts` via `mapPostgresError` in `src/lib/infra/supabase/map-error.ts`.
3. **No Direct Supabase Queries in UI or Server Functions:**
   Server functions (`src/lib/*.functions.ts`) instantiate the application via `createSupabaseApp(supabase, userId)` and delegate business operations directly to application services.
4. **Isolate Realtime and Signaling Transports:**
   Realtime event subscriptions (presence, Postgres change notifications, typing broadcast) are encapsulated behind `RealtimePort` in `src/lib/ports/realtime.ts` and `SupabaseRealtimeService` in `src/lib/infra/supabase/supabase-realtime.ts`.
   WebRTC signaling is encapsulated behind `CallSignaling` in `src/lib/ports/signaling.ts` and `SupabaseCallSignaling` in `src/lib/infra/supabase/supabase-signaling.ts`.
5. **Preserve Current Security & Behavior:**
   Row Level Security (RLS), authenticated sessions, ownership verification, and optimistic sending (`client_id = crypto.randomUUID()`) remain completely intact.

---

## 3. Directory Layout

```
src/
  ├── components/          # Reusable UI components (AppShell, PresenceProvider, CallProvider)
  ├── hooks/               # Custom React hooks (use-keyboard-inset, etc.)
  ├── integrations/
  │   ├── lovable/         # Lovable Cloud Auth integration (OAuth)
  │   └── supabase/        # Supabase JS client and auth middleware
  ├── lib/
  │   ├── auth/            # Auth façade & session helper (session.ts)
  │   ├── domain/          # Pure domain types (types.ts) and errors (errors.ts)
  │   ├── infra/
  │   │   └── supabase/    # Supabase adapters (realtime, signaling, storage, error mapper)
  │   ├── ports/           # Abstraction interfaces (realtime, signaling, storage, rate-limit)
  │   ├── repositories/    # Data access port definitions & Supabase implementations
  │   │   ├── ports.ts     # Repository interfaces
  │   │   └── supabase/    # Concrete Supabase repository classes
  │   ├── services/        # Application services orchestrating domain logic
  │   └── *.functions.ts   # TanStack Start RPC server functions
  └── routes/              # TanStack Router file-based routes
tests/
  └── unit/                # Vitest unit tests for application services
```

---

## 4. Application Services Breakdown

| Service | File | Responsibilities |
|---|---|---|
| `AuthService` | `src/lib/services/auth.service.ts` | Server-side caller identity encapsulation |
| `ProfileService` | `src/lib/services/profile.service.ts` | Profile fetch, update, user discovery search |
| `FriendshipService` | `src/lib/services/friendship.service.ts` | Friend requests, responses (accept/decline/block), removal |
| `ConversationService` | `src/lib/services/conversation.service.ts` | Direct conversations, summary listings, flags (pinned, muted, archived), membership |
| `MessageService` | `src/lib/services/message.service.ts` | Message send (with rate limiting), pagination, hide, edit, hard delete-for-everyone |
| `ReactionService` | `src/lib/services/reaction.service.ts` | Emoji reaction toggle, conversation reactions list |
| `PinService` | `src/lib/services/pin.service.ts` | Message pinning/unpinning, pinned messages list |
| `StarService` | `src/lib/services/star.service.ts` | Message starring/unstarring, starred inbox listing |
| `DeviceService` | `src/lib/services/device.service.ts` | Device registration, listing, revocation |
| `CallService` | `src/lib/services/call.service.ts` | Call session creation, status updates, call history |

---

## 5. Security & Isolation State

- **RLS Preserved:** Every Supabase repository receives an authenticated `AppSupabase` client scoped to the caller's JWT token, ensuring Postgres RLS enforces authorization at the database level.
- **Service Identity Enforced:** Application services bind `userId` from the verified session context (`context.userId` extracted by `requireSupabaseAuth`), preventing client identity spoofing.
- **Client Decoupling:** UI components import only `authService`, `realtimeService`, or TanStack Start server functions.
