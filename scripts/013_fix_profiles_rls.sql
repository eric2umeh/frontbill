-- Allow users to view all profiles within their organization
-- This is needed for the Users & Roles management page
-- The existing policy "Profiles are viewable by the user" only allows viewing your own row

-- Drop the restrictive single-row policy
DROP POLICY IF EXISTS "Profiles are viewable by the user" ON profiles;

-- Replace with org-scoped policy so admins/managers can see all team members
CREATE POLICY "Profiles are viewable by org members" ON profiles
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );
