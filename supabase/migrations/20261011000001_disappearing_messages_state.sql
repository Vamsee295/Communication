-- Migration: disappearing_messages_state
-- Add disappearing_messages_enabled flag to conversations table

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS disappearing_messages_enabled BOOLEAN NOT NULL DEFAULT false;
