-- Ghostline E2EE-2 relay schema (Neon, manual production migration)
-- Apply only after the normal Neon schema and E2EE-1 schema are present.
-- This schema deliberately stores public protocol material and opaque envelopes only.

CREATE TABLE IF NOT EXISTS public.e2ee_protocol_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  protocol_device_id SMALLINT NOT NULL CHECK (protocol_device_id BETWEEN 1 AND 5),
  registration_id INTEGER CHECK (registration_id BETWEEN 1 AND 65535),
  device_type TEXT NOT NULL DEFAULT 'web' CHECK (device_type IN ('mobile', 'desktop', 'tablet', 'web')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id),
  UNIQUE (user_id, protocol_device_id)
);
CREATE INDEX IF NOT EXISTS e2ee_protocol_devices_user_active_idx
  ON public.e2ee_protocol_devices (user_id, protocol_device_id) WHERE enabled;

CREATE TABLE IF NOT EXISTS public.e2ee_account_identities (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  identity_type TEXT NOT NULL DEFAULT 'aci' CHECK (identity_type IN ('aci', 'pni')),
  x25519_public_key TEXT NOT NULL,
  ed25519_public_key TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, identity_type)
);

CREATE TABLE IF NOT EXISTS public.e2ee_protocol_prekeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_device_id UUID NOT NULL REFERENCES public.e2ee_protocol_devices(id) ON DELETE CASCADE,
  identity_type TEXT NOT NULL DEFAULT 'aci' CHECK (identity_type IN ('aci', 'pni')),
  key_type TEXT NOT NULL CHECK (key_type IN ('ecPreKey', 'ecSignedPreKey', 'kemOneTimePreKey', 'kemLastResortPreKey')),
  key_id INTEGER NOT NULL CHECK (key_id >= 0),
  public_key TEXT NOT NULL,
  signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (protocol_device_id, identity_type, key_type, key_id)
);
CREATE INDEX IF NOT EXISTS e2ee_protocol_prekeys_lookup_idx
  ON public.e2ee_protocol_prekeys (protocol_device_id, identity_type, key_type, key_id);

CREATE TABLE IF NOT EXISTS public.e2ee_envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_protocol_device_id UUID NOT NULL REFERENCES public.e2ee_protocol_devices(id) ON DELETE CASCADE,
  sender_protocol_device_id UUID NOT NULL REFERENCES public.e2ee_protocol_devices(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('ciphertext', 'prekey_bundle', 'sender_key', 'server_delivery_receipt', 'unidentified_sender')),
  client_timestamp BIGINT NOT NULL,
  client_message_id TEXT,
  urgent BOOLEAN NOT NULL DEFAULT true,
  ephemeral BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  UNIQUE NULLS NOT DISTINCT (recipient_protocol_device_id, sender_protocol_device_id, client_message_id)
);
CREATE INDEX IF NOT EXISTS e2ee_envelopes_recipient_pending_idx
  ON public.e2ee_envelopes (recipient_protocol_device_id, created_at, id)
  WHERE delivered_at IS NULL;

-- The app connects directly to Neon as a trusted backend service. Do not grant
-- anon/authenticated access: there is intentionally no PostgREST/RLS relay path.
