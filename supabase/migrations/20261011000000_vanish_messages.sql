-- Migration: vanish_messages
-- Add is_vanish flag to messages table and vanish_session_active_until to conversations table.

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_vanish BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS vanish_session_active_until TIMESTAMPTZ;

-- Allow conversation participants to delete their vanish messages.
-- Note: the application relies primarily on backend functionality, but we set this policy for completeness and security.
CREATE POLICY "Users can delete vanish messages in their conversations" ON public.messages
  FOR DELETE
  USING (
    is_vanish = true AND
    conversation_id IN (
      SELECT conversation_id FROM public.conversation_members WHERE user_id = auth.uid()
    )
  );
