-- ============================================================
-- FIX: Implement proper RLS policies using has_role/has_permission
-- This migration replaces overly permissive USING(true) policies
-- with role-based and permission-based access control
-- ============================================================

-- ===========================================
-- CONTRACTS AND RELATED TABLES
-- ===========================================

-- Drop overly permissive policy on contracts
DROP POLICY IF EXISTS "Allow all for authenticated users" ON contracts;

-- Admins can manage all contracts
CREATE POLICY "Admins can manage contracts"
  ON contracts FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Users can view contracts if they have contracts view or edit permission
CREATE POLICY "Users can view contracts with permission"
  ON contracts FOR SELECT
  USING (
    has_permission(auth.uid(), 'contracts', 'view') OR
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

-- Users can modify contracts if they have edit or all permission
CREATE POLICY "Users can modify contracts with permission"
  ON contracts FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can update contracts with permission"
  ON contracts FOR UPDATE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can delete contracts with permission"
  ON contracts FOR DELETE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

-- Contract Addresses (linked to contracts)
DROP POLICY IF EXISTS "Allow all for authenticated users on contract_addresses" ON contract_addresses;

CREATE POLICY "Admins can manage contract_addresses"
  ON contract_addresses FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view contract_addresses with permission"
  ON contract_addresses FOR SELECT
  USING (
    has_permission(auth.uid(), 'contracts', 'view') OR
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can modify contract_addresses with permission"
  ON contract_addresses FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can update contract_addresses with permission"
  ON contract_addresses FOR UPDATE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can delete contract_addresses with permission"
  ON contract_addresses FOR DELETE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

-- Contract Contacts
DROP POLICY IF EXISTS "Allow all for authenticated users on contract_contacts" ON contract_contacts;

CREATE POLICY "Admins can manage contract_contacts"
  ON contract_contacts FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view contract_contacts with permission"
  ON contract_contacts FOR SELECT
  USING (
    has_permission(auth.uid(), 'contracts', 'view') OR
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can modify contract_contacts with permission"
  ON contract_contacts FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can update contract_contacts with permission"
  ON contract_contacts FOR UPDATE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can delete contract_contacts with permission"
  ON contract_contacts FOR DELETE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

-- Contract Versions
DROP POLICY IF EXISTS "Allow all for authenticated users" ON contract_versions;

CREATE POLICY "Admins can manage contract_versions"
  ON contract_versions FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view contract_versions with permission"
  ON contract_versions FOR SELECT
  USING (
    has_permission(auth.uid(), 'contracts', 'view') OR
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can modify contract_versions with permission"
  ON contract_versions FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can update contract_versions with permission"
  ON contract_versions FOR UPDATE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can delete contract_versions with permission"
  ON contract_versions FOR DELETE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

-- Rent Escalations
DROP POLICY IF EXISTS "Allow all for authenticated users" ON rent_escalations;

CREATE POLICY "Admins can manage rent_escalations"
  ON rent_escalations FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view rent_escalations with permission"
  ON rent_escalations FOR SELECT
  USING (
    has_permission(auth.uid(), 'contracts', 'view') OR
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can modify rent_escalations with permission"
  ON rent_escalations FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can update rent_escalations with permission"
  ON rent_escalations FOR UPDATE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can delete rent_escalations with permission"
  ON rent_escalations FOR DELETE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

-- Contract Documents
DROP POLICY IF EXISTS "Allow all for authenticated users" ON contract_documents;

CREATE POLICY "Admins can manage contract_documents"
  ON contract_documents FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view contract_documents with permission"
  ON contract_documents FOR SELECT
  USING (
    has_permission(auth.uid(), 'contracts', 'view') OR
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can modify contract_documents with permission"
  ON contract_documents FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can update contract_documents with permission"
  ON contract_documents FOR UPDATE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can delete contract_documents with permission"
  ON contract_documents FOR DELETE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

-- Finalized Contracts
DROP POLICY IF EXISTS "Allow all for authenticated users" ON finalized_contracts;

CREATE POLICY "Admins can manage finalized_contracts"
  ON finalized_contracts FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view finalized_contracts with permission"
  ON finalized_contracts FOR SELECT
  USING (
    has_permission(auth.uid(), 'contracts', 'view') OR
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can modify finalized_contracts with permission"
  ON finalized_contracts FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can update finalized_contracts with permission"
  ON finalized_contracts FOR UPDATE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can delete finalized_contracts with permission"
  ON finalized_contracts FOR DELETE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

-- Termination Notices
DROP POLICY IF EXISTS "Authenticated users can manage termination notices" ON termination_notices;

CREATE POLICY "Admins can manage termination_notices"
  ON termination_notices FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view termination_notices with permission"
  ON termination_notices FOR SELECT
  USING (
    has_permission(auth.uid(), 'contracts', 'view') OR
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can modify termination_notices with permission"
  ON termination_notices FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can update termination_notices with permission"
  ON termination_notices FOR UPDATE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can delete termination_notices with permission"
  ON termination_notices FOR DELETE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

-- Notice Ranges
DROP POLICY IF EXISTS "Allow all for authenticated users on notice_ranges" ON notice_ranges;

CREATE POLICY "Admins can manage notice_ranges"
  ON notice_ranges FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view notice_ranges with permission"
  ON notice_ranges FOR SELECT
  USING (
    has_permission(auth.uid(), 'contracts', 'view') OR
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can modify notice_ranges with permission"
  ON notice_ranges FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can update notice_ranges with permission"
  ON notice_ranges FOR UPDATE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can delete notice_ranges with permission"
  ON notice_ranges FOR DELETE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

-- Contract Import Audit (audit logs should be more restrictive)
DROP POLICY IF EXISTS "Authenticated users can view import audit" ON contract_import_audit;
DROP POLICY IF EXISTS "Authenticated users can insert import audit" ON contract_import_audit;

CREATE POLICY "Admins can manage contract_import_audit"
  ON contract_import_audit FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view contract_import_audit with permission"
  ON contract_import_audit FOR SELECT
  USING (
    has_permission(auth.uid(), 'contracts', 'view') OR
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users can insert contract_import_audit with permission"
  ON contract_import_audit FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

-- ===========================================
-- SUPPLIERS AND RELATED TABLES (HIGH PRIORITY - bank data)
-- ===========================================

-- Suppliers (contains bank account information)
DROP POLICY IF EXISTS "Allow all for authenticated users on suppliers" ON suppliers;

CREATE POLICY "Admins can manage suppliers"
  ON suppliers FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view suppliers with permission"
  ON suppliers FOR SELECT
  USING (
    has_permission(auth.uid(), 'suppliers', 'view') OR
    has_permission(auth.uid(), 'suppliers', 'edit') OR
    has_permission(auth.uid(), 'suppliers', 'all')
  );

CREATE POLICY "Users can modify suppliers with permission"
  ON suppliers FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'suppliers', 'edit') OR
    has_permission(auth.uid(), 'suppliers', 'all')
  );

CREATE POLICY "Users can update suppliers with permission"
  ON suppliers FOR UPDATE
  USING (
    has_permission(auth.uid(), 'suppliers', 'edit') OR
    has_permission(auth.uid(), 'suppliers', 'all')
  );

CREATE POLICY "Users can delete suppliers with permission"
  ON suppliers FOR DELETE
  USING (
    has_permission(auth.uid(), 'suppliers', 'edit') OR
    has_permission(auth.uid(), 'suppliers', 'all')
  );

-- Supplier Categories
DROP POLICY IF EXISTS "Allow read access to supplier_categories" ON supplier_categories;
DROP POLICY IF EXISTS "Allow insert to supplier_categories" ON supplier_categories;
DROP POLICY IF EXISTS "Allow update to supplier_categories" ON supplier_categories;
DROP POLICY IF EXISTS "Allow delete to supplier_categories" ON supplier_categories;

CREATE POLICY "Admins can manage supplier_categories"
  ON supplier_categories FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view supplier_categories with permission"
  ON supplier_categories FOR SELECT
  USING (
    has_permission(auth.uid(), 'suppliers', 'view') OR
    has_permission(auth.uid(), 'suppliers', 'edit') OR
    has_permission(auth.uid(), 'suppliers', 'all')
  );

CREATE POLICY "Users can modify supplier_categories with permission"
  ON supplier_categories FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'suppliers', 'edit') OR
    has_permission(auth.uid(), 'suppliers', 'all')
  );

CREATE POLICY "Users can update supplier_categories with permission"
  ON supplier_categories FOR UPDATE
  USING (
    has_permission(auth.uid(), 'suppliers', 'edit') OR
    has_permission(auth.uid(), 'suppliers', 'all')
  );

CREATE POLICY "Users can delete supplier_categories with permission"
  ON supplier_categories FOR DELETE
  USING (
    has_permission(auth.uid(), 'suppliers', 'edit') OR
    has_permission(auth.uid(), 'suppliers', 'all')
  );

-- Supplier Emails
DROP POLICY IF EXISTS "Allow read access to supplier_emails" ON supplier_emails;
DROP POLICY IF EXISTS "Allow insert to supplier_emails" ON supplier_emails;
DROP POLICY IF EXISTS "Allow update to supplier_emails" ON supplier_emails;
DROP POLICY IF EXISTS "Allow delete to supplier_emails" ON supplier_emails;

CREATE POLICY "Admins can manage supplier_emails"
  ON supplier_emails FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view supplier_emails with permission"
  ON supplier_emails FOR SELECT
  USING (
    has_permission(auth.uid(), 'suppliers', 'view') OR
    has_permission(auth.uid(), 'suppliers', 'edit') OR
    has_permission(auth.uid(), 'suppliers', 'all')
  );

CREATE POLICY "Users can modify supplier_emails with permission"
  ON supplier_emails FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'suppliers', 'edit') OR
    has_permission(auth.uid(), 'suppliers', 'all')
  );

CREATE POLICY "Users can update supplier_emails with permission"
  ON supplier_emails FOR UPDATE
  USING (
    has_permission(auth.uid(), 'suppliers', 'edit') OR
    has_permission(auth.uid(), 'suppliers', 'all')
  );

CREATE POLICY "Users can delete supplier_emails with permission"
  ON supplier_emails FOR DELETE
  USING (
    has_permission(auth.uid(), 'suppliers', 'edit') OR
    has_permission(auth.uid(), 'suppliers', 'all')
  );

-- Supplier Products
DROP POLICY IF EXISTS "Allow read access to supplier_products" ON supplier_products;
DROP POLICY IF EXISTS "Allow insert to supplier_products" ON supplier_products;
DROP POLICY IF EXISTS "Allow update to supplier_products" ON supplier_products;
DROP POLICY IF EXISTS "Allow delete to supplier_products" ON supplier_products;

CREATE POLICY "Admins can manage supplier_products"
  ON supplier_products FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view supplier_products with permission"
  ON supplier_products FOR SELECT
  USING (
    has_permission(auth.uid(), 'suppliers', 'view') OR
    has_permission(auth.uid(), 'suppliers', 'edit') OR
    has_permission(auth.uid(), 'suppliers', 'all')
  );

CREATE POLICY "Users can modify supplier_products with permission"
  ON supplier_products FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'suppliers', 'edit') OR
    has_permission(auth.uid(), 'suppliers', 'all')
  );

CREATE POLICY "Users can update supplier_products with permission"
  ON supplier_products FOR UPDATE
  USING (
    has_permission(auth.uid(), 'suppliers', 'edit') OR
    has_permission(auth.uid(), 'suppliers', 'all')
  );

CREATE POLICY "Users can delete supplier_products with permission"
  ON supplier_products FOR DELETE
  USING (
    has_permission(auth.uid(), 'suppliers', 'edit') OR
    has_permission(auth.uid(), 'suppliers', 'all')
  );

-- ===========================================
-- FINANCIAL TABLES (HIGH PRIORITY)
-- ===========================================

-- Contract Budgets
DROP POLICY IF EXISTS "Allow all for authenticated users on contract_budgets" ON contract_budgets;

CREATE POLICY "Admins can manage contract_budgets"
  ON contract_budgets FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view contract_budgets with permission"
  ON contract_budgets FOR SELECT
  USING (
    has_permission(auth.uid(), 'budget', 'view') OR
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can modify contract_budgets with permission"
  ON contract_budgets FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can update contract_budgets with permission"
  ON contract_budgets FOR UPDATE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can delete contract_budgets with permission"
  ON contract_budgets FOR DELETE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

-- Budget Lines
DROP POLICY IF EXISTS "Allow all for authenticated users on budget_lines" ON budget_lines;

CREATE POLICY "Admins can manage budget_lines"
  ON budget_lines FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view budget_lines with permission"
  ON budget_lines FOR SELECT
  USING (
    has_permission(auth.uid(), 'budget', 'view') OR
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can modify budget_lines with permission"
  ON budget_lines FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can update budget_lines with permission"
  ON budget_lines FOR UPDATE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can delete budget_lines with permission"
  ON budget_lines FOR DELETE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

-- Budget Carryover
DROP POLICY IF EXISTS "Authenticated users can manage budget carryover" ON budget_carryover;

CREATE POLICY "Admins can manage budget_carryover"
  ON budget_carryover FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view budget_carryover with permission"
  ON budget_carryover FOR SELECT
  USING (
    has_permission(auth.uid(), 'budget', 'view') OR
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can modify budget_carryover with permission"
  ON budget_carryover FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can update budget_carryover with permission"
  ON budget_carryover FOR UPDATE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can delete budget_carryover with permission"
  ON budget_carryover FOR DELETE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

-- Budget Reassignments
DROP POLICY IF EXISTS "Allow all for authenticated users on budget_reassignments" ON budget_reassignments;

CREATE POLICY "Admins can manage budget_reassignments"
  ON budget_reassignments FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view budget_reassignments with permission"
  ON budget_reassignments FOR SELECT
  USING (
    has_permission(auth.uid(), 'budget', 'view') OR
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can modify budget_reassignments with permission"
  ON budget_reassignments FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can update budget_reassignments with permission"
  ON budget_reassignments FOR UPDATE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can delete budget_reassignments with permission"
  ON budget_reassignments FOR DELETE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

-- Purchase Orders (HIGH PRIORITY)
DROP POLICY IF EXISTS "Allow all for authenticated users on purchase_orders" ON purchase_orders;

CREATE POLICY "Admins can manage purchase_orders"
  ON purchase_orders FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view purchase_orders with permission"
  ON purchase_orders FOR SELECT
  USING (
    has_permission(auth.uid(), 'budget', 'view') OR
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can modify purchase_orders with permission"
  ON purchase_orders FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can update purchase_orders with permission"
  ON purchase_orders FOR UPDATE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can delete purchase_orders with permission"
  ON purchase_orders FOR DELETE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

-- Purchase Items
DROP POLICY IF EXISTS "Allow all for authenticated users on purchase_items" ON purchase_items;

CREATE POLICY "Admins can manage purchase_items"
  ON purchase_items FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view purchase_items with permission"
  ON purchase_items FOR SELECT
  USING (
    has_permission(auth.uid(), 'budget', 'view') OR
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can modify purchase_items with permission"
  ON purchase_items FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can update purchase_items with permission"
  ON purchase_items FOR UPDATE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can delete purchase_items with permission"
  ON purchase_items FOR DELETE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

-- Invoices (HIGH PRIORITY)
DROP POLICY IF EXISTS "Allow all for authenticated users on invoices" ON invoices;

CREATE POLICY "Admins can manage invoices"
  ON invoices FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view invoices with permission"
  ON invoices FOR SELECT
  USING (
    has_permission(auth.uid(), 'budget', 'view') OR
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can modify invoices with permission"
  ON invoices FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can update invoices with permission"
  ON invoices FOR UPDATE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can delete invoices with permission"
  ON invoices FOR DELETE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

-- Credit Notes (HIGH PRIORITY)
DROP POLICY IF EXISTS "Allow all for authenticated users on credit_notes" ON credit_notes;

CREATE POLICY "Admins can manage credit_notes"
  ON credit_notes FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view credit_notes with permission"
  ON credit_notes FOR SELECT
  USING (
    has_permission(auth.uid(), 'budget', 'view') OR
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can modify credit_notes with permission"
  ON credit_notes FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can update credit_notes with permission"
  ON credit_notes FOR UPDATE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

CREATE POLICY "Users can delete credit_notes with permission"
  ON credit_notes FOR DELETE
  USING (
    has_permission(auth.uid(), 'budget', 'edit') OR
    has_permission(auth.uid(), 'budget', 'all')
  );

-- ===========================================
-- REPOSITORY TABLES
-- ===========================================

-- Repository Folders
DROP POLICY IF EXISTS "Allow all for authenticated users on repository_folders" ON repository_folders;

CREATE POLICY "Admins can manage repository_folders"
  ON repository_folders FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view repository_folders with permission"
  ON repository_folders FOR SELECT
  USING (
    has_permission(auth.uid(), 'repository', 'view') OR
    has_permission(auth.uid(), 'repository', 'edit') OR
    has_permission(auth.uid(), 'repository', 'all')
  );

CREATE POLICY "Users can modify repository_folders with permission"
  ON repository_folders FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'repository', 'edit') OR
    has_permission(auth.uid(), 'repository', 'all')
  );

CREATE POLICY "Users can update repository_folders with permission"
  ON repository_folders FOR UPDATE
  USING (
    has_permission(auth.uid(), 'repository', 'edit') OR
    has_permission(auth.uid(), 'repository', 'all')
  );

CREATE POLICY "Users can delete repository_folders with permission"
  ON repository_folders FOR DELETE
  USING (
    has_permission(auth.uid(), 'repository', 'edit') OR
    has_permission(auth.uid(), 'repository', 'all')
  );

-- Repository Files
DROP POLICY IF EXISTS "Allow all for authenticated users on repository_files" ON repository_files;

CREATE POLICY "Admins can manage repository_files"
  ON repository_files FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view repository_files with permission"
  ON repository_files FOR SELECT
  USING (
    has_permission(auth.uid(), 'repository', 'view') OR
    has_permission(auth.uid(), 'repository', 'edit') OR
    has_permission(auth.uid(), 'repository', 'all')
  );

CREATE POLICY "Users can modify repository_files with permission"
  ON repository_files FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'repository', 'edit') OR
    has_permission(auth.uid(), 'repository', 'all')
  );

CREATE POLICY "Users can update repository_files with permission"
  ON repository_files FOR UPDATE
  USING (
    has_permission(auth.uid(), 'repository', 'edit') OR
    has_permission(auth.uid(), 'repository', 'all')
  );

CREATE POLICY "Users can delete repository_files with permission"
  ON repository_files FOR DELETE
  USING (
    has_permission(auth.uid(), 'repository', 'edit') OR
    has_permission(auth.uid(), 'repository', 'all')
  );

-- Folder Statuses
DROP POLICY IF EXISTS "Allow all for authenticated users on folder_statuses" ON folder_statuses;

CREATE POLICY "Admins can manage folder_statuses"
  ON folder_statuses FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view folder_statuses with permission"
  ON folder_statuses FOR SELECT
  USING (
    has_permission(auth.uid(), 'repository', 'view') OR
    has_permission(auth.uid(), 'repository', 'edit') OR
    has_permission(auth.uid(), 'repository', 'all')
  );

CREATE POLICY "Users can modify folder_statuses with permission"
  ON folder_statuses FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'repository', 'edit') OR
    has_permission(auth.uid(), 'repository', 'all')
  );

CREATE POLICY "Users can update folder_statuses with permission"
  ON folder_statuses FOR UPDATE
  USING (
    has_permission(auth.uid(), 'repository', 'edit') OR
    has_permission(auth.uid(), 'repository', 'all')
  );

CREATE POLICY "Users can delete folder_statuses with permission"
  ON folder_statuses FOR DELETE
  USING (
    has_permission(auth.uid(), 'repository', 'edit') OR
    has_permission(auth.uid(), 'repository', 'all')
  );

-- ===========================================
-- PATENT TABLES
-- ===========================================

-- Patent Documents
DROP POLICY IF EXISTS "Authenticated users can manage patent documents" ON patent_documents;

CREATE POLICY "Admins can manage patent_documents"
  ON patent_documents FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view patent_documents with permission"
  ON patent_documents FOR SELECT
  USING (
    has_permission(auth.uid(), 'patents', 'view') OR
    has_permission(auth.uid(), 'patents', 'edit') OR
    has_permission(auth.uid(), 'patents', 'all')
  );

CREATE POLICY "Users can modify patent_documents with permission"
  ON patent_documents FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'patents', 'edit') OR
    has_permission(auth.uid(), 'patents', 'all')
  );

CREATE POLICY "Users can update patent_documents with permission"
  ON patent_documents FOR UPDATE
  USING (
    has_permission(auth.uid(), 'patents', 'edit') OR
    has_permission(auth.uid(), 'patents', 'all')
  );

CREATE POLICY "Users can delete patent_documents with permission"
  ON patent_documents FOR DELETE
  USING (
    has_permission(auth.uid(), 'patents', 'edit') OR
    has_permission(auth.uid(), 'patents', 'all')
  );

-- Patent Document Alerts
DROP POLICY IF EXISTS "Authenticated users can manage patent alerts" ON patent_document_alerts;

CREATE POLICY "Admins can manage patent_document_alerts"
  ON patent_document_alerts FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view patent_document_alerts with permission"
  ON patent_document_alerts FOR SELECT
  USING (
    has_permission(auth.uid(), 'patents', 'view') OR
    has_permission(auth.uid(), 'patents', 'edit') OR
    has_permission(auth.uid(), 'patents', 'all')
  );

CREATE POLICY "Users can modify patent_document_alerts with permission"
  ON patent_document_alerts FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'patents', 'edit') OR
    has_permission(auth.uid(), 'patents', 'all')
  );

