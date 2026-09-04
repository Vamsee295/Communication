# GHOSTLINE — E2EE CRYPTOGRAPHIC ARCHITECTURE DECISION

> **Security Mandate**: This document is a formal cryptographic decision record for Ghostline. No application code, database schema, dependencies, or UI elements have been modified.

---

## Executive Summary & Architecture Decision

To deliver production-grade End-to-End Encryption (E2EE) without inventing a custom cryptographic protocol, Ghostline adopts the **Signal Protocol (PQXDH / X3DH + Double Ratchet)** specification.

Rather than assembling custom Web Crypto TypeScript wrappers (which risks protocol-level vulnerabilities in skip-key storage, header encryption, or ratchet state serialization), Ghostline recommends using **spec-compliant, audited protocol libraries** backed by standard cryptographic primitives.

---

## A. Recommended Protocol

- **Session Protocol**: **Double Ratchet Algorithm** (Kittinger / Marlinspike).
- **Key Agreement**: **PQXDH** (Post-Quantum Extended Triple Diffie-Hellman) / **X3DH** (Extended Triple Diffie-Hellman).
- **Curve Standard**: **Curve25519 (X25519 for Key Exchange, Ed25519 for Signatures)**.
- **Symmetric Cipher**: **AES-256-GCM** / **AES-256-CBC + HMAC-SHA256**.
- **KDF**: **HKDF-SHA256**.

---

## B. Recommended Implementation & Library Strategy

### Primary Library Choice: **`@privacyresearch/libsignal-protocol-typescript`** (or `@noble/curves` + spec-compliant Signal Double Ratchet)
- **Rationale**: 
  1. Implements standard Signal Protocol serialization, Double Ratchet state transitions, skipped message key management, header encryption, and X3DH bundle processing.
  2. Pure TypeScript / JS execution compatible across browser runtimes (Vite/React) without requiring native C/Rust binding compilation steps.
  3. Uses standard `Curve25519` primitives via audited JS/WASM underlying implementations.

---

## C. Why It Is Appropriate for Browser Clients

- **Non-blocking Execution**: Asynchronous key generation and session processing run smoothly in client thread or Web Workers.
- **Secure Persistence**: Session states and private identity keys are stored in client-side **IndexedDB** using non-exportable key structures.
- **No Private Key Leakage**: Client computes shared secrets locally; private key material never leaves the browser.

---

## D. Cloudflare Worker Compatibility

- **Server Blindness**: Cloudflare Workers act strictly as blind routers of JSONB ciphertext envelopes.
- **No Worker Decryption**: Workers do not parse or decrypt Double Ratchet payloads.
- **Zero WASM Overhead on Server**: Workers only process routing headers (`conversation_id`, `sender_device_id`, `target_device_ids`).

---

## E. Key Hierarchy

```
                      [ Master Account Identity ]
                                  │
                       [ Device Identity Key (IK) ]
                               (Ed25519)
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
[ Signed PreKey (SPK) ]                        [ One-Time PreKeys (OPK) ]
(Curve25519 signed by IK)                      (Pool of 100 Curve25519 keys)
         │                                                 │
         └────────────────────────┬────────────────────────┘
                                  ▼
                    [ Ephemeral Key Agreement (X3DH) ]
                                  │
                    [ Shared Master Key (SK) ]
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
      [ Root Key (RK) ]                 [ Chain Keys (CK) ]
                 │                                 │
                 └────────────────┬────────────────┘
                                  ▼
                       [ Message Keys (MK) ]
                       (AES-256-GCM / AEAD)
```

---

## F. Device Identity Model

- Every client device generates its own independent **Identity Keypair (`IK`)** on registration.
- Multiple devices under one user account hold distinct `IK`s and separate Double Ratchet sessions.
- **Account Public Directory**: Server stores user's active device list and public key bundles.

---

## G. PreKey Model

1. **Signed PreKey (`SPK`)**: Rotated every 7–14 days. Signed by `IK` to prevent MitM key substitution by server.
2. **One-Time PreKeys (`OPK`)**: Single-use Curve25519 keys uploaded in batches of 100.
3. **Atomic PreKey Consumption**: Server MUST atomically delete an `OPK` when fetched by an asynchronous sender to enforce forward secrecy during initial handshake.

---

## H. Session Model

- **Double Ratchet State**: Combines KDF chains (DH ratchet + symmetric ratchet).
- **Per-Message Keys**: Every message is encrypted with a unique single-use `MK` derived from current chain key.
- **Out-of-Order & Skipped Messages**: Receiver stores skipped message keys in an encrypted IndexedDB map (with maximum limit and TTL) to decrypt delayed or out-of-order packets.

---

## I. Multi-Device Model

- **Fan-Out Encryption**: When Alice sends a message in a 1-to-1 conversation with Bob (where Alice has 2 devices and Bob has 3 devices):
  - Alice's device encrypts the message payload **4 times** (for Bob's 3 devices + Alice's 1 other device).
  - The server receives a single payload containing an array of ciphertext envelopes targeted by `device_id`.

