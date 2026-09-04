# GHOSTLINE — E2EE READ-ONLY IMPLEMENTATION AUDIT & SPECIFICATION

> **Security Mandate**: This audit is a zero-mutation analysis of the Ghostline codebase. No application source code, database schemas, dependencies, or UI components have been modified during this audit phase.

---

## 1. Current Plaintext Flow

Currently, message text travels through the application stack in unencrypted cleartext:

```
[ User Text Input ]
        │ (Plaintext string)
        ▼
[ Client UI: chats.$conversationId.tsx ]
        │ (HTTPS POST /api/server-fn -> sendMessage)
        ▼
[ Cloudflare Worker / TanStack Start Server Fn (chat.functions.ts) ]
        │ (App Service Layer: MessageService.send)
        ▼
[ Neon PostgreSQL (public.messages.body TEXT column) ]
        │
        ├───────────────────────────────┐
        ▼                               ▼
[ RealtimeGateway (WebSocket) ]   [ PostCommitPublisher -> PushDispatcher ]
        │ (Plaintext payload)           │ (Generic Push Notification)
        ▼                               ▼
[ Recipient Browser ]             [ Browser Service Worker ]
```

---

## 2. Current Crypto State

- **Application Cryptography**: None. No end-to-end payload encryption exists.
- **Transport Security**: TLS 1.3 (HTTPS / WSS) in transit.
- **Database Security**: Server-side disk encryption at rest provided by Neon PostgreSQL and Supabase.
- **Authentication**: Supabase Auth JWT tokens (`ES256` / `RS256`).
- **Web Push**: VAPID (`ECDSA P-256`) keypair signing for Web Push subscription authentication.

---

## 3. Current Device Architecture