CREATE POLICY "Users can update patent_document_alerts with permission"
  ON patent_document_alerts FOR UPDATE
  USING (
    has_permission(auth.uid(), 'patents', 'edit') OR
    has_permission(auth.uid(), 'patents', 'all')
  );

CREATE POLICY "Users can delete patent_document_alerts with permission"
  ON patent_document_alerts FOR DELETE
  USING (
    has_permission(auth.uid(), 'patents', 'edit') OR
    has_permission(auth.uid(), 'patents', 'all')
  );

-- Contract Patents
DROP POLICY IF EXISTS "Authenticated users can manage contract patents" ON contract_patents;

CREATE POLICY "Admins can manage contract_patents"
  ON contract_patents FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view contract_patents with permission"
  ON contract_patents FOR SELECT
  USING (
    has_permission(auth.uid(), 'patents', 'view') OR
    has_permission(auth.uid(), 'patents', 'edit') OR
    has_permission(auth.uid(), 'patents', 'all')
  );

CREATE POLICY "Users can modify contract_patents with permission"
  ON contract_patents FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'patents', 'edit') OR
    has_permission(auth.uid(), 'patents', 'all')
  );

CREATE POLICY "Users can update contract_patents with permission"
  ON contract_patents FOR UPDATE
  USING (
    has_permission(auth.uid(), 'patents', 'edit') OR
    has_permission(auth.uid(), 'patents', 'all')
  );

