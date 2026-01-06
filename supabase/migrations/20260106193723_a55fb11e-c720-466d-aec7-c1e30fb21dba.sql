-- Drop remaining overly permissive policies
DROP POLICY IF EXISTS "Allow all for authenticated users" ON contract_addresses;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON contract_contacts;

-- folder_templates - the SELECT with true is intentional for public read, but we should fix the warning
-- by checking if there are any USING(true) for non-SELECT operations
-- The linter only flagged SELECT, which is acceptable for folder templates (public reference data)