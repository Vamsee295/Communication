-- Migration: group_system_v1
-- Expands conversations with description and avatar_url
-- Adds group_permissions, member_restrictions, group_invite_links, group_admin_actions

ALTER TABLE public.conversations 
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE TABLE IF NOT EXISTS public.group_permissions (
  conversation_id UUID PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  send_messages BOOLEAN NOT NULL DEFAULT true,
  send_media BOOLEAN NOT NULL DEFAULT true,
  send_files BOOLEAN NOT NULL DEFAULT true,
  send_voice BOOLEAN NOT NULL DEFAULT true,
  send_links BOOLEAN NOT NULL DEFAULT true,
  create_polls BOOLEAN NOT NULL DEFAULT true,
  add_members BOOLEAN NOT NULL DEFAULT false,
  pin_messages BOOLEAN NOT NULL DEFAULT false,
  change_group_info BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.member_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  restricted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  send_messages BOOLEAN NOT NULL DEFAULT true,
  send_media BOOLEAN NOT NULL DEFAULT true,
  send_files BOOLEAN NOT NULL DEFAULT true,
  send_voice BOOLEAN NOT NULL DEFAULT true,
  send_links BOOLEAN NOT NULL DEFAULT true,
  create_polls BOOLEAN NOT NULL DEFAULT true,
  add_members BOOLEAN NOT NULL DEFAULT true,
  pin_messages BOOLEAN NOT NULL DEFAULT true,
  change_group_info BOOLEAN NOT NULL DEFAULT true,
  restricted_until TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS member_restrictions_conv_user_idx ON public.member_restrictions(conversation_id, user_id);

CREATE TABLE IF NOT EXISTS public.group_invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  expires_at TIMESTAMPTZ NULL,
  max_uses INT NULL,
  use_count INT NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS group_invite_links_conv_idx ON public.group_invite_links(conversation_id);
CREATE INDEX IF NOT EXISTS group_invite_links_token_idx ON public.group_invite_links(token);

CREATE TABLE IF NOT EXISTS public.group_admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS group_admin_actions_conv_idx ON public.group_admin_actions(conversation_id, created_at DESC);
