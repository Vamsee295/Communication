# Phase 2.5 Staging Cutover Rehearsal & Production Cutover Plan

**Document:** `PHASE_2_5_CUTOVER_PLAN.md`  
**Date:** September 3, 2026  
**Status:** STAGING REHEARSAL COMPLETE — CUTOVER BLOCKED ON REALTIME DEPENDENCY  
**Critical Finding:** Database migration layer is 100% complete and verified, but **Supabase Realtime `postgres_changes` is technically incompatible with Neon writes**. Production database cutover cannot occur until Realtime transport is migrated in Phase 4.

---

## Executive Summary

During the Phase 2.5 Staging Cutover Rehearsal, we conducted an end-to-end architectural verification of the Ghostline application running with `DATA_REPOSITORY_DRIVER=neon`.

The persistent database layer on Neon successfully passes all functional tests, schema constraints, transaction isolation, keyset pagination, single-query unread calculations, and multi-user authorization rules.

However, a **critical architectural incompatibility** was confirmed between **Neon PostgreSQL** and **Supabase Realtime**:
- The existing UI relies on `supabase.channel(...).on("postgres_changes", ...)` for message delivery, read receipts, reactions, pins, and inbox badges.
- Supabase Realtime `postgres_changes` listens exclusively to the PostgreSQL Write-Ahead Log (WAL) of the **Supabase-hosted database**.
- When application writes are routed to **Neon**, Supabase Realtime does not receive any WAL events from Neon. Consequently, **User B will not receive incoming messages, reactions, or read state in real time** without refreshing the page.

Per the mandatory directive:
> *"If the existing Supabase Realtime Postgres Changes mechanism depends directly on Supabase's own Postgres database, document the incompatibility instead of pretending it works... If this means message realtime will stop working after database cutover: DO NOT proceed with production cutover. Document: 'Database migration is complete, but realtime transport must be migrated before production database cutover.' This is acceptable."*

Therefore, **production database cutover is held until Phase 4 (WebSocket Realtime Migration)**.

---

## 1. Classification of Current Realtime Transports

Every realtime mechanism currently in Ghostline was audited:

| Realtime Feature | Current Source | Current Transport | Works with Neon? | Migration Required in Phase 4? |
|---|---|---|:---:|:---:|
| **New Message Delivery** | Supabase Postgres WAL | Supabase Realtime (`postgres_changes` INSERT on `messages`) | ❌ **NO** | **YES (Phase 4)** |
| **Message Edits** | Supabase Postgres WAL | Supabase Realtime (`postgres_changes` UPDATE on `messages`) | ❌ **NO** | **YES (Phase 4)** |
| **Message Deletion** | Supabase Postgres WAL | Supabase Realtime (`postgres_changes` DELETE on `messages`) | ❌ **NO** | **YES (Phase 4)** |
| **Message Receipts (Delivered/Read)** | Supabase Postgres WAL | Supabase Realtime (`postgres_changes` * on `message_receipts`) | ❌ **NO** | **YES (Phase 4)** |
| **Reactions (Emoji)** | Supabase Postgres WAL | Supabase Realtime (`postgres_changes` * on `message_reactions`) | ❌ **NO** | **YES (Phase 4)** |
| **Pinned Messages** | Supabase Postgres WAL | Supabase Realtime (`postgres_changes` * on `pinned_messages`) | ❌ **NO** | **YES (Phase 4)** |
| **Hidden Messages ("Delete for me")** | Supabase Postgres WAL | Supabase Realtime (`postgres_changes` INSERT on `message_hidden`) | ❌ **NO** | **YES (Phase 4)** |
| **Inbox & Unread Updates** | Supabase Postgres WAL | Supabase Realtime (`postgres_changes` INSERT on `messages`) | ❌ **NO** | **YES (Phase 4)** |
| **Friendship Status Changes** | Supabase Postgres WAL | Supabase Realtime (`postgres_changes` * on `friendships`) | ❌ **NO** | **YES (Phase 4)** |
| **Typing Indicator** | In-memory Broadcast | Supabase Realtime (`broadcast` event `typing`) | ✅ **YES** | **YES (Consolidate in Phase 4)** |
| **Active Conversation Presence** | In-memory Presence | Supabase Realtime (`presence` channel) | ✅ **YES** | **YES (Consolidate in Phase 4)** |
| **Global Online Presence** | In-memory Presence | Supabase Realtime (`presence` channel `presence:ghostline`) | ✅ **YES** | **YES (Consolidate in Phase 4)** |
| **WebRTC Call Signaling** | In-memory Broadcast | Supabase Realtime (`broadcast` offer/answer/ice/decline/end) | ✅ **YES** | **Phase 5** |

### Key Insight:
Ephemeral broadcast channels (WebRTC calling signaling, typing indicators, presence) continue to function under Neon because they use Supabase's WebSocket message bus and do not touch the database. However, **all communication persistence events depend on Postgres CDC/WAL**, which severs when writes move to Neon.

---

## 2. Staging Rehearsal Verification Results

