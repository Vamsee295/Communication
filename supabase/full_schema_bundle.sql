-- =====================================================================================
-- GHOSTLINE COMPLETE APPLICATION SCHEMA BUNDLE
-- Target Supabase Project: glczzihurrenapbbepfy
-- Concatenated in exact chronological order from supabase/migrations/
-- =====================================================================================

-- =====================================================================================
-- 1. MIGRATION 20260715120255: Core Profiles, Roles, Devices, Friendships, Trigger
-- =====================================================================================

-- =========== ENUMS ===========
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.friendship_status AS ENUM ('pending', 'accepted', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========== PROFILES ===========
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Profiles are viewable by authenticated users') THEN
    CREATE POLICY "Profiles are viewable by authenticated users"
      ON public.profiles FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users insert own profile') THEN
    CREATE POLICY "Users insert own profile"
      ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users update own profile') THEN
    CREATE POLICY "Users update own profile"
      ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- Username validation constraint
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT username_format
    CHECK (username IS NULL OR (char_length(username) BETWEEN 3 AND 30 AND username ~ '^[a-z0-9_]+$'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========== USER ROLES ===========
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_roles' AND policyname = 'Users can view own roles') THEN
    CREATE POLICY "Users can view own roles"
      ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- =========== DEVICES ===========
CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_key TEXT NOT NULL,
  device_name TEXT,
  platform TEXT NOT NULL DEFAULT 'web',
  user_agent TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'devices' AND policyname = 'Users manage own devices') THEN
    CREATE POLICY "Users manage own devices"
      ON public.devices FOR ALL TO authenticated
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- =========== FRIENDSHIPS ===========
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.friendship_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  CHECK (requester_id <> addressee_id),
  UNIQUE (requester_id, addressee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'friendships' AND policyname = 'View own friendships') THEN
    CREATE POLICY "View own friendships"
      ON public.friendships FOR SELECT TO authenticated
      USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'friendships' AND policyname = 'Create own friend request') THEN
    CREATE POLICY "Create own friend request"
      ON public.friendships FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = requester_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'friendships' AND policyname = 'Update own friendships') THEN
    CREATE POLICY "Update own friendships"
      ON public.friendships FOR UPDATE TO authenticated
      USING (auth.uid() = requester_id OR auth.uid() = addressee_id)
      WITH CHECK (auth.uid() = requester_id OR auth.uid() = addressee_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'friendships' AND policyname = 'Delete own friendships') THEN
    CREATE POLICY "Delete own friendships"
      ON public.friendships FOR DELETE TO authenticated
      USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS friendships_requester_idx ON public.friendships(requester_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON public.friendships(addressee_id);

-- =========== TRIGGERS ===========
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on new user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =====================================================================================
-- 2. MIGRATION 20260715120356: Permissions Hardening
-- =====================================================================================

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


-- =====================================================================================
-- 3. MIGRATION 20260715120436: Storage Policies for Avatars
-- =====================================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Avatars readable by authenticated') THEN
    CREATE POLICY "Avatars readable by authenticated"
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'avatars');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users upload own avatar') THEN
    CREATE POLICY "Users upload own avatar"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users update own avatar') THEN
    CREATE POLICY "Users update own avatar"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users delete own avatar') THEN
    CREATE POLICY "Users delete own avatar"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;


-- =====================================================================================
-- 4. MIGRATION 20260716133338: Conversations, Members, Messages, Receipts, Realtime
-- =====================================================================================

