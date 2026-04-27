-- Optional cleanup for guests left behind by older booking deletes.
-- Deletes guest rows only when they have no bookings, no payments, and no balance.

DELETE FROM guests g
WHERE COALESCE(g.balance, 0) = 0
  AND NOT EXISTS (
    SELECT 1 FROM bookings b WHERE b.guest_id = g.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM payments p WHERE p.guest_id = g.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM transactions t WHERE t.guest_id = g.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM city_ledger_accounts cla
    WHERE cla.organization_id = g.organization_id
      AND cla.account_type IN ('individual', 'guest')
      AND LOWER(cla.account_name) = LOWER(g.name)
      AND COALESCE(cla.balance, 0) <> 0
  );
