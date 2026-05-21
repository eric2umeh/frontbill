-- Tighten outlet daily report RLS to match the server API permission model.
-- Run after 053_outlet_daily_reports.sql.

ALTER TABLE public.outlet_daily_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlet_daily_reports_org ON public.outlet_daily_reports;
DROP POLICY IF EXISTS outlet_daily_reports_select ON public.outlet_daily_reports;

CREATE POLICY outlet_daily_reports_select ON public.outlet_daily_reports
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM (
        SELECT
          p.organization_id,
          LOWER(REPLACE(REPLACE(BTRIM(COALESCE(p.role, '')), ' ', '_'), '-', '_')) AS role_key
        FROM public.profiles p
        WHERE p.id = auth.uid()
      ) p
      WHERE p.organization_id = outlet_daily_reports.organization_id
        AND (
          p.role_key IN ('superadmin', 'admin', 'administrator', 'manager', 'accountant')
          OR (
            outlet_daily_reports.department IN ('restaurant', 'main_bar', 'pool_bar', 'banquets')
            AND p.role_key IN (
              'food_beverage',
              'food_and_beverage',
              'food_&_beverage',
              'fnb',
              'restaurant',
              'bar',
              'waiter',
              'restaurant_staff',
              'bartender',
              'bar_staff',
              'pool_bar',
              'banquets_staff',
              'events_staff'
            )
          )
          OR (outlet_daily_reports.department = 'laundry' AND p.role_key IN ('laundry', 'laundry_staff'))
          OR (outlet_daily_reports.department = 'gym' AND p.role_key IN ('gym', 'gym_staff'))
        )
    )
  );

-- No authenticated INSERT/UPDATE/DELETE policy is defined here. Daily reports are
-- written by the server API after it enforces outlet:reports and recalculates totals.
