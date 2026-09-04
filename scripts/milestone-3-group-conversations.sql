-- ==============================================================================
-- Milestone 3: Group Conversations Schema Migration
-- ==============================================================================

-- 1. Extend conversation_kind enum with 'group'
DO $$ BEGIN
  ALTER TYPE public.conversation_kind ADD VALUE IF NOT EXISTS 'group';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Create group_member_role enum
DO $$ BEGIN
  CREATE TYPE public.group_member_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Extend conversations table with title and created_by
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS title TEXT CHECK (title IS NULL OR (char_length(trim(title)) BETWEEN 1 AND 100)),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 4. Extend conversation_members table with group role
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS role public.group_member_role NOT NULL DEFAULT 'member';
