-- Sign-up creates a new hotel organization for the first owner account.
-- Run on staging Supabase BEFORE creating your first account via /auth/sign-up.
-- Team members added later via Users & Roles do NOT get a new hotel (no create_hotel flag).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  hotel_name TEXT;
  should_create_hotel BOOLEAN;
BEGIN
  should_create_hotel := COALESCE(new.raw_user_meta_data ->> 'create_hotel', '') IN ('true', 't', '1');

  IF should_create_hotel THEN
    hotel_name := COALESCE(
      NULLIF(trim(new.raw_user_meta_data ->> 'hotel_name'), ''),
      COALESCE(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)) || ' Hotel'
    );

    INSERT INTO public.organizations (name, email)
    VALUES (hotel_name, new.email)
    RETURNING id INTO new_org_id;
  END IF;

  INSERT INTO public.profiles (id, organization_id, full_name, role)
  VALUES (
    new.id,
    new_org_id,
    COALESCE(new.raw_user_meta_data ->> 'full_name', new.email),
    COALESCE(new.raw_user_meta_data ->> 'role', 'admin')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    role = COALESCE(EXCLUDED.role, profiles.role),
    organization_id = COALESCE(profiles.organization_id, EXCLUDED.organization_id);

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error creating profile for user %: %', new.id, SQLERRM;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user IS
  'Self-signup with create_hotel=true creates organizations row + admin profile. Staff invites skip create_hotel.';
