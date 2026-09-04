# Phase 4.5 Staging Audit: Neon + WebSocket Rehearsal Pre-Flight

**Document:** `PHASE_4_5_STAGING_AUDIT.md`  
**Date:** September 3, 2026  
**Status:** AUDIT COMPLETE — READY FOR STAGING REHEARSAL PASS  

---

## 1. Current Drivers & Production Configuration

- **Data Repository Driver:** `DATA_REPOSITORY_DRIVER=supabase` (Default in [`src/lib/infra/create-app.ts`](file:///x:/Project-Buildings/Communication/src/lib/infra/create-app.ts)).
  - Routes 100% of persistent data reads and writes to Supabase PostgREST under Supabase RLS.
- **Realtime Driver:** `REALTIME_DRIVER=supabase` (Default in [`src/lib/realtime/create-realtime.ts`](file:///x:/Project-Buildings/Communication/src/lib/realtime/create-realtime.ts)).
  - Routes realtime subscriptions through `SupabaseRealtimeService` using Supabase Realtime Phoenix channels.
- **Production Safety Guarantee:**
  - Production `.env` contains Supabase credentials only.
  - Zero dual-writing exists anywhere in the application.
  - No production database credentials or cutovers have occurred.

---

## 2. Staging Target Configuration

For the Phase 4.5 Staging Rehearsal, the isolated staging configuration is:

```env
DATA_REPOSITORY_DRIVER=neon
REALTIME_DRIVER=websocket
DATABASE_URL=postgresql://[staging_user]:[staging_password]@[staging_endpoint].neon.tech/ghostline_staging?sslmode=require
```

### Staging Architecture:
```
Browser Client
   │ (Authenticated WebSocket connection)
   ▼
Ghostline Realtime Gateway (src/lib/realtime/gateway.ts)
   ▲
   │ (Committed Domain Events: message.created, etc.)
TanStack Start Server Functions
   ↓
Application Services (MessageService, ConversationService)
   ↓
Phase 3 Authorization Policies (ConversationPolicy, MessagePolicy)
   ↓
Neon Native PostgreSQL Repositories (src/lib/repositories/postgres/*)
   ↓
Neon Staging Database (14 tables, 5 enums, 4 triggers)
```

---

## 3. Infrastructure Dependencies Status

| Component | Target Provider | Staging Driver | Production Driver | Notes |
|---|---|---|---|---|
| **Persistent DB** | Neon PostgreSQL | `neon` | `supabase` | Native driver via `postgres` package, SSL enforced |
| **Realtime Gateway** | Ghostline WebSocket | `websocket` | `supabase` | In-process Gateway, typed event contracts |
| **Authentication** | Supabase Auth (GoTrue) | Supabase Auth | Supabase Auth | Kept unchanged; verified JWT `claims.sub` |
| **WebRTC Signaling** | Supabase Broadcast | Supabase Broadcast | Supabase Broadcast | Kept unchanged (Scheduled for Phase 5) |
| **Media / Storage** | Supabase Storage | Supabase Storage | Supabase Storage | Kept unchanged (Scheduled for Phase 6) |
| **UI Components** | React + TanStack Start | Unchanged | Unchanged | Zero visual or layout modifications |

---

## 4. Rehearsal Verification Matrices

### 4.1 Schema & Table DAG
Topological order for schema creation and data migration:
1. `profiles`
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

### 4.2 Two-User Live Chat & Channel Isolation Tests
- **User A (sender) & User B (recipient)** in shared conversation `convAB`.
- **User C (unrelated third party)** in private conversation `convBC`.
- **Live Event Matrix**:
  - `message.created`: A sends → B receives live via WebSocket. C receives 0 frames.
  - `message.updated`: A edits → B receives live via WebSocket.
  - `message.deleted`: A deletes → B receives live via WebSocket.
  - `reaction.created`: A reacts → B receives live via WebSocket.
  - `pin.created`: A pins → B receives live via WebSocket.
  - `typing`: A types → B receives live indicator. A receives no echo.
  - `presence.sync`: Tracks online state dynamically across multiple tabs.

### 4.3 Deduplication & Reconnect Safety
- Bounded sliding window (`processedEventIds`, size 2000) prevents twin renders from duplicate network frames or multi-tab echoes.
- Reconnection triggers React Query cache invalidation against Neon, recovering any state missed during offline windows.

---

## 5. Rollback Path

To immediately abort staging and return 100% of application traffic to Supabase:
```env
DATA_REPOSITORY_DRIVER=supabase
REALTIME_DRIVER=supabase
```
- Requires **zero code changes** or migrations.
- Both `createApp` and `getRealtimeService` automatically re-bind to Supabase PostgREST and Supabase Realtime.

---

## 6. STOP CONDITION & NEXT STEP

- **AUDIT COMPLETE.**
- No production database cutover was performed.
- No production data was modified.
- Ready to proceed with the comprehensive Phase 4.5 verification report.