CREATE POLICY "Users can delete contract_patents with permission"
  ON contract_patents FOR DELETE
  USING (
    has_permission(auth.uid(), 'patents', 'edit') OR
    has_permission(auth.uid(), 'patents', 'all')
  );

-- ===========================================
-- GANTT/TIMELINE TABLES
-- ===========================================

-- Gantt Timelines
DROP POLICY IF EXISTS "Authenticated users can manage timelines" ON gantt_timelines;

CREATE POLICY "Admins can manage gantt_timelines"
  ON gantt_timelines FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view gantt_timelines with permission"
  ON gantt_timelines FOR SELECT
  USING (
    has_permission(auth.uid(), 'gantt', 'view') OR
    has_permission(auth.uid(), 'gantt', 'edit') OR
    has_permission(auth.uid(), 'gantt', 'all')
  );

CREATE POLICY "Users can modify gantt_timelines with permission"
  ON gantt_timelines FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'gantt', 'edit') OR
    has_permission(auth.uid(), 'gantt', 'all')
  );

CREATE POLICY "Users can update gantt_timelines with permission"
  ON gantt_timelines FOR UPDATE
  USING (
    has_permission(auth.uid(), 'gantt', 'edit') OR
    has_permission(auth.uid(), 'gantt', 'all')
  );

