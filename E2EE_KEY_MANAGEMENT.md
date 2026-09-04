# GHOSTLINE — E2EE KEY MANAGEMENT SPECIFICATION (MILESTONE E2EE-1)

This document describes the cryptographic identity and prekey management specification implemented for Ghostline devices in Milestone E2EE-1.

---

## 1. Cryptographic Primitives & Specification

Ghostline implements standard Signal-family asynchronous key agreement primitives using **Curve25519 (Ed25519 & X25519)**:

- **Identity Keypair (`IK`)**: Ed25519 signature keypair generated per client device.
- **Signed PreKey (`SPK`)**: X25519 keypair signed by the device's `IK` (`Ed25519.sign(spk.publicKey, ik.privateKey)`). Rotated periodically (7-day target lifecycle).
- **One-Time PreKeys (`OPKs`)**: Batch of X25519 keypairs generated per device for single-use asynchronous session setup.

---

## 2. Public vs. Private Material Boundary

```
                     SECURITY BOUNDARY

[ CLIENT (Browser IndexedDB) ]             [ SERVER (Neon PostgreSQL) ]
──────────────────────────────             ────────────────────────────
• Identity Private Key (Ed25519)            • Identity Public Key
• Signed PreKey Private Key (X25519)        • Signed PreKey Public Key
• One-Time PreKey Private Keys (X25519)     • Signed PreKey Signature
                                            • One-Time PreKey Public Keys (Normalized)
```

**Security Mandate**: Private key material NEVER leaves the client device. Server APIs strictly reject or prevent uploading private keys.

---

## 3. Database Schema (`supabase/migrations/20260904193000_e2ee_prekeys.sql`)

### Device Prekeys (`public.device_prekeys`)
Stores the long-term public identity key and active signed prekey bundle for each device:
- `device_id` (UUID, PRIMARY KEY)
- `user_id` (UUID, FK to `auth.users`)
- `identity_key` (Base64 Ed25519 public key)
- `signed_prekey` (Base64 X25519 public key)
- `signed_prekey_signature` (Base64 Ed25519 signature)
- `created_at` / `updated_at`

### One-Time Prekeys (`public.device_one_time_prekeys`)
Normalized single-use table for atomic prekey consumption:
- `id` (UUID, PRIMARY KEY)
- `device_id` (UUID, FK to `public.devices`)
- `key_id` (INT)
- `public_key` (Base64 X25519 public key)
- `created_at`
- `UNIQUE(device_id, key_id)`

---

## 4. Atomic One-Time PreKey Consumption

To eliminate race conditions when multiple asynchronous senders initiate a session simultaneously, `PostgresPrekeyRepository.consumeOneTimePrekey()` performs single-key fetch & delete atomically:

```sql
DELETE FROM public.device_one_time_prekeys
 WHERE id = (
   SELECT id FROM public.device_one_time_prekeys
    WHERE device_id = $1
    ORDER BY key_id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
 )
 RETURNING key_id, public_key;
```

---

## 5. Client Key Store (`CryptoKeyStore`)

Client private keys are persisted in browser **IndexedDB** (`ghostline_crypto_store` / `device_private_state` store). `CryptoKeyStore` provides non-exportable storage scoped strictly to the local device ID.

---

## 6. PreKey Replenishment & Rotation

- **Replenishment**: Client auto-generates 100 OPKs initially. When remaining OPK count on server falls below 20, `ClientCryptoService` generates a new batch and calls `replenishDeviceOneTimePrekeys`.
- **Signed PreKey Rotation**: Executed via `rotateDeviceSignedPrekey` server action every 7 days.

---

## 7. Device Revocation

When a user revokes a device via `/settings`:
1. Server marks `devices.revoked_at = NOW()`.
2. `PostgresPrekeyRepository.revokeDevicePrekeys()` purges all public prekeys and OPKs for that device.
3. Client IndexedDB private keys are ignored by future senders as the device is no longer listed in active bundles.
