
-- ============ MESSAGE COLUMNS ============
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forwarded_from_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;

-- ============ REACTIONS ============
CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions: members can read"
  ON public.message_reactions FOR SELECT TO authenticated
  USING (public.is_conversation_member(
    (SELECT conversation_id FROM public.messages WHERE id = message_id),
    auth.uid()
  ));

CREATE POLICY "reactions: members can add own"
  ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_conversation_member(
      (SELECT conversation_id FROM public.messages WHERE id = message_id),
      auth.uid()
    )
  );

CREATE POLICY "reactions: users can delete own"
  ON public.message_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;

-- ============ EDIT HISTORY ============
CREATE TABLE IF NOT EXISTS public.message_edits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  previous_body text NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.message_edits TO authenticated;
GRANT ALL ON public.message_edits TO service_role;
ALTER TABLE public.message_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "edits: sender can read own edits"
  ON public.message_edits FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND m.sender_id = auth.uid())
    OR public.is_conversation_member(
      (SELECT conversation_id FROM public.messages WHERE id = message_id),
      auth.uid()
    )
  );

CREATE POLICY "edits: sender can insert"
  ON public.message_edits FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND m.sender_id = auth.uid())
  );

-- ============ PINNED MESSAGES ============
CREATE TABLE IF NOT EXISTS public.pinned_messages (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, message_id)
);
GRANT SELECT, INSERT, DELETE ON public.pinned_messages TO authenticated;
GRANT ALL ON public.pinned_messages TO service_role;
ALTER TABLE public.pinned_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pins: members can read"
  ON public.pinned_messages FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "pins: members can pin"
  ON public.pinned_messages FOR INSERT TO authenticated
  WITH CHECK (
    pinned_by = auth.uid()
    AND public.is_conversation_member(conversation_id, auth.uid())
  );

CREATE POLICY "pins: members can unpin"
  ON public.pinned_messages FOR DELETE TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));

ALTER TABLE public.pinned_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pinned_messages;

-- Enforce max 3 pins per conversation
CREATE OR REPLACE FUNCTION public.enforce_pin_limit()
RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.pinned_messages WHERE conversation_id = NEW.conversation_id) >= 3 THEN
    RAISE EXCEPTION 'Pin limit reached (3 per conversation)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_pin_limit_trg ON public.pinned_messages;
CREATE TRIGGER enforce_pin_limit_trg
BEFORE INSERT ON public.pinned_messages
FOR EACH ROW EXECUTE FUNCTION public.enforce_pin_limit();

-- ============ STARRED MESSAGES ============
CREATE TABLE IF NOT EXISTS public.starred_messages (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  starred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);
GRANT SELECT, INSERT, DELETE ON public.starred_messages TO authenticated;
GRANT ALL ON public.starred_messages TO service_role;
ALTER TABLE public.starred_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stars: users manage own"
  ON public.starred_messages FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_conversation_member(
      (SELECT conversation_id FROM public.messages WHERE id = message_id),
      auth.uid()
    )
  );

-- ============ EDIT TRIGGER: auto-record previous body ============
CREATE OR REPLACE FUNCTION public.record_message_edit()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body AND OLD.deleted_at IS NULL THEN
    INSERT INTO public.message_edits (message_id, previous_body, edited_at)
    VALUES (OLD.id, OLD.body, now());
    NEW.edited_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_message_edit_trg ON public.messages;
CREATE TRIGGER record_message_edit_trg
BEFORE UPDATE OF body ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.record_message_edit();

-- ============ ALLOW SENDER TO UPDATE OWN MESSAGE BODY ============
DROP POLICY IF EXISTS "messages: sender can edit own" ON public.messages;
CREATE POLICY "messages: sender can edit own"
  ON public.messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());