### 2.1 Database Schema & Constraints
- Applied and verified [`src/lib/infra/postgres/schema.sql`](file:///x:/Project-Buildings/Communication/src/lib/infra/postgres/schema.sql) across 14 tables, 5 enums, 4 triggers, and 12 indexes.
- Verified foreign-key data retention policies:
  - `messages.sender_id`: `ON DELETE RESTRICT`
  - `pinned_messages.pinned_by`: `ON DELETE SET NULL`
  - `calls.caller_id` & `callee_id`: `ON DELETE RESTRICT`
  - Ephemeral user states (`conversation_members`, `devices`, `friendships`, `message_receipts`, `message_reactions`, `starred_messages`, `message_hidden`, `user_roles`): `ON DELETE CASCADE`.

### 2.2 Data Migration Dry-Run & Parity Tooling
- Executed `scripts/migrate-supabase-to-neon.ts --dry-run` against source Supabase instance.
- Verified topological DAG table extraction order:
  `profiles` → `user_roles` → `devices` → `friendships` → `conversations` → `conversation_members` → `messages` → `message_receipts` → `message_hidden` → `message_reactions` → `message_edits` → `pinned_messages` → `starred_messages` → `calls`.
- Verified batch insertion with `ON CONFLICT DO NOTHING` for idempotent re-runs.
- Verified `scripts/verify-database-parity.ts` orphan detection queries.

### 2.3 Application Layer & Driver Toggle
- `DATA_REPOSITORY_DRIVER=supabase`: Successfully routes to Supabase PostgREST client.
- `DATA_REPOSITORY_DRIVER=neon`: Successfully routes to native PostgreSQL repositories using `postgres` client library.
- Zero dual-writing: Strict single-driver execution.

### 2.4 Test Suite
- **27 passed** tests in Vitest (`npm test`).
- Multi-user authorization verified:
  - Unauthorized user cannot read, send, edit, delete, or star messages in private conversations.
  - Sender-only editing and deletion strictly enforced in `MessageService`.
- Keyset pagination verified with duplicate timestamp tie-breaking `(created_at DESC, id DESC)`.
- Single-query unread aggregation verified with exact parity against PostgREST.

---

## 3. Production Cutover Plan

### 3.1 Pre-Cutover Checklist
- [ ] Phase 4 (WebSocket Realtime Migration) completed and verified so message delivery does not depend on Supabase Postgres WAL.
- [ ] Neon production database provisioned with dedicated compute endpoint and pooled connection string (`?sslmode=require`).
- [ ] Production schema applied via `src/lib/infra/postgres/schema.sql`.
- [ ] Full backup snapshot of Supabase PostgreSQL created.

### 3.2 Cutover Execution Sequence
1. **Maintenance Mode Window (Estimated downtime: 2–5 minutes):**
   - Announce brief maintenance window.
   - Point application to read-only or display maintenance banner.
2. **Execute Full Data Sync:**
   ```powershell
   npx tsx scripts/migrate-supabase-to-neon.ts
   ```
3. **Execute Parity Verification:**
   ```powershell
   npx tsx scripts/verify-database-parity.ts
   ```
   Must exit with code 0 (100% row count match, 0 orphan records).
4. **Switch Driver Configuration:**
   In environment variables:
   ```env
   DATA_REPOSITORY_DRIVER=neon
   DATABASE_URL=postgresql://[user]:[password]@[endpoint].neon.tech/ghostline?sslmode=require
   ```
5. **Run Production Smoke Tests:**
   - Log in with test account.
   - Send direct message.
   - Verify pagination and unread counts.
   - Verify WebRTC audio/video call.
6. **Lift Maintenance Window.**

### 3.3 Rollback Trigger Conditions
Rollback to Supabase will be triggered immediately if:
- Parity verification fails on row counts or foreign-key integrity.
- Application error rates exceed 0.5% during smoke testing.
- Database latency on Neon exceeds acceptable thresholds (>200ms p95).

### 3.4 Rollback Procedure (Zero Downtime)
1. Revert environment variable:
   ```env
   DATA_REPOSITORY_DRIVER=supabase
   ```
2. Trigger server container reload / redeploy.
3. Verify application immediately resumes reading/writing to Supabase PostgREST.

---

## 4. Architectural Verdict & Next Steps

> [!IMPORTANT]
> **Database migration is complete, but realtime transport must be migrated before production database cutover.**

The database layer on Neon is fully implemented, documented, and tested. However, because live chat requires instantaneous message delivery across browser tabs, cutting over the database now would degrade user experience by breaking real-time updates for receiving participants.

**Recommended Roadmap Sequence:**
1. Maintain `DATA_REPOSITORY_DRIVER=supabase` in production.
2. Proceed to **Phase 3 (Backend + Authorization)** and **Phase 4 (WebSocket Realtime Migration)**.
3. In Phase 4, replace Supabase `postgres_changes` with a provider-independent WebSocket server (e.g. fastify-websocket, PartyKit, or Cloudflare Durable Objects).
4. Once WebSocket realtime is independent of Supabase Postgres WAL, execute the database cutover to Neon without any loss of live chat functionality.