CREATE POLICY "Users can delete gantt_timelines with permission"
  ON gantt_timelines FOR DELETE
  USING (
    has_permission(auth.uid(), 'gantt', 'edit') OR
    has_permission(auth.uid(), 'gantt', 'all')
  );

-- Gantt Tasks
DROP POLICY IF EXISTS "Authenticated users can manage tasks" ON gantt_tasks;

CREATE POLICY "Admins can manage gantt_tasks"
  ON gantt_tasks FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view gantt_tasks with permission"
  ON gantt_tasks FOR SELECT
  USING (
    has_permission(auth.uid(), 'gantt', 'view') OR
    has_permission(auth.uid(), 'gantt', 'edit') OR
    has_permission(auth.uid(), 'gantt', 'all')
  );

CREATE POLICY "Users can modify gantt_tasks with permission"
  ON gantt_tasks FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'gantt', 'edit') OR
    has_permission(auth.uid(), 'gantt', 'all')
  );

CREATE POLICY "Users can update gantt_tasks with permission"
  ON gantt_tasks FOR UPDATE
  USING (
    has_permission(auth.uid(), 'gantt', 'edit') OR
    has_permission(auth.uid(), 'gantt', 'all')
  );

CREATE POLICY "Users can delete gantt_tasks with permission"
  ON gantt_tasks FOR DELETE
  USING (
    has_permission(auth.uid(), 'gantt', 'edit') OR
    has_permission(auth.uid(), 'gantt', 'all')
  );