---

## J. Group Encryption Model

- **Pairwise Double Ratchet (1-to-1 Fan-Out) vs. Sender Keys**:
  - For small groups (≤ 50 members), pairwise Double Ratchet fan-out provides maximum forward secrecy and post-compromise security without requiring complex group state consensus.
  - **Membership Removal Secrecy**: When a member is removed, sender sessions advance ratchets; removed member cannot decrypt future ratchets.
  - **New Member History Secrecy**: New members receive no historical ratchet keys.

---

## K. Attachment Encryption Model

1. Sender generates random 256-bit AES-GCM key (`K_att`) and 96-bit IV locally.
2. Sender encrypts binary attachment payload on-device (`Web Crypto API`).
3. Encrypted ciphertext binary is uploaded to Cloudflare R2 via S3 presigned URL.
4. `K_att`, `IV`, `SHA-256 digest`, and R2 storage key are included inside the Double Ratchet encrypted text message payload.
5. Recipient downloads binary ciphertext from R2 and decrypts locally using `K_att`.

---

## L. Key Rotation

- **One-Time PreKeys**: Client replenishes OPK pool when server reports count < 20.
- **Signed PreKey**: Automatically rotated every 7 days.
- **Message Ratchet**: Advances automatically with every message sent/received.

---

## M. Device Revocation

- User revokes a device via `/settings`.
- Server marks device as `revoked_at = NOW()` and deletes its PreKey bundles.
- Other active client devices remove the revoked `device_id` from future fan-out payload recipient lists.

---

## N. Recovery Strategy

- Private Identity Keys reside in local browser `IndexedDB`.
- **Optional Escrow (Passphrase Backup)**: Client can encrypt its private key bundle locally using a 24-word recovery passphrase (derived via Argon2id / PBKDF2) and store the encrypted backup blob on the server.
- Server **never** holds unencrypted recovery keys.

---

## O. Normalized Database Schema

> **Refinement over initial audit**: The previous `one_time_prekeys JSONB` suggestion is replaced with a **normalized single-use table** to guarantee atomic, race-free consumption of prekeys during session setup.

```sql
-- 1. Device Identity & Signed PreKeys
CREATE TABLE public.device_prekeys (
  device_id UUID PRIMARY KEY REFERENCES public.devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_key TEXT NOT NULL,           -- Base64 Curve25519/Ed25519 Public Identity Key
  signed_prekey TEXT NOT NULL,         -- Base64 Curve25519 Public Signed PreKey
  signed_prekey_signature TEXT NOT NULL, -- Ed25519 Signature of Signed PreKey
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Atomic Single-Use One-Time PreKeys (Normalized Table)
CREATE TABLE public.device_one_time_prekeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  key_id INT NOT NULL,
  public_key TEXT NOT NULL,             -- Base64 Curve25519 Public One-Time PreKey
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, key_id)
);

-- Index for fast atomic fetch & delete
CREATE INDEX idx_dotp_device ON public.device_one_time_prekeys(device_id);

-- 3. Versioned Ciphertext Envelope Messages
ALTER TABLE public.messages
  ADD COLUMN ciphertext_envelopes JSONB, -- Array of { recipient_device_id, header, ciphertext }
  ADD COLUMN is_encrypted BOOLEAN NOT NULL DEFAULT false;
```

---

## P. Security Assumptions

1. **Client Endpoint Integrity**: User's device is free from active keyloggers and memory scrapers.
2. **Server Honest-but-Curious**: Server routes packets faithfully and does not attempt key substitution attacks (mitigated by key safety numbers/fingerprints).

---

## Q. Known Limitations

- **Metadata Leakage**: Server knows sender ID, recipient IDs, device IDs, timestamps, and message payload size.
- **Server-Side Search Disabled**: Content search must run locally on client IndexedDB indexes.

---

## R. Alternatives Rejected & Why

1. **Homemade Web Crypto Wrapper (Custom Double Ratchet)**:
   - *Rejected*: High risk of subtle protocol flaws (e.g. key reuse, incorrect skip-key storage, MAC validation order).
2. **Standard P-256 / RSA Primitive Wrapping**:
   - *Rejected*: Does not comply with Signal/X3DH specifications; lacks forward secrecy and post-compromise security properties.
3. **Storing `one_time_prekeys` as a single `JSONB` array**:
   - *Rejected*: Inability to perform atomic, race-free single-key consumption under concurrent sender requests.

---

```text
E2EE CRYPTOGRAPHIC DECISION COMPLETE: YES
RECOMMENDED PROTOCOL: Signal Protocol (Double Ratchet + X3DH / PQXDH)
RECOMMENDED LIBRARY: @privacyresearch/libsignal-protocol-typescript
CODE MODIFICATIONS: NONE (Zero mutation)
NEXT STEP: Await explicit user approval before starting Milestone E2EE-1.
```
