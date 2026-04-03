-- Full data reset — clears ALL transactional data in correct FK order
-- Preserves: organizations, profiles, auth users (your login stays intact)
-- Clears: all bookings, guests, rooms, payments, ledger data, folio charges, transactions, audits

DELETE FROM night_audits;
DELETE FROM transactions;
DELETE FROM folio_charges;
DELETE FROM payments;
DELETE FROM bookings;
DELETE FROM city_ledger_accounts;
DELETE FROM guests;
DELETE FROM rooms;
