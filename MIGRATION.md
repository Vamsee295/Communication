# Ghostline Migration Roadmap & Decisions

**Status:** Phase 2 Complete (PostgreSQL on Neon + Repositories)  
**Target:** Provider-Independent Ghostline (Migrating gradually from Supabase to self-hosted/custom infrastructure)

---

## 1. Migration Roadmap

```
             GHOSTLINE MIGRATION ROADMAP
                         │
                         ▼
                  ✅ PHASE 0
                  FULL AUDIT
                         │
                         ▼
                  ✅ PHASE 1
             Architecture Abstraction
                         │
                         ▼
                  ✅ PHASE 2
            PostgreSQL + Repositories
                         │
                         ▼
                  🟡 PHASE 3
            Backend + Authorization
                         │
                         ▼
                  🟠 PHASE 4
               WebSocket Realtime
                         │
                         ▼
                  🔴 PHASE 5
            WebRTC Signaling Migration
                         │
                         ▼
                  🟣 PHASE 6
               Object Storage
                         │
                         ▼
                  ⚫ PHASE 7
            Remove Supabase Gradually
                         │
                         ▼
                  🚀 PRODUCTION
```

---

## 2. Phase 1 Accomplishments

In Phase 1, we successfully isolated all application dependencies on Supabase behind provider-independent abstractions without replacing Supabase or changing user-facing behavior:
1. **Domain Models & Error Hierarchy:** Built pure TypeScript types and domain errors. PostgREST codes are mapped at the boundary.
2. **Repository Ports:** Defined abstract interfaces for all database queries and writes.
3. **Application Services:** Built thin, single-responsibility services orchestrating domain logic.
4. **Server Functions Refactored:** All `src/lib/*.functions.ts` server functions now delegate to `createSupabaseApp(supabase, userId)`.
5. **Realtime & Signaling Isolated:** Extracted `RealtimePort` and `CallSignaling` ports.
6. **Test Safety Net:** Added Vitest with focused unit tests covering core service behaviors (messaging, permissions, edits, hard deletions, reactions, pins, stars, conversations).

---

## 3. Explicit Migration Decisions & Known Issues

### A. TURN Configuration Security
- **Issue:** Currently, TURN credentials in `src/lib/webrtc-config.ts` use `VITE_TURN_*` client-side environment variables bundled directly into the browser.
- **Phase 1 Decision:** Retain existing WebRTC configuration unchanged in Phase 1 to prevent breaking live calling. No new secrets were exposed.
- **Migration Plan:** In **Phase 5 (WebRTC Signaling Migration)**, replace static client-side TURN credentials with a short-lived ephemeral credential service (e.g. COTURN REST API or Cloudflare Calls / Twilio Network Traversal tokens generated dynamically on the server).

### B. N+1 Unread Counts Query
- **Issue:** `ConversationService.list()` currently counts unread messages per conversation in a loop (`convIds.map(...)` querying `countUnread` for each conversation).
- **Phase 1 Decision:** Retained existing PostgREST query pattern in Phase 1 to ensure 100% semantic and performance parity without unexpected regressions.
- **Migration Plan:** In **Phase 2 (PostgreSQL + Repositories)**, implement a single SQL query utilizing `JOIN` / `GROUP BY` or window functions over `messages` and `conversation_members.last_read_at` to compute unread counts in `O(1)` database roundtrip.

### C. Message Deletion Semantics (Hard vs Soft Delete)
- **Current Behavior:** `deleteMessageForEveryone` performs an immediate hard SQL `DELETE` on the `messages` table row.
- **Phase 1 Decision:** Retained hard `DELETE` in Phase 1. `MessageRepository.hardDelete(id)` is explicitly named to document this behavior.
- **Migration Decision:** In **Phase 2**, evaluate transitioning to soft deletion (`deleted_at TIMESTAMP WITH TIME ZONE`). Soft deletion preserves thread continuity, prevents broken reply citations (`reply_to_id`), and provides auditability, while replacing body text with a "Message deleted" tombstone in the UI.

---

## 4. Phase 2 Plan: PostgreSQL + Repositories

When Phase 2 begins (upon explicit user approval):
1. **Define Pure PostgreSQL Schema:** Export table definitions, constraints, and indexes without Supabase extensions or Supabase Auth foreign keys.
2. **Implement Native Repositories:** Implement `PostgresMessageRepository`, `PostgresConversationRepository`, etc., using a standard PostgreSQL driver/query builder (e.g., `pg`, `kysely`, or `drizzle-orm`).
3. **Dual-Repository Verification:** Verify that repository implementations satisfy the exact same `ports.ts` interfaces and pass identical unit and integration tests.
4. **Preserve RLS / Auth bridge:** Prepare auth user mapping before cutting over databases.

---

## 5. Rollback Considerations

- **Git Isolation:** Phase 1 introduced non-breaking additions in `src/lib/domain/`, `src/lib/repositories/`, `src/lib/services/`, and `src/lib/infra/`.
- **Zero Schema Changes:** Because no migrations or schema edits were made in Supabase, reverting to previous code requires only a clean git revert.
- **Backward Compatibility:** All server functions retain their exact input schemas, return types, and route endpoints.
