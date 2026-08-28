-- Monthly operational report queries (FrontBill).
-- Replace YOUR_ORG_ID with the hotel organization UUID.
-- Supabase SQL Editor → Download CSV.

SELECT p.full_name, p.role, u.email, u.last_sign_in_at, u.created_at
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.organization_id = 'YOUR_ORG_ID'
ORDER BY u.last_sign_in_at DESC NULLS LAST;

SELECT date_trunc('month', created_at) AS month,
       count(*) AS bookings_created,
       sum(total_amount) AS booking_value
FROM bookings
WHERE organization_id = 'YOUR_ORG_ID'
  AND status <> 'cancelled'
GROUP BY 1 ORDER BY 1;

SELECT audit_date, created_at, created_by
FROM night_audits
WHERE organization_id = 'YOUR_ORG_ID'
ORDER BY audit_date DESC;

SELECT signal_type,
       date_trunc('month', created_at) AS month,
       count(*) AS signal_count,
       count(DISTINCT user_id) AS unique_users
FROM usage_logs
WHERE organization_id = 'YOUR_ORG_ID'
GROUP BY 1, 2 ORDER BY 2, 1;
