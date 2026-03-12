-- Clear all data from tables in correct order to respect foreign key constraints
-- This preserves the schema while removing all test data

-- Disable foreign key constraints temporarily
ALTER TABLE folio_charges DISABLE TRIGGER ALL;
ALTER TABLE bookings DISABLE TRIGGER ALL;
ALTER TABLE transactions DISABLE TRIGGER ALL;
ALTER TABLE rooms DISABLE TRIGGER ALL;
ALTER TABLE city_ledger_accounts DISABLE TRIGGER ALL;
ALTER TABLE guests DISABLE TRIGGER ALL;
ALTER TABLE organizations DISABLE TRIGGER ALL;

-- Clear data starting from tables with foreign keys pointing to others
TRUNCATE TABLE transactions CASCADE;
TRUNCATE TABLE folio_charges CASCADE;
TRUNCATE TABLE bookings CASCADE;
TRUNCATE TABLE city_ledger_accounts CASCADE;
TRUNCATE TABLE guests CASCADE;
TRUNCATE TABLE rooms CASCADE;
TRUNCATE TABLE organizations CASCADE;

-- Re-enable triggers
ALTER TABLE folio_charges ENABLE TRIGGER ALL;
ALTER TABLE bookings ENABLE TRIGGER ALL;
ALTER TABLE transactions ENABLE TRIGGER ALL;
ALTER TABLE rooms ENABLE TRIGGER ALL;
ALTER TABLE city_ledger_accounts ENABLE TRIGGER ALL;
ALTER TABLE guests ENABLE TRIGGER ALL;
ALTER TABLE organizations ENABLE TRIGGER ALL;