-- Gantt Task Dependencies
DROP POLICY IF EXISTS "Authenticated users can manage dependencies" ON gantt_task_dependencies;

CREATE POLICY "Admins can manage gantt_task_dependencies"
  ON gantt_task_dependencies FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view gantt_task_dependencies with permission"
  ON gantt_task_dependencies FOR SELECT
  USING (
    has_permission(auth.uid(), 'gantt', 'view') OR
    has_permission(auth.uid(), 'gantt', 'edit') OR
    has_permission(auth.uid(), 'gantt', 'all')
  );

CREATE POLICY "Users can modify gantt_task_dependencies with permission"
  ON gantt_task_dependencies FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'gantt', 'edit') OR
    has_permission(auth.uid(), 'gantt', 'all')
  );

CREATE POLICY "Users can update gantt_task_dependencies with permission"
  ON gantt_task_dependencies FOR UPDATE
  USING (
    has_permission(auth.uid(), 'gantt', 'edit') OR
    has_permission(auth.uid(), 'gantt', 'all')
  );

CREATE POLICY "Users can delete gantt_task_dependencies with permission"
  ON gantt_task_dependencies FOR DELETE
  USING (
    has_permission(auth.uid(), 'gantt', 'edit') OR
    has_permission(auth.uid(), 'gantt', 'all')
  );

