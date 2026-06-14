-- Stop infinite recursion on profiles:
-- 1) Drop org-wide profiles SELECT policy (calling current_user_org_id() from a profiles
--    policy still re-enters profiles when payments/rooms/bookings policies subquery profiles).
-- 2) Point hotel-scoped table policies at current_user_org_id() so they never read profiles.
-- Team profile lists use /api/admin/users/list (service role).

DROP POLICY IF EXISTS "Profiles are viewable by org members" ON public.profiles;

-- payments
DROP POLICY IF EXISTS "Users can view payments in their hotel" ON public.payments;
DROP POLICY IF EXISTS "Users can create payments in their hotel" ON public.payments;
DROP POLICY IF EXISTS "Users can update payments in their hotel" ON public.payments;

CREATE POLICY "Users can view payments in their hotel" ON public.payments
  FOR SELECT USING (organization_id = public.current_user_org_id());

CREATE POLICY "Users can create payments in their hotel" ON public.payments
  FOR INSERT WITH CHECK (organization_id = public.current_user_org_id());

CREATE POLICY "Users can update payments in their hotel" ON public.payments
  FOR UPDATE USING (organization_id = public.current_user_org_id());

-- rooms
DROP POLICY IF EXISTS "Users can view rooms in their hotel" ON public.rooms;
DROP POLICY IF EXISTS "Users can create rooms in their hotel" ON public.rooms;
DROP POLICY IF EXISTS "Users can update rooms in their hotel" ON public.rooms;
DROP POLICY IF EXISTS "Users can delete rooms in their hotel" ON public.rooms;

CREATE POLICY "Users can view rooms in their hotel" ON public.rooms
  FOR SELECT USING (organization_id = public.current_user_org_id());

CREATE POLICY "Users can create rooms in their hotel" ON public.rooms
  FOR INSERT WITH CHECK (organization_id = public.current_user_org_id());

CREATE POLICY "Users can update rooms in their hotel" ON public.rooms
  FOR UPDATE USING (organization_id = public.current_user_org_id());

CREATE POLICY "Users can delete rooms in their hotel" ON public.rooms
  FOR DELETE USING (organization_id = public.current_user_org_id());

-- bookings
DROP POLICY IF EXISTS "Users can view bookings in their hotel" ON public.bookings;
DROP POLICY IF EXISTS "Users can create bookings in their hotel" ON public.bookings;
DROP POLICY IF EXISTS "Users can update bookings in their hotel" ON public.bookings;
DROP POLICY IF EXISTS "Users can delete bookings in their hotel" ON public.bookings;

CREATE POLICY "Users can view bookings in their hotel" ON public.bookings
  FOR SELECT USING (organization_id = public.current_user_org_id());

CREATE POLICY "Users can create bookings in their hotel" ON public.bookings
  FOR INSERT WITH CHECK (organization_id = public.current_user_org_id());

CREATE POLICY "Users can update bookings in their hotel" ON public.bookings
  FOR UPDATE USING (organization_id = public.current_user_org_id());

CREATE POLICY "Users can delete bookings in their hotel" ON public.bookings
  FOR DELETE USING (organization_id = public.current_user_org_id());

-- transactions
DROP POLICY IF EXISTS "Users can view transactions in their hotel" ON public.transactions;
DROP POLICY IF EXISTS "Users can create transactions in their hotel" ON public.transactions;
DROP POLICY IF EXISTS "Users can update transactions in their hotel" ON public.transactions;

CREATE POLICY "Users can view transactions in their hotel" ON public.transactions
  FOR SELECT USING (organization_id = public.current_user_org_id());

CREATE POLICY "Users can create transactions in their hotel" ON public.transactions
  FOR INSERT WITH CHECK (organization_id = public.current_user_org_id());

CREATE POLICY "Users can update transactions in their hotel" ON public.transactions
  FOR UPDATE USING (organization_id = public.current_user_org_id());

-- guests
DROP POLICY IF EXISTS "Users can view guests in their hotel" ON public.guests;
DROP POLICY IF EXISTS "Users can create guests in their hotel" ON public.guests;
DROP POLICY IF EXISTS "Users can update guests in their hotel" ON public.guests;
DROP POLICY IF EXISTS "Users can delete guests in their hotel" ON public.guests;

CREATE POLICY "Users can view guests in their hotel" ON public.guests
  FOR SELECT USING (organization_id = public.current_user_org_id());

CREATE POLICY "Users can create guests in their hotel" ON public.guests
  FOR INSERT WITH CHECK (organization_id = public.current_user_org_id());

CREATE POLICY "Users can update guests in their hotel" ON public.guests
  FOR UPDATE USING (organization_id = public.current_user_org_id());

CREATE POLICY "Users can delete guests in their hotel" ON public.guests
  FOR DELETE USING (organization_id = public.current_user_org_id());
