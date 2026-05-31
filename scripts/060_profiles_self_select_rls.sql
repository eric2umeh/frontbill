-- Users must always be able to read their own profile row (login role resolution).
-- The org-scoped policy alone can fail for the signed-in user's row when the subquery
-- is evaluated under the same RLS rules.

DROP POLICY IF EXISTS "Profiles are viewable by org members" ON profiles;

CREATE POLICY "Profiles are viewable by org members" ON profiles
  FOR SELECT USING (
    auth.uid() = id
    OR organization_id IN (
      SELECT p.organization_id FROM profiles AS p WHERE p.id = auth.uid()
    )
  );