- **Database Table**: `public.devices` ([`supabase/migrations/20260715120255_92546a94-42a8-4332-8205-b1a3aa1f5dd7.sql:58-69`](file:///x:/Project-Buildings/Communication/supabase/migrations/20260715120255_92546a94-42a8-4332-8205-b1a3aa1f5dd7.sql#L58-L69)).
- **Fields**: `id`, `user_id`, `device_key` (client-generated UUID in `localStorage`), `device_name`, `platform`, `user_agent`, `last_seen_at`, `revoked_at`.
- **Cryptographic State**: **Zero key material**. Devices currently act only as session/push tracking entries and have no asymmetric keypairs, Identity Keys, or PreKeys.

---

## 4. Current Message Schema

- **Database Table**: `public.messages` ([`supabase/migrations/20260715120256_...sql`](file:///x:/Project-Buildings/Communication/supabase/migrations/20260715120256_messages.sql)).
- **Columns**: `id`, `conversation_id`, `sender_id`, `body` (`TEXT`), `client_id`, `reply_to_id`, `forwarded_from_id`, `created_at`, `edited_at`, `deleted_at`.
- **Primary Plaintext Vulnerability**: `body` stores raw unencrypted string.

---

## 5. Current Attachment Architecture

- **Implementation**: [`src/lib/attachments.ts`](file:///x:/Project-Buildings/Communication/src/lib/attachments.ts).
- **Storage**: Cloudflare R2 binary bucket via S3 presigned URLs (`AWS4-HMAC-SHA256`).
- **Plaintext Status**: Files (JPEG, PNG, PDF, GIF, TXT) are uploaded in cleartext binary format without client-side payload encryption. Anyone with the R2 object key or signed GET URL can view the raw attachment file.

---

## 6. Current Push Architecture

- **Implementation**: [`src/lib/push/push-dispatcher.ts`](file:///x:/Project-Buildings/Communication/src/lib/push/push-dispatcher.ts).
- **Payload**: Generic notification (`title: "New message"`, `body: "New message in Ghostline"`).
- **Plaintext Status**: **Safe against message text leak** — message body is NOT included in push payloads.

---

## 7. Current Realtime Architecture

- **Implementation**: [`src/lib/realtime/multi-instance-gateway.ts`](file:///x:/Project-Buildings/Communication/src/lib/realtime/multi-instance-gateway.ts) & [`realtime-gateway.ts`](file:///x:/Project-Buildings/Communication/src/lib/realtime/realtime-gateway.ts).
- **Transport**: WebSocket connections routed through Cloudflare Durable Objects.
- **Event Payload**: Broadcasts `message.created` containing full `Message` object (including cleartext `body`).

---

## 8. Current Group Architecture

- **Implementation**: [`src/lib/services/conversation.service.ts`](file:///x:/Project-Buildings/Communication/src/lib/services/conversation.service.ts).
- **Membership**: `public.conversation_members` table with roles `owner`, `admin`, `member`.
- **Authorization**: Server-side `ConversationPolicy` checks membership before returning query results or accepting writes.
- **Cryptographic Status**: **No cryptographic group state**. Membership is purely application authorization.

---

## 9. Current Multi-Device Architecture

- **User Accounts**: A user can have multiple records in `public.devices`.
- **Routing**: Messages are saved once per conversation. Any device belonging to a conversation member can list or fetch messages via HTTP server functions.
- **Cryptographic Status**: No fan-out encryption per device key.

---

## 10. Current Search Architecture

- **Implementation**: `PostgresMessageRepository.searchMessages()` and `searchMessagesGlobal()`.
- **Execution**: Server-side SQL query using `ILIKE` on `public.messages.body`.
- **E2EE Conflict**: SQL `ILIKE` cannot execute on encrypted ciphertext. Server-side message content search must be replaced with client-side local search indexing.

---

## 11. Current Forwarding Architecture

- **Implementation**: `MessageService.send({ forwarded_from_id, ... })` and `chat.functions.ts` (`forwardMessage`).
- **Execution**: Server copies `parent.body` text directly into a new message record on the target conversation.
- **E2EE Conflict**: Server cannot copy ciphertext across conversations because recipient key sets differ. Client must decrypt locally and re-encrypt for target recipients.

---

## 12. Current Edit/Reply Architecture

- **Editing**: [`src/lib/services/message.service.ts:110`](file:///x:/Project-Buildings/Communication/src/lib/services/message.service.ts#L110) updates `messages.body` in Neon and records previous plaintext in `message_edits`.
- **Replies**: `reply_to_id` references parent message UUID; UI renders parent message body.
- **E2EE Requirement**: Edit payloads must be re-encrypted client-side. Parent message body for replies must be resolved and decrypted locally on the client.

---

## 13. Security Risks of Current Baseline

1. **Database Compromise**: Any read leak of Neon PostgreSQL exposes 100% of historical message text.
2. **Infrastructure / Worker Compromise**: Cloudflare Worker or Durable Object operators could intercept message strings in flight.
3. **R2 Asset Interception**: Unencrypted attachment binaries in R2 can be accessed if signed URLs or keys leak.

---

## 14. Files That Must Change (during E2EE implementation phases)

- `src/lib/chat.functions.ts` — Update server actions to transport versioned ciphertext envelopes.
- `src/lib/domain/types.ts` — Add ciphertext envelope and device crypto types.
- `src/lib/services/message.service.ts` — Handle ciphertext storage & removal of server-side `ILIKE` search.
- `src/lib/repositories/postgres/postgres-message-repository.ts` — Store & retrieve versioned ciphertexts.
- `src/lib/repositories/postgres/postgres-device-call-repository.ts` — Store device prekeys & public key bundles.
- `src/lib/attachments.ts` — Require client-side binary payload encryption before R2 upload.
- `src/routes/_authenticated/chats.$conversationId.tsx` — Integrate local client E2EE crypto engine for encrypt/decrypt workflows.
- `src/routes/_authenticated/chats.index.tsx` — Integrate local search indexing.

---

## 15. Files That Should NOT Change

- `src/integrations/supabase/auth-middleware.ts` — Keep Supabase Auth as identity authority.
- `src/lib/services/call.service.ts` — WebRTC signaling flow remains intact.
- `src/lib/push/push-dispatcher.ts` — Generic notification dispatching remains intact.
- `src/components/ui/*` — UI components & styling design system.

---

## 16. Database Changes Required

```sql
-- New Device PreKeys Table for PQXDH / X3DH Asynchronous Session Establishment
CREATE TABLE public.device_prekeys (
  device_id UUID PRIMARY KEY REFERENCES public.devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_key TEXT NOT NULL,
  signed_prekey TEXT NOT NULL,
  signed_prekey_signature TEXT NOT NULL,
  one_time_prekeys JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Update Messages Table for Versioned Ciphertext Envelopes
ALTER TABLE public.messages
  ADD COLUMN ciphertext_envelope JSONB,
  ADD COLUMN is_encrypted BOOLEAN NOT NULL DEFAULT false;
```

---

## 17. Crypto Library Recommendation & Evaluation

### Candidates Evaluated:
1. **Signal Protocol (`@privacyresearch/libsignal-protocol-typescript`)**:
   - *Pros*: Proven TypeScript implementation of Double Ratchet & X3DH.
   - *Cons*: Community maintenance; official `libsignal-client` Rust/WASM bindings recommend Signal application usage only.
2. **Web Crypto API (Standard Browser W3C Primitive)**:
   - *Pros*: Native in all modern browsers and Cloudflare Workers runtime. Zero external NPM overhead. High performance.
   - *Primitives*: `crypto.subtle` (AES-256-GCM, ECDH P-256 / HKDF-SHA256, HMAC-SHA256).
   - *Recommendation*: Use standard **Web Crypto API** for core primitives (AES-GCM attachment & payload AEAD, ECDH HKDF Double Ratchet state) combined with robust TypeScript state machine wrappers.

---

## 18. Browser Compatibility Assessment

- `window.crypto.subtle` is supported in 100% of modern browsers (Chrome 37+, Firefox 34+, Safari 11+, Edge 79+, iOS Safari 11+).
- `IndexedDB` is supported in all modern desktop and mobile browsers for non-exportable private key storage.

---

## 19. Cloudflare Compatibility Assessment

- Cloudflare Workers & Durable Objects support standard `crypto.subtle` Web Crypto primitives natively.
- Server-side Worker runtime only routes opaque JSONB ciphertext envelopes, maintaining 100% Cloudflare compatibility without requiring WASM binaries in Worker isolates.

---

## 20. Migration Risks & Mitigation

- **Risk**: Existing historical messages are plaintext.
- **Mitigation**: Implement explicit dual-mode flag (`is_encrypted: boolean`). Historical messages remain readable as legacy entries. New messages set `is_encrypted = true`.

---

## 21. Rollback Strategy

- Database migrations add non-null optional columns (`ciphertext_envelope JSONB`, `is_encrypted BOOLEAN DEFAULT false`).
- If an E2EE client error occurs, the client fails closed (no unencrypted fallback) while preserving server data integrity.

---

## 22. Controlled E2EE Implementation Milestones

```
               GHOSTLINE E2EE MILESTONES

  [ E2EE-1: Cryptographic Identity & PreKeys ]
                       │
                       ▼
  [ E2EE-2: 1-to-1 E2EE Messaging (Double Ratchet) ]
                       │
                       ▼
  [ E2EE-3: Encrypted R2 Attachments + Local Search ]
                       │
                       ▼
  [ E2EE-4: Group E2EE & Multi-Device Fan-out ]
                       │
                       ▼
  [ E2EE-5: Key Verification & Security Hardening ]
```

---

## 23. Testing Strategy

1. **Crypto State Unit Tests**: Vitest suite for ECDH key exchange, ratchet advancement, and AEAD encryption/decryption.
2. **Server Blindness Integration Tests**: Assert that database records, WebSocket events, and server logs contain zero plaintext.
3. **Tamper Isolation Tests**: Verify corrupted ciphertexts are rejected by recipient clients.

---

## 24. Security Acceptance Criteria

- [ ] Plaintext `body` is never sent over network for `is_encrypted = true` messages.
- [ ] Neon PostgreSQL stores only opaque ciphertext JSONB envelopes.
- [ ] Cloudflare R2 stores binary ciphertexts without plaintext headers.
- [ ] Push notifications contain zero cleartext content.
- [ ] All quality gates (`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`) pass cleanly.

---

```text
E2EE READ-ONLY AUDIT COMPLETE: YES
CODE MODIFICATIONS: NONE (Zero mutation)
NEXT STEP: Await approval to begin Milestone E2EE-1.
```