DO $$ BEGIN
  CREATE TYPE public.conversation_kind AS ENUM ('direct');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.conversation_kind NOT NULL DEFAULT 'direct',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT 'epoch',
  muted boolean NOT NULL DEFAULT false,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON public.conversation_members(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_members TO authenticated;
GRANT ALL ON public.conversation_members TO service_role;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 4000),
  client_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON public.messages(conversation_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS messages_client_dedupe_idx ON public.messages(conversation_id, sender_id, client_id) WHERE client_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.message_receipts (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  delivered_at timestamptz,
  read_at timestamptz,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS message_receipts_user_idx ON public.message_receipts(user_id);
GRANT SELECT, INSERT, UPDATE ON public.message_receipts TO authenticated;
GRANT ALL ON public.message_receipts TO service_role;
ALTER TABLE public.message_receipts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_conversation_member(_conv uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = _conv AND user_id = _user
  );
$$;

CREATE OR REPLACE FUNCTION public.are_friends(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = _a AND addressee_id = _b) OR (requester_id = _b AND addressee_id = _a))
  );
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conversations' AND policyname = 'Members read conversations') THEN
    CREATE POLICY "Members read conversations" ON public.conversations
      FOR SELECT TO authenticated
      USING (public.is_conversation_member(id, auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conversation_members' AND policyname = 'Members read membership') THEN
    CREATE POLICY "Members read membership" ON public.conversation_members
      FOR SELECT TO authenticated
      USING (public.is_conversation_member(conversation_id, auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conversation_members' AND policyname = 'Users add themselves as member') THEN
    CREATE POLICY "Users add themselves as member" ON public.conversation_members
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conversation_members' AND policyname = 'Users update own membership') THEN
    CREATE POLICY "Users update own membership" ON public.conversation_members
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conversation_members' AND policyname = 'Users leave conversations') THEN
    CREATE POLICY "Users leave conversations" ON public.conversation_members
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'Members read messages') THEN
    CREATE POLICY "Members read messages" ON public.messages
      FOR SELECT TO authenticated
      USING (public.is_conversation_member(conversation_id, auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'Members send messages') THEN
    CREATE POLICY "Members send messages" ON public.messages
      FOR INSERT TO authenticated
      WITH CHECK (
        sender_id = auth.uid()
        AND public.is_conversation_member(conversation_id, auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'Sender edits own messages') THEN
    CREATE POLICY "Sender edits own messages" ON public.messages
      FOR UPDATE TO authenticated
      USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_receipts' AND policyname = 'Users read own receipts') THEN
    CREATE POLICY "Users read own receipts" ON public.message_receipts
      FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.messages m
        WHERE m.id = message_id AND m.sender_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_receipts' AND policyname = 'Users update own receipts') THEN
    CREATE POLICY "Users update own receipts" ON public.message_receipts
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
     SET last_message_at = NEW.created_at
   WHERE id = NEW.conversation_id;

  INSERT INTO public.message_receipts (message_id, user_id)
  SELECT NEW.id, cm.user_id
    FROM public.conversation_members cm
   WHERE cm.conversation_id = NEW.conversation_id
     AND cm.user_id <> NEW.sender_id
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_created ON public.messages;
CREATE TRIGGER on_message_created
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.handle_new_message();

-- Realtime publications
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_receipts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =====================================================================================
-- 5. MIGRATION 20260716133408: Direct Conversation RPC
-- =====================================================================================

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


-- =====================================================================================
-- 6. MIGRATION 20260717101800: Message Hiding & Sender Deletes
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.message_hidden (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS message_hidden_user_idx ON public.message_hidden(user_id);
GRANT SELECT, INSERT, DELETE ON public.message_hidden TO authenticated;
GRANT ALL ON public.message_hidden TO service_role;
ALTER TABLE public.message_hidden ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_hidden' AND policyname = 'Users read their own hides') THEN
    CREATE POLICY "Users read their own hides" ON public.message_hidden
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_hidden' AND policyname = 'Users hide messages they can see') THEN
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
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_hidden' AND policyname = 'Users unhide their own') THEN
    CREATE POLICY "Users unhide their own" ON public.message_hidden
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'Sender deletes own messages') THEN
    CREATE POLICY "Sender deletes own messages" ON public.messages
      FOR DELETE TO authenticated USING (sender_id = auth.uid());
  END IF;
END $$;

ALTER TABLE public.messages REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_hidden;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =====================================================================================
-- 7. MIGRATION 20260718042556: Security Invoker Role & Device Policy
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'devices' AND policyname = 'Users can view own devices') THEN
    CREATE POLICY "Users can view own devices"
    ON public.devices FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
  END IF;
END $$;


-- =====================================================================================
-- 8. MIGRATION 20260718043948: Reactions, Edits, Pins, Stars
-- =====================================================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forwarded_from_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;

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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_reactions' AND policyname = 'reactions: members can read') THEN
    CREATE POLICY "reactions: members can read"
      ON public.message_reactions FOR SELECT TO authenticated
      USING (public.is_conversation_member(
        (SELECT conversation_id FROM public.messages WHERE id = message_id),
        auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_reactions' AND policyname = 'reactions: members can add own') THEN
    CREATE POLICY "reactions: members can add own"
      ON public.message_reactions FOR INSERT TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND public.is_conversation_member(
          (SELECT conversation_id FROM public.messages WHERE id = message_id),
          auth.uid()
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_reactions' AND policyname = 'reactions: users can delete own') THEN
    CREATE POLICY "reactions: users can delete own"
      ON public.message_reactions FOR DELETE TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.message_edits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  previous_body text NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.message_edits TO authenticated;
GRANT ALL ON public.message_edits TO service_role;
ALTER TABLE public.message_edits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_edits' AND policyname = 'edits: sender can read own edits') THEN
    CREATE POLICY "edits: sender can read own edits"
      ON public.message_edits FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND m.sender_id = auth.uid())
        OR public.is_conversation_member(
          (SELECT conversation_id FROM public.messages WHERE id = message_id),
          auth.uid()
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_edits' AND policyname = 'edits: sender can insert') THEN
    CREATE POLICY "edits: sender can insert"
      ON public.message_edits FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND m.sender_id = auth.uid())
      );
  END IF;
END $$;

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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pinned_messages' AND policyname = 'pins: members can read') THEN
    CREATE POLICY "pins: members can read"
      ON public.pinned_messages FOR SELECT TO authenticated
      USING (public.is_conversation_member(conversation_id, auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pinned_messages' AND policyname = 'pins: members can pin') THEN
    CREATE POLICY "pins: members can pin"
      ON public.pinned_messages FOR INSERT TO authenticated
      WITH CHECK (
        pinned_by = auth.uid()
        AND public.is_conversation_member(conversation_id, auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pinned_messages' AND policyname = 'pins: members can unpin') THEN
    CREATE POLICY "pins: members can unpin"
      ON public.pinned_messages FOR DELETE TO authenticated
      USING (public.is_conversation_member(conversation_id, auth.uid()));
  END IF;
END $$;

ALTER TABLE public.pinned_messages REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pinned_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

CREATE TABLE IF NOT EXISTS public.starred_messages (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  starred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);
GRANT SELECT, INSERT, DELETE ON public.starred_messages TO authenticated;
GRANT ALL ON public.starred_messages TO service_role;
ALTER TABLE public.starred_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'starred_messages' AND policyname = 'stars: users manage own') THEN
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
  END IF;
END $$;

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

DROP POLICY IF EXISTS "messages: sender can edit own" ON public.messages;
CREATE POLICY "messages: sender can edit own"
  ON public.messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());


-- =====================================================================================
-- 9. MIGRATION 20260816042523: Calls & Conversation Member Flags
-- =====================================================================================

ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  CREATE TYPE public.call_type AS ENUM ('voice', 'video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.call_status AS ENUM ('ringing', 'accepted', 'declined', 'missed', 'ended', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  callee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  call_type public.call_type NOT NULL DEFAULT 'voice',
  status public.call_status NOT NULL DEFAULT 'ringing',
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calls_caller_idx ON public.calls (caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_callee_idx ON public.calls (callee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_conversation_idx ON public.calls (conversation_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calls' AND policyname = 'calls: participants can read') THEN
    CREATE POLICY "calls: participants can read"
      ON public.calls FOR SELECT TO authenticated
      USING (auth.uid() = caller_id OR auth.uid() = callee_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calls' AND policyname = 'calls: caller can create') THEN
    CREATE POLICY "calls: caller can create"
      ON public.calls FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = caller_id
        AND public.are_friends(caller_id, callee_id)
        AND public.is_conversation_member(conversation_id, auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calls' AND policyname = 'calls: participants can update') THEN
    CREATE POLICY "calls: participants can update"
      ON public.calls FOR UPDATE TO authenticated
      USING (auth.uid() = caller_id OR auth.uid() = callee_id)
      WITH CHECK (auth.uid() = caller_id OR auth.uid() = callee_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS calls_set_updated_at ON public.calls;
CREATE TRIGGER calls_set_updated_at
  BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.calls REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =====================================================================================
-- 10. MIGRATION 20260904193000: E2EE Prekeys
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.device_prekeys (
  device_id UUID PRIMARY KEY REFERENCES public.devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_key TEXT NOT NULL,
  signed_prekey TEXT NOT NULL,
  signed_prekey_signature TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_prekeys TO authenticated;
GRANT ALL ON public.device_prekeys TO service_role;
ALTER TABLE public.device_prekeys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users view public prekeys of any authenticated user' AND tablename = 'device_prekeys') THEN
    CREATE POLICY "Users view public prekeys of any authenticated user"
      ON public.device_prekeys FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users manage own device prekeys' AND tablename = 'device_prekeys') THEN
    CREATE POLICY "Users manage own device prekeys"
      ON public.device_prekeys FOR ALL TO authenticated
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.device_one_time_prekeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  key_id INT NOT NULL,
  public_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, key_id)
);

CREATE INDEX IF NOT EXISTS idx_device_one_time_prekeys_device ON public.device_one_time_prekeys(device_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_one_time_prekeys TO authenticated;
GRANT ALL ON public.device_one_time_prekeys TO service_role;
ALTER TABLE public.device_one_time_prekeys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users view OPKs' AND tablename = 'device_one_time_prekeys') THEN
    CREATE POLICY "Authenticated users view OPKs"
      ON public.device_one_time_prekeys FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users manage own OPKs' AND tablename = 'device_one_time_prekeys') THEN
    CREATE POLICY "Users manage own OPKs"
      ON public.device_one_time_prekeys FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.devices d WHERE d.id = device_id AND d.user_id = auth.uid()));
  END IF;
END $$;

-- =====================================================================================
-- POSTGREST SCHEMA CACHE RELOAD NOTIFICATION
-- =====================================================================================
NOTIFY pgrst, 'reload schema';
