-- =========== E2EE DEVICE PREKEYS ===========
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

-- =========== E2EE ONE-TIME PREKEYS ===========
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
