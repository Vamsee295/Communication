-- E2EE-5 Privacy-Preserving Push Subscriptions Schema
-- IMPORTANT: DO NOT automatically apply to production.
-- This migration script creates per-device push subscription tracking with device_id binding.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for per-user and per-device push notification lookup & revocation cleanup
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_device ON public.push_subscriptions (user_id, device_id, status);

COMMENT ON TABLE public.push_subscriptions IS 'Opaque per-device Web Push subscriptions. Zero message content or E2EE keys stored.';
