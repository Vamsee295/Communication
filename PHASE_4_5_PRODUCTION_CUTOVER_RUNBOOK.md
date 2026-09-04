# Phase 4.5 Production Cutover Runbook: Zero-Loss Migration & Rollback

**Document:** `PHASE_4_5_PRODUCTION_CUTOVER_RUNBOOK.md`  
**Date:** September 3, 2026  
**Status:** COMPLETE RUNBOOK — STANDARDIZED OPERATIONAL PROCEDURE  

---

## 1. Pre-Cutover Preparation

### 1.1 Snapshot & Point-In-Time Backup
1. **Supabase Production Snapshot:**
   - Navigate to Supabase Dashboard -> Database -> Backups.
   - Trigger a manual database backup snapshot.
   - Record Snapshot ID: `sb_backup_[timestamp]`.
2. **Neon Production Restore Point:**
   - Navigate to Neon Console -> Branches -> `main`.
   - Create a restore branch or snapshot point: `neon_pre_cutover_[timestamp]`.

### 1.2 Initial Bulk Migration (While Application Remains on Supabase)
Run initial bulk copy to populate Neon with history prior to the cutover window:
```bash
npx tsx scripts/migrate-supabase-to-neon.ts
```
*Note: Users continue reading and writing to Supabase without any disruption.*

### 1.3 Parity Check Baseline
```bash
npx tsx scripts/verify-database-parity.ts
```

---

## 2. Cutover Execution Window

### Step 1: Enable Write Freeze
Activate maintenance mode write gate across all application instances:
```bash
# Set in deployment environment (Cloudflare / Nitro worker environment)
GHOSTLINE_WRITE_FREEZE=true
```
- Server Functions now reject new writes with `HTTP 503 MaintenanceWriteFreezeError`.
- Read operations, profile viewing, and existing conversation history remain accessible.

### Step 2: Final Delta Synchronization
With write traffic frozen, execute the final delta synchronization:
```bash
npx tsx scripts/migrate-supabase-to-neon.ts
```
Because the migration uses `ON CONFLICT DO NOTHING` and handles mutable records in topological DAG order, only rows created or modified since the initial migration are transferred.

### Step 3: Verify 100% Data Parity
```bash
npx tsx scripts/verify-database-parity.ts
```
- Verify all 14 tables report `PASS`.
- **ABORT CONDITION:** If any table reports a row mismatch or foreign key violation, STOP immediately. Do NOT proceed to Step 4.

### Step 4: Switch Production Drivers
Update production environment variables:
```env
DATA_REPOSITORY_DRIVER=neon
REALTIME_DRIVER=websocket
GHOSTLINE_WRITE_FREEZE=false
```

### Step 5: Execute Two-User Smoke Test
Conduct the deterministic two-user smoke test according to Section 4.

---

## 3. Rollback Procedures

### Scenario A: Rollback BEFORE Neon Accepts Production Writes
*(Triggered if Neon connection fails or smoke tests fail immediately)*
1. Keep `GHOSTLINE_WRITE_FREEZE=true`.
2. Revert environment variables:
   ```env
   DATA_REPOSITORY_DRIVER=supabase
   REALTIME_DRIVER=supabase
   GHOSTLINE_WRITE_FREEZE=false
   ```
3. Restart application. Supabase resumes as primary. Zero data loss.

### Scenario B: Rollback AFTER Neon Accepted Production Writes
*(Triggered if a failure occurs minutes/hours after live traffic was routed to Neon)*
1. **Immediately freeze writes:**
   ```env
   GHOSTLINE_WRITE_FREEZE=true
   ```
2. **Execute Reverse Reconciliation Tool:**
   ```bash
   npx tsx scripts/reconcile-neon-to-supabase.ts
   ```
   - Scans Neon for any rows inserted or edited since cutover timestamp.
   - Upserts new/modified messages, reactions, pins, receipts, and calls into Supabase.
3. **Verify Parity:**
   ```bash
   npx tsx scripts/verify-database-parity.ts
   ```
4. **Revert Production Drivers:**
   ```env
   DATA_REPOSITORY_DRIVER=supabase
   REALTIME_DRIVER=supabase
   GHOSTLINE_WRITE_FREEZE=false
   ```
5. Resume traffic on Supabase.

---

## 4. Deterministic Two-User Smoke Test Checklist

| # | Domain | Test Action | Expected Result | Verified |
|---|---|---|---|:---:|
| 1 | **Auth** | User A & B log in via Supabase Auth | Session created; `claims.sub` matches `profiles.id` | [ ] |
| 2 | **Messaging** | User A sends message to User B in `convAB` | Written to Neon; User B receives live over WebSocket | [ ] |
| 3 | **Edits** | User A edits message | Updated in Neon; edit badge & new text appear on User B screen | [ ] |
| 4 | **Reactions** | User B reacts with "🔥" | Written to Neon; User A sees updated reaction pill | [ ] |
| 5 | **Pins** | User A pins message | Written to Neon; pin carousel updates for both users | [ ] |
| 6 | **Read Receipts**| User B marks chat read | Neon receipt committed; User A sees double checkmarks | [ ] |
| 7 | **Typing** | User A types in input | User B sees "User A is typing..."; User A receives no echo | [ ] |
| 8 | **Presence** | User A goes offline/online | Global presence dot toggles dynamically on User B screen | [ ] |
| 9 | **Isolation** | User C (member of `convBC`) observes traffic | Receives 0 frames from `convAB` | [ ] |
| 10 | **Calls (WebRTC)**| User A initiates call to User B | Rings via `SupabaseCallSignaling`; media establishes | [ ] |
| 11 | **Reconnect** | User B disconnects and reconnects WiFi | Socket reconnects; query cache invalidates; zero missed msgs | [ ] |
