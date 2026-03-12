-- Clear all data from tables in correct order to respect foreign key constraints
-- Removes all test data while preserving the database schema

DELETE FROM transactions;
DELETE FROM folio_charges;
DELETE FROM bookings;
DELETE FROM city_ledger_accounts;
DELETE FROM guests;
DELETE FROM rooms;
DELETE FROM organizations;
