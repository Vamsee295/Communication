
-- Tighten has_role: switch to SECURITY INVOKER and restrict EXECUTE.
-- Callers already have RLS-based SELECT on their own user_roles rows.
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

-- Devices: add explicit owner-only SELECT policy for defense-in-depth
-- alongside the existing ALL policy.
CREATE POLICY "Users can view own devices"
ON public.devices
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
