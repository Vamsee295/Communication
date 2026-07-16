
DROP POLICY IF EXISTS "Authenticated create conversations" ON public.conversations;
REVOKE INSERT ON public.conversations FROM authenticated;

CREATE OR REPLACE FUNCTION public.open_direct_conversation(_friend uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _conv uuid;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _friend = _me THEN
    RAISE EXCEPTION 'Cannot start a conversation with yourself';
  END IF;
  IF NOT public.are_friends(_me, _friend) THEN
    RAISE EXCEPTION 'Not friends';
  END IF;

  -- Find existing direct conversation between the two users
  SELECT c.id INTO _conv
    FROM public.conversations c
    JOIN public.conversation_members a ON a.conversation_id = c.id AND a.user_id = _me
    JOIN public.conversation_members b ON b.conversation_id = c.id AND b.user_id = _friend
   WHERE c.kind = 'direct'
   LIMIT 1;

  IF _conv IS NOT NULL THEN
    RETURN _conv;
  END IF;

  INSERT INTO public.conversations (kind) VALUES ('direct') RETURNING id INTO _conv;
  INSERT INTO public.conversation_members (conversation_id, user_id) VALUES (_conv, _me), (_conv, _friend);
  RETURN _conv;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.open_direct_conversation(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.open_direct_conversation(uuid) TO authenticated;