-- Gantt Task Purchase Orders
DROP POLICY IF EXISTS "Allow all for authenticated users on gantt_task_purchase_orders" ON gantt_task_purchase_orders;

CREATE POLICY "Admins can manage gantt_task_purchase_orders"
  ON gantt_task_purchase_orders FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view gantt_task_purchase_orders with permission"
  ON gantt_task_purchase_orders FOR SELECT
  USING (
    has_permission(auth.uid(), 'gantt', 'view') OR
    has_permission(auth.uid(), 'gantt', 'edit') OR
    has_permission(auth.uid(), 'gantt', 'all')
  );

CREATE POLICY "Users can modify gantt_task_purchase_orders with permission"
  ON gantt_task_purchase_orders FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'gantt', 'edit') OR
    has_permission(auth.uid(), 'gantt', 'all')
  );

CREATE POLICY "Users can update gantt_task_purchase_orders with permission"
  ON gantt_task_purchase_orders FOR UPDATE
  USING (
    has_permission(auth.uid(), 'gantt', 'edit') OR
    has_permission(auth.uid(), 'gantt', 'all')
  );

CREATE POLICY "Users can delete gantt_task_purchase_orders with permission"
  ON gantt_task_purchase_orders FOR DELETE
  USING (
    has_permission(auth.uid(), 'gantt', 'edit') OR
    has_permission(auth.uid(), 'gantt', 'all')
  );

