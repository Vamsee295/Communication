-- E2EE-4 Encrypted Attachments Schema Migration
-- IMPORTANT: DO NOT automatically apply to production.
-- This migration script creates server-side metadata tables for opaque E2EE attachment tracking.
-- Zero plaintext filenames, MIME types, sizes, or encryption keys are stored in database columns.

CREATE TABLE IF NOT EXISTS public.e2ee_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  uploader_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  uploader_device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  storage_key TEXT NOT NULL UNIQUE, -- e.g. attachments/e2ee/<opaque_attachment_id>.bin
  ciphertext_size_bytes BIGINT NOT NULL,
  chunk_count INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'attached', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for conversation lookup & orphan cleanup reconciliation
CREATE INDEX IF NOT EXISTS idx_e2ee_attachments_conversation ON public.e2ee_attachments (conversation_id, status);
CREATE INDEX IF NOT EXISTS idx_e2ee_attachments_uploader ON public.e2ee_attachments (uploader_user_id, status);
CREATE INDEX IF NOT EXISTS idx_e2ee_attachments_message ON public.e2ee_attachments (message_id);

COMMENT ON TABLE public.e2ee_attachments IS 'Opaque metadata for E2EE-4 encrypted attachments. Ciphertext only stored in R2. Zero plaintext metadata in database.';
