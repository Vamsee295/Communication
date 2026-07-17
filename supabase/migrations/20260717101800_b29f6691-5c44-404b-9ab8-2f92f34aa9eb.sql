
-- Per-user hidden messages ("Delete for Me")
CREATE TABLE public.message_hidden (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX message_hidden_user_idx ON public.message_hidden(user_id);
GRANT SELECT, INSERT, DELETE ON public.message_hidden TO authenticated;
GRANT ALL ON public.message_hidden TO service_role;
ALTER TABLE public.message_hidden ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own hides" ON public.message_hidden
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users hide messages they can see" ON public.message_hidden
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

CREATE POLICY "Users unhide their own" ON public.message_hidden
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Allow the sender to permanently delete their own message
CREATE POLICY "Sender deletes own messages" ON public.messages
  FOR DELETE TO authenticated USING (sender_id = auth.uid());

-- Ensure DELETE realtime payload includes all columns (so conversation_id filter works)
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- Realtime publication for hides
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_hidden;