-- ===========================================
-- ALERTS AND RECIPIENTS
-- ===========================================

-- Alert Recipients
DROP POLICY IF EXISTS "Authenticated users can manage recipients" ON alert_recipients;

CREATE POLICY "Admins can manage alert_recipients"
  ON alert_recipients FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view alert_recipients with permission"
  ON alert_recipients FOR SELECT
  USING (
    has_permission(auth.uid(), 'alerts', 'view') OR
    has_permission(auth.uid(), 'alerts', 'edit') OR
    has_permission(auth.uid(), 'alerts', 'all')
  );

CREATE POLICY "Users can modify alert_recipients with permission"
  ON alert_recipients FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'alerts', 'edit') OR
    has_permission(auth.uid(), 'alerts', 'all')
  );

CREATE POLICY "Users can update alert_recipients with permission"
  ON alert_recipients FOR UPDATE
  USING (
    has_permission(auth.uid(), 'alerts', 'edit') OR
    has_permission(auth.uid(), 'alerts', 'all')
  );

CREATE POLICY "Users can delete alert_recipients with permission"
  ON alert_recipients FOR DELETE
  USING (
    has_permission(auth.uid(), 'alerts', 'edit') OR
    has_permission(auth.uid(), 'alerts', 'all')
  );

-- ===========================================
-- COMPANIES (shared reference data)
-- ===========================================

DROP POLICY IF EXISTS "Authenticated users can manage companies" ON companies;
DROP POLICY IF EXISTS "Authenticated users can view companies" ON companies;

CREATE POLICY "Admins can manage companies"
  ON companies FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- All authenticated users can view companies (needed for dropdowns)
CREATE POLICY "Authenticated users can view companies"
  ON companies FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users with contracts permission can manage companies
CREATE POLICY "Users with contracts permission can manage companies"
  ON companies FOR INSERT
  WITH CHECK (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users with contracts permission can update companies"
  ON companies FOR UPDATE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

CREATE POLICY "Users with contracts permission can delete companies"
  ON companies FOR DELETE
  USING (
    has_permission(auth.uid(), 'contracts', 'edit') OR
    has_permission(auth.uid(), 'contracts', 'all')
  );

-- ===========================================
-- DASHBOARD SECTIONS (user-owned)
-- ===========================================

DROP POLICY IF EXISTS "Allow all for authenticated users on dashboard_sections" ON dashboard_sections;

-- Users can manage only their own dashboard sections
CREATE POLICY "Users can manage own dashboard_sections"
  ON dashboard_sections FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins can view all (for support purposes)
CREATE POLICY "Admins can view all dashboard_sections"
  ON dashboard_sections FOR SELECT
  USING (has_role(auth.uid(), 'admin'));